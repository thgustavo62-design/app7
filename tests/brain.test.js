// Central de Inteligência: agentes e maestro (sem API), com dados reais das semanas de 19/10 a 08/11.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js'); require('../public/assets/js/brain.js');
const { WEEKS, GENS } = require('../lib/seed-weeks');
const B = globalThis.N7Brain;

const clients = [
  { key: 'M', name: 'Minas Farma', services: ['redes', 'trafego', 'varejo'] }, { key: 'F', name: 'Farma e Farma', services: ['redes', 'trafego', 'varejo'] },
  { key: 'C', name: 'Campo Forte', services: ['redes'] }, { key: 'N', name: 'Nova7 Produtora', services: ['redes'] }];
const post = (code, b, date, status) => ({ code, b, title: 'Título ' + code, format: 'Reels', date, status, steps: {} });
const TODAY = '2026-11-18';                                           /* quarta-feira */
const posts = [
  post('R-M01', 'M', '2026-11-10', 'plan'), post('R-M02', 'M', '2026-11-12', 'prod'), post('R-M03', 'M', '2026-11-14', 'apr'), post('R-M09', 'M', '2026-11-25', 'plan'),
  post('R-F01', 'F', '2026-11-19', 'plan'), post('R-F02', 'F', '2026-11-26', 'plan'),
  post('CF-01', 'C', '2026-11-20', 'apr'), post('CF-02', 'C', '2026-11-27', 'plan'),
  post('N7-01', 'N', '2026-11-10', 'pub')];                           /* Nova7: nada nos próximos 7 dias */
const base = { today: TODAY, clients, posts, weeks: WEEKS, gens: GENS, needsClient: p => p.code === 'CF-01', planSource: { source: 'central' } };

test('maestro: a decisão do dia é o achado de maior nota, e cada nota fica entre 0 e 100 com urgência', () => {
  const r = B.run(base);
  assert.equal(r.decision.chave, 'prod-due-F', 'pauta de amanhã que nem começou');
  assert.equal(r.decision.score, 90); assert.equal(r.decision.urgencia, 'Hoje'); assert.ok(r.decision.acao && r.decision.evidencia.length);
  const all = [r.decision, ...r.also, ...r.radar, ...r.wins];
  all.forEach(f => { assert.ok(f.score >= 0 && f.score <= 100, f.chave); assert.ok(f.titulo && f.agente); });
  assert.ok(r.also.length <= 2); const pairs = r.also.map(f => f.agente + f.marca); assert.equal(new Set(pairs).size, pairs.length, '"também hoje" varia cliente e agente');
  assert.ok(!r.also.some(f => f.chave === r.decision.chave));
});
test('produção: atraso agrupado por cliente, vencimento sem começar e calendário vazio', () => {
  const r = B.run(base), all = [r.decision, ...r.also, ...r.radar];
  const late = all.find(f => f.chave === 'prod-late-M'); assert.match(late.titulo, /3 pautas atrasadas/); assert.match(late.detalhe, /R-M01/); assert.ok(late.score >= 52 && late.score < 85);
  assert.ok(all.find(f => f.chave === 'prod-empty-N'), 'Nova7 sem pauta nos próximos 7 dias');
  assert.ok(!all.some(f => f.chave === 'prod-empty-M'), 'Minas tem pauta futura');
  assert.ok(!all.some(f => f.chave === 'prod-late-N'), 'publicada não conta como atrasada');
});
test('aprovações: só quando a política exige o cliente e a peça publica em até 3 dias', () => {
  const r = B.run(base), all = [r.decision, ...r.also, ...r.radar];
  const a = all.find(f => f.chave === 'apr-C'); assert.ok(a); assert.equal(a.score, 72); assert.match(a.detalhe, /CF-01/);
  const none = B.run(Object.assign({}, base, { needsClient: () => false })); assert.ok(![none.decision, ...none.also, ...none.radar].some(f => f.chave === 'apr-C'));
});
test('vendas, mídia e redes vêm da análise semanal; ganho não vira decisão', () => {
  const r = B.run(base); assert.equal(r.analysisWeek.inicio, '2026-11-02');
  const all = [r.decision, ...r.also, ...r.radar];
  assert.ok(all.some(f => f.agente === 'redes' && /Facebook/.test(f.titulo)), 'queda do Facebook');
  assert.ok(r.wins.some(f => f.agente === 'vendas' && f.marca === 'M'), 'vendas da Minas subiram');
  assert.ok(![r.decision, ...r.also, ...r.radar].some(f => f.kind === 'ganho'));
  assert.ok(r.byAgent.redes.length >= 1 && r.byAgent.vendas.length >= 1);
});
test('dados e datas: semana sem números, decisão em branco, calendário na cópia e feriado próximo', () => {
  const r = B.run(Object.assign({}, base, { planSource: { source: 'static', error: 'Sheets 403' } })), all = [r.decision, ...r.also, ...r.radar];
  const d = all.find(f => f.chave === 'dados-M-2026-11-09'); assert.ok(d); assert.equal(d.score, 74, 'quarta-feira: hora de fechar a semana');
  assert.ok(all.find(f => f.chave === 'dados-fechamento-2026-11-02'), 'semana com análise e sem decisão');
  const c = all.find(f => f.chave === 'dados-central'); assert.match(c.detalhe, /Sheets 403/);
  const h = all.find(f => f.chave === 'cal-hol-2026-11-20'); assert.ok(h); assert.equal(h.score, 70); assert.match(h.detalhe, /CF-01/); assert.match(h.titulo, /em 2 dias/);
  const sat = B.run(Object.assign({}, base, { today: '2026-11-21' })), sx = [sat.decision, ...sat.also, ...sat.radar];
  assert.equal(sx.find(f => f.chave === 'dados-M-2026-11-09').score, 56, 'fora do começo da semana a urgência é menor');
});
test('memória: o que foi feito, adiado ou ignorado some até a data e volta depois', () => {
  const dec = [{ chave: 'prod-due-F', status: 'feita', ate: TODAY }];
  const r = B.run(Object.assign({}, base, { decisions: dec }));
  assert.notEqual(r.decision.chave, 'prod-due-F'); assert.ok(r.resolved >= 1);
  const amanha = B.run(Object.assign({}, base, { today: '2026-11-19', decisions: dec }));
  assert.ok([amanha.decision, ...amanha.also, ...amanha.radar].some(f => f.chave === 'prod-due-F') || amanha.decision.chave !== 'prod-due-F', 'a marcação de ontem não vale hoje');
  const adiada = B.run(Object.assign({}, base, { decisions: [{ chave: 'prod-due-F', status: 'adiada', ate: B.plus(TODAY, 2) }] }));
  assert.notEqual(adiada.decision.chave, 'prod-due-F'); assert.equal(B.hidden({ chave: 'x' }, [{ chave: 'x', ate: '2026-11-17' }], TODAY), false);
});
test('calma: sem pendências o cérebro diz que está tranquilo em vez de inventar urgência', () => {
  const r = B.run({ today: '2026-12-01', clients: [], posts: [], weeks: [], gens: [], planSource: { source: 'central' } });   /* sem feriado nos próximos 10 dias */
  assert.equal(r.decision, null); assert.equal(r.calm, true); assert.equal(r.also.length, 0);
  assert.equal(B.AGENT_ORDER.length, Object.keys(B.AGENTS).length); Object.values(B.AGENTS).forEach(a => assert.ok(a.does && a.rules.length));
});
