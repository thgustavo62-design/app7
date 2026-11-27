// Base de regras e estilos: regras da equipe, sugestões vindas dos ajustes, aprovações viram referência, API da página da extensão e a própria página.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const ARTE = require('../scripts/analise-local/arte');
const BASE = require('../scripts/analise-local/base');

test('base: regras da equipe valem na hora; sugestões do agente só depois de aceitas; não repete; blocos por linha', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-base-'));
  try {
    const a = BASE.adicionar(dir, { texto: 'Nunca usar fundo vermelho nas artes educativas.', linha: 'farmacia' }), b = BASE.adicionar(dir, { texto: 'Sempre deixar o logotipo no topo.', linha: 'todas' }), c = BASE.adicionar(dir, { texto: 'O clube sempre mostra a coroa.', linha: 'club' });
    assert.equal(a.status, 'ativa'); assert.throws(() => BASE.adicionar(dir, { texto: 'curta' }), /pelo menos/);
    assert.equal(BASE.adicionar(dir, { texto: 'nunca usar fundo VERMELHO nas artes educativas', linha: 'farmacia' }).id, a.id, 'regra igual não duplica');
    const bloco = BASE.blocoDeRegras(dir, 'farmacia'); assert.match(bloco, /REGRAS DA AGÊNCIA/); assert.match(bloco, /fundo vermelho/); assert.match(bloco, /logotipo no topo/); assert.ok(!/coroa/.test(bloco), 'regra do clube não vai para a farmácia');
    assert.match(BASE.blocoDeRegras(dir, 'club'), /coroa/); assert.ok(!/fundo vermelho/.test(BASE.blocoDeRegras(dir, 'club')));
    /* sugestão do agente: não vale até aceitar */
    const s = BASE.sugerirDeAjuste(dir, { instrucao: 'deixe o título mais curto e direto', codigo: 'C-F09' }); assert.equal(s.status, 'sugerida'); assert.ok(!/mais curto/.test(BASE.blocoDeRegras(dir, 'farmacia')));
    BASE.atualizar(dir, s.id, { status: 'ativa' }); assert.match(BASE.blocoDeRegras(dir, 'farmacia'), /mais curto/);
    BASE.atualizar(dir, a.id, { status: 'desativada' }); assert.ok(!/fundo vermelho/.test(BASE.blocoDeRegras(dir, 'farmacia')), 'regra desativada sai do pedido');
    assert.equal(BASE.remover(dir, b.id), true); assert.equal(BASE.ler(dir).ajustes.length, 1);
    assert.equal(BASE.blocoDeRegras(fs.mkdtempSync(path.join(os.tmpdir(), 'n7-vazia-')), 'club'), '', 'sem regras: sem bloco');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('base: aprovação vira referência de prioridade na biblioteca (por linha), uma vez só', () => {
  const marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-')), orig = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-orig-')); process.env.N7_MKT_RAIZ = path.join(marcas, '__x'); process.env.N7_DRIVE_RAIZ = path.join(marcas, '__y'); process.env.N7_DOWNLOADS = path.join(marcas, '__z'); process.env.N7_MARCAS = marcas;
  try {
    for (const n of ['01_capa.png', '02_slide.png']) fs.writeFileSync(path.join(orig, n), Buffer.alloc(60 * 1024, 3));
    const dir = path.join(marcas, 'farma-e-farma');
    assert.equal(BASE.guardarAprovada(dir, { codigo: 'C-F09', linha: 'farmacia', origemDir: orig, nomes: ['01_capa.png', '02_slide.png', 'sumiu.png'], titulo: 'Cabelo' }), 2);
    assert.equal(BASE.guardarAprovada(dir, { codigo: 'C-F09', linha: 'farmacia', origemDir: orig, nomes: ['01_capa.png'] }), 1, 'copia de novo, mas o registro não duplica'); assert.equal(BASE.ler(dir).aprovadas.length, 1);
    const B = require('../scripts/analise-local/biblioteca'); const r = B.indexar({ marcas, raiz: '', mkt: '' }); assert.equal(r['farma-e-farma'].porCategoria.finalizado, 2);
    const lib = B.carregar({ marcas, validadeMs: 1e9 }), fa = B.escolherReferencias(lib, 'farma-e-farma', { formato: 'Carrossel', assunto: 'qualquer', n: 2, linha: 'farmacia' }), cl = B.escolherReferencias(lib, 'farma-e-farma', { formato: 'Carrossel', assunto: 'x', n: 2, linha: 'club' });
    assert.ok(fa.length === 2 && fa.every(f => /aprovadas[\\/]farmacia[\\/]C-F09/.test(f)), 'a arte aprovada é a referência da farmácia: ' + fa.join('|')); assert.equal(cl.length, 0, 'e não aparece como referência do clube');
  } finally { for (const k of ['N7_MKT_RAIZ', 'N7_DRIVE_RAIZ', 'N7_DOWNLOADS', 'N7_MARCAS']) delete process.env[k]; [marcas, orig].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});

/* API da página + a página de verdade (Playwright) falando com a ponte de verdade */
test('página da extensão: lista, aceita sugestão, adiciona e edita regra, edita estilo, mostra logo — via ponte local', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 120000 }, async () => {
  const marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-')), ext = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ext-')), mkt = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mkt-'));
  process.env.N7_MARCAS = marcas; process.env.N7_MKT_RAIZ = mkt; process.env.N7_DRIVE_RAIZ = path.join(mkt, '__y'); process.env.N7_DOWNLOADS = path.join(mkt, '__z'); process.env.N7_ARMAZEM = '';
  const grava = (f, kb = 40) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(kb * 1024, 7)); };
  const F = path.join(mkt, 'FARMA E FARMA MARKETING'); grava(path.join(F, 'Logos', 'logo_farma_oficial.png.png'), 40); grava(path.join(F, 'IDENTIDADE VISUAL FARMA CLUB', '04_Logo_Compacta_Com_Seta.png'), 40);
  for (let i = 1; i <= 3; i++) grava(path.join(F, 'Carroseis', 'PROTETOR', `${i}.png`), 300);
  const dirF = path.join(marcas, 'farma-e-farma'); fs.mkdirSync(dirF, { recursive: true });
  fs.writeFileSync(path.join(dirF, 'padrao.json'), JSON.stringify({ linha: 'farmacia', geradoEm: new Date().toISOString(), baseadoEm: ['a.png'], resumo: 'Estilo editorial limpo', paleta: [{ nome: 'Vermelho', hex: '#E21118', uso: 'marca' }], tipografia: { titulo: 'Sans pesada' }, elementos: ['selo'], fundos: [], composicao: 'título no topo', logotipo: 'canto', receitas: { promocional: 'faixa vermelha' }, evitar: ['fotos stock'] }));
  BASE.sugerirDeAjuste(dirF, { instrucao: 'título sempre em duas linhas', codigo: 'C-F09' });
  const PAINEL = require('../scripts/analise-local/painel-api'), P = require('../scripts/analise-local/ponte'); let acionou = 0;
  const ponte = P.criar({ porta: 0, token: 'tok-' + 'p'.repeat(30), pastaExtensao: ext, origemExtra: /^http:\/\/127\.0\.0\.1:\d+$/, rotas: r => PAINEL.tratar(r, { acionar: () => { acionou++; } }) }); await ponte.ligar();
  const estaticos = http.createServer((req, res) => { const n = decodeURIComponent(req.url.split('?')[0].replace(/^\/ext\//, '').replace(/^\//, '')) || 'painel.html'; const f = path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', n === 'config.json' ? '__nada' : n); if (n === 'config.json') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ porta: ponte.porta, token: ponte.token })); } if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', /\.css$/.test(n) ? 'text/css' : /\.js$/.test(n) ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(f)); });
  await new Promise(r => estaticos.listen(0, '127.0.0.1', r)); const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage(); const erros = [];
  pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept('Regra editada pela equipe no teste'));
  try {
    await fetch(`http://127.0.0.1:${ponte.porta}/ping`, { headers: { 'x-n7-token': ponte.token, 'x-n7-versao': '1.2.2' } });   // a extensão de verdade faz isso a cada 30 s
    await pg.addInitScript(() => { window.chrome = { runtime: { getURL: p => '/ext/' + p } }; });
    await pg.goto('http://127.0.0.1:' + estaticos.address().port + '/painel.html');
    await pg.waitForSelector('#empresas button', { timeout: 20000 }); await pg.waitForSelector('#estado b.on', { timeout: 20000 });
    assert.match(await pg.textContent('#estado'), /Agente conectado/);
    await pg.click('#empresas button:has-text("Farma e Farma")'); await pg.waitForSelector('#sugeridas .item'); assert.match(await pg.textContent('#sugeridas'), /título sempre em duas linhas/);
    assert.ok((await pg.$$('#linhas button')).length === 2, 'farmácia e clube separados');
    /* aceitar a sugestão */
    await pg.click('#sugeridas button:has-text("Aceitar")'); await pg.waitForFunction(() => !document.querySelector('#sugeridas .item')); assert.match(await pg.textContent('#regras'), /duas linhas/);
    assert.match(BASE.blocoDeRegras(dirF, 'farmacia'), /duas linhas/, 'a regra aceita já vale no pedido do agente');
    /* adicionar, editar, desativar */
    await pg.fill('#nr-texto', 'Nunca citar preço sem a validade da oferta.'); await pg.click('#nova-regra button[type=submit]'); await pg.waitForFunction(() => /validade da oferta/.test(document.querySelector('#regras').textContent));
    await pg.click('#regras .item:has-text("validade da oferta") button:has-text("Editar")'); await pg.waitForFunction(() => /editada pela equipe/.test(document.querySelector('#regras').textContent));
    await pg.click('#regras .item:has-text("editada pela equipe") button:has-text("Desativar")'); await pg.waitForFunction(() => document.querySelector('#regras .item.desativada'));
    assert.ok(!/editada pela equipe/.test(BASE.blocoDeRegras(dirF, 'farmacia')), 'regra desativada sai do pedido');
    /* estilo editável + refazer */
    await pg.waitForSelector('#estilo textarea'); assert.match(await pg.textContent('#estilo'), /Vermelho #E21118/); await pg.fill('#estilo textarea[aria-label="Resumo do estilo"]', 'Resumo corrigido pela equipe'); await pg.click('#estilo button:has-text("Salvar minhas correções")'); await pg.waitForFunction(() => document.querySelector('#aviso') && /Estilo salvo/.test(document.querySelector('#aviso').textContent));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dirF, 'padrao.json'), 'utf8')).resumo, 'Resumo corrigido pela equipe');
    await pg.click('#estilo button:has-text("Refazer a partir das peças")'); await pg.waitForFunction(() => /Pedi ao agente/.test(document.querySelector('#aviso').textContent)); assert.ok(!fs.existsSync(path.join(dirF, 'padrao.json')), 'o padrão antigo foi guardado de lado'); assert.ok(acionou >= 1, 'o agente foi acionado'); assert.ok(fs.readdirSync(dirF).some(n => /^padrao\.anterior-\d+\.json$/.test(n)));
    /* logo em uso (imagem lida da ponte, só dentro das pastas permitidas) */
    await pg.waitForSelector('#refs figure img'); assert.match(await pg.textContent('#refs'), /logo_farma_oficial/);
    await pg.click('#linhas button:has-text("Farma Club")'); await pg.waitForFunction(() => /Logo_Compacta/.test(document.querySelector('#refs').textContent)); assert.match(await pg.textContent('#estilo'), /ainda não foi extraído/, 'o clube não tem padrão: a página avisa');
    assert.equal((await fetch(`http://127.0.0.1:${ponte.porta}/arquivo?id=${Buffer.from(path.join(__dirname, '..', 'package.json')).toString('base64url')}`, { headers: { 'x-n7-token': ponte.token } })).status, 403, 'não serve arquivo fora das pastas do agente');
    assert.deepEqual(erros, [], 'sem erro de script na página: ' + erros.join(' | '));
  } catch (e) { e.message += ' | página: ' + (await pg.textContent('body').catch(() => '')).replace(/s+/g, ' ').slice(0, 400) + ' | erros: ' + erros.join(' ; '); throw e; } finally { await b.close(); estaticos.close(); ponte.parar(); for (const k of ['N7_MARCAS', 'N7_MKT_RAIZ', 'N7_DRIVE_RAIZ', 'N7_DOWNLOADS', 'N7_ARMAZEM']) delete process.env[k]; [marcas, ext, mkt].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});
