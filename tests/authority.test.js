// Painel de autoridade: análise semanal, operação "auth" no servidor, recorte por empresa e sincronização.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js');
require('../public/assets/js/authority.js');
require('../public/assets/js/store.js');
require('../public/assets/js/sync.js');
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const { scopeState } = require('../lib/scope');
const U = globalThis.N7Authority, { diffKey } = globalThis.N7Sync;

const cl = { key: 'W', name: 'Werllem Polac' };
const row = (inicio, canal, o = {}) => Object.assign({ tipo: 'semana', inicio, marca: 'W', canal }, o);
const W = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
const run = (rows, inicio = '2026-11-09') => U.analyze({ rows, client: cl, inicio });
const titulos = r => r.signals.map(s => s.titulo);

test('derivados: engajamento qualificado por mil alcançadas; campo vazio não vira zero', () => {
  const d = U.derive(U.norm({ alcance: 2000, comentarios: 10, compartilhamentos: 4, salvamentos: 6 }));
  assert.equal(d.engQual, 20); assert.equal(d.engQualMil, 10);
  const v = U.derive(U.norm({ alcance: 2000, comentarios: '', compartilhamentos: null }));
  assert.equal(v.engQual, null); assert.equal(v.engQualMil, null);
  assert.equal(U.norm({ alcance: '' }).alcance, null);
  assert.equal(U.hasData(U.norm({ obs: 'só texto' })), false);
});

test('consistência: em dia, abaixo na semana e abaixo há 3 semanas', () => {
  const ok = run([row('2026-11-09', 'li', { posts: 4 })]);
  assert.equal(ok.signals[0].classe, 'MANTER');
  const um = run([row('2026-11-09', 'li', { posts: 1 }), row('2026-11-02', 'li', { posts: 3 })]);
  assert.ok(um.signals.some(s => s.canal === 'Consistência' && s.classe === 'TESTAR'));
  const tres = run([row('2026-11-09', 'li', { posts: 1 }), row('2026-11-02', 'li', { posts: 1 }), row('2026-10-26', 'li', { posts: 0 })]);
  const s = tres.signals.find(x => x.canal === 'Consistência'); assert.equal(s.classe, 'CORRIGIR'); assert.match(s.titulo, /3 semanas/);
  assert.equal(tres.signals[0].classe, 'CORRIGIR', 'CORRIGIR vem primeiro');
});

test('alcance: queda e alta com base suficiente; base pequena é INCONCLUSIVO', () => {
  const q = run([row('2026-11-09', 'li', { alcance: 3000 }), row('2026-11-02', 'li', { alcance: 6000 })]);
  assert.ok(q.signals.some(s => s.titulo.startsWith('Alcance caiu') && s.classe === 'TESTAR' && s.confianca === 'ALTA'));
  const a = run([row('2026-11-09', 'ig', { alcance: 1500 }), row('2026-11-02', 'ig', { alcance: 1000 })]);
  assert.ok(a.signals.some(s => s.titulo.startsWith('Alcance subiu') && s.classe === 'ESCALAR' && s.confianca === 'MÉDIA'));
  const p = run([row('2026-11-09', 'li', { alcance: 100 }), row('2026-11-02', 'li', { alcance: 300 })]);
  assert.ok(p.signals.some(s => s.classe === 'INCONCLUSIVO' && /base é pequena/.test(s.titulo)));
  assert.ok(!p.signals.some(s => s.classe === 'TESTAR'), 'não conclui com base pequena');
});

test('engajamento qualificado e audiência: sobe, desce, base pequena, mais seguidores com menos engajamento', () => {
  const sobe = run([row('2026-11-09', 'li', { alcance: 3000, comentarios: 30, salvamentos: 30 }), row('2026-11-02', 'li', { alcance: 3000, comentarios: 10, salvamentos: 10 })]);
  assert.ok(sobe.signals.some(s => /comentando, compartilhando e salvando/.test(s.titulo) && s.classe === 'ESCALAR'));
  const pouco = run([row('2026-11-09', 'li', { alcance: 3000, comentarios: 6 }), row('2026-11-02', 'li', { alcance: 3000, comentarios: 2 })]);
  assert.ok(pouco.signals.some(s => /base pequena/.test(s.titulo) && s.classe === 'INCONCLUSIVO'));
  const mix = run([row('2026-11-09', 'ig', { alcance: 3000, comentarios: 10, segNovos: 90 }), row('2026-11-02', 'ig', { alcance: 3000, comentarios: 30, segNovos: 30 })]);
  assert.ok(mix.signals.some(s => s.titulo === 'Mais seguidores, menos engajamento'));
});

test('convites: visitas sem contato há 3 semanas e reuniões vindas do conteúdo', () => {
  const g = [row('2026-11-09', 'geral', { contatos: 0 }), row('2026-11-02', 'geral', { contatos: 0 }), row('2026-10-26', 'geral', { contatos: 0 })];
  const r = run([row('2026-11-09', 'li', { visitas: 120 }), ...g]);
  assert.ok(r.signals.some(s => s.canal === 'Convites' && s.classe === 'CORRIGIR'));
  const sem = run([row('2026-11-09', 'li', { visitas: 120 }), row('2026-11-09', 'geral', { contatos: 0 })]);
  assert.ok(!sem.signals.some(s => s.classe === 'CORRIGIR' && s.canal === 'Convites'), 'sem 3 semanas informadas não afirma');
  const conv = run([row('2026-11-09', 'geral', { reunioes: 2 }), row('2026-11-02', 'geral', { reunioes: 0 })]);
  assert.ok(conv.signals.some(s => /Convites e reuniões/.test(s.titulo) && s.classe === 'ESCALAR'));
});

test('faltas e vazio: o que não veio é listado, nunca zerado', () => {
  const v = run([]); assert.equal(v.vazio, true); assert.deepEqual(v.signals, []);
  const f = run([row('2026-10-26', 'li', { alcance: 2000 })]);
  assert.ok(f.missing.some(m => /LinkedIn: números da semana/.test(m)));
  const sem = run([row('2026-11-09', 'li', { alcance: 2000 })]);
  assert.ok(sem.missing.some(m => /sem base de comparação/.test(m)));
  assert.ok(sem.missing.some(m => /Publicações/.test(m)));
  assert.ok(sem.missing.some(m => /Contatos, reuniões e convites/.test(m)));
  assert.equal(sem.posts.atual, null, 'publicações sem dado não viram 0');
});

test('canais nunca são somados; série e semanas com dado', () => {
  const r = run([row('2026-11-09', 'li', { alcance: 2000, posts: 2 }), row('2026-11-09', 'ig', { alcance: 3000, posts: 1 })]);
  assert.equal(r.posts.atual, 3, 'publicações somam (peças), alcance não');
  assert.ok(r.canais.every(c => c.row.alcance === (c.canal === 'li' ? 2000 : 3000)));
  const rows = W.map((w, i) => row(w, 'li', { alcance: 1000 * (i + 1) }));
  const s = U.series(rows, 'W', 'li', n => n.alcance, '2026-11-09', 4);
  assert.deepEqual(s.map(x => x.valor), [1000, 2000, 3000, 4000]);
  assert.equal(U.series(rows, 'W', 'ig', n => n.alcance, '2026-11-09', 2)[1].valor, null);
  assert.deepEqual(U.periodsWith(rows, 'W'), W);
});

/* ---------- servidor ---------- */
const seeded = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const novo = { t: 'client', chave: 'WP', id: 'werllem-polac', nome: 'Werllem Polac', curto: 'Werllem', cor: '--c7', segmento: 'Executivo tributário e comercial', perfil: '', setor: 'executivo', servicos: ['redes', 'autoridade'] };
const au = (o = {}) => ({ t: 'auth', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', marca: 'WP', canal: 'li', alcance: 4200, comentarios: 12, posts: 3, ...o });

test('servidor: auth exige o serviço, valida canal e números, e guarda ausência como vazio', async () => {
  const r = seeded(); const run = (ops, u = admin) => model.applyOps(new Repo(r.d), ops, u);
  await run([novo]);
  await assert.rejects(run([au({ marca: 'M' })]), /não tem o serviço Autoridade/);
  const ok = await run([au()]); assert.equal(ok.results[0].v, '1');
  const st = await model.loadState(new Repo(r.d)); const a = st.authority.find(x => x.marca === 'WP');
  assert.equal(a.alcance, 4200); assert.equal(a.fim, '2026-11-15'); assert.equal(a.visitas, null, 'campo não enviado fica null, não 0');
  await run([au({ posts: 0 })].map(o => ({ ...o, v: '1' })));
  assert.equal((await model.loadState(new Repo(r.d))).authority[0].posts, 0, 'zero informado continua zero');
  await assert.rejects(run([au({ canal: 'tt' })]), /inválid|Canal/);
  await assert.rejects(run([au({ inicio: '2026-11-10' })]), /inválid|segunda|Informe/);
  await assert.rejects(run([au({ alcance: -1 })]), /inválid|precisa|Informe/);
  await assert.rejects(run([au({ marca: 'Z' })]), /inválid|empresa/);
  const conf = await run([au({ v: '9' })]); assert.ok(conf.conflict);
  await run([{ t: 'auth', op: 'delete', tipo: 'semana', inicio: '2026-11-09', marca: 'WP', canal: 'li', v: '2' }]);
  assert.equal((await model.loadState(new Repo(r.d))).authority.length, 0);
});

test('servidor: leitura não grava; cliente não vê nem grava; equipe restrita só vê suas empresas', async () => {
  const r = seeded(); const run = (ops, u = admin) => model.applyOps(new Repo(r.d), ops, u);
  await run([novo, au()]);
  await assert.rejects(run([au({ alcance: 1 })], { email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] }), /só de leitura/);
  const cli = { email: 'c@x.com', nome: 'C', papel: 'cliente', tipo: 'cliente', empresas: ['WP'] };
  await assert.rejects(run([au({ alcance: 1 })], cli), /só registram aprovação/);
  const st = await model.loadState(new Repo(r.d)); const brands = new Map();
  assert.equal(scopeState(st, cli, c => brands.get(c)).authority.length, 0);
  const eqOutra = { email: 'o@x.com', nome: 'O', papel: 'editor', tipo: 'equipe', empresas: ['M'] };
  assert.equal(scopeState(st, eqOutra, c => brands.get(c)).authority.length, 0);
  await assert.rejects(run([au({ alcance: 1 })], eqOutra), /acesso a esta empresa/);
  assert.equal(scopeState(st, { ...eqOutra, empresas: ['WP'] }, c => brands.get(c)).authority.length, 1);
  assert.equal(scopeState(st, admin, c => brands.get(c)).authority.length, 1);
});

/* ---------- sincronização ---------- */
test('sync: autoridade vira operação por semana e canal, com a versão conhecida', () => {
  const a = { tipo: 'semana', inicio: '2026-11-09', marca: 'WP', canal: 'li', alcance: 4200, v: '1' };
  assert.deepEqual(diffKey('authority', [a], [JSON.parse(JSON.stringify(a))]), []);
  const ops = diffKey('authority', [a], [{ ...a, alcance: 5000, v: undefined }, { ...a, canal: 'ig', alcance: 10, v: undefined }]);
  assert.equal(ops.length, 2); assert.equal(ops[0].t, 'auth'); assert.equal(ops[0].v, '1'); assert.equal(ops[0].alcance, 5000); assert.equal(ops[1].v, undefined);
  assert.deepEqual(diffKey('authority', [a], []), [{ t: 'auth', op: 'delete', tipo: 'semana', inicio: '2026-11-09', marca: 'WP', canal: 'li', v: '1' }]);
});
