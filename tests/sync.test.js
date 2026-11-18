// Testes da sincronização: o que vira operação, versões e fila.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/store.js');
require('../public/assets/js/sync.js');
const { diffKey, createSync } = globalThis.N7Sync;
const Store = globalThis.N7Store;
test.beforeEach(() => Store.reset());

test('overrides: só o que mudou vira operação, com a versão conhecida', () => {
  const old = { 'C-F05': { status: 'prod', date: '2026-11-16', v: '2' }, 'C-F06': { status: 'apr', v: '1' } };
  const nw = { 'C-F05': { status: 'prod', date: '2026-11-16', v: '2' }, 'C-F06': { status: 'agd', v: '1' }, 'C-F07': { date: '2026-11-24' } };
  assert.deepEqual(diffKey('overrides', old, nw), [
    { t: 'override', op: 'upsert', code: 'C-F06', status: 'agd', date: '', v: '1' },
    { t: 'override', op: 'upsert', code: 'C-F07', status: '', date: '2026-11-24', v: undefined }
  ]);
  assert.deepEqual(diffKey('overrides', old, { 'C-F05': old['C-F05'] }), [{ t: 'override', op: 'delete', code: 'C-F06', v: '1' }]);
  assert.deepEqual(diffKey('overrides', old, JSON.parse(JSON.stringify(old))), [], 'sem mudança, sem operação');
});
test('ideias e pautas criadas: novo, alterado e removido; ordem das chaves não importa', () => {
  const a = { id: 'i1', b: 'F', format: 'Reels', title: 'A', note: '', stage: 'nova', src: 's', at: '2026-11-18', v: '1' };
  const reordered = { at: '2026-11-18', v: '1', stage: 'nova', src: 's', note: '', title: 'A', format: 'Reels', b: 'F', id: 'i1' };
  assert.deepEqual(diffKey('ideas', [a], [reordered]), []);
  const ops = diffKey('ideas', [a], [{ ...a, stage: 'aprovada', v: undefined }, { id: 'i2', b: 'M', format: 'Carrossel', title: 'B', stage: 'nova', at: '2026-11-18' }]);
  assert.equal(ops.length, 2); assert.equal(ops[0].v, '1', 'usa a versão do retrato anterior'); assert.equal(ops[0].stage, 'aprovada'); assert.equal(ops[1].v, undefined);
  assert.deepEqual(diffKey('ideas', [a], []), [{ t: 'idea', op: 'delete', id: 'i1', v: '1' }]);
  const c = { code: 'I-F01', b: 'F', title: 'T', format: 'Reels', date: '2027-01-04', time: '12:00', status: 'plan', steps: { roteiro: '2026-12-25' }, doc: 'https://x', note: '', fromIdea: 'i1' };
  const o = diffKey('custom', [], [c])[0]; assert.equal(o.t, 'custom'); assert.equal(o.fromIdea, 'i1'); assert.equal(o.steps.roteiro, '2026-12-25');
});
test('eventos só acrescentam; checagens e metas por chave', () => {
  const e1 = { id: 'e-1', code: 'C-F05', kind: 'internal', act: 'aprovou', by: 'Ana', at: 'x', text: '' };
  const e2 = { ...e1, id: 'e-2', act: 'comentou', text: 'ok' };
  assert.deepEqual(diffKey('events', [e1], [e1, e2]).map(o => o.ev.id), ['e-2']);
  assert.deepEqual(diffKey('events', [e1, e2], [e1]), [], 'remover evento local não apaga nada no servidor');
  assert.deepEqual(diffKey('checks', {}, { 'C-F05': { dims: { native: 100 }, checks: { 0: true } } }), [{ t: 'check', op: 'upsert', code: 'C-F05', dims: { native: 100 }, checks: { 0: true } }]);
  assert.deepEqual(diffKey('goals', { 'M-sales': 1 }, { 'M-sales': 2, 'F-ig': 5 }).map(o => o.key), ['M-sales', 'F-ig']);
  assert.deepEqual(diffKey('goals', { 'M-sales': 1 }, {}), [{ t: 'goal', op: 'delete', key: 'M-sales' }]);
});
test('fluxo: política e horários por marca, só o que mudou', () => {
  const old = { policy: { M: 'internal_client', F: 'internal_client' }, slots: { M: [{ dow: 1, time: '12:00', format: 'Carrossel' }], F: [{ dow: 3, time: '18:30', format: 'Reels' }] } };
  const nw = { policy: { M: 'none', F: 'internal_client' }, slots: { M: [{ dow: 1, time: '12:00', format: 'Carrossel' }, { dow: 2, time: '12:00', format: 'Qualquer' }], F: [{ dow: 3, time: '18:30', format: 'Reels', id: 'H-F01', v: 1 }] } };
  assert.deepEqual(diffKey('flow', old, nw), [{ t: 'policy', marca: 'M', politica: 'none' }, { t: 'slots', marca: 'M', rows: nw.slots.M }]);
});

test('motor: envia em fila, guarda a versão devolvida, junta mudanças seguidas e pede recarga em conflito', async () => {
  const sent = []; let mode = 'ok', states = [], fatal = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body); sent.push(body.ops);
    assert.equal(init.headers['X-N7'], '1');
    if (mode === '409') return { ok: false, status: 409, json: async () => ({ error: 'conflict' }) };
    if (mode === '400') return { ok: false, status: 400, json: async () => ({ error: 'Título é obrigatório' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, results: body.ops.map(() => ({ v: '1' })) }) };
  };
  Store.hydrate({ ideas: [{ id: 'i1', b: 'F', format: 'Reels', title: 'A', stage: 'nova', at: '2026-11-18', v: '3' }] });
  const sync = createSync({ store: Store, fetchFn, onState: s => states.push(s), onFatal: m => fatal.push(m) });
  const ideas = Store.get('ideas', []);
  ideas[0].stage = 'analise'; Store.set('ideas', ideas);
  ideas[0].stage = 'aprovada'; Store.set('ideas', ideas);          // segunda mudança antes da resposta da primeira
  await new Promise(r => setTimeout(r, 20));
  assert.equal(sent[0].length, 1); assert.equal(sent[0][0].v, '3');
  assert.equal(sent[1].length, 1, 'a segunda foi junta e enviada depois');
  assert.equal(sent[1][0].stage, 'aprovada'); assert.equal(sent[1][0].v, '1', 'versão devolvida pela primeira foi repassada');
  assert.equal(Store.get('ideas', [])[0].v, '1'); assert.equal(Store._snap.ideas[0].v, '1');
  assert.equal(states.at(-1), 'saved'); assert.equal(sync.pending(), 0);
  mode = '409'; ideas[0].stage = 'descartada'; Store.set('ideas', ideas); await new Promise(r => setTimeout(r, 20));
  assert.match(fatal[0], /Outra pessoa/); assert.equal(sync.pending(), 0);
  mode = '400'; ideas[0].title = ''; Store.set('ideas', ideas); await new Promise(r => setTimeout(r, 20));
  assert.match(fatal[1], /Título é obrigatório/);
});
test('motor: falha de rede mantém a fila e tenta de novo', async () => {
  let fail = true, calls = 0;
  const fetchFn = async () => { calls++; if (fail) throw new Error('offline'); return { ok: true, status: 200, json: async () => ({ ok: true, results: [{}] }) }; };
  Store.hydrate({ goals: {} }); const st = [];
  const sync = createSync({ store: Store, fetchFn, onState: s => st.push(s), retryMs: 10 });
  Store.set('goals', { 'M-sales': 100 });
  await new Promise(r => setTimeout(r, 15));
  assert.equal(st.at(-1), 'error'); assert.equal(sync.pending(), 1);
  fail = false; await new Promise(r => setTimeout(r, 60));
  assert.equal(st.at(-1), 'saved'); assert.equal(sync.pending(), 0); assert.ok(calls >= 2);
});

test('semanas e decisão da semana: operações por período e marca, com versão', () => {
  const w = { tipo: 'semana', inicio: '2026-11-09', fim: '2026-11-15', marca: 'M', vendas: 1000, dias: [1, 2, 3, 4, 5, 6, 7], ig: { views: 5 }, fb: {}, ads: {}, v: '2' };
  assert.deepEqual(diffKey('weeks', [w], [JSON.parse(JSON.stringify(w))]), []);
  const ops = diffKey('weeks', [w], [{ ...w, vendas: 1100 }, { ...w, marca: 'F', v: undefined }]);
  assert.equal(ops.length, 2); assert.equal(ops[0].t, 'week'); assert.equal(ops[0].v, '2'); assert.equal(ops[0].vendas, 1100); assert.equal(ops[1].marca, 'F'); assert.equal(ops[1].v, undefined);
  assert.deepEqual(diffKey('weeks', [w], []), [{ t: 'week', op: 'delete', tipo: 'semana', inicio: '2026-11-09', marca: 'M', v: '2' }]);
  const g = { tipo: 'semana', inicio: '2026-11-09', decisao: 'x', rumo: 'sim', v: '1' };
  assert.equal(diffKey('weekGen', [g], [{ ...g, rumo: 'nao' }])[0].t, 'weekgen');
  assert.deepEqual(diffKey('weekGen', [g], []), [{ t: 'weekgen', op: 'delete', tipo: 'semana', inicio: '2026-11-09', v: '1' }]);
});

test('decisões do cérebro: operação por chave, com versão, e junção na fila', () => {
  const d = { chave: 'prod-due-F', agente: 'producao', marca: 'F', titulo: 'T', status: 'feita', ate: '2026-11-18', nota: '', v: '1' };
  assert.deepEqual(diffKey('decisions', [d], [JSON.parse(JSON.stringify(d))]), []);
  const ops = diffKey('decisions', [d], [{ ...d, status: 'adiada', ate: '2026-11-20', v: undefined }, { chave: 'apr-C', agente: 'aprovacao', marca: 'C', titulo: 'U', status: 'feita', ate: '2026-11-18' }]);
  assert.equal(ops.length, 2); assert.equal(ops[0].t, 'decision'); assert.equal(ops[0].v, '1'); assert.equal(ops[0].status, 'adiada'); assert.equal(ops[1].v, undefined);
  assert.deepEqual(diffKey('decisions', [d], []), [{ t: 'decision', op: 'delete', chave: 'prod-due-F', marca: 'F', v: '1' }]);
  assert.ok(Store.SYNCED.includes('decisions'));
});
