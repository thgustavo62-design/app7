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
  const u = { email: 'a@b.com', nome: 'Ana', papel: 'editor' };
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
