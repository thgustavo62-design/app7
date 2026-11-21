// Correções da revisão de código: permissões entre empresas, cookie malformado, conflito 409, calendário com Postgres e cópia por cabeçalho.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Repo, MemoryDriver, Conflict } = require('../lib/repo');
const model = require('../lib/model');
const session = require('../lib/session');
const { cfg } = require('../lib/config');

const mk = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const run = (r, ops, u = admin) => model.applyOps(new Repo(r.d), ops, u);

test('equipe restrita: cria pauta nova da própria empresa, mas não mexe em ideia nem em decisão de outra empresa', async () => {
  const r = mk(), edM = { email: 'm@x.com', papel: 'editor', tipo: 'equipe', empresas: ['M'] }, edF = { email: 'f@x.com', papel: 'editor', tipo: 'equipe', empresas: ['F'] };
  const novaM = { t: 'custom', op: 'upsert', code: 'X-NEW1', b: 'M', title: 'Pauta nova', format: 'Reels', date: '2026-12-01', time: '12:00', status: 'plan', steps: {} };
  assert.equal((await run(r, [novaM], edM)).results[0].v, '1', 'pauta nova da própria empresa');
  await assert.rejects(run(r, [{ ...novaM, code: 'X-NEW2', b: 'F' }], edM), /acesso a esta empresa/, 'mas não para outra empresa');
  await run(r, [{ t: 'idea', op: 'upsert', id: 'i-ideia-m', b: 'M', format: 'Reels', title: 'Da M', stage: 'nova', at: '2026-11-18' }], edM);
  await assert.rejects(run(r, [{ t: 'idea', op: 'upsert', id: 'i-ideia-m', b: 'F', format: 'Reels', title: 'Roubada', stage: 'nova', at: '2026-11-18' }], edF), /acesso a esta empresa/, 'ideia da M não vira da F');
  assert.equal((await new Repo(r.d).rows('Ideias')).find(i => i.id === 'i-ideia-m').titulo, 'Da M');
  await run(r, [{ t: 'decision', op: 'upsert', chave: 'dec-da-m-1', agente: 'estoque', marca: 'M', titulo: 'x', status: 'feita', ate: '2026-11-25', em: '2026-11-20' }], edM);
  await assert.rejects(run(r, [{ t: 'decision', op: 'delete', chave: 'dec-da-m-1' }], edF), /acesso a esta empresa/, 'decisão da M não é apagada pela F');
  await assert.rejects(run(r, [{ t: 'decision', op: 'upsert', chave: 'dec-da-m-1', agente: 'estoque', status: 'feita', ate: '2026-11-25', em: '2026-11-20' }], edF), /acesso a esta empresa/, 'nem sobrescrita sem informar a empresa');
  assert.equal((await new Repo(r.d).rows('Decisoes')).length, 1);
});

test('cookie malformado de outro app não derruba a leitura da sessão', () => {
  const t = session.create({ email: 'a@x.com', nome: 'A', papel: 'admin', tipo: 'equipe', empresas: [] }, cfg().sessionSecret, 600);
  const req = { headers: { cookie: `outro=100%; ruim=%E0%A4%A; ${session.NAME}=${encodeURIComponent(t)}` } };
  assert.doesNotThrow(() => session.parseCookies(req.headers.cookie));
  assert.equal(session.fromRequest(req, cfg().sessionSecret).email, 'a@x.com', 'a sessão válida continua sendo lida');
  assert.equal(session.parseCookies('x=100%').x, '100%');
});

test('conflito de versão fora do /api/mutate vira 409 com mensagem clara, não 500', async () => {
  const { handle } = require('../lib/http');
  let st = 0, body = null;
  const res = { writeHead(s) { st = s; }, setHeader() {}, end(b) { body = JSON.parse(b); }, get statusCode() { return st; }, set statusCode(v) { st = v; } };
  await handle(async () => { throw new Conflict('PromoCampanhas', {}); })({ headers: {} }, res);
  assert.equal(st, 409); assert.match(body.error, /Outra pessoa mudou/);
});

test('calendário ao vivo da Central também é lido com o Postgres em uso; só a memória usa o plano embutido', async () => {
  const central = require('../lib/central');
  process.env.DB_DRIVER = 'pg'; process.env.GOOGLE_SERVICE_ACCOUNT_JSON = 'x'; process.env.DATABASE_URL = 'postgres://x@localhost/x';
  try {
    const out = await central.plan({ clients: [{ key: 'M', name: 'M' }], staticPlan: [], central: 'abc', force: true, client: { values: async () => ({ values: [] }) } });
    assert.notEqual(out.report.reason, 'banco em memória (modo de desenvolvimento)', 'com pg não é "modo de desenvolvimento"');
    process.env.DB_DRIVER = 'memory'; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const mem = await central.plan({ clients: [{ key: 'M', name: 'M' }], staticPlan: [], central: 'abc', force: true });
    assert.match(mem.report.reason || '', /memória/);
  } finally { delete process.env.DB_DRIVER; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; delete process.env.DATABASE_URL; }
});

test('POSTGRES_URL sozinha, com DB_BACKEND=pg, escolhe o driver pg', () => {
  const keep = { ...process.env };
  try {
    delete process.env.DATABASE_URL; delete process.env.DB_DRIVER; process.env.POSTGRES_URL = 'postgres://x@h/db'; process.env.DB_BACKEND = 'pg';
    const c = cfg(); assert.equal(c.driver, 'pg'); assert.equal(c.databaseUrl, 'postgres://x@h/db');
  } finally { Object.keys(process.env).forEach(k => { if (!(k in keep)) delete process.env[k]; }); Object.assign(process.env, keep); }
});

test('cópia para a planilha usa o cabeçalho real do destino (colunas extras ou em outra ordem)', async () => {
  const { copyTabs } = require('../lib/db-copy'), { COLS } = require('../lib/schema');
  const rows = [{ _row: 2, marca: 'M', politica: 'internal_client', atualizado_em: 'a', atualizado_por: 'b' }];
  const from = { readMany: async () => ({ Politicas: { header: COLS.Politicas, rows } }) };
  const ordemTrocada = ['politica', 'marca', 'nota_extra', 'atualizado_em', 'atualizado_por'];
  let escrito = null;
  const to = { readMany: async () => ({ Politicas: { header: ordemTrocada, rows: [] } }), replace: async (tab, header, objs) => { escrito = { header, objs }; } };
  to.readMany = (calls => async t => (calls++ === 0 ? { Politicas: { header: ordemTrocada, rows: [] } } : { Politicas: { header: ordemTrocada, rows } }))(0);
  await copyTabs(from, to, ['Politicas']);
  assert.deepEqual(escrito.header, ordemTrocada, 'escreve na ordem do cabeçalho do destino, por nome de coluna');
});
