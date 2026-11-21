// Testes do servidor: sessão, login Google, repositório com versões, cliente do Sheets e rotas HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.AUTH_DEV_EMAIL = 'dev@local';
delete process.env.VERCEL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const session = require('../lib/session');
const { verifyIdToken, _resetCache } = require('../lib/googleid');
const { Repo, MemoryDriver, SheetsDriver, Conflict, colLetter } = require('../lib/repo');
const { SheetsClient } = require('../lib/google');
const model = require('../lib/model');
const db = require('../lib/db');

/* ---------- sessão ---------- */
test('sessão: assina, aceita e recusa adulteração e vencimento', () => {
  const u = { email: 'a@b.com', nome: 'Ana', papel: 'editor', tipo: 'equipe', empresas: [] };
  const t = session.create(u, 'segredo', 60, 1000e3);
  assert.deepEqual(session.verify(t, 'segredo', 1010e3), u);
  assert.equal(session.verify(t, 'outro', 1010e3), null);
  assert.equal(session.verify(t, 'segredo', 1100e3), null, 'vencida');
  const [b, s] = t.split('.'); const forged = Buffer.from(JSON.stringify({ e: 'a@b.com', n: '', r: 'admin', x: 9e9 })).toString('base64url');
  assert.equal(session.verify(forged + '.' + s, 'segredo', 1010e3), null, 'papel adulterado');
  assert.throws(() => session.create(u, '', 60));
  assert.match(session.setCookie('x', { secure: true, maxAge: 5 }), /HttpOnly; SameSite=Lax; Max-Age=5; Secure/);
});

/* ---------- login Google ---------- */
function googleToken(claims, kp, kid = 'k1') {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), kp.privateKey).toString('base64url')}`;
}
test('login Google: valida assinatura, público, validade e e-mail verificado', async () => {
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = [Object.assign(kp.publicKey.export({ format: 'jwk' }), { kid: 'k1' })];
  const now = 2000e3, ok = { iss: 'https://accounts.google.com', aud: 'cid', exp: 2100, email: 'Ana@Exemplo.com', email_verified: true, name: 'Ana' };
  assert.deepEqual(await verifyIdToken(googleToken(ok, kp), { clientId: 'cid', jwks, now }), { email: 'ana@exemplo.com', name: 'Ana' });
  await assert.rejects(verifyIdToken(googleToken(ok, kp), { clientId: 'outro', jwks, now }), /outro aplicativo/);
  await assert.rejects(verifyIdToken(googleToken({ ...ok, exp: 1000 }, kp), { clientId: 'cid', jwks, now }), /expirado/);
  await assert.rejects(verifyIdToken(googleToken({ ...ok, email_verified: false }, kp), { clientId: 'cid', jwks, now }), /verificado/);
  await assert.rejects(verifyIdToken(googleToken({ ...ok, iss: 'https://evil.com' }, kp), { clientId: 'cid', jwks, now }), /Emissor/);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(verifyIdToken(googleToken(ok, other), { clientId: 'cid', jwks, now }), /Assinatura/);
  await assert.rejects(verifyIdToken(googleToken(ok, kp, 'zzz'), { clientId: 'cid', jwks, now }), /desconhecida/);
  _resetCache();
});

/* ---------- repositório ---------- */
const user = { email: 'ana@exemplo.com', nome: 'Ana', papel: 'admin' };
test('repositório: versões, conflito, remoção e eventos sem duplicar', async () => {
  const d = new MemoryDriver(); let r = new Repo(d, { now: () => '2026-11-18T10:00:00.000Z' });
  const a = await r.upsert('Ideias', { id: 'i1', marca: 'F', formato: 'Reels', titulo: 'x', etapa: 'nova' }, { user });
  assert.equal(a.versao, '1'); assert.equal(a.atualizado_por, 'ana@exemplo.com');
  r = new Repo(d);
  const b = await r.upsert('Ideias', { id: 'i1', titulo: 'y' }, { baseV: '1', user });
  assert.equal(b.versao, '2'); assert.equal(b.marca, 'F', 'mantém campos não enviados');
  r = new Repo(d);
  await assert.rejects(r.upsert('Ideias', { id: 'i1', titulo: 'z' }, { baseV: '1', user }), Conflict);
  await assert.rejects(r.upsert('Ideias', { id: 'i1', titulo: 'z' }, { user }), Conflict, 'quem não sabe a versão também conflita');
  assert.equal(await r.remove('Ideias', { id: 'i1' }), true);
  assert.equal((await new Repo(d).rows('Ideias')).length, 0);
  r = new Repo(d);
  assert.ok(!(await r.append('Aprovacoes', { id: 'e-aaaaaa', codigo: 'C-F01', tipo: 'internal', acao: 'aprovou', por: 'Ana', em: 'x', texto: '' })).duplicate);
  assert.equal((await r.append('Aprovacoes', { id: 'e-aaaaaa', codigo: 'C-F01' })).duplicate, true);
  r = new Repo(d); await r.upsert('Politicas', { marca: 'F', politica: 'none' }, { baseV: 'qualquer', user });
  assert.equal((await new Repo(d).rows('Politicas')).length, 1, 'aba sem versao não confere versão');
});

/* ---------- cliente do Sheets (resposta do Google simulada) ---------- */
function fakeGoogle() {
  const calls = []; let n429 = 0;
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = JSON.stringify({ client_email: 'robo@proj.iam.gserviceaccount.com', private_key: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body, auth: init.headers && init.headers.Authorization });
    if (String(url).includes('oauth2.googleapis.com/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    if (n429-- > 0) return { ok: false, status: 429, json: async () => ({}) };
    if (String(url).includes('values:batchGet')) return { ok: true, status: 200, json: async () => ({ valueRanges: [{ values: [['id', 'marca', 'formato', 'titulo', 'observacao', 'etapa', 'origem', 'criada_em', 'pauta_codigo', 'versao', 'atualizado_em', 'atualizado_por'], ['i1', 'F', 'Reels', 'Ideia', '', 'nova', '', '2026-11-18', '', '3'], [], ['i2', 'M', 'Carrossel', 'Outra', '', 'aprovada']] }] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { calls, sa, fetchFn, fail429: k => { n429 = k; } };
}
test('Sheets: token da conta de serviço, leitura por nome de coluna, escrita RAW e nova tentativa em 429', async () => {
  const g = fakeGoogle();
  const client = new SheetsClient({ sheetId: 'SHEET', serviceAccount: Buffer.from(g.sa).toString('base64'), fetchFn: g.fetchFn, now: () => 5e12, sleep: async () => {} });
  const drv = new SheetsDriver(client), repo = new Repo(drv, { now: () => 'T' });
  const rows = await repo.rows('Ideias');
  assert.equal(rows.length, 2, 'linha vazia ignorada'); assert.equal(rows[0]._row, 2); assert.equal(rows[1]._row, 4); assert.equal(rows[1].versao, '');
  assert.match(g.calls.find(c => c.url.includes('batchGet')).url, /ranges=Ideias&majorDimension=ROWS/);
  assert.equal(g.calls.find(c => c.url.includes('batchGet')).auth, 'Bearer tok');
  g.fail429(2);
  await repo.upsert('Ideias', { id: 'i1', titulo: 'Novo' }, { baseV: '3', user });
  const put = g.calls.find(c => c.method === 'PUT');
  assert.match(put.url, /values\/Ideias!A2%3AL2\?valueInputOption=RAW|values\/Ideias!A2:L2\?valueInputOption=RAW/);
  assert.equal(JSON.parse(put.body).values[0][3], 'Novo'); assert.equal(JSON.parse(put.body).values[0][9], '4');
  assert.equal(g.calls.filter(c => c.url.includes('oauth2')).length, 1, 'token em cache');
  await repo.upsert('Ideias', { id: 'novo', marca: 'N', formato: 'Reels', titulo: 'T', etapa: 'nova' }, { user });
  const ap = g.calls.find(c => c.method === 'POST' && c.url.includes(':append'));
  assert.match(ap.url, /insertDataOption=INSERT_ROWS/); assert.equal(JSON.parse(ap.body).values[0][0], 'novo');
  assert.equal(colLetter(1), 'A'); assert.equal(colLetter(26), 'Z'); assert.equal(colLetter(27), 'AA');
});
test('Sheets: aba sem coluna esperada dá erro claro; erro 403 do Google vira mensagem', async () => {
  const c = { batchGet: async () => ({ valueRanges: [{ values: [['id', 'marca']] }] }) };
  await assert.rejects(new Repo(new SheetsDriver(c)).rows('Ideias'), /aba Ideias não tem a coluna/);
  const g = fakeGoogle();
  const bad = new SheetsClient({ sheetId: 'S', serviceAccount: g.sa, fetchFn: async (u) => String(u).includes('oauth2') ? { ok: true, json: async () => ({ access_token: 't' }) } : { ok: false, status: 403, json: async () => ({ error: { message: 'sem permissão' } }) }, sleep: async () => {} });
  await assert.rejects(bad.batchGet(['Ideias']), /Sheets 403: sem permissão/);
});

/* ---------- operações (modelo) ---------- */
const mk = () => new Repo(new MemoryDriver());
test('operações: validação, papéis e versões', async () => {
  const ed = { email: 'e@x.com', papel: 'editor' }, lei = { email: 'l@x.com', papel: 'leitura' };
  let r = mk();
  const ok = await model.applyOps(r, [{ t: 'idea', op: 'upsert', id: 'id-1', b: 'M', format: 'Reels', title: 'Ideia boa', note: '', stage: 'nova', src: 'x', at: '2026-11-18' }], ed);
  assert.equal(ok.results[0].v, '1');
  const bad = async (op, u = ed, re = /inválid|obrigat|passa|precisa/) => assert.rejects(model.applyOps(mk(), [op], u), re);
  await bad({ t: 'idea', op: 'upsert', id: 'a', b: 'X', format: 'Reels', title: 'T', stage: 'nova' });
  await bad({ t: 'idea', op: 'upsert', id: 'a', b: 'M', format: 'Reels', title: '', stage: 'nova' });
  await bad({ t: 'idea', op: 'upsert', id: 'a', b: 'M', format: 'Reels', title: 'T', stage: 'nova', at: '2026-13-45' });
  await bad({ t: 'override', op: 'upsert', code: 'C-F05', status: 'foo' });
  await bad({ t: 'override', op: 'upsert', code: '../x', status: 'plan' });
  await bad({ t: 'custom', op: 'upsert', code: 'I-F01', b: 'F', format: 'Reels', title: 'T', date: '2027-01-04', time: '25:00' });
  await bad({ t: 'custom', op: 'upsert', code: 'I-F01', b: 'F', format: 'Reels', title: 'T', date: '2027-01-04', doc: 'javascript:alert(1)' });
  await bad({ t: 'event', ev: { id: 'x', code: 'C-F01', kind: 'internal', act: 'aprovou' } });
  await bad({ t: 'goal', key: 'M-sales', value: -1 });
  await bad({ t: 'nada' }, ed, /desconhecido/);
  await bad({ t: 'idea', op: 'upsert', id: 'id-1', b: 'M', format: 'Reels', title: 'T', stage: 'nova' }, lei, /só de leitura/);
  await bad({ t: 'policy', marca: 'F', politica: 'none' }, ed, /administradores/);
  await bad({ t: 'slots', marca: 'F', rows: [] }, ed, /administradores/);
  await assert.rejects(model.applyOps(mk(), new Array(41).fill({ t: 'goal', key: 'M-sales', value: 1 }), ed), /demais/);
  // conflito de versão: devolve 409 lógico sem aplicar o resto
  r = mk(); await model.applyOps(r, [{ t: 'override', op: 'upsert', code: 'C-F05', status: 'prod', date: '2026-11-16' }], ed);
  r = new Repo(r.d);
  const c = await model.applyOps(r, [{ t: 'override', op: 'upsert', code: 'C-F05', status: 'apr', date: '2026-11-16', v: '9' }, { t: 'goal', key: 'M-sales', value: 5 }], ed);
  assert.equal(c.conflict.index, 0); assert.equal(c.results.length, 0);
  assert.equal((await new Repo(r.d).rows('Metas')).length, 0, 'operações depois do conflito não rodam');
});
test('operações: evento (idempotente, hora ajustada), checagem, meta, política e horários', async () => {
  const ed = { email: 'e@x.com', papel: 'editor' }, now = Date.parse('2026-11-18T12:00:00Z');
  const d = new MemoryDriver(); const run = (ops, u = user) => model.applyOps(new Repo(d), ops, u, now);
  const ev = { id: 'e-abc123', code: 'C-F05', kind: 'client', act: 'aprovou', by: 'Sr. Paulo', at: '2020-01-01T00:00:00Z', text: '' };
  const a = await run([{ t: 'event', ev }], ed); assert.equal(a.results[0].at, '2026-11-18T12:00:00.000Z', 'hora absurda vira hora do servidor');
  const b = await run([{ t: 'event', ev }], ed); assert.equal(b.results[0].duplicate, true);
  await run([{ t: 'check', op: 'upsert', code: 'C-F05', dims: { native: 100 }, checks: { 0: true }, nota: 96 }, { t: 'goal', key: 'F-sales', value: 60000 }, { t: 'policy', marca: 'F', politica: 'none' }], ed.papel === 'editor' ? { ...ed, papel: 'admin' } : ed);
  const slots = [{ dow: 1, time: '12:00', format: 'Carrossel' }, { dow: 3, time: '18:30', format: 'Reels' }, { dow: 5, time: '12:00', format: 'Qualquer' }];
  await run([{ t: 'slots', marca: 'F', rows: slots }]);
  await run([{ t: 'slots', marca: 'F', rows: slots.slice(0, 2) }]);
  const s = await model.loadState(new Repo(d));
  assert.equal(s.events.length, 1); assert.equal(s.events[0].by, 'Sr. Paulo');
  assert.deepEqual(s.checks['C-F05'], { dims: { native: 100 }, checks: { 0: true } });
  assert.equal(s.goals['F-sales'], 60000); assert.equal(s.flow.policy.F, 'none');
  assert.deepEqual(s.flow.slots.F, [{ dow: 1, time: '12:00', format: 'Carrossel' }, { dow: 3, time: '18:30', format: 'Reels' }]);
  await run([{ t: 'goal', op: 'delete', key: 'F-sales' }]);
  assert.equal(Object.keys((await model.loadState(new Repo(d))).goals).length, 0);
});
test('usuários: e-mail em minúsculas, inativo bloqueado, papel inválido vira leitura', async () => {
  const d = new MemoryDriver({ Usuarios: [{ email: 'Ana@X.com', nome: 'Ana', papel: 'admin', ativo: 'sim' }, { email: 'b@x.com', nome: 'B', papel: 'chefe', ativo: '' }, { email: 'c@x.com', nome: 'C', papel: 'editor', ativo: 'nao' }] });
  assert.equal((await model.findUser(new Repo(d), ' ana@x.COM ')).papel, 'admin');
  assert.equal((await model.findUser(new Repo(d), 'b@x.com')).papel, 'leitura');
  assert.equal(await model.findUser(new Repo(d), 'c@x.com'), null);
  assert.equal(await model.findUser(new Repo(d), 'z@x.com'), null);
});

/* ---------- rotas HTTP (servidor local, dados em memória) ---------- */
test('rotas: sem login nada sai; login de desenvolvimento; estado; gravação; segurança de origem; dados protegidos', async () => {
  db._resetMemory();
  const { createServer } = require('../dev-server');
  const srv = createServer(); await new Promise(r => srv.listen(0, r));
  const base = 'http://localhost:' + srv.address().port; let cookie = '';
  const call = async (path, { method = 'GET', body, headers = {}, auth = true } = {}) => {
    const res = await fetch(base + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, auth && cookie ? { cookie } : {}, headers), body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc && path.includes('action=dev')) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), res };
  };
  try {
    assert.equal((await call('/api/state')).status, 401);
    assert.equal((await call('/api/data')).status, 401, 'dados dos clientes protegidos');
    assert.equal((await call('/api/mutate', { method: 'POST', body: { ops: [] }, headers: { 'x-n7': '1' } })).status, 401);
    const me = await call('/api/auth?action=me'); assert.equal(me.status, 401); assert.equal(me.body.login.dev, true);
    assert.equal((await call('/api/auth?action=dev', { method: 'POST' })).status, 403, 'login exige cabeçalho X-N7');
    assert.equal((await call('/api/auth?action=dev', { method: 'POST', headers: { 'x-n7': '1', origin: 'https://evil.com' } })).status, 403, 'origem de outro site');
    const lg = await call('/api/auth?action=dev', { method: 'POST', headers: { 'x-n7': '1' } });
    assert.equal(lg.status, 200); assert.match(lg.res.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await call('/api/auth?action=me')).body.user.papel, 'admin');
    const st = await call('/api/state'); assert.equal(st.status, 200);
    assert.equal(st.body.state.ideas.length, 4); assert.equal(st.body.state.flow.policy.N, 'internal'); assert.equal(st.body.state.flow.slots.M.length, 4);
    const data = await call('/api/data'); assert.equal(data.status, 200); assert.match(data.body, /window\.N7 = /);
    const noHdr = await call('/api/mutate', { method: 'POST', body: { ops: [{ t: 'goal', key: 'M-sales', value: 1 }] } }); assert.equal(noHdr.status, 403);
    const mu = await call('/api/mutate', { method: 'POST', headers: { 'x-n7': '1' }, body: { ops: [{ t: 'override', op: 'upsert', code: 'C-F05', status: 'prod', date: '2026-11-16' }] } });
    assert.equal(mu.status, 200); assert.equal(mu.body.results[0].v, '1');
    const again = await call('/api/mutate', { method: 'POST', headers: { 'x-n7': '1' }, body: { ops: [{ t: 'override', op: 'upsert', code: 'C-F05', status: 'apr', date: '2026-11-16', v: '7' }] } });
    assert.equal(again.status, 409); assert.equal(again.body.error, 'conflict');
    const inv = await call('/api/mutate', { method: 'POST', headers: { 'x-n7': '1' }, body: { ops: [{ t: 'override', op: 'upsert', code: 'C-F05', status: 'xxx' }] } });
    assert.equal(inv.status, 400); assert.match(inv.body.error, /Status inválido/);
    const st2 = await call('/api/state'); assert.equal(st2.body.state.overrides['C-F05'].status, 'prod');
    const out = await call('/api/auth?action=logout', { method: 'POST', headers: { 'x-n7': '1' } }); assert.match(out.res.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await call('/api/nao-existe')).status, 404);
    assert.equal((await call('/../private/data.js', { auth: false })).status, 404, 'private/ não é servido como arquivo');
    assert.equal((await call('/assets/js/data.js', { auth: false })).status, 404, 'data.js não está mais na pasta pública');
    assert.equal((await call('/index.html', { auth: false })).status, 200);
  } finally { srv.close(); }
});

/* ---------- semanas e meses ---------- */
test('semanas: estado vem da planilha, gravação valida período e números, ausência de dado não vira zero', async () => {
  const ed = { email: 'e@x.com', papel: 'editor' }, lei = { email: 'l@x.com', papel: 'leitura' };
  const st0 = await model.loadState(new Repo(new MemoryDriver(require('../lib/seed').build({}))));
  assert.equal(st0.weeks.length, 6); assert.equal(st0.weekGen.length, 1);
  const w = st0.weeks.find(x => x.inicio === '2026-11-02' && x.marca === 'M');
  assert.equal(w.vendas, 109842.42); assert.equal(w.dias.length, 7); assert.equal(w.ig.views, 119600); assert.equal(w.ads.gasto, null, 'campo vazio fica null, não 0');
  const row = { t: 'week', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', marca: 'M', vendas: 120000.5, compras: 1800, dias: [1, 2, 3, 4, 5, 6, 7], ig: { views: 1000 }, fb: {}, ads: { gasto: 45, resultados: 0 }, fonte: 'teste' };
  const r = mk(); const ok = await model.applyOps(r, [row], ed); assert.equal(ok.results[0].v, '1');
  const st = await model.loadState(new Repo(r.d));
  const n = st.weeks.find(x => x.inicio === '2026-11-09');
  assert.equal(n.fim, '2026-11-15'); assert.equal(n.ads.gasto, 45); assert.equal(n.ads.resultados, 0, 'zero informado continua zero'); assert.equal(n.ads.alcance, null); assert.equal(n.dias[6], 7);
  const bad = async (op, u = ed, re = /inválid|precisa|Informe/) => assert.rejects(model.applyOps(mk(), [op], u), re);
  await bad({ ...row, inicio: '2026-11-10' });                                    /* terça */
  await bad({ ...row, tipo: 'mes', inicio: '2026-11-09' });                        /* mês sem dia 1 */
  await bad({ ...row, vendas: -5 });
  await bad({ ...row, vendas: 'abc' });
  await bad({ ...row, dias: [1, 2, 3] });
  await bad({ ...row, marca: 'Z' });
  await bad(row, lei, /só de leitura/);
  /* mês: fim = último dia; reenvio exige a versão */
  const rm = mk(); await model.applyOps(rm, [{ ...row, tipo: 'mes', inicio: '2026-10-01', dias: [] }], ed);
  assert.equal((await model.loadState(new Repo(rm.d))).weeks.find(x => x.tipo === 'mes').fim, '2026-10-31');
  const c = await model.applyOps(new Repo(rm.d), [{ ...row, tipo: 'mes', inicio: '2026-10-01', dias: [], vendas: 1, v: '9' }], ed); assert.ok(c.conflict);
  const up = await model.applyOps(new Repo(rm.d), [{ ...row, tipo: 'mes', inicio: '2026-10-01', dias: [], vendas: 1, v: '1' }], ed); assert.equal(up.results[0].v, '2');
  /* decisão da semana */
  const g = new Repo(new MemoryDriver(require('../lib/seed').build({})));
  const gr = await model.applyOps(g, [{ t: 'weekgen', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', promocao: 'BF', decisao: 'Cortar frequência', rumo: 'nao' }], ed); assert.equal(gr.results[0].v, '1');
  assert.equal((await model.loadState(new Repo(g.d))).weekGen.find(x => x.inicio === '2026-11-09').rumo, 'nao');
  await assert.rejects(model.applyOps(mk(), [{ t: 'weekgen', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', rumo: 'talvez' }], ed), /inválid/);
  /* apagar */
  await model.applyOps(g, [{ t: 'week', op: 'delete', tipo: 'semana', inicio: '2026-11-02', marca: 'F', v: '1' }], ed);
  assert.equal((await model.loadState(new Repo(g.d))).weeks.some(x => x.inicio === '2026-11-02' && x.marca === 'F'), false);
});

/* ---------- empresas, usuários e escopo ---------- */
const seeded = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const newClient = { t: 'client', chave: 'PBP', id: 'padaria-bom-pao', nome: 'Padaria Bom Pão', curto: 'Bom Pão', cor: '--c5', segmento: 'Padaria · Baixo Guandu-ES', perfil: '@bompao', setor: 'varejo', servicos: ['trafego', 'criativos'] };
const planOf = b => require('../lib/dataset').load().PLAN.find(p => p.b === b).code;

test('empresas: cadastro com serviços, validações, desativar e uso como marca nas outras operações', async () => {
  const r = seeded();
  const reg0 = await model.loadRegistry(r, admin);
  assert.deepEqual(reg0.clients.map(c => c.key), ['M', 'F', 'C', 'N']);
  assert.deepEqual(reg0.clients[0].services, ['redes', 'trafego', 'varejo', 'promocoes']); assert.deepEqual(reg0.clients[2].services, ['redes']);
  const ok = await model.applyOps(r, [newClient], admin); assert.equal(ok.results[0].v, '1');
  const c = (await model.loadRegistry(new Repo(r.d), admin)).clients.find(x => x.key === 'PBP');
  assert.deepEqual(c.services, ['trafego', 'criativos']); assert.equal(c.active, true);
  const bad = (op, re, u = admin) => assert.rejects(model.applyOps(seeded(), [op], u), re);
  await bad({ ...newClient, chave: 'pbp' }, /Chave inválida/);
  await bad({ ...newClient, id: 'config' }, /reservado/);
  await bad({ ...newClient, id: 'minas-farma' }, /Já existe/);
  await bad({ ...newClient, servicos: [] }, /pelo menos um serviço/);
  await bad({ ...newClient, servicos: ['xyz'] }, /pelo menos um serviço/);
  await bad({ ...newClient, cor: '--c99' }, /Cor inválido/);
  await bad({ ...newClient, op: 'delete' }, /desative/);
  await bad(newClient, /configurações/, { email: 'e@x.com', papel: 'editor' });
  /* a nova empresa vale como marca; desativada deixa de valer */
  const idea = { t: 'idea', op: 'upsert', id: 'id-pbp', b: 'PBP', format: 'Reels', title: 'Fornada', stage: 'nova', at: '2026-11-18' };
  assert.equal((await model.applyOps(new Repo(r.d), [idea], admin)).results[0].v, '1');
  await model.applyOps(new Repo(r.d), [{ ...newClient, ativo: 'nao', v: '1' }], admin);
  await assert.rejects(model.applyOps(new Repo(r.d), [{ ...idea, id: 'id-2' }], admin), /Empresa inválida/);
  assert.equal((await model.loadRegistry(new Repo(r.d), { email: 'e@x.com', papel: 'editor', tipo: 'equipe', empresas: [] })).clients.some(x => x.key === 'PBP'), false, 'não-admin não vê empresa desativada');
  /* planilha ainda vazia: os quatro iniciais seguem valendo e vão junto na primeira gravação */
  const vazio = mk(); await model.applyOps(vazio, [newClient], admin);
  assert.equal((await new Repo(vazio.d).rows('Clientes')).length, 5);
});

test('usuários: cadastro por administrador, tipo equipe e cliente, trava do último administrador', async () => {
  const r = seeded();
  const add = (o, u = admin, repo = r) => model.applyOps(new Repo(repo.d), [Object.assign({ t: 'user', op: 'upsert' }, o)], u);
  await add({ email: 'Ana@Agencia.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: ['M', 'F'] });
  await add({ email: 'dono@padaria.com', nome: 'Dono', tipo: 'cliente', empresas: ['F'] });
  const f = await model.findUser(new Repo(r.d), 'ANA@agencia.com'); assert.deepEqual([f.tipo, f.papel, f.empresas], ['equipe', 'editor', ['M', 'F']]);
  const c = await model.findUser(new Repo(r.d), 'dono@padaria.com'); assert.deepEqual([c.tipo, c.papel, c.empresas], ['cliente', 'cliente', ['F']]);
  const reg = await model.loadRegistry(new Repo(r.d), admin); assert.equal(reg.users.length, 3);
  assert.equal((await model.loadRegistry(new Repo(r.d), f)).users, undefined, 'só administrador recebe a lista de usuários');
  await assert.rejects(add({ email: 'x@y.com', nome: 'X', tipo: 'cliente', empresas: [] }), /pelo menos uma empresa/);
  await assert.rejects(add({ email: 'x@y.com', nome: 'X', tipo: 'cliente', empresas: ['ZZ'] }), /Empresa inválida/);
  await assert.rejects(add({ email: 'x@y', nome: 'X', tipo: 'equipe', papel: 'editor' }), /E-mail inválido/);
  await assert.rejects(add({ email: 'x@y.com', nome: 'X', tipo: 'equipe', papel: 'chefe' }), /Papel inválido/);
  await assert.rejects(add({ email: 'x@y.com', nome: 'X', tipo: 'equipe', papel: 'leitura' }, f), /configurações/);
  await assert.rejects(add({ email: 'dev@agencia.test', nome: 'Dev', tipo: 'equipe', papel: 'editor' }), /próprio acesso/);
  await assert.rejects(add({ email: 'dev@agencia.test', op: 'delete' }), /próprio acesso/);
  await add({ email: 'ana@agencia.com', nome: 'Ana', tipo: 'equipe', papel: 'admin' });                       /* promove */
  await add({ email: 'dev@agencia.test', nome: 'Dev', tipo: 'equipe', papel: 'admin', ativo: 'nao' }, { ...admin, email: 'ana@agencia.com' });
  assert.equal(await model.findUser(new Repo(r.d), 'dev@agencia.test'), null, 'desativado não entra');
  await assert.rejects(add({ email: 'ana@agencia.com', op: 'delete' }, { ...admin, email: 'outro@x.com' }), /pelo menos um administrador/);
  await add({ email: 'dono@padaria.com', op: 'delete' }); assert.equal(await model.findUser(new Repo(r.d), 'dono@padaria.com'), null);
});

test('escopo: usuário cliente só aprova pautas da própria empresa; equipe restrita só mexe nas empresas listadas', async () => {
  const r = seeded(), cliF = { email: 'dono@f.com', nome: 'Dona da Farma', papel: 'cliente', tipo: 'cliente', empresas: ['F'] };
  const ev = (code, kind = 'client', act = 'aprovou') => ({ t: 'event', ev: { id: 'e-' + Math.random().toString(36).slice(2, 10), code, kind, act, by: 'Fulano', text: 'ok' } });
  const run = (ops, u) => model.applyOps(new Repo(r.d), ops, u);
  await run([ev(planOf('F'))], cliF);
  const ev1 = (await new Repo(r.d).rows('Aprovacoes'))[0]; assert.equal(ev1.por, 'Dona da Farma', 'o nome vem do login, não do pedido');
  await assert.rejects(run([ev(planOf('M'))], cliF), /acesso a esta pauta/);
  await assert.rejects(run([ev(planOf('F'), 'internal')], cliF), /só registram aprovação do cliente/);
  await assert.rejects(run([{ t: 'override', op: 'upsert', code: planOf('F'), status: 'pub' }], cliF), /só registram aprovação/);
  await assert.rejects(run([{ t: 'goal', key: 'F-sales', value: 1 }], cliF), /só registram aprovação/);
  await assert.rejects(run([{ t: 'user', op: 'upsert', email: 'a@b.com', nome: 'A', tipo: 'equipe', papel: 'admin' }], cliF), /configurações/);
  /* estado recortado */
  const st = await model.loadState(new Repo(r.d)); const { scopeState } = require('../lib/scope'); const brands = require('../lib/dataset').planBrands();
  const v = scopeState(st, cliF, c => brands.get(c));
  assert.equal(v.ideas.length, 0); assert.equal(v.weeks.length, 0); assert.equal(v.weekGen.length, 0);
  assert.ok(v.events.every(e => brands.get(e.code) === 'F')); assert.deepEqual(Object.keys(v.flow.policy), ['F']);
  /* equipe restrita a C */
  const eqC = { email: 'c@x.com', nome: 'C', papel: 'editor', tipo: 'equipe', empresas: ['C'] };
  await assert.rejects(run([{ t: 'idea', op: 'upsert', id: 'i-x', b: 'M', format: 'Reels', title: 'T', stage: 'nova' }], eqC), /acesso a esta empresa/);
  await assert.rejects(run([{ t: 'override', op: 'upsert', code: planOf('M'), status: 'prod' }], eqC), /acesso a esta pauta/);
  await assert.rejects(run([{ t: 'week', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', marca: 'M' }], eqC), /acesso a esta empresa/);
  await assert.rejects(run([{ t: 'weekgen', op: 'upsert', tipo: 'semana', inicio: '2026-11-09' }], eqC), /todas as empresas/);
  await run([{ t: 'override', op: 'upsert', code: planOf('C'), status: 'prod' }], eqC);
  assert.equal(scopeState(st, eqC, c => brands.get(c)).weeks.length, 0, 'semanas só das empresas dela');
});

test('dados dos clientes: o script entregue a quem é de uma empresa só traz essa empresa', () => {
  const ds = require('../lib/dataset'), vm = require('vm');
  const run = js => { const ctx = { window: {} }; vm.runInNewContext(js, ctx); return JSON.parse(JSON.stringify(ctx.window.N7)); };
  const D = run(ds.scriptFor(new Set(['F']), { internal: false }));
  assert.deepEqual(D.CLIENTS.map(c => c.key), ['F']); assert.deepEqual(Object.keys(D.WEEKLY), ['F']);
  assert.ok(D.PLAN.length > 0 && D.PLAN.every(p => p.b === 'F')); assert.deepEqual(D.ALERTS, []); assert.deepEqual(D.FINDINGS, []); assert.deepEqual(D.ROUTINE, []);
  assert.equal(D.MINAS_AUG, null); assert.ok(D.FARMA_DAILY);
  assert.deepEqual(Object.keys(D.IG_POSTS), ['F']);
  assert.ok(!JSON.stringify(D).includes('Minas Club'), 'nada da Minas Farma vaza');
  const all = run(ds.scriptFor(null)); assert.equal(all.CLIENTS.length, 4);
});

const regUsers = async list => require('../lib/model').applyOps(require('../lib/db').getRepo(), list.map(u => Object.assign({ t: 'user', op: 'upsert' }, u)), { email: 'dev@agencia.test', papel: 'admin', tipo: 'equipe', empresas: [] });   /* as rotas conferem o cadastro: o usuário do cookie precisa existir na planilha */
test('rotas: cliente recebe só a própria empresa em /api/data e /api/state, e não grava o que não é dele', async () => {
  db._resetMemory();
  await regUsers([{ email: 'dono@f.com', nome: 'Dona', tipo: 'cliente', empresas: ['F'] }]);
  const { createServer } = require('../dev-server'), { cfg } = require('../lib/config');
  const srv = createServer(); await new Promise(rs => srv.listen(0, rs));
  const base = 'http://localhost:' + srv.address().port;
  const mk2 = u => 'n7_session=' + encodeURIComponent(session.create(u, cfg().sessionSecret, 600));
  const call = async (p, cookie, body) => { const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-n7': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* script */ } return { status: res.status, text: t, json: j }; };
  try {
    const adm = mk2({ ...admin, email: 'dev@local' }), cli = mk2({ email: 'dono@f.com', nome: 'Dona', papel: 'cliente', tipo: 'cliente', empresas: ['F'] });
    const d = await call('/api/data', cli); assert.equal(d.status, 200); assert.ok(!d.text.includes('Minas Club')); assert.match(d.text, /^window\.N7 = \{/);
    const s = await call('/api/state', cli); assert.equal(s.status, 200);
    assert.deepEqual(s.json.registry.clients.map(c => c.key), ['F']); assert.equal(s.json.registry.users, undefined); assert.equal(s.json.state.ideas.length, 0);
    const sa = await call('/api/state', adm); assert.equal(sa.json.registry.clients.length, 4); assert.ok(sa.json.registry.users.length >= 1); assert.equal(sa.json.state.ideas.length, 4);
    assert.equal((await call('/api/mutate', cli, { ops: [{ t: 'goal', key: 'F-sales', value: 5 }] })).status, 403);
    assert.equal((await call('/api/mutate', cli, { ops: [{ t: 'event', ev: { id: 'e-abcdef12', code: planOf('F'), kind: 'client', act: 'aprovou', by: 'x', text: '' } }] })).status, 200);
    assert.equal((await call('/api/mutate', cli, { ops: [{ t: 'event', ev: { id: 'e-abcdef13', code: planOf('M'), kind: 'client', act: 'aprovou', by: 'x', text: '' } }] })).status, 403);
    /* administrador desativa a Farma: some do /api/data de todos */
    await call('/api/mutate', adm, { ops: [{ t: 'client', chave: 'F', id: 'farma-e-farma', nome: 'Farma e Farma', curto: 'Farma', cor: '--c2', segmento: 'x', perfil: '@f', setor: 'saude', servicos: ['redes'], ativo: 'nao', v: '1' }] });
    const d2 = await call('/api/data', adm); assert.ok(!d2.text.includes('"key":"F"'), 'empresa desativada não é entregue');
  } finally { srv.close(); db._resetMemory(); }
});

test('erros de configuração aparecem com a causa; os demais erros internos continuam genéricos', async () => {
  const { handle } = require('../lib/http'), { ConfigError } = require('../lib/config');
  const run = async err => { let out = {}; const res = { setHeader() {}, end(b) { out = JSON.parse(b); }, statusCode: 0 }; await handle(async () => { throw err; })({}, res); return { status: res.statusCode, ...out }; };
  const a = await run(new ConfigError('Falta a variável SESSION_SECRET')); assert.equal(a.status, 500); assert.match(a.error, /SESSION_SECRET/);
  const b = await run(new Error('chave-secreta-xyz quebrou')); assert.equal(b.status, 500); assert.doesNotMatch(b.error, /xyz/);
});

test('chave da conta de serviço: aceita JSON normal, com quebras de linha coladas no meio, sem "}" final e em base64; recusa lixo', () => {
  const { SheetsClient } = require('../lib/google');
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const obj = { type: 'service_account', client_email: 'robo@proj.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' };
  const ok = raw => new SheetsClient({ sheetId: 'x', serviceAccount: raw }).sa;
  const normal = JSON.stringify(obj, null, 2);
  assert.equal(ok(normal).client_email, obj.client_email);
  const quebrado = normal.replace(/("private_key": ")([^"]+)(")/, (m, a, b, c) => a + b.replace(/(.{37})/g, '$1\n  ') + c);   /* chave longa quebrada em qualquer ponto */
  assert.throws(() => JSON.parse(quebrado));
  const r = ok(quebrado); assert.equal(r.client_email, obj.client_email); assert.ok(crypto.createPrivateKey(r.private_key));
  assert.ok(ok(normal.replace(/\}\s*$/, '')).private_key.includes('BEGIN PRIVATE KEY'), 'sem o } final');
  assert.ok(ok('"' + normal.replace(/"/g, '\\"') + '"'), 'com aspas ao redor');
  assert.equal(ok(Buffer.from(normal).toString('base64')).client_email, obj.client_email);
  assert.throws(() => ok('isto não é uma chave'), /JSON válido/);
  const cortada = normal.replace(/(BEGIN PRIVATE KEY-----\\n)[\s\S]{40}[\s\S]*?(\\n-----END)/, '$1MIIEv$2');
  assert.throws(() => ok(cortada), /corrompida|incompleta/);
});

/* ---------- login por e-mail e senha ---------- */
test('senha: padrão no primeiro acesso, troca obrigatória, regras, bloqueio e redefinição pelo administrador', async () => {
  const { checkPassword, setPassword, MAX_TRIES, LOCK_MS } = require('../lib/login-senha');
  const seed = require('../lib/seed').build({ devEmail: 'dev@agencia.test' });
  const repo = () => new Repo(d), d = new MemoryDriver(seed);
  const c = { defaultPassword: 'Padrao@2026' };
  const email = 'dev@agencia.test';
  const wrong = await checkPassword(repo(), email, 'errada', c); assert.equal(wrong.status, 401);
  const ghost = await checkPassword(repo(), 'ninguem@x.com', 'errada', c); assert.equal(ghost.error, wrong.error, 'não revela se o e-mail existe');
  const first = await checkPassword(repo(), ' Dev@Agencia.test ', 'Padrao@2026', c);
  assert.equal(first.user.trocar, true); assert.equal(first.user.papel, 'admin');
  assert.match((await setPassword(repo(), first.user, 'curta1', '', c)).error, /8 caracteres/);
  assert.match((await setPassword(repo(), first.user, 'Padrao@2026', '', c)).error, /diferente da senha padrão/);
  assert.match((await setPassword(repo(), first.user, 'somenteletras', '', c)).error, /letras e números/);
  const done = await setPassword(repo(), first.user, 'MinhaSenha9', '', c); assert.ok(!done.user.trocar);
  assert.match((await repo().rows('Usuarios'))[0].senha_hash, /^s1\$/, 'guarda só o hash');
  assert.ok(!JSON.stringify(await repo().rows('Usuarios')).includes('MinhaSenha9'));
  assert.equal((await checkPassword(repo(), email, 'Padrao@2026', c)).status, 401, 'a senha padrão deixa de valer');
  const ok = await checkPassword(repo(), email, 'MinhaSenha9', c); assert.ok(ok.user && !ok.user.trocar);
  assert.match((await setPassword(repo(), ok.user, 'OutraSenha8', 'errada1', c)).error, /atual não confere/);
  assert.ok((await setPassword(repo(), ok.user, 'OutraSenha8', 'MinhaSenha9', c)).user, 'troca com a atual');
  /* bloqueio */
  const t0 = Date.now(); require('../lib/login-senha')._resetLimiter();
  for (let i = 1; i < MAX_TRIES; i++) assert.equal((await checkPassword(repo(), email, 'x' + i, c, t0)).status, 401);
  const quinta = await checkPassword(repo(), email, 'x9', c, t0); assert.equal(quinta.status, 401); assert.equal(quinta.error, 'E-mail ou senha incorretos.', 'a quinta tentativa errada não revela que a conta bloqueou');
  assert.equal((await checkPassword(repo(), email, 'chute', c, t0 + 1000)).status, 401, 'bloqueada, senha errada: mesma resposta de qualquer erro');
  const certa = await checkPassword(repo(), email, 'OutraSenha8', c, t0 + 2000); assert.equal(certa.status, 429); assert.match(certa.error, /Muitas tentativas/, 'só quem acerta a senha vê o aviso de bloqueio');
  assert.ok((await checkPassword(repo(), email, 'OutraSenha8', c, t0 + LOCK_MS + 1000)).user, 'depois do prazo volta a valer');
  /* administrador redefine: volta para a senha padrão */
  const adm = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
  await model.applyOps(repo(), [{ t: 'user', op: 'upsert', email: 'ana@agencia.com', nome: 'Ana', tipo: 'equipe', papel: 'editor' }], adm);
  const ana1 = await checkPassword(repo(), 'ana@agencia.com', 'Padrao@2026', c); assert.equal(ana1.user.trocar, true, 'usuário novo entra com a senha padrão');
  await setPassword(repo(), ana1.user, 'SenhaDaAna1', '', c);
  const reg = await model.loadRegistry(repo(), adm); assert.equal(reg.users.find(u => u.email === 'ana@agencia.com').senhaPadrao, false);
  await model.applyOps(repo(), [{ t: 'user', op: 'upsert', email: 'ana@agencia.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', resetSenha: true }], adm);
  assert.equal((await checkPassword(repo(), 'ana@agencia.com', 'Padrao@2026', c)).user.trocar, true);
  assert.equal((await model.loadRegistry(repo(), adm)).users.find(u => u.email === 'ana@agencia.com').senhaPadrao, true);
  /* sem a variável SENHA_PADRAO configurada, avisa em vez de aceitar qualquer coisa */
  await assert.rejects(checkPassword(repo(), 'ana@agencia.com', 'qualquer', {}), /SENHA_PADRAO/);
});

test('rotas de senha: primeiro acesso bloqueia os dados até criar a senha; depois entra normal', async () => {
  db._resetMemory();
  const { createServer } = require('../dev-server');
  const srv = createServer(); await new Promise(rs => srv.listen(0, rs));
  const base = 'http://localhost:' + srv.address().port; let cookie = '';
  const call = async (p, body) => { const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-n7': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = res.headers.get('set-cookie'); if (sc && /n7_session=[^;]+/.test(sc) && !/Max-Age=0/.test(sc)) cookie = sc.split(';')[0]; const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* script */ } return { status: res.status, json: j }; };
  try {
    const padrao = require('../lib/config').cfg().defaultPassword;
    assert.equal((await call('/api/auth?action=me')).json.login.password, true, 'a tela de login sabe que há senha');
    assert.equal((await call('/api/auth?action=password', { email: 'dev@local', senha: 'errada' })).status, 401);
    const l = await call('/api/auth?action=password', { email: 'dev@local', senha: padrao }); assert.equal(l.status, 200); assert.equal(l.json.user.trocar, true);
    assert.equal((await call('/api/state')).json.error, 'trocar_senha'); assert.equal((await call('/api/data')).status, 403);
    assert.equal((await call('/api/mutate', { ops: [{ t: 'goal', key: 'M-sales', value: 1 }] })).status, 403);
    assert.equal((await call('/api/auth?action=me')).json.user.trocar, true, 'continua pedindo a troca ao recarregar');
    assert.equal((await call('/api/auth?action=setpassword', { nova: '123' })).status, 400);
    const s = await call('/api/auth?action=setpassword', { nova: 'SenhaNova77' }); assert.equal(s.status, 200); assert.ok(!s.json.user.trocar);
    assert.equal((await call('/api/state')).status, 200); assert.equal((await call('/api/data')).status, 200);
    cookie = '';
    assert.equal((await call('/api/auth?action=setpassword', { nova: 'SenhaNova77' })).status, 401, 'sem login não troca senha');
    assert.equal((await call('/api/auth?action=password', { email: 'dev@local', senha: 'SenhaNova77' })).json.user.trocar, undefined);
  } finally { srv.close(); db._resetMemory(); }
});

test('decisões do cérebro: grava feita/adiada/ignorada, valida e respeita escopo e papel', async () => {
  const seed = require('../lib/seed').build({ devEmail: 'dev@agencia.test' }), repo = () => new Repo(new MemoryDriver(seed));
  const r = repo(); const ed = { email: 'e@x.com', nome: 'E', papel: 'editor', tipo: 'equipe', empresas: [] };
  const op = { t: 'decision', op: 'upsert', chave: 'prod-due-F', agente: 'producao', marca: 'F', titulo: 'Farma: pauta vence amanhã', status: 'feita', ate: '2026-11-18' };
  assert.equal((await model.applyOps(r, [op], ed)).results[0].v, '1');
  assert.equal((await model.applyOps(new Repo(r.d), [Object.assign({}, op, { status: 'adiada', ate: '2026-11-20', v: '1' })], ed)).results[0].v, '2');
  const st = await model.loadState(new Repo(r.d)); assert.equal(st.decisions.length, 1); assert.equal(st.decisions[0].status, 'adiada'); assert.ok(st.decisions[0].em);
  const bad = (o, re, u = ed) => assert.rejects(model.applyOps(repo(), [Object.assign({}, op, o)], u), re);
  await bad({ chave: 'x' }, /Chave da decisão inválida/); await bad({ agente: 'robo' }, /Agente inválido/); await bad({ status: 'talvez' }, /Situação inválido/);
  await bad({ ate: '' }, /Data é obrigatória/); await bad({ marca: 'ZZ' }, /Empresa inválida/);
  await bad({}, /só registram aprovação/, { email: 'c@x.com', nome: 'C', papel: 'cliente', tipo: 'cliente', empresas: ['F'] });
  await bad({}, /só de leitura/, { email: 'l@x.com', nome: 'L', papel: 'leitura', tipo: 'equipe', empresas: [] });
  await bad({ marca: 'F' }, /acesso a esta empresa/, { email: 'r@x.com', nome: 'R', papel: 'editor', tipo: 'equipe', empresas: ['C'] });
  const { scopeState } = require('../lib/scope');
  const c = scopeState(st, { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['F'] }, () => 'F'); assert.deepEqual(c.decisions, [], 'cliente nunca vê a memória do cérebro');
  const eq = scopeState(st, { email: 'r@x.com', papel: 'editor', tipo: 'equipe', empresas: ['C'] }, () => 'C'); assert.deepEqual(eq.decisions, [], 'equipe restrita só vê decisões das suas empresas');
  await model.applyOps(new Repo(r.d), [{ t: 'decision', op: 'delete', chave: 'prod-due-F', v: '2' }], ed); assert.equal((await model.loadState(new Repo(r.d))).decisions.length, 0);
});
