// Achados do cérebro viram tarefas: responsável da equipe, prazo, marca no achado, vencida, resolvida e sincronização.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js'); require('../public/assets/js/store.js'); require('../public/assets/js/sync.js');
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const B = require('../public/assets/js/brain/index.mjs').default;
const { diffKey } = globalThis.N7Sync;

const mk = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const run = (r, ops, u = admin) => model.applyOps(new Repo(r.d), ops, u);
const dec = o => Object.assign({ t: 'decision', op: 'upsert', chave: 'pauta-atrasada-1', agente: 'producao', marca: 'M', titulo: 'Minas: pautas atrasadas', status: 'atribuida', ate: '2026-11-25', em: '2026-11-20' }, o);

test('servidor: tarefa exige responsável da equipe com acesso ativo e grava o e-mail; as outras situações seguem sem responsável', async () => {
  const r = mk();
  await run(r, [{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [] }, { t: 'user', op: 'upsert', email: 'cli@x.com', nome: 'Cli', tipo: 'cliente', empresas: ['M'] }]);
  await assert.rejects(run(r, [dec({})]), /Responsável inválido/, 'sem responsável');
  await assert.rejects(run(r, [dec({ responsavel: 'cli@x.com' })]), /Responsável inválido/, 'usuário cliente não recebe tarefa');
  await assert.rejects(run(r, [dec({ responsavel: 'fantasma@x.com' })]), /Responsável inválido/);
  assert.equal((await run(r, [dec({ responsavel: 'Ana@x.com' })])).results[0].v, '1');
  assert.equal((await model.loadState(new Repo(r.d))).decisions[0].responsavel, 'ana@x.com', 'e-mail normalizado');
  await run(r, [dec({ status: 'feita', responsavel: 'ana@x.com', v: '1' })]);
  assert.equal((await model.loadState(new Repo(r.d))).decisions[0].responsavel, '', 'feita não guarda responsável');
});

test('cérebro: achado com tarefa mostra quem cuida e o prazo; vencida e ainda aberta sobe; achado que sumiu conta como resolvido', () => {
  const clients = [{ key: 'M', name: 'Minas Farma', services: ['redes'] }];
  const posts = Array.from({ length: 4 }, (_, i) => ({ code: 'C-M0' + i, b: 'M', title: 'x' + i, date: '2026-11-01', status: 'plan', steps: {} }));
  const run1 = (today, decisions) => B.run({ today, clients, posts, weeks: [], gens: [], decisions, team: [{ email: 'ana@x.com', nome: 'Ana Souza' }], planSource: { source: 'central' } });
  const base = run1('2026-11-20', []), f0 = (base.radar.concat(base.decision, base.also)).find(f => f.chave === 'prod-late-M');
  assert.ok(f0, 'achado de pautas atrasadas existe'); assert.ok(!f0.tarefa);
  const d = { chave: 'prod-late-M', agente: 'producao', marca: 'M', titulo: 'Minas: pautas atrasadas', status: 'atribuida', ate: '2026-11-25', responsavel: 'ana@x.com' };
  const com = run1('2026-11-21', [d]), f1 = (com.radar.concat(com.decision, com.also)).find(f => f.chave === 'prod-late-M');
  assert.ok(f1, 'tarefa em andamento continua à vista (não some como "feito")');
  assert.equal(f1.tarefa.nome, 'Ana Souza'); assert.equal(f1.tarefa.vencida, false); assert.ok(f1.evidencia.some(e => /Atribuído a Ana Souza, prazo 25\/11/.test(e)));
  const venc = run1('2026-11-27', [d]), f2 = (venc.radar.concat(venc.decision, venc.also)).find(f => f.chave === 'prod-late-M');
  assert.equal(f2.tarefa.vencida, true); assert.ok(f2.score > f1.score, 'vencida sobe de nota'); assert.ok(f2.evidencia.some(e => /venceu em 25\/11 e o problema continua/.test(e)));
  const resolvido = B.run({ today: '2026-11-27', clients, posts: [], weeks: [], gens: [], decisions: [d], team: [], planSource: { source: 'central' } });
  assert.ok(resolvido.memoria.resolveu.some(x => x.chave === 'prod-late-M' && x.responsavel === 'ana@x.com'), 'o achado sumiu: tarefa resolvida, com o responsável no histórico');
});

test('sync: a tarefa vai ao servidor com o responsável', () => {
  const a = { chave: 'k-1', agente: 'producao', marca: 'M', titulo: 't', status: 'atribuida', ate: '2026-11-25', nota: '', responsavel: 'ana@x.com', v: '1' };
  const ops = diffKey('decisions', [], [a]); assert.equal(ops[0].responsavel, 'ana@x.com'); assert.equal(ops[0].status, 'atribuida');
  assert.deepEqual(diffKey('decisions', [a], [JSON.parse(JSON.stringify(a))]), []);
});
