// Preview das artes no site: o agente avisa as miniaturas (salvarPreviews) e a tela lê cada JPEG do Drive (ARTES/<empresa>/<código>/_preview) pela API.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db');

const FOLDER = 'application/vnd.google-apps.folder';
class DriveFalso {
  constructor() { this.n = 0; this.itens = new Map(); this.email = 'conta@teste'; this.raiz = this.add(null, 'ARTES', FOLDER); }
  add(pai, name, mimeType, conteudo) { const id = 'D' + (++this.n); this.itens.set(id, { id, name, mimeType, pai, conteudo }); return id; }
  async filhos(id) { return [...this.itens.values()].filter(x => x.pai === id).map(x => ({ id: x.id, name: x.name, mimeType: x.mimeType })); }
  async buscar(q) { return [...this.itens.values()].filter(x => x.mimeType === FOLDER && x.pai === null && /name = 'ARTES'/.test(q)).map(x => ({ id: x.id, name: x.name, mimeType: x.mimeType })); }
  async baixar(id) { return this.itens.get(id).conteudo; }
  async capacidades() { return { nome: 'x', podeCriar: true }; }
}

test('preview: a miniatura sai do Drive pela API; sem a pasta ou antes de sincronizar, a tela recebe um aviso claro', async () => {
  const TOKEN = 'teste-token-preview-da-agencia-0123456789abc'; process.env.LEITURA_TOKEN = TOKEN; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server'), D = require('../lib/drive-org');
  const drive = new DriveFalso(); D._trocarDrive(() => drive);
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const usuario = { email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
  const adm = 'n7_session=' + encodeURIComponent(session.create(usuario, cfg().sessionSecret, 600));
  const J = (u, o = {}) => fetch(base + u, Object.assign({ headers: { cookie: adm, 'x-n7': '1', 'content-type': 'application/json' } }, o));
  const agente = (u, corpo) => fetch(base + '/api/leitura?acao=' + u, { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  try {
    await db.getRepo().upsert('Config', { chave: 'rascunho:CF-08', valor: JSON.stringify({ codigo: 'CF-08', marca: 'C', titulo: 'Teste', legenda: 'Legenda', imagens: ['01_capa.png'], status: 'novo', geradoEm: new Date().toISOString() }) }, { user: usuario });
    /* o agente manda as miniaturas */
    let r = await agente('previews', { codigo: 'CF-08', previews: ['01_capa.jpg', '../../etc/passwd', 'x.png'], pastaArtes: 'Campo Forte/CF-08' }); assert.equal(r.status, 200); const salvo = await r.json();
    assert.deepEqual(salvo.previews, ['01_capa.jpg'], 'só nomes .jpg simples são aceitos'); assert.equal(salvo.pastaArtes, 'Campo Forte/CF-08');
    assert.equal((await fetch(base + '/api/leitura?acao=previews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status >= 400, true, 'sem a chave do agente não grava');
    /* sem a pasta ARTES no Drive da conta de serviço */
    drive.itens.clear(); r = await J('/api/drive?acao=arte&codigo=CF-08&n=1'); assert.equal(r.status, 404); assert.match((await r.json()).error, /ARTES.*compartilhe/i);
    /* pasta existe mas a miniatura ainda não sincronizou */
    drive.raiz = drive.add(null, 'artes', FOLDER); const emp = drive.add(drive.raiz, 'campo forte', FOLDER), cod = drive.add(emp, 'CF-08', FOLDER);
    r = await J('/api/drive?acao=arte&codigo=CF-08&n=1'); assert.equal(r.status, 404); assert.match((await r.json()).error, /sincronizar/i);
    /* sincronizou */
    const prev = drive.add(cod, '_preview', FOLDER), jpg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex'); drive.add(prev, '01_capa.jpg', 'image/jpeg', jpg);
    r = await J('/api/drive?acao=arte&codigo=CF-08&n=1'); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg'); assert.deepEqual(Buffer.from(await r.arrayBuffer()), jpg);
    assert.equal((await J('/api/drive?acao=arte&codigo=CF-08&n=2')).status, 404, 'miniatura que não existe');
    assert.equal((await fetch(base + '/api/drive?acao=arte&codigo=CF-08&n=1')).status, 401, 'só quem está logado vê as artes');
    const ras = (await (await J('/api/drive?marca=C&acao=rascunhos')).json()).rascunhos[0]; assert.deepEqual(ras.previews, ['01_capa.jpg']);
  } finally { srv.close(); D._trocarDrive(null); delete process.env.LEITURA_TOKEN; db._resetMemory(); require('../lib/fila').reset(); }
});
