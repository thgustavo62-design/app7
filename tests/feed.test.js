// Preview de Feed: nomes das pastas do Drive, legenda, leitura do Drive (com Google de mentira), perfil guardado, rota e as regras da grade.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
process.env.AUTH_DEV_EMAIL = 'dev@local'; delete process.env.VERCEL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const F = require('../lib/feed');
const db = require('../lib/db');
const model = require('../lib/model');
const N = require('../public/assets/js/feed.js');

const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = JSON.stringify({ client_email: 'conta@projeto.iam.gserviceaccount.com', private_key: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const admin = { email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';

/* Google de mentira: pasta raiz com 2 posts (um carrossel de 3 artes + legenda, um reels) e um documento de legenda */
function googleFalso(log = []) {
  const arvore = {
    [F.PASTAS_PADRAO.M]: [{ id: 'P1', name: '2026-11-05__C-M15__Minas-Club-Como-Participar', mimeType: FOLDER }, { id: 'P2', name: '2026-11-10__R-M08__Reels-Teste', mimeType: FOLDER }, { id: 'P3', name: 'Rascunhos soltos', mimeType: FOLDER }, { id: 'X', name: 'arquivo.txt', mimeType: 'text/plain' }],
    P1: [{ id: 'D1', name: 'LEGENDA — C-M15', mimeType: DOC }, { id: 'I3', name: '03_final.png', mimeType: 'image/png', thumbnailLink: 'https://lh3.googleusercontent.com/c=s220' }, { id: 'I1', name: '01_capa.png', mimeType: 'image/png', thumbnailLink: 'https://lh3.googleusercontent.com/a=s220' }, { id: 'I2', name: '02_passo.png', mimeType: 'image/png', thumbnailLink: 'https://lh3.googleusercontent.com/b=s220' }],
    P2: [{ id: 'V1', name: 'reels.mp4', mimeType: 'video/mp4', thumbnailLink: 'https://lh3.googleusercontent.com/v=s220' }],
    P3: []
  };
  const texto = 'MINAS FARMA | C-M15\n\nCARROSSEL FEED 4:5 — CINCO ARTES\n\nDATA-ALVO: QUINTA-FEIRA 05/11/2026, ÀS 17H30 (BRASÍLIA)\n\nLEGENDA PARA COPIAR\n\nVocê está deixando seus pontos parados?\n\n#MinasClub\n\nORDEM DAS ARTES\n\n1. Capa\n';
  return async (url, init = {}) => {
    log.push(String(url));
    if (/oauth2|token/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 'tk', expires_in: 3600 }) };
    const u = new URL(url);
    if (u.pathname.endsWith('/export')) return { ok: true, status: 200, text: async () => texto };
    const m = (u.searchParams.get('q') || '').match(/'([^']+)' in parents/);
    return { ok: true, status: 200, json: async () => ({ files: arvore[m[1]] || [] }) };
  };
}
const driveCom = fetchFn => F.novoDrive(SA, { fetchFn });

test('nome da pasta: data, código e título; links do Drive viram o id', () => {
  assert.deepEqual(F.parsePasta('2026-11-05__C-M15__Minas-Club-Como-Participar'), { data: '2026-11-05', codigo: 'C-M15', titulo: 'Minas Club Como Participar' });
  assert.equal(F.parsePasta('Rascunhos soltos'), null);
  assert.equal(F.pastaId('https://drive.google.com/drive/folders/1PoKHg8R5jlMHnpblNk83TYugio32Za7b?usp=sharing'), '1PoKHg8R5jlMHnpblNk83TYugio32Za7b');
  assert.equal(F.pastaId('1PoKHg8R5jlMHnpblNk83TYugio32Za7b'), '1PoKHg8R5jlMHnpblNk83TYugio32Za7b');
  assert.equal(F.pastaId('x'), '', 'id curto demais não vale');
  assert.equal(F.pastaId("a'; drop"), '', 'nada de aspas no id');
});
test('legenda: pega só o trecho "LEGENDA PARA COPIAR", a hora e o formato', () => {
  const r = F.parseLegenda('X\n\nCARROSSEL FEED 4:5\n\nDATA-ALVO: QUINTA, ÀS 17H30\n\nLEGENDA PARA COPIAR\n\nLinha 1\n\nLinha 2\n\nORDEM DAS ARTES\n\n1. Capa');
  assert.equal(r.legenda, 'Linha 1\n\nLinha 2'); assert.equal(r.hora, '17:30'); assert.equal(r.formato, 'Carrossel');
  assert.equal(F.parseLegenda('só um texto').legenda, 'só um texto', 'sem seções, vale o texto todo');
});
test('Drive: lê as pastas de post, ordena as artes pelo nome e usa miniatura maior; ignora o que não é pasta', async () => {
  F._cache.clear(); const log = [];
  const d = driveCom(googleFalso(log)); const posts = await (async () => { const r = await F.carregar(await repoCom(), admin, 'M', { drive: d }); return r; })();
  assert.equal(posts.drive.ligado, true); assert.equal(posts.drive.posts.length, 3);
  const p1 = posts.drive.posts.find(p => p.id === 'P1');
  assert.deepEqual(p1.midias.map(m => m.nome), ['01_capa.png', '02_passo.png', '03_final.png']);
  assert.equal(p1.midias[0].thumb, 'https://lh3.googleusercontent.com/a=w720'); assert.equal(p1.legendaId, 'D1'); assert.equal(p1.codigo, 'C-M15'); assert.equal(p1.data, '2026-11-05');
  assert.equal(posts.drive.posts.find(p => p.id === 'P2').midias[0].tipo, 'video');
  assert.equal(posts.drive.posts[0].id, 'P2', 'mais novo primeiro');
  assert.ok(log.every(u => !/key=|access_token/.test(u)), 'o token vai no cabeçalho, nunca na URL');
});
test('Drive: sem permissão ou API desligada a resposta explica o que fazer; sem chave diz que falta a chave', async () => {
  F._cache.clear();
  const recusa = msg => async url => (/oauth2|token/.test(url) ? { ok: true, status: 200, json: async () => ({ access_token: 'tk', expires_in: 3600 }) } : { ok: false, status: 403, json: async () => ({ error: { message: msg } }) });
  let r = await F.carregar(await repoCom(), admin, 'M', { drive: driveCom(recusa('Google Drive API has not been used in project 1 before or it is disabled')) });
  assert.equal(r.drive.ligado, false); assert.match(r.drive.erro, /Drive API/); assert.equal(r.drive.conta, 'conta@projeto.iam.gserviceaccount.com');
  F._cache.clear();
  r = await F.carregar(await repoCom(), admin, 'M', { drive: driveCom(recusa('The caller does not have permission')) });
  assert.match(r.drive.erro, /Compartilhe a pasta com conta@projeto/);
  r = await F.carregar(await repoCom(), admin, 'M', { drive: null }); assert.match(r.drive.erro, /GOOGLE_SERVICE_ACCOUNT_JSON/); assert.equal(r.drive.posts.length, 0);
});
test('legenda só abre documento que está numa pasta do cliente', async () => {
  F._cache.clear(); const repo = await repoCom(), d = driveCom(googleFalso());
  const r = await F.legenda(repo, admin, 'M', 'D1', { drive: d }); assert.match(r.legenda, /pontos parados/); assert.equal(r.hora, '17:30');
  await assert.rejects(F.legenda(repo, admin, 'M', 'QUALQUER-OUTRO', { drive: d }), /não pertence/);
});
async function repoCom() { db._resetMemory(); return db.getRepo(); }

test('perfil, ordem e pastas: só quem edita grava; cliente lê só a própria empresa; entradas são limpas', async () => {
  const repo = await repoCom();
  const novo = await F.salvar(repo, admin, 'M', { perfil: { handle: '@minasfarmabg', nome: 'Minas Farma', bio: 'Farmácia', seguidores: '12,4 mil', destaques: [{ nome: 'Clube', cor: '#ff0000' }, { nome: '' }, { nome: 'Dicas', cor: 'vermelho' }] }, ordem: ['C-M16', 'C-M17'], pastas: [{ id: 'https://drive.google.com/drive/folders/1PoKHg8R5jlMHnpblNk83TYugio32Za7b' }, { id: "x'" }] });
  assert.equal(novo.perfil.handle, 'minasfarmabg', 'o @ sai'); assert.deepEqual(novo.perfil.destaques, [{ nome: 'Clube', cor: '#ff0000' }, { nome: 'Dicas', cor: '' }]);
  assert.deepEqual(novo.pastas, [{ id: '1PoKHg8R5jlMHnpblNk83TYugio32Za7b', status: 'pronto' }]); assert.deepEqual(novo.ordem, ['C-M16', 'C-M17']);
  const volta = await F.lerConfig(db.getRepo(), 'M'); assert.equal(volta.perfil.bio, 'Farmácia');
  await F.salvar(repo, admin, 'M', { ordem: ['C-M17'] }); assert.equal((await F.lerConfig(repo, 'M')).perfil.nome, 'Minas Farma', 'mexer só na ordem mantém o perfil');
  const leitor = { email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] }, cliente = { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['M'] };
  await assert.rejects(F.salvar(repo, leitor, 'M', { ordem: [] }), /só de leitura/); await assert.rejects(F.salvar(repo, cliente, 'M', { ordem: [] }), /só de leitura/);
  assert.equal((await F.carregar(repo, cliente, 'M', { drive: null })).podeEditar, false);
  await assert.rejects(F.carregar(repo, cliente, 'F', { drive: null }), /não tem acesso/);
  await assert.rejects(F.carregar(repo, admin, 'ZZ', { drive: null }), /não tem acesso/);
  await assert.rejects(F.salvar(repo, admin, 'M', { perfil: { bio: 'x'.repeat(301) } }), /passa de 300/);
  assert.equal((await F.carregar(repo, admin, 'F', { drive: null })).perfil.handle, 'farmaefarmabg', 'perfis conhecidos já vêm preenchidos');
});
test('rota /api/feed: exige login, lê, grava e recusa pedido de outra origem', async () => {
  const session = require('../lib/session'), { cfg } = require('../lib/config');
  db._resetMemory();
  const { createServer } = require('../dev-server'); const srv = createServer(); await new Promise(rs => srv.listen(0, rs));
  const base = 'http://localhost:' + srv.address().port, ck = 'n7_session=' + encodeURIComponent(session.create(admin, cfg().sessionSecret, 600));
  const call = async (p, body, headers = { 'x-n7': '1' }) => { const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'content-type': 'application/json', cookie: ck }, headers), body: body ? JSON.stringify(body) : undefined }); return { status: res.status, body: await res.json() }; };
  try {
    assert.equal((await fetch(base + '/api/feed?marca=M')).status, 401);
    const g = await call('/api/feed?marca=M'); assert.equal(g.status, 200); assert.equal(g.body.podeEditar, true); assert.equal(g.body.drive.ligado, false);
    assert.equal((await call('/api/feed', { marca: 'M', ordem: ['a'] }, {})).status, 403, 'sem o cabeçalho X-N7');
    const p = await call('/api/feed', { marca: 'M', ordem: ['C-M16'], perfil: { handle: 'minasfarmabg', bio: 'oi' } }); assert.equal(p.status, 200);
    assert.deepEqual((await call('/api/feed?marca=M')).body.ordem, ['C-M16']);
    assert.equal((await call('/api/feed')).status, 400);
    assert.equal((await call('/api/feed?marca=M&legenda=abc')).status, 503, 'sem o Drive ligado não lê legenda');
  } finally { srv.close(); }
});

/* ---------- regras da grade (as mesmas do navegador) ---------- */
const pauta = (code, date, status = 'plan', extra = {}) => Object.assign({ code, b: 'M', title: 'Título ' + code, format: 'Carrossel', date, status, late: false }, extra);
const pasta = (codigo, data, n = 3, extra = {}) => Object.assign({ id: 'd' + codigo, codigo, data, titulo: 'Arte ' + codigo, origem: 'pronto', legendaId: '', midias: Array.from({ length: n }, (_, i) => ({ id: codigo + i, nome: `0${i + 1}.png`, tipo: 'imagem', thumb: 'https://lh3.googleusercontent.com/x=w720' })) }, extra);
test('grade: pauta e pasta se ligam pelo código; arte pronta vale "pronto"; pasta sem pauta também entra', () => {
  const l = N.montar({ hoje: '2026-11-26', pautas: [pauta('C-M15', '2026-11-05', 'apr'), pauta('C-M20', '2026-12-01')], drive: [pasta('C-M15', '2026-11-05'), pasta('C-M99', '2026-11-20', 1)] });
  const por = Object.fromEntries(l.map(i => [i.id, i]));
  assert.equal(l.length, 3); assert.equal(por['C-M15'].status, 'agd', 'em aprovação, mas com arte final no Drive'); assert.equal(por['C-M15'].temArte, true); assert.equal(por['C-M15'].midias.length, 3);
  assert.equal(por['C-M20'].temArte, false); assert.equal(por['d:dC-M99'].temPauta, false); assert.equal(por['d:dC-M99'].formato, 'Post');
  assert.equal(N.statusDe(pauta('x', '2026-12-01', 'pub'), pasta('x', '2026-12-01')), 'pub', 'publicado continua publicado');
  assert.equal(N.statusDe(pauta('x', '2026-12-01', 'plan'), pasta('x', '2026-12-01', 3, { origem: 'producao' })), 'prod');
});
test('grade: publicado antigo sem arte e planejado muito longe ficam de fora', () => {
  const l = N.montar({ hoje: '2026-11-26', pautas: [pauta('A', '2026-09-01', 'pub'), pauta('B', '2026-11-10', 'pub'), pauta('C', '2027-03-01'), pauta('D', '2026-12-20')], drive: [] });
  assert.deepEqual(l.map(i => i.id).sort(), ['B', 'D']);
});
test('ordem: novos e planejados em cima por data; a ordem salva vale só para os não publicados; publicados no fim', () => {
  const l = N.montar({ hoje: '2026-11-26', pautas: [pauta('P1', '2026-11-20', 'pub'), pauta('A', '2026-12-01'), pauta('B', '2026-12-03'), pauta('C', '2026-12-05')], drive: [] });
  assert.deepEqual(N.ordenar(l).map(i => i.id), ['C', 'B', 'A', 'P1']);
  assert.deepEqual(N.ordenar(l, ['A', 'B']).map(i => i.id), ['C', 'A', 'B', 'P1'], 'C é novo e vai para cima; A e B seguem a ordem salva');
  assert.deepEqual(N.ordenar(l, ['A', 'B', 'P1']).map(i => i.id), ['C', 'A', 'B', 'P1']);
});
test('mover: troca de lugar só entre os não publicados e devolve a ordem nova', () => {
  const l = N.ordenar(N.montar({ hoje: '2026-11-26', pautas: [pauta('P1', '2026-11-20', 'pub'), pauta('A', '2026-12-01'), pauta('B', '2026-12-03'), pauta('C', '2026-12-05')], drive: [] }));
  assert.deepEqual(N.mover(l, 'A', 'C'), ['A', 'C', 'B']); assert.deepEqual(N.mover(l, 'C', 'A'), ['B', 'A', 'C']);
  assert.deepEqual(N.mover(l, 'A', 'P1'), ['C', 'B', 'A'], 'publicado não é alvo: nada muda');
  assert.deepEqual(N.passo(l, 'C', 1), ['B', 'C', 'A']); assert.deepEqual(N.passo(l, 'A', 1), ['C', 'B', 'A'], 'já é o último dos planejados');
});
test('filtros e contagens', () => {
  const l = N.montar({ hoje: '2026-11-26', pautas: [pauta('P1', '2026-11-20', 'pub'), pauta('A', '2026-12-01', 'prod'), pauta('B', '2026-12-03', 'agd', { format: 'Reels' })], drive: [] });
  assert.deepEqual(N.contar(l), { todos: 3, andamento: 1, pronto: 1, publicado: 1 });
  assert.deepEqual(N.filtrar(l, 'pronto', 'grade').map(i => i.id), ['B']); assert.deepEqual(N.filtrar(l, 'todos', 'reels').map(i => i.id), ['B']);
  assert.equal(N.miniOk('https://lh3.googleusercontent.com/a=w720'), true); assert.equal(N.miniOk('https://evil.example/x.png'), false); assert.equal(N.miniOk('javascript:alert(1)'), false);
});
