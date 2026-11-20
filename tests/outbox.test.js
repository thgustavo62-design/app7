// Caixa de saída: a fila de alterações sobrevive a fechar o app e é reenviada depois.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/store.js'); require('../public/assets/js/sync.js'); require('../public/assets/js/outbox.js');
const { createSync } = globalThis.N7Sync, Store = globalThis.N7Store, Box = globalThis.N7Outbox;
test.beforeEach(() => { Store.reset(); Box._mem.clear(); });
const wait = ms => new Promise(r => setTimeout(r, ms));

test('caixa de saída: guarda, lê por usuário e apaga (sem IndexedDB nem localStorage cai em memória)', async () => {
  const a = Box.forUser('Ana@x.com'), b = Box.forUser('bia@x.com');
  assert.equal(await a.load(), null);
  await a.save([{ t: 'goal', key: 'M-sales', value: 1 }]);
  assert.equal((await a.load()).ops[0].key, 'M-sales'); assert.equal((await Box.forUser('ana@x.com').load()).ops.length, 1, 'e-mail sem diferença de maiúscula');
  assert.equal(await b.load(), null, 'cada usuário tem a sua caixa');
  await a.clear(); assert.equal(await a.load(), null);
});
test('sem conexão a fila fica guardada; fechar o app e abrir de novo reenvia; ao esvaziar, a caixa é apagada', async () => {
  const box = Box.forUser('ana@x.com'); let online = false; const sent = [];
  const fetchFn = async (u, i) => { if (!online) throw new Error('offline'); sent.push(JSON.parse(i.body).ops); return { ok: true, status: 200, json: async () => ({ ok: true, results: JSON.parse(i.body).ops.map(() => ({ v: '2' })) }) }; };
  Store.hydrate({ goals: {} }); const st = [];
  let sync = createSync({ store: Store, fetchFn, onState: (s, n) => st.push([s, n]), persist: box, retryMs: 5 });
  Store.set('goals', { 'M-sales': 100 }); Store.set('goals', { 'M-sales': 100, 'F-sales': 50 });
  await wait(15);
  assert.deepEqual(st.at(-1), ['error', 2], 'o estado diz quantas alterações estão pendentes');
  const guardado = await box.load(); assert.equal(guardado.ops.length, 2, 'as duas estão no aparelho');
  /* "fecha o app": uma sessão nova começa do zero e recupera a caixa */
  Store.reset(); Store.hydrate({ goals: {} });
  online = true;
  sync = createSync({ store: Store, fetchFn, onState: (s, n) => st.push([s, n]), persist: box, retryMs: 5 });
  await sync.restore((await box.load()).ops); await wait(10);
  assert.equal(sync.pending(), 0); assert.deepEqual(sent.at(-1).map(o => o.key), ['M-sales', 'F-sales']);
  assert.equal(await box.load(), null, 'enviado: a caixa é esvaziada');
});
test('conflito ou recusa do servidor descartam a fila e a caixa, para não repetir o erro a cada abertura', async () => {
  const box = Box.forUser('ana@x.com'); let status = 409; const fatal = [];
  const fetchFn = async () => ({ ok: false, status, json: async () => ({ error: 'Título é obrigatório' }) });
  Store.hydrate({ goals: {} });
  const sync = createSync({ store: Store, fetchFn, onFatal: m => fatal.push(m), persist: box });
  Store.set('goals', { 'M-sales': 1 }); await wait(15);
  assert.equal(fatal.length, 1); assert.equal(sync.pending(), 0); assert.equal(await box.load(), null);
  status = 400; Store.set('goals', { 'M-sales': 2 }); await wait(15);
  assert.match(fatal[1], /Título/); assert.equal(await box.load(), null);
});
test('retryNow: depois de desistir das tentativas, a volta da internet envia na hora', async () => {
  let online = false, calls = 0;
  const fetchFn = async () => { calls++; if (!online) throw new Error('offline'); return { ok: true, status: 200, json: async () => ({ ok: true, results: [{}] }) }; };
  Store.hydrate({ goals: {} });
  const sync = createSync({ store: Store, fetchFn, retryMs: 1 });
  Store.set('goals', { 'M-sales': 1 }); await wait(80);            // 6 tentativas e desiste
  const antes = calls; assert.ok(antes >= 6); assert.equal(sync.pending(), 1);
  online = true; sync.retryNow(); await wait(10);
  assert.equal(sync.pending(), 0); assert.ok(calls > antes);
});
