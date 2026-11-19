// Windsor.ai: busca dos resultados da Meta por conta, junção com a aba Semanas e gravação, com a API simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.WINDSOR_API_KEY = 'chave-de-teste'; process.env.CRON_SECRET = 'segredo-cron';
delete process.env.VERCEL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const W = require('../lib/windsor');
const model = require('../lib/model');
const { Repo, MemoryDriver } = require('../lib/repo');
const db = require('../lib/db');

const clients = [
  { key: 'M', name: 'Minas Farma', meta: { ads: '111', ig: 'ig-m', fb: 'pg-m' } },
  { key: 'F', name: 'Farma e Farma', meta: { ads: '222', ig: '', fb: '' } },
  { key: 'C', name: 'Campo Forte', meta: { ads: '', ig: '', fb: '' } }];

/* API simulada: devolve linhas conforme o conector e o campo pedidos */
function fakeFetch({ failFields = [], log = [] } = {}) {
  return async url => {
    const u = new URL(url); log.push(u);
    const connector = u.pathname.slice(1), fields = u.searchParams.get('fields').split(','), metric = fields[1];
    assert.equal(u.searchParams.get('api_key'), 'chave-de-teste');
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (failFields.includes(metric)) return json(400, { error: { code: 'bad_request', message: `Field ${metric} not found` } });
    const idField = fields[0], sel = (u.searchParams.get('select_accounts') || '').split(',').filter(Boolean);
    if (u.searchParams.get('date_preset')) {                                     /* listagem de contas */
      const nameField = fields[1];
      return json(200, { data: [{ [idField]: 'X1', [nameField]: 'Conta 1' }, { [idField]: 'X1', [nameField]: 'Conta 1' }, { [idField]: 'X2', [nameField]: 'Conta 2' }] });
    }
    const per = { spend: [['111', 40], ['111', 60.5], ['222', 70]], reach: [['111', 5000], ['222', 3000]], impressions: [['111', 9000]], views: [['ig-m', 119600]], page_impressions: [['pg-m', 11700]] };
    const rows = (per[metric] || sel.map(id => [id, 10])).filter(([id]) => sel.includes(id)).map(([id, v]) => ({ [idField]: id, [metric]: v }));
    return json(200, { data: rows });
  };
}

test('call: monta a URL com a chave, devolve data e traduz erros da API', async () => {
  const log = []; const rows = await W.call('facebook', { fields: 'account_id,spend', date_from: '2026-11-02', date_to: '2026-11-08' }, { fetchFn: fakeFetch({ log }) });
  assert.ok(Array.isArray(rows)); assert.match(log[0].href, /^https:\/\/connectors\.windsor\.ai\/facebook\?/); assert.equal(log[0].searchParams.get('_renderer'), 'json');
  await assert.rejects(W.call('instagram', { fields: 'account_id,nao_existe' }, { fetchFn: fakeFetch({ failFields: ['nao_existe'] }) }), /Windsor: Field nao_existe not found/);
  let n = 0; const flaky = async () => (++n < 3 ? { ok: false, status: 429, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ data: [{ a: 1 }] }) });
  assert.equal((await W.call('facebook', { fields: 'a' }, { fetchFn: flaky, sleep: async () => {} })).length, 1); assert.equal(n, 3, 'tenta de novo no 429');
  delete process.env.WINDSOR_API_KEY; await assert.rejects(W.call('facebook', { fields: 'a' }, { fetchFn: flaky }), /WINDSOR_API_KEY/); process.env.WINDSOR_API_KEY = 'chave-de-teste';
});
test('accounts: lista as contas de cada canal sem repetir', async () => {
  const a = await W.accounts({ fetchFn: fakeFetch() });
  assert.deepEqual(Object.keys(a).sort(), ['ads', 'fb', 'ig']); assert.deepEqual(a.ads.list, [{ id: 'X1', name: 'Conta 1' }, { id: 'X2', name: 'Conta 2' }]);
});
test('fetchWeek: soma as linhas de cada conta, separa por cliente e deixa sem dado o campo que falhou (nunca zero)', async () => {
  const w = await W.fetchWeek(clients, '2026-11-02', { fetchFn: fakeFetch({ failFields: ['profile_views'] }) });
  assert.equal(w.from, '2026-11-02'); assert.equal(w.to, '2026-11-08');
  const get = (m, ch) => w.itens.find(i => i.marca === m && i.canal === ch);
  assert.equal(get('M', 'ads').valores.gasto, 100.5, 'duas linhas somadas'); assert.equal(get('F', 'ads').valores.gasto, 70);
  assert.equal(get('M', 'ads').valores.alcance, 5000); assert.equal(get('F', 'ads').valores.alcance, 3000);
  assert.equal(get('M', 'ig').valores.views, 119600); assert.equal(get('M', 'ig').valores.visitas, null, 'campo recusado fica sem dado');
  assert.ok(get('M', 'ig').semDado.includes('visitas')); assert.ok(get('M', 'ig').falhas.some(f => f.campo === 'profile_views' && /not found/.test(f.erro)));
  assert.equal(get('M', 'fb').valores.views, 11700);
  assert.ok(!w.itens.some(i => i.marca === 'C'), 'cliente sem conta não é consultado');
  assert.ok(!w.itens.some(i => i.marca === 'F' && i.canal !== 'ads'));
});
test('mergeRow: só troca o que o Windsor trouxe; vendas e anotações ficam; sem nada novo não grava', () => {
  const existing = { tipo: 'semana', inicio: '2026-11-02', fim: '2026-11-08', marca: 'M', vendas: 109842.42, compras: 1747, dias: [1, 2, 3, 4, 5, 6, 7], c100n: 299, c100rs: 60468.02, ig: { views: 100, alcance: null, interacoes: 279, cliques: null, visitas: null, seguidores: null }, fb: {}, ads: {}, janela: 'janela x', fonte: 'PDF analítico', obs: 'nota', v: '3' };
  const itens = [{ marca: 'M', canal: 'ig', valores: { views: 119600, alcance: null, interacoes: null, cliques: 91, visitas: null, seguidores: 33 } }, { marca: 'M', canal: 'ads', valores: { gasto: 100.5, alcance: 5000, impressoes: null, resultados: null } }];
  const op = W.mergeRow(existing, 'M', '2026-11-02', itens, '2026-11-10');
  assert.equal(op.vendas, 109842.42); assert.equal(op.obs, 'nota'); assert.equal(op.janela, 'janela x'); assert.equal(op.v, '3');
  assert.equal(op.ig.views, 119600); assert.equal(op.ig.interacoes, 279, 'valor que o Windsor não trouxe é mantido'); assert.equal(op.ig.cliques, 91); assert.equal(op.ads.gasto, 100.5);
  assert.equal(op.fonte, 'Windsor.ai (2026-11-10) + PDF analítico');
  assert.equal(W.mergeRow(existing, 'M', '2026-11-02', [{ marca: 'M', canal: 'ig', valores: { views: null } }]), null);
  assert.equal(W.mergeRow(null, 'F', '2026-11-02', [{ marca: 'F', canal: 'ads', valores: { gasto: 70 } }]).v, undefined, 'linha nova');
});
test('sync: grava na aba Semanas preservando vendas, respeita a simulação (preview) e informa quando não há contas', async () => {
  const seed = require('../lib/seed').build({ devEmail: 'dev@x.test' });
  const driver = new MemoryDriver(seed), repo = () => new Repo(driver);
  const args = o => Object.assign({ repo: repo(), clients, weeks: ['2026-11-02'], applyOp: model.applyOp, weekFromRow: model.weekFromRow, fetchFn: fakeFetch(), now: new Date('2026-11-10T12:00:00Z') }, o);
  const dry = await W.sync(args({ dryRun: true })); assert.equal(dry.saved, 0); assert.ok(dry.weeks[0].itens.length >= 3);
  assert.equal((await repo().rows('Semanas')).find(r => r.inicio === '2026-11-02' && r.marca === 'M').ads_gasto, '', 'simulação não grava');
  const real = await W.sync(args({})); assert.equal(real.saved, 2);                      /* Minas e Farma */
  const m = (await repo().rows('Semanas')).find(r => r.inicio === '2026-11-02' && r.marca === 'M');
  assert.equal(m.ads_gasto, '100.5'); assert.equal(m.ig_views, '119600'); assert.equal(m.fb_views, '11700'); assert.equal(m.vendas, '109842.42', 'vendas do PDF preservadas');
  assert.match(m.fonte, /^Windsor\.ai \(2026-11-10\)/); assert.equal(m.versao, '2');
  const f = (await repo().rows('Semanas')).find(r => r.inicio === '2026-11-02' && r.marca === 'F'); assert.equal(f.ads_gasto, '70'); assert.equal(f.vendas, '49311.51');
  const none = await W.sync(args({ clients: [{ key: 'C', name: 'Campo Forte', meta: {} }] })); assert.match(none.aviso, /Nenhum cliente/);
  assert.equal(W.lastWeeks(2, new Date('2026-11-18T12:00:00Z')).join(), '2026-11-02,2026-11-09');
});
test('cadastro: IDs das contas Meta no cliente e na leitura do cadastro; caracteres estranhos são recusados', async () => {
  const seed = require('../lib/seed').build({ devEmail: 'dev@x.test' }), repo = new Repo(new MemoryDriver(seed));
  const adm = { email: 'dev@x.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
  const op = { t: 'client', chave: 'M', id: 'minas-farma', nome: 'Minas Farma', curto: 'Minas', cor: '--c1', segmento: 's', perfil: '@m', setor: 'saude', servicos: ['redes', 'trafego', 'varejo'], ativo: 'sim', v: '1' };
  await model.applyOps(repo, [Object.assign({}, op, { meta_ads: 'act_111', meta_ig: '178414', meta_fb: '999,888' })], adm);
  const c = (await model.loadRegistry(new Repo(repo.d), adm)).clients.find(x => x.key === 'M');
  assert.deepEqual(c.meta, { ads: 'act_111', ig: '178414', fb: '999,888' });
  await assert.rejects(model.applyOps(new Repo(repo.d), [Object.assign({}, op, { v: '2', meta_ads: 'x; DROP TABLE' })], adm), /Conta de anúncios inválido/);
  await model.applyOps(new Repo(repo.d), [Object.assign({}, op, { v: '2' })], adm);        /* sem os campos: não apaga o que já estava */
  assert.equal((await model.loadRegistry(new Repo(repo.d), adm)).clients.find(x => x.key === 'M').meta.ads, 'act_111');
});
test('rotas: o agendador só entra com o segredo; as demais exigem administrador', async () => {
  db._resetMemory();
  const { createServer } = require('../dev-server'), session = require('../lib/session'), { cfg } = require('../lib/config');
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const call = async (p, { headers = {}, method = 'GET', body } = {}) => { const r = await fetch(base + p, { method, headers: Object.assign({ 'content-type': 'application/json', 'x-n7': '1' }, headers), body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { status: r.status, j }; };
  const ck = u => ({ cookie: 'n7_session=' + encodeURIComponent(session.create(u, cfg().sessionSecret, 600)) });
  try {
    assert.equal((await call('/api/windsor?cron=1')).status, 401); assert.equal((await call('/api/windsor?cron=1', { headers: { authorization: 'Bearer errado' } })).status, 401);
    const ok = await call('/api/windsor?cron=1', { headers: { authorization: 'Bearer segredo-cron' } }); assert.equal(ok.status, 200); assert.match(ok.j.report.aviso, /Nenhum cliente/);
    assert.equal((await call('/api/windsor')).status, 401);
    const ed = ck({ email: 'e@x.com', nome: 'E', papel: 'editor', tipo: 'equipe', empresas: [] }); assert.equal((await call('/api/windsor', { headers: ed })).status, 403);
    const cli = ck({ email: 'c@x.com', nome: 'C', papel: 'cliente', tipo: 'cliente', empresas: ['F'] }); assert.equal((await call('/api/windsor', { headers: cli })).status, 403);
    const adm = ck({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] });
    const st = await call('/api/windsor', { headers: adm }); assert.equal(st.status, 200); assert.equal(st.j.configured, true); assert.equal(st.j.mapped, 0);
    assert.equal((await call('/api/windsor', { method: 'POST', headers: adm, body: { action: 'apagar' } })).status, 400);
    assert.equal((await call('/api/windsor', { method: 'POST', headers: adm, body: { action: 'sync', inicio: 'ontem' } })).status, 400);
    assert.equal((await call('/api/windsor', { method: 'POST', headers: Object.assign({ 'x-n7': '' }, adm), body: { action: 'sync' } })).status, 403, 'POST exige o cabeçalho de origem');
  } finally { srv.close(); db._resetMemory(); }
});

test('sync do mês: pede o período inteiro (alcance do mês não é a soma das semanas) e grava linha de mês sem mexer nas semanas', async () => {
  const seed = require('../lib/seed').build({ devEmail: 'dev@x.test' });
  const driver = new MemoryDriver(seed), repo = () => new Repo(driver), log = [];
  const args = { repo: repo(), clients, weeks: ['2026-10-01'], tipo: 'mes', applyOp: model.applyOp, weekFromRow: model.weekFromRow, fetchFn: fakeFetch({ log }), now: new Date('2026-11-02T12:00:00Z') };
  const r = await W.sync(args); assert.equal(r.saved, 2); assert.equal(r.weeks[0].from, '2026-10-01'); assert.equal(r.weeks[0].to, '2026-10-31');
  const q = log.find(u => u.searchParams.get('date_from')); assert.equal(q.searchParams.get('date_from'), '2026-10-01'); assert.equal(q.searchParams.get('date_to'), '2026-10-31');
  const rows = await repo().rows('Semanas'), m = rows.find(x => x.tipo === 'mes' && x.inicio === '2026-10-01' && x.marca === 'M');
  assert.equal(m.fim, '2026-10-31'); assert.equal(m.ads_alcance, '5000'); assert.equal(m.ads_gasto, '100.5'); assert.equal(m.vendas, '', 'vendas do mês não são inventadas');
  assert.equal(rows.filter(x => x.tipo === 'semana').length, 6, 'as semanas continuam como estavam');
  assert.equal(W.lastMonths(2, new Date('2026-11-18T12:00:00Z')).join(), '2026-09-01,2026-10-01');
});
