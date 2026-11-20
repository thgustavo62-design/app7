// O servidor aceita decisões de todos os agentes do catálogo do site (e só deles).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const ids = require('../lib/agents');

test('agentes: a lista do servidor é igual ao catálogo do site', async () => {
  const { AGENT_ORDER, AGENTS } = await import('../public/assets/js/brain/catalog.mjs');
  assert.deepEqual([...ids].sort(), [...AGENT_ORDER].sort());
  assert.deepEqual([...ids].sort(), Object.keys(AGENTS).sort());
});
test('decisão (Feito, Adiar, Ignorar) grava para cada agente do catálogo e recusa agente desconhecido', async () => {
  const r = new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' }))), ed = { email: 'dev@agencia.test', papel: 'admin', tipo: 'equipe', empresas: [] };
  for (const a of ids) {
    const res = await model.applyOps(new Repo(r.d), [{ t: 'decision', op: 'upsert', chave: `k-${a}-1`, agente: a, marca: 'M', titulo: 'x', status: 'feita', ate: '2026-11-25', em: '2026-11-20' }], ed);
    assert.ok(res.results[0].v, a);
  }
  assert.equal((await model.loadState(new Repo(r.d))).decisions.length, ids.length);
  await assert.rejects(model.applyOps(new Repo(r.d), [{ t: 'decision', op: 'upsert', chave: 'k-xx-1', agente: 'inventado', status: 'feita', ate: '2026-11-25', em: '2026-11-20' }], ed), /inválid/);
});
