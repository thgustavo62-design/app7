// Responsável por etapa: servidor (equipe ativa, escopo), recorte para cliente, sincronização e cérebro.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js'); require('../public/assets/js/store.js'); require('../public/assets/js/sync.js');
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const { scopeState } = require('../lib/scope');
const B = require('../public/assets/js/brain/index.mjs').default;
const { diffKey } = globalThis.N7Sync;

const mk = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const brands = require('../lib/dataset').planBrands();
const codeOf = b => [...brands.entries()].find(([, k]) => k === b)[0];

test('responsável por etapa: só equipe ativa, grava, atualiza com versão e some quando todas as etapas ficam vazias', async () => {
  const r = mk(), run = (ops, u = admin) => model.applyOps(new Repo(r.d), ops, u), c = codeOf('F');
  await run([{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [] }, { t: 'user', op: 'upsert', email: 'cli@x.com', nome: 'Cli', tipo: 'cliente', empresas: ['F'] }]);
  const a = await run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'ana@x.com', gravar: '', editar: 'Ana@x.com' }]); assert.equal(a.results[0].v, '1');
  let st = await model.loadState(new Repo(r.d)); assert.deepEqual(st.owners[c], { roteiro: 'ana@x.com', editar: 'ana@x.com', v: '1' }, 'e-mail normalizado, etapa vazia não grava');
  await assert.rejects(run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'cli@x.com' }]), /Responsável inválido/, 'usuário cliente não é responsável');
  await assert.rejects(run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'fantasma@x.com' }]), /Responsável inválido/);
  const b = await run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'ana@x.com', v: '1' }]); assert.equal(b.results[0].v, '2');
  assert.ok((await run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'ana@x.com', v: '1' }])).conflict, 'versão velha conflita');
  await run([{ t: 'owners', op: 'upsert', code: c, v: '2' }]);                       /* tudo vazio: apaga */
  st = await model.loadState(new Repo(r.d)); assert.equal(st.owners[c], undefined);
  await run([{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [], ativo: 'nao', v: (await new Repo(r.d).rows('Usuarios')).find(x => x.email === 'ana@x.com').versao }]);
  await assert.rejects(run([{ t: 'owners', op: 'upsert', code: c, roteiro: 'ana@x.com' }]), /Responsável inválido/, 'desativada não recebe etapa');
});
test('responsável por etapa: leitura não grava, equipe restrita só mexe nas suas empresas e cliente não vê o mapa', async () => {
  const r = mk(), run = (ops, u = admin) => model.applyOps(new Repo(r.d), ops, u), cF = codeOf('F'), cM = codeOf('M');
  await run([{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [] }]);
  await run([{ t: 'owners', op: 'upsert', code: cF, roteiro: 'ana@x.com' }, { t: 'owners', op: 'upsert', code: cM, gravar: 'ana@x.com' }]);
  await assert.rejects(run([{ t: 'owners', op: 'upsert', code: cF, roteiro: 'ana@x.com' }], { ...admin, papel: 'leitura' }), /só de leitura/);
  const eqM = { email: 'm@x.com', papel: 'editor', tipo: 'equipe', empresas: ['M'] };
  await assert.rejects(run([{ t: 'owners', op: 'upsert', code: cF, roteiro: 'ana@x.com' }], eqM), /acesso a esta pauta/);
  const st = await model.loadState(new Repo(r.d)), br = c => brands.get(c);
  assert.deepEqual(Object.keys(scopeState(st, eqM, br).owners), [cM], 'equipe restrita vê só as suas pautas');
  assert.deepEqual(scopeState(st, { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['F'] }, br).owners, {}, 'cliente não vê quem faz o quê');
  const reg = await model.loadRegistry(new Repo(r.d), eqM); assert.ok(reg.team.some(u => u.email === 'ana@x.com') && !reg.users, 'quem atribui vê a equipe sem ser administrador');
  assert.equal((await model.loadRegistry(new Repo(r.d), { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['F'] })).team, undefined);
});
test('sync: responsável vira operação por pauta, com a versão conhecida', () => {
  const o = { 'C-F05': { roteiro: 'a@x.com', v: '2' } };
  assert.deepEqual(diffKey('owners', o, JSON.parse(JSON.stringify(o))), []);
  const ops = diffKey('owners', o, { 'C-F05': { roteiro: 'a@x.com', editar: 'b@x.com', v: '2' }, 'C-F06': { gravar: 'b@x.com' } });
  assert.equal(ops.length, 2); assert.equal(ops[0].t, 'owners'); assert.equal(ops[0].editar, 'b@x.com'); assert.equal(ops[0].v, '2'); assert.equal(ops[1].v, undefined);
  assert.deepEqual(diffKey('owners', o, {}), [{ t: 'owners', op: 'delete', code: 'C-F05', v: '2' }]);
});
test('cérebro: etapa atrasada diz quem é o responsável, ou que não há', () => {
  const clients = [{ key: 'F', name: 'Farma e Farma', services: ['redes'] }];
  const posts = [{ code: 'C-F99', b: 'F', title: 'X', date: '2026-11-25', status: 'plan', steps: { roteiro: '2026-11-16', gravar: '2026-11-20', editar: '2026-11-22', aprovar: '2026-11-23', agendar: '2026-11-24' } }];
  const run = owners => B.run({ today: '2026-11-18', clients, posts, weeks: [], gens: [], owners, team: [{ email: 'ana@x.com', nome: 'Ana Souza' }], planSource: { source: 'central' } });
  const com = run({ 'C-F99': { roteiro: 'ana@x.com' } }).byAgent.pipeline[0], sem = run({}).byAgent.pipeline[0];
  assert.ok(com.evidencia.some(e => /Responsável pela etapa de C-F99: Ana Souza/.test(e)));
  assert.ok(sem.evidencia.some(e => /C-F99 não tem responsável definido para o roteiro/.test(e)));
});
