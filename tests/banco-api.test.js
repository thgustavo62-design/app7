// /api/banco: só administradores; sem as duas conexões não copia.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db');

test('rota /api/banco: administrador vê o estado, cliente e leitura são recusados e sem as duas conexões não copia', async () => {
  db._resetMemory();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server');
  await require('../lib/model').applyOps(db.getRepo(), [{ t: 'user', op: 'upsert', email: 'l@x.com', nome: 'L', tipo: 'equipe', papel: 'leitura', empresas: [] }, { t: 'user', op: 'upsert', email: 'c@x.com', nome: 'C', tipo: 'cliente', empresas: ['F'] }], { email: 'dev@local', papel: 'admin', tipo: 'equipe', empresas: [] });
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const ck = u => 'n7_session=' + encodeURIComponent(session.create(u, cfg().sessionSecret, 600));
  const call = async (cookie, body, path = '') => { const r = await fetch(base + '/api/banco' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-n7': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
  try {
    const adm = ck({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] });
    assert.equal((await call('')).s, 401);
    assert.equal((await call(ck({ email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] }))).s, 403);
    assert.equal((await call(ck({ email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['F'] }))).s, 403);
    const st = await call(adm); assert.equal(st.s, 200); assert.equal(st.j.backend, 'memory'); assert.equal(st.j.sheets, false); assert.equal(st.j.pg, false); assert.ok(st.j.tabs.includes('PromoBase'));
    const cp = await call(adm, { action: 'copiar', tab: 'Metas', de: 'sheets' }); assert.equal(cp.s, 400); assert.match(cp.j.error, /Faltam as duas conexões/);
    assert.equal((await call(adm, { action: 'copiar', tab: 'Inventada' })).s, 400);
    assert.equal((await call(adm, null, '?tab=Inventada')).s, 400);
  } finally { srv.close(); db._resetMemory(); }
});

