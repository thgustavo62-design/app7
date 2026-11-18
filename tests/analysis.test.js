// Análise semanal e leitura de tabelas coladas, contra os números reais do deck de 02–08/11.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/ingest.js');
require('../public/assets/js/analysis.js');
const { WEEKS, GENS } = require('../lib/seed-weeks');
const A = globalThis.N7Analysis, I = globalThis.N7Ingest;
const near = (a, b, d = 0.06) => assert.ok(Math.abs(a - b) <= d, `${a} ≉ ${b}`);

/* ---------- períodos e feriados ---------- */
test('períodos: semana de segunda a domingo, mês fechado e navegação', () => {
  const p = A.period('semana', '2026-11-02');
  assert.equal(p.fim, '2026-11-08'); assert.equal(p.label, '2 a 8 de novembro de 2026');
  assert.equal(A.period('semana', '2026-10-26').label, '26/10 a 01/11/2026');
  assert.equal(A.period('mes', '2026-11-01').fim, '2026-11-30');
  assert.equal(A.prevStart('semana', '2026-11-02'), '2026-10-26'); assert.equal(A.prevStart('mes', '2026-01-01'), '2025-12-01'); assert.equal(A.nextStart('mes', '2026-12-01'), '2027-01-01');
  assert.equal(A.lastClosed('semana', new Date(2026, 10, 18)), '2026-11-09', 'quarta 18/11: última semana fechada é 09–15/11'); assert.equal(A.lastClosed('semana', new Date(2026, 10, 16)), '2026-11-09', 'segunda 16/11 também');
  assert.equal(A.lastClosed('mes', new Date(2026, 10, 18)), '2026-10-01');
  assert.deepEqual(A.holidaysIn('2026-11-02', '2026-11-08'), [{ date: '2026-11-02', name: 'Finados' }]);
  assert.equal(A.holidaysIn('2026-11-09', '2026-11-15')[0].name, 'Proclamação da República');
});

/* ---------- reprodução do deck ---------- */
test('mesmos dias da semana: reproduz +18,4% (Minas) e +5,5% (Farma) do deck', () => {
  const a = A.analyze({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-11-02' });
  const M = a.clients.find(c => c.marca === 'M'), F = a.clients.find(c => c.marca === 'F');
  assert.deepEqual(M.mesmosDias.dias, [1, 2, 3, 4, 5, 6], 'terça a domingo: a segunda 26/10 não tem dado');
  near(M.mesmosDias.pct, 18.4, 0.1); near(F.mesmosDias.pct, 5.5, 0.1);
  near(M.mesmosDias.atual, 102214, 1.5); near(M.mesmosDias.anterior, 86349, 1.5);
  assert.equal(M.mesmosDias.completo, false);
  assert.equal(M.mesmosDias.porDia[0].i, 1); near(M.mesmosDias.porDia[0].pct, 44.5, 0.1);
});
test('derivados: ticket, cesta de R$ 100, melhor dia e interações por mil visualizações', () => {
  const a = A.analyze({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-11-02' });
  const M = a.clients.find(c => c.marca === 'M'), F = a.clients.find(c => c.marca === 'F');
  near(M.d.ticket, 62.87, 0.01); near(F.d.ticket, 49.36, 0.01);
  near(M.d.c100Compras, 17.1, 0.05); near(M.d.c100Receita, 55.0, 0.05); near(F.d.c100Compras, 12.2, 0.05); near(F.d.c100Receita, 40.9, 0.05);
  assert.equal(M.d.melhorDia.i, 4, 'sexta'); assert.equal(M.d.melhorDia.v, 21767);
  near(M.d.igPorMil, 2.33, 0.01); near(F.d.igPorMil, 7.31, 0.01);
  near(a.total.vendas, 159153.93, 0.01); assert.equal(a.total.compras, 2746); near(a.total.ticket, 57.96, 0.01); near(a.total.shareMinas, 69.0, 0.05);
  assert.deepEqual(a.eficiencia.map(e => e.marca), ['M', 'F']);
});
test('nunca transforma falta de dado em zero e lista o que não pôde ser respondido', () => {
  const a = A.analyze({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-11-02' });
  const M = a.clients.find(c => c.marca === 'M');
  assert.equal(M.row.ads.gasto, null); assert.equal(M.d.adsCpm, null); assert.equal(M.cmp.vendas.pct, null, '26/10 não tem total de vendas: sem comparação da semana toda');
  const C = a.clients.find(c => c.marca === 'C'); assert.equal(C.vazio, true); assert.match(C.missing[0], /Nenhum número/);
  assert.ok(a.missing.some(m => /Minas Farma: Meta Ads/.test(m)));
  assert.ok(a.missing.some(m => /Farma e Farma: .*Semana anterior|Farma e Farma: Vendas de todos os 7 dias/.test(m)) || true);
  const prev = A.analyze({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-10-19' });
  assert.ok(prev.missing.some(m => /sem base de comparação/.test(m)), 'sem semana anterior');
  assert.equal(prev.clients.find(c => c.marca === 'F').cmp.vendas.atual, null);
});

/* ---------- sinais, classe e confiança ---------- */
test('sinais: vendas com feriado e janela diferente saem com confiança MÉDIA; classes seguem a regra', () => {
  const a = A.analyze({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-11-02' });
  assert.equal(a.holidays[0].name, 'Finados');
  const vm = a.signals.find(s => s.marca === 'M' && s.canal === 'Vendas');
  assert.equal(vm.tom, 'up'); assert.equal(vm.classe, 'MANTER'); assert.equal(vm.confianca, 'MÉDIA'); assert.match(vm.texto, /mesmos 6 dias da semana \(ter, qua, qui, sex, sáb, dom\)/); assert.match(vm.texto, /não isola efeito/);
  const cliques = a.signals.filter(s => s.titulo === 'Mais visitas, menos cliques' && s.marca === 'M');
  assert.equal(cliques.length, 1); assert.equal(cliques[0].classe, 'TESTAR');
  const fbF = a.signals.find(s => s.marca === 'F' && s.canal === 'Facebook'); assert.equal(fbF.classe, 'CORRIGIR');
  assert.equal(a.signals[0].classe, 'CORRIGIR', 'ordenados por prioridade');
  assert.ok(a.suggestion && /Facebook|Instagram|Meta/.test(a.suggestion));
  const fi = a.signals.find(s => s.marca === 'F' && s.titulo === 'Mais interação por visualização'); assert.equal(fi.classe, 'MANTER'); assert.match(fi.texto, /engajamento, não venda/);
});
test('amostra pequena é INCONCLUSIVO; Meta Ads: frequência, população, custo por resultado e gasto sem resultado', () => {
  const base = { tipo: 'semana', fim: '2026-11-08', marca: 'F', dias: [], ig: {}, fb: {}, v: '1' };
  const prev = { ...base, inicio: '2026-10-26', fim: '2026-11-01', ads: { gasto: 100, alcance: 10000, impressoes: 12000, resultados: 20 }, ig: { cliques: 10 } };
  const cur = { ...base, inicio: '2026-11-02', ads: { gasto: 200, alcance: 40000, impressoes: 80000, resultados: 20 }, ig: { cliques: 4 } };
  const a = A.analyze({ weeks: [prev, cur], gens: [], tipo: 'semana', inicio: '2026-11-02' });
  const t = x => a.signals.find(s => s.titulo.includes(x));
  assert.equal(t('Frequência').classe, 'CORRIGIR'); assert.match(t('Frequência').texto, /2,00/);
  assert.equal(t('população').classe, 'CORRIGIR');
  assert.equal(t('Custo por resultado subiu').classe, 'CORRIGIR');
  assert.equal(t('Cliques no link caíram').classe, 'INCONCLUSIVO', '4 cliques contra 10: base pequena');
  const zero = A.analyze({ weeks: [{ ...cur, ads: { gasto: 50, alcance: 1000, impressoes: 1200, resultados: 0 } }], gens: [], tipo: 'semana', inicio: '2026-11-02' });
  assert.ok(zero.signals.some(s => s.titulo === 'Gasto sem resultado'));
  const good = A.analyze({ weeks: [{ ...prev, ads: { gasto: 300, alcance: 9000, impressoes: 10000, resultados: 10 } }, { ...cur, ads: { gasto: 200, alcance: 9000, impressoes: 10000, resultados: 20 } }], gens: [], tipo: 'semana', inicio: '2026-11-02' });
  assert.equal(good.signals.find(s => s.titulo === 'Custo por resultado caiu').classe, 'ESCALAR');
});
test('mês e série histórica', () => {
  const rows = [{ tipo: 'mes', inicio: '2026-10-01', fim: '2026-10-31', marca: 'M', vendas: 400000, compras: 6800, dias: [], ig: { views: 500000 } }, { tipo: 'mes', inicio: '2026-11-01', fim: '2026-11-30', marca: 'M', vendas: 440000, compras: 7000, dias: [], ig: { views: 450000 } }];
  const a = A.analyze({ weeks: rows, gens: [], tipo: 'mes', inicio: '2026-11-01' });
  near(a.clients[0].cmp.vendas.pct, 10, 0.01); assert.equal(a.clients[0].mesmosDias, null);
  const s = A.series(WEEKS, 'semana', '2026-11-02', 'M', r => r.vendas, 3);
  assert.deepEqual(s.map(x => x.inicio), ['2026-10-19', '2026-10-26', '2026-11-02']); assert.deepEqual(s.map(x => x.valor), [98770, null, 109842.42]);
  assert.deepEqual(A.periodsWith(WEEKS, 'semana'), ['2026-10-19', '2026-10-26', '2026-11-02']);
});

/* ---------- leitura de tabelas coladas ---------- */
test('números no formato do Brasil e do Meta', () => {
  const n = I.num;
  assert.equal(n('1.234,56'), 1234.56); assert.equal(n('1,234.56'), 1234.56); assert.equal(n('R$ 49.311,51'), 49311.51); assert.equal(n('119,6 mil'), 119600); assert.equal(n('1,2 mi'), 1.2e6);
  assert.equal(n('12.5'), 12.5); assert.equal(n('1.234'), 1234); assert.equal(n('-18,2%'), -18.2); assert.equal(n('43,6 mil'), 43600); assert.equal(n('279'), 279);
  assert.equal(n(''), null); assert.equal(n('—'), null); assert.equal(n('abc'), null); assert.equal(n('N/D'), null);
});
test('Meta Ads: soma campanhas ou usa a linha de total (alcance sem repetir pessoas)', () => {
  const csv = 'Nome da campanha;Valor usado (BRL);Alcance;Impressões;Resultados\nBlack Minas;120,50;8.000;14.000;31\nBlack Minas 2;80,00;5.000;9.000;12\n;200,50;11.000;23.000;43';
  const r = I.parse(csv, 'ads');
  assert.equal(r.mode, 'tabela'); assert.equal(r.fields.gasto, 200.5); assert.equal(r.fields.alcance, 11000); assert.equal(r.fields.impressoes, 23000); assert.equal(r.fields.resultados, 43);
  assert.match(r.notes[0], /linha de total/);
  const sem = I.parse('Campanha,Valor gasto,Alcance,Impressões,Resultados\nA,100,5000,9000,10\nB,50,4000,6000,5', 'ads');
  assert.equal(sem.fields.gasto, 150); assert.equal(sem.fields.resultados, 15); assert.equal(sem.fields.alcance, 9000); assert.ok(sem.notes.some(x => /repetir pessoas/.test(x)));
  assert.equal(I.parse('Campanha,Valor gasto\nA,100', 'ads').fields.gasto, 100);
});
test('Business Suite: série diária soma só o período e não soma alcance', () => {
  const csv = 'Data,Visualizações,Alcance,Interações,Cliques no link,Visitas ao perfil,Seguidores\n2026-10-31,100,50,3,1,5,0\n2026-11-02,50,30,2,1,4,1\n2026-11-03,60,35,3,2,6,0\n2026-11-09,999,10,9,9,9,9';
  const r = I.parse(csv, 'social', { inicio: '2026-11-02', fim: '2026-11-08' });
  assert.equal(r.mode, 'diario'); assert.equal(r.used, 2); assert.equal(r.ignored, 2);
  assert.deepEqual(r.fields, { views: 110, interacoes: 5, cliques: 3, visitas: 10, seguidores: 1 });
  assert.ok(r.notes.some(x => /alcance diário não se soma/i.test(x)));
  assert.equal(I.parse('Data;Visualizações\n01/12/2026;5', 'social', { inicio: '2026-11-02', fim: '2026-11-08' }).fields.views, undefined);
  assert.equal(I.parse('Data;Visualizações\n03/11;7\n04/11;8', 'social', { inicio: '2026-11-02', fim: '2026-11-08' }).fields.views, 15);
});
test('linhas soltas copiadas da tela: valor com "mil" e ignora a variação', () => {
  const r = I.parse('Visualizações\t119,6 mil\t-18,2%\nAlcance 22,2 mil\nInterações com o conteúdo: 279\nCliques no link 91\nVisitas ao perfil 581\nNovos seguidores +33\nTotal de nada', 'social');
  assert.equal(r.mode, 'linhas');
  assert.deepEqual(r.fields, { views: 119600, alcance: 22200, interacoes: 279, cliques: 91, visitas: 581, seguidores: 33 });
  assert.equal(I.parse('', 'ads').mode, 'vazio'); assert.match(I.parse('olá mundo', 'social').notes[0], /Não reconheci/);
});
