// Auditoria de interligação: confere, sem navegador, se as peças do site se enxergam entre si
// (páginas, cache do app, ícones, operações do navegador e do servidor, abas do banco, variáveis, rotas, permissões).
// Quando alguém acrescenta uma tela, uma operação ou um arquivo e esquece de ligar, algum destes testes avisa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const existe = p => fs.existsSync(path.join(ROOT, 'public', String(p).replace(/^\//, '')));
const aspas = src => [...src.matchAll(/'([^']*)'/g)].map(m => m[1]);
const lista = (src, nome) => { const m = src.match(new RegExp(`const ${nome} = \\[([^\\]]*)\\]`)); assert.ok(m, `lista ${nome} não encontrada no servidor`); return aspas(m[1]).filter(Boolean); };
const sw = read('public/sw.js'), SHELL = aspas(sw.match(/const SHELL = \[([\s\S]*?)\];/)[1]);

test('páginas: todo script e estilo local do app existe e está no cache do app (SHELL)', () => {
  const html = read('public/app.html');
  const locais = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
  assert.ok(locais.length > 20, 'achou os arquivos do app.html');
  const faltam = locais.filter(u => !existe(u)), foraDoCache = locais.filter(u => !SHELL.includes('/' + u.replace(/^\//, '')));
  assert.deepEqual(faltam, [], 'arquivos citados no app.html que não existem');
  assert.deepEqual(foraDoCache, [], 'arquivos do app.html que faltam no SHELL do sw.js (o app instalado não os guardaria)');
});

test('cache do app: todo item do SHELL existe no disco e não se repete', () => {
  const faltam = SHELL.filter(u => /\.[a-z0-9]+$/i.test(u) && !existe(u));
  assert.deepEqual(faltam, [], 'itens do SHELL sem arquivo');
  assert.equal(new Set(SHELL).size, SHELL.length, 'SHELL com item repetido: ' + SHELL.filter((u, i) => SHELL.indexOf(u) !== i).join(', '));
});

test('ícones das empresas: todo arquivo mapeado existe, todo PNG de assets/clientes está mapeado e guardado no cache', () => {
  require('../public/assets/js/logos.js');
  const mapa = globalThis.N7Logos.MAPA, arquivos = fs.readdirSync(path.join(ROOT, 'public/assets/clientes')).filter(f => /\.(png|webp|svg)$/.test(f));
  assert.deepEqual(Object.values(mapa).filter(u => !existe(u)), [], 'ícone mapeado sem arquivo');
  assert.deepEqual(arquivos.filter(f => !Object.values(mapa).includes('assets/clientes/' + f)), [], 'arquivo em assets/clientes sem linha no logos.js');
  assert.deepEqual(Object.values(mapa).filter(u => !SHELL.includes('/' + u)), [], 'ícone fora do SHELL (não funcionaria sem internet)');
  const { defaults } = require('../lib/clients'); const ids = defaults().map(c => c.id);
  assert.deepEqual(Object.keys(mapa).filter(id => !ids.includes(id)), [], 'ícone para empresa que não existe no cadastro inicial');
  const html = globalThis.N7Logos.avatar({ id: 'sem-arquivo', color: '--c3', short: 'Zé' }, 'width:20px'); assert.match(html, /^<span class="client-avatar" style="background:var\(--c3\);width:20px">Z<\/span>$/, 'empresa sem ícone usa a inicial colorida');
  assert.match(globalThis.N7Logos.avatar({ id: 'nova7', color: '--c4', short: 'N' }), /<img src="assets\/clientes\/nova7\.png"/);
});

test('manifesto do app e página inicial: ícones e atalhos apontam para arquivos e rotas que existem', () => {
  const man = JSON.parse(read('public/manifest.webmanifest')), icones = [...man.icons, ...(man.shortcuts || []).flatMap(s => s.icons || [])].map(i => i.src);
  assert.deepEqual(icones.filter(u => !existe(u)), [], 'ícone do manifesto sem arquivo');
  const rotas = [...read('public/assets/js/app.js').match(/const ROUTES = \{([\s\S]*?)\n  \};/)[1].matchAll(/^    ([a-z]+): \{/gm)].map(m => m[1]);
  assert.ok(rotas.length >= 12, 'achou as rotas do app: ' + rotas.join(','));
  const hashes = [...(man.shortcuts || []).map(s => s.url), ...[...read('public/index.html').matchAll(/href="(\/app#[^"]*)"/g)].map(m => m[1])].map(u => (u.split('#')[1] || '').split('/')[0]).filter(Boolean);
  assert.deepEqual([...new Set(hashes)].filter(h => !rotas.includes(h)), [], 'atalho ou link que abre uma rota inexistente');
});

test('sincronização: toda operação que o navegador envia é tratada no servidor, e toda chave sincronizada volta no estado', async () => {
  const sync = read('public/assets/js/sync.js'), model = read('lib/model.js');
  const enviadas = new Set([...sync.matchAll(/\bt: "([a-z]+)"/g)].map(m => m[1]));
  ['client', 'user'].forEach(t => enviadas.add(t));                                    /* Configurações e conversão de ficha enviam direto, sem a fila */
  const tratadas = new Set([...model.matchAll(/case '([a-z]+)':/g)].map(m => m[1]));
  assert.deepEqual([...enviadas].filter(t => !tratadas.has(t)), [], 'operação enviada pelo navegador sem tratamento no servidor');
  assert.deepEqual([...tratadas].filter(t => !enviadas.has(t)), [], 'operação do servidor que nenhum código do navegador envia');
  const SYNCED = aspas(read('public/assets/js/store.js').match(/const SYNCED = \[([^\]]*)\]/)[1].replace(/"/g, "'"));
  const { Repo, MemoryDriver } = require('../lib/repo'), seed = require('../lib/seed'), m = require('../lib/model');
  const estado = await m.loadState(new Repo(new MemoryDriver(seed.build({ devEmail: 'dev@local' }))));
  assert.deepEqual(SYNCED.filter(k => !(k in estado)), [], 'chave sincronizada que o servidor não devolve');
});

test('banco: toda aba tem chave, está documentada e as colunas da ficha e do cliente estão nos dois lados', () => {
  const { COLS, KEYS, TABS } = require('../lib/schema'), doc = read('docs/banco-de-dados.md');
  assert.deepEqual(TABS.filter(t => !KEYS[t] || !KEYS[t].length), [], 'aba sem chave');
  assert.deepEqual(TABS.filter(t => !KEYS[t].every(k => COLS[t].includes(k))), [], 'chave que não é coluna da aba');
  assert.deepEqual(TABS.filter(t => !doc.includes('`' + t + '`')), [], 'aba que não está em docs/banco-de-dados.md');
  const model = read('lib/model.js');
  ['tipo_negocio', 'endereco', 'bairro', 'lat', 'lng', 'raio_km', 'ficha', 'cliente_chave', 'valor_estimado', 'proximo_contato', 'proximo_passo', 'atividades'].forEach(c => assert.ok(COLS.Prospects.includes(c), 'Prospects sem a coluna ' + c));
  ['endereco', 'bairro', 'lat', 'lng', 'raio_km'].forEach(c => assert.ok(COLS.Clientes.includes(c), 'Clientes sem a coluna ' + c));
  assert.ok(doc.includes('ficha (JSON') && doc.includes('lat, lng'), 'documentação das colunas novas do Comercial');
  assert.ok(model.includes("'Prospects'") && model.includes("'Clientes'"));
});

test('ambiente: toda variável que o código lê está explicada na documentação', () => {
  const nomes = [...new Set([...read('lib/config.js').matchAll(/\be\.([A-Z][A-Z0-9_]+)/g)].map(m => m[1]))].filter(n => !['NODE_ENV', 'VERCEL', 'AUTH_DEV_EMAIL'].includes(n));
  const docs = ['README.md', 'docs/publicar-na-vercel.md', 'docs/banco-de-dados.md', 'docs/banco-postgres-passo-a-passo.md', '.env.example'].map(f => read(f)).join('\n');
  assert.deepEqual(nomes.filter(n => !docs.includes(n)), [], 'variável lida pelo código e sem explicação nos docs');
});

test('Comercial: as listas do navegador e do servidor são as mesmas (etapas, objetivos, portes, tipos, contatos)', () => {
  globalThis.window = globalThis;
  ['services', 'playbook', 'comercial'].forEach(f => require(`../public/assets/js/${f}.js`));
  const C = globalThis.N7Comercial, model = read('lib/model.js');
  const igual = (a, b, n) => assert.deepEqual(Object.keys(a).sort(), b.slice().sort(), `${n}: navegador e servidor divergem`);
  igual(C.ETAPAS, lista(model, 'ETAPAS'), 'etapas'); igual(C.OBJETIVOS, lista(model, 'OBJETIVOS'), 'objetivos'); igual(C.PORTES, lista(model, 'PORTES'), 'portes');
  igual(C.TIPOS, lista(model, 'TIPOS_NEGOCIO'), 'tipos de negócio'); igual(C.ATIVIDADES, lista(model, 'ATIV_TIPOS'), 'tipos de contato');
  assert.deepEqual(Object.keys(C.PROB).sort(), Object.keys(C.ETAPAS).sort(), 'toda etapa tem chance de fechar');
  const fichaServidor = aspas(model.match(/const FICHA_KEYS = \[([^\]]*)\]/)[1]);
  assert.deepEqual(C.FICHA_KEYS.slice().sort(), fichaServidor.slice().sort(), 'respostas da conversa de posicionamento');
});

test('permissões: toda operação do Comercial, de cliente e de usuário exige administrador', () => {
  const model = read('lib/model.js'), blocos = model.split(/\n    case '/).slice(1);
  ['prospect', 'contract', 'agency', 'client', 'user'].forEach(op => {
    const b = blocos.find(x => x.startsWith(op + "':")); assert.ok(b, 'operação ' + op);
    assert.match(b.slice(0, 400), /needAdmin\(user\)/, `a operação ${op} precisa chamar needAdmin(user) logo no começo`);
  });
});

test('hospedagem: o cron e a reescrita do vercel.json apontam para arquivos que existem', () => {
  const v = JSON.parse(read('vercel.json'));
  (v.crons || []).forEach(c => assert.ok(fs.existsSync(path.join(ROOT, c.path.split('?')[0].replace(/^\//, '') + '.js')), 'cron sem função: ' + c.path));
  (v.rewrites || []).forEach(r => assert.ok(existe(r.destination), 'reescrita sem arquivo: ' + r.destination));
  const csp = v.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /img-src[^;]*tile\.openstreetmap\.org/, 'mapa precisa dos blocos do OpenStreetMap'); assert.match(csp, /connect-src[^;]*nominatim\.openstreetmap\.org/, 'busca de endereço');
  assert.doesNotMatch(csp, /unsafe-eval/, 'sem unsafe-eval'); assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client(;|$)/, 'scripts só do próprio site e do login Google');
});

test('Painel e calendário: o que o Painel usa existe no app (calendário do mês, Assistente, saudação, avatar)', () => {
  const app = read('public/assets/js/app.js'), boot = read('public/assets/js/boot.js');
  ['calInner', 'bindCal', 'assistente', 'saudacao', 'primeiroNome', 'dataLonga'].forEach(f => assert.match(app, new RegExp(`(?:function|const) ${f}\\b`), 'falta ' + f));
  assert.match(app, /class="panel cal-card" id="pcal"/); assert.match(app, /\$\{assistente\(ps\)\}/); assert.match(app, /bindCal\(v, ps\)/);
  assert.match(boot, /who-av/); const css = read('public/assets/css/app.css');
  ['.cd.hoje', '.cal-grid', '.asst', '.who-av', '.tema-btn', '.client-avatar.has-logo', '.nav-logo'].forEach(s => assert.ok(css.includes(s), 'CSS sem ' + s));
  assert.equal((css.match(/\.cd\.today/g) || []).length, 0, 'o círculo do calendário não pode usar a classe today (ela tem espaçamento próprio)');
});

test('tema: o botão sol/lua existe, o script roda no head antes do CSS e o padrão é o claro', () => {
  const html = read('public/app.html'); assert.ok(html.indexOf('assets/js/tema.js') > 0 && html.indexOf('assets/js/tema.js') < html.indexOf('assets/css/app.css'), 'tema.js antes do CSS');
  const t = read('public/assets/js/tema.js'); assert.match(t, /return v === "escuro" \? "escuro" : "claro"/, 'padrão claro'); assert.match(t, /localStorage\.setItem\(KEY/); assert.ok(SHELL.includes('/assets/js/tema.js'));
});
