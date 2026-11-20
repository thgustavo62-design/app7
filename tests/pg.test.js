// Driver do Postgres: mesmas regras da planilha, mais transação e versão conferida na gravação.
// Só roda quando PG_TEST_URL aponta para um Postgres de teste (no CI há um; localmente: PG_TEST_URL=postgres://postgres@localhost:5433/postgres).
const test = require('node:test');
const assert = require('node:assert/strict');
const URL_ = process.env.PG_TEST_URL;
const skip = URL_ ? false : 'PG_TEST_URL não definida';
const { Repo, MemoryDriver, Conflict } = require('../lib/repo');
const { COLS, TABS } = require('../lib/schema');
const model = require('../lib/model');
const P = require('../lib/promo-store');
const seed = require('../lib/seed');

let drv = null;
async function fresh() {
  const { PgDriver } = require('../lib/pg-driver');
  drv = drv || new PgDriver(URL_);
  await drv.ensure(); await drv.pool.query('TRUNCATE n7.linhas RESTART IDENTITY');
  const data = seed.build({ devEmail: 'dev@agencia.test' });
  for (const t of TABS) if ((data[t] || []).length) await drv.replace(t, COLS[t], data[t]);
  return drv;
}
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const repoOf = d => new Repo(d);
test.after(async () => { if (drv) await drv.close(); });

test('postgres: lê e grava como a planilha (mesmas operações dão o mesmo estado que a memória)', { skip }, async () => {
  const d = await fresh(), mem = new MemoryDriver(seed.build({ devEmail: 'dev@agencia.test' }));
  const ops = [
    { t: 'goal', key: 'M-sales', value: 123456 },
    { t: 'idea', op: 'upsert', id: 'i-pg1', b: 'F', format: 'Reels', title: 'Ideia do teste', stage: 'nova', at: '2026-11-18' },
    { t: 'week', op: 'upsert', tipo: 'semana', inicio: '2026-11-09', marca: 'M', vendas: 120000.5, dias: [1, 2, 3, 4, 5, 6, 7], ig: { views: 1000 }, fb: {}, ads: { gasto: 45 }, fonte: 'teste' },
    { t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [] },
    { t: 'decision', op: 'upsert', chave: 'k-pg-1', agente: 'estoque', marca: 'M', titulo: 'x', status: 'feita', ate: '2026-11-25', em: '2026-11-20' }
  ];
  for (const op of ops) { await model.applyOps(repoOf(d), [op], admin); await model.applyOps(repoOf(mem), [op], admin); }
  const a = await model.loadState(repoOf(d)), b = await model.loadState(repoOf(mem));
  const limpa = x => { const o = JSON.parse(JSON.stringify(x)); o.decisions.forEach(d => { delete d.em; }); return o; };      /* a hora da gravação é do servidor */
  assert.deepEqual(limpa(a), limpa(b));
  /* apagar e atualizar com versão */
  const w = a.ideas.find(i => i.id === 'i-pg1');
  const up = await model.applyOps(repoOf(d), [{ t: 'idea', op: 'upsert', id: 'i-pg1', b: 'F', format: 'Reels', title: 'Mudou', stage: 'analise', at: '2026-11-18', v: w.v }], admin);
  assert.equal(up.results[0].v, String(Number(w.v) + 1));
  await model.applyOps(repoOf(d), [{ t: 'idea', op: 'delete', id: 'i-pg1', v: up.results[0].v }], admin);
  assert.equal((await model.loadState(repoOf(d))).ideas.some(i => i.id === 'i-pg1'), false);
});

test('postgres: duas pessoas editando o mesmo registro: a segunda recebe conflito, nunca sobrescreve', { skip }, async () => {
  const d = await fresh();
  await model.applyOps(repoOf(d), [{ t: 'idea', op: 'upsert', id: 'i-c1', b: 'F', format: 'Reels', title: 'A', stage: 'nova', at: '2026-11-18' }], admin);
  const a = repoOf(d), b = repoOf(d);
  await a.load(['Ideias']); await b.load(['Ideias']);                                 /* as duas leram a versão 1 */
  const obj = t => ({ id: 'i-c1', marca: 'F', formato: 'Reels', titulo: t, etapa: 'nova', criado_em: '2026-11-18' });
  await a.upsert('Ideias', obj('da primeira'), { baseV: '1', user: admin });
  await assert.rejects(b.upsert('Ideias', obj('da segunda'), { baseV: '1', user: admin }), Conflict);
  const r = (await repoOf(d).rows('Ideias')).find(x => x.id === 'i-c1'); assert.equal(r.titulo, 'da primeira'); assert.equal(r.versao, '2');
  /* mesmo com a versão certa na tela, se a linha mudou depois da leitura o próprio UPDATE recusa */
  const c = repoOf(d); await c.load(['Ideias']);
  await repoOf(d).upsert('Ideias', obj('de outra pessoa'), { baseV: '2', user: admin });
  await assert.rejects(c.upsert('Ideias', obj('tarde demais'), { baseV: '2', user: admin }), Conflict);
});

test('postgres: importações simultâneas da mesma loja: uma vence, a outra recebe 409 e nada é perdido', { skip }, async () => {
  const d = await fresh();
  const est = b => ({ barras: b, desc: 'P ' + b, estoque: 10, preco: 20, custo: 12 });
  await P.importEstoque(repoOf(d), admin, 'M', { items: [est('7890000000011')], arquivo: 'e.xlsx' });
  const vend = dia => ({ produtos: { '7890000000011': { desc: 'P', dias: { [dia]: [3, 60] } } }, inicio: '2026-11-01', fim: '2026-11-08', arquivo: dia + '.pdf', linhas: 10, candidatas: 10 });
  const A = repoOf(d), B = repoOf(d); await A.load(['PromoBase', 'Config']); await B.load(['PromoBase', 'Config']);     /* as duas começaram com a mesma base */
  const r = await Promise.allSettled([P.importVendas(A, admin, 'M', vend('2026-11-03')), P.importVendas(B, admin, 'M', vend('2026-11-04'))]);
  const ok = r.filter(x => x.status === 'fulfilled'), no = r.filter(x => x.status === 'rejected');
  assert.equal(ok.length, 1, 'exatamente uma grava'); assert.equal(no.length, 1); assert.equal(no[0].reason.status, 409);
  const dias = (await P.load(repoOf(d), 'M')).items[0].dias; assert.equal(Object.keys(dias).length, 1, 'a base tem só os dias da importação vencedora, inteira');
  /* a perdedora tenta de novo com a base atual e passa */
  await P.importVendas(repoOf(d), admin, 'M', vend(Object.keys(dias)[0] === '2026-11-03' ? '2026-11-04' : '2026-11-03'));
  assert.equal(Object.keys((await P.load(repoOf(d), 'M')).items[0].dias).length, 1);
});

test('postgres: troca da aba é atômica (recusa pela revisão não apaga nada) e aceita bases grandes em blocos', { skip }, async () => {
  const d = await fresh(), repo = repoOf(d);
  const itens = Array.from({ length: 2500 }, (_, i) => ({ barras: String(7890000000000 + i), desc: 'P' + i, estoque: 1, preco: 5, custo: 2 }));
  await P.importEstoque(repoOf(d), admin, 'M', { items: itens, arquivo: 'grande.xlsx' });
  assert.equal((await P.load(repoOf(d), 'M')).items.length, 2500);
  const antes = (await d.pool.query(`SELECT count(*)::int n FROM n7.linhas WHERE aba = 'PromoBase'`)).rows[0].n;
  await repo.load(['PromoBase']);
  await assert.rejects(repo.replaceAll('PromoBase', [], { guard: { key: 'promo_rev:M', expect: 'revisao-errada', set: 'x' } }), e => e.status === 409);
  assert.equal((await d.pool.query(`SELECT count(*)::int n FROM n7.linhas WHERE aba = 'PromoBase'`)).rows[0].n, antes, 'a recusa desfez tudo: nenhuma linha foi apagada');
});

test('postgres: o schema n7 tem RLS ligada e a leitura devolve as colunas da aba mesmo que faltem no JSON', { skip }, async () => {
  const d = await fresh();
  assert.equal((await d.pool.query(`SELECT relrowsecurity r FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'n7' AND c.relname = 'linhas'`)).rows[0].r, true);
  await d.pool.query(`INSERT INTO n7.linhas (aba, dados) VALUES ('Config', '{"chave":"so_chave"}')`);
  const r = (await d.readMany(['Config'])).Config.rows.find(x => x.chave === 'so_chave'); assert.equal(r.valor, '');
});

test('postgres: copiar da planilha (memória) para o Postgres e de volta, com conferência por contagem e impressão digital', { skip }, async () => {
  const { copyTab, compareTab } = require('../lib/db-copy');
  const d = await fresh(); await d.pool.query('TRUNCATE n7.linhas');
  const mem = new MemoryDriver(seed.build({ devEmail: 'dev@agencia.test' }));
  for (const t of TABS) { const r = await copyTab(mem, d, t); assert.equal(r.igual, true, t); }
  for (const t of TABS) assert.equal((await compareTab(mem, d, t)).igual, true, 'igual: ' + t);
  await model.applyOps(repoOf(d), [{ t: 'goal', key: 'M-sales', value: 999 }], admin);
  assert.equal((await compareTab(mem, d, 'Metas')).igual, false, 'uma mudança só de um lado aparece como diferente');
  const volta = await copyTab(d, mem, 'Metas'); assert.equal(volta.igual, true);
  assert.equal((await compareTab(mem, d, 'Metas')).igual, true, 'a cópia de volta (plano de retorno) deixa os dois iguais');
  await copyTab(mem, d, 'Metas');                                                      /* copiar de novo não duplica */
  assert.equal((await d.readMany(['Metas'])).Metas.rows.length, mem.t.Metas.length);
});
