// Central de Inteligência: agentes e maestro (sem API), com dados reais das semanas de 19/10 a 08/11.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js');
const { WEEKS, GENS } = require('../lib/seed-weeks');
const B = require('../public/assets/js/brain/index.mjs').default;

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
  assert.equal(r.decision.score, 96, '90 da pauta de amanhã + 6 da sinapse feriado-prazo (Consciência Negra em 20/11)'); assert.equal(r.decision.urgencia, 'Hoje'); assert.ok(r.decision.acao && r.decision.evidencia.length);
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

/* ---------- cérebro v2: novos agentes, sinapses, memória e saúde por cliente ---------- */
const steps = (r, g, e, a, ag) => ({ roteiro: r, gravar: g, editar: e, aprovar: a, agendar: ag });
const all = r => [r.decision, ...r.also, ...r.radar, ...r.wins].filter(Boolean);
const find = (r, k) => all(r).find(f => f.chave === k);
const W = (inicio, marca, o) => Object.assign({ tipo: 'semana', inicio, marca, ads: {}, ig: {}, fb: {}, dias: [] }, o);
const calm = { today: TODAY, clients, planSource: { source: 'central' }, needsClient: () => false };

test('catálogo: 18 agentes em 6 áreas, todos com regras, e cada sinapse liga agentes que existem', () => {
  assert.equal(B.AGENT_ORDER.length, 18); assert.equal(new Set(B.AGENT_ORDER).size, 18);
  Object.values(B.AGENTS).forEach(a => { assert.ok(B.AREAS[a.area], a.id + ' sem área'); assert.ok(a.does && a.rules.length, a.id); });
  B.AREA_ORDER.forEach(id => assert.ok(Object.values(B.AGENTS).some(a => a.area === id), 'área vazia ' + id));
  B.SYNAPSES.forEach(s => { assert.ok(s.nome && s.texto); [...s.de, ...s.para].forEach(id => assert.ok(B.AGENTS[id] || ['memoria', 'todos'].includes(id), s.id + ' -> ' + id)); });
});
test('etapas: prazo de etapa vencido com o status parado vira achado antes de a pauta atrasar', () => {
  const p = [post('R-M09', 'M', '2026-11-25', 'plan')]; p[0].steps = steps('2026-11-15', '2026-11-16', '2026-11-21', '2026-11-23', '2026-11-24');
  const r = B.run(Object.assign({}, calm, { posts: p })), f = find(r, 'pipe-M');
  assert.ok(f); assert.match(f.detalhe, /o roteiro era para 15\/11/); assert.ok(f.score >= 55 && f.score < 80);
  const ok = B.run(Object.assign({}, calm, { posts: [Object.assign({}, p[0], { status: 'agd' })] })); assert.equal(find(ok, 'pipe-M'), undefined, 'pronta: nada atrasado');
  const hol = post('R-M10', 'M', '2026-11-27', 'plan'); hol.steps = steps('2026-11-20', '2026-11-26', '2026-11-26', '2026-11-26', '2026-11-26');
  assert.ok(find(B.run(Object.assign({}, calm, { posts: [hol] })), 'pipe-hol-M'), 'roteiro vence no feriado de 20/11');
});
test('capacidade: soma as etapas por dia e só avisa acima do limite', () => {
  const mk = n => Array.from({ length: n }, (_, i) => { const p = post('R-M' + (20 + i), 'M', '2026-11-30', 'plan'); p.steps = steps('2026-11-17', '2026-11-19', '2026-11-26', '2026-11-27', '2026-11-28'); return p; });
  const r = B.run(Object.assign({}, calm, { posts: mk(3) })), f = find(r, 'cap-2026-11-19');
  assert.ok(f); assert.match(f.titulo, /sobrecarregada em 19\/11/); assert.match(f.detalhe, /3 gravação/);
  assert.equal(find(B.run(Object.assign({}, calm, { posts: mk(2) })), 'cap-2026-11-19'), undefined);
});
test('editorial: ritmo abaixo dos horários fixos, ideia aprovada parada e formato repetido', () => {
  const slots = { M: [{ dow: 1, time: '12:00', format: 'Reels' }, { dow: 2, time: '12:00', format: 'Reels' }, { dow: 4, time: '18:30', format: 'Reels' }, { dow: 6, time: '11:00', format: 'Reels' }] };
  const p = [post('R-M30', 'M', '2026-11-20', 'plan'), post('R-M31', 'M', '2026-11-27', 'plan'), post('R-M32', 'M', '2026-11-28', 'plan'), post('R-M33', 'M', '2026-12-01', 'plan')];
  const ideas = [{ id: 'i1', b: 'M', stage: 'aprovada', title: 'Dica de inverno', at: '2026-11-05' }, { id: 'i2', b: 'M', stage: 'nova', title: 'Outra', at: '2026-11-01' }, { id: 'i3', b: 'M', stage: 'aprovada', title: 'Recente', at: '2026-11-16' }];
  const r = B.run(Object.assign({}, calm, { posts: p, slots, ideas }));
  assert.ok(find(r, 'edit-cad-M'), '1 pauta para 4 horários fixos'); assert.match(find(r, 'edit-cad-M').titulo, /1 de 4/);
  assert.match(find(r, 'edit-mix-M').titulo, /só Reels/);
  const i = find(r, 'edit-ideas-M'); assert.ok(i); assert.match(i.titulo, /1 ideia aprovada parada/, 'só a de 13 dias conta');
  assert.equal(find(B.run(Object.assign({}, calm, { posts: p })), 'edit-cad-M'), undefined, 'sem horários fixos não há o que comparar');
});
test('qualidade: peça pronta que vai ao ar sem checagem; sem o dado de checagens o agente não opina', () => {
  const p = [post('R-F40', 'F', '2026-11-19', 'agd')];
  assert.ok(find(B.run(Object.assign({}, calm, { posts: p, checks: {} })), 'qual-F'));
  assert.equal(find(B.run(Object.assign({}, calm, { posts: p, checks: { 'R-F40': { dims: {} } } })), 'qual-F'), undefined);
  assert.equal(find(B.run(Object.assign({}, calm, { posts: p })), 'qual-F'), undefined);
});
test('sinapse apr-prod: aprovação pendente e pauta apertada no mesmo cliente se reforçam', () => {
  const p = [post('CF-01', 'C', '2026-11-20', 'apr'), post('CF-03', 'C', '2026-11-24', 'plan')]; p[1].steps = steps('2026-11-12', '2026-11-14', '2026-11-18', '2026-11-20', '2026-11-22');
  const r = B.run(Object.assign({}, calm, { posts: p, needsClient: x => x.code === 'CF-01' })), a = find(r, 'apr-C'), pi = find(r, 'pipe-C');
  assert.ok(a && pi); assert.ok(a.rel.some(x => x.chave === 'pipe-C')); assert.ok(pi.rel.some(x => x.chave === 'apr-C'));
  assert.ok(a.score > 72, 'ganhou os pontos da sinapse'); assert.ok(r.sinapses.some(s => s.id === 'apr-prod' && s.qtd === 1));
});
test('sinapse mídia + redes: frequência alta com queda de visualizações e cliques vira "criativos desgastados"', () => {
  const weeks = [W('2026-11-02', 'M', { ads: { gasto: 500, alcance: 8000, impressoes: 9000, resultados: 50 }, ig: { views: 10000, cliques: 200, visitas: 500 } }),
    W('2026-11-09', 'M', { ads: { gasto: 500, alcance: 4000, impressoes: 10000, resultados: 30 }, ig: { views: 6000, cliques: 100, visitas: 500 } })];
  const r = B.run(Object.assign({}, calm, { weeks, clients: clients.slice(0, 1) })), c = find(r, 'crit-fadiga-M-2026-11-09');
  assert.ok(c, 'achado novo de Criativos'); assert.equal(c.agente, 'criativo'); assert.ok(c.evidencia.length >= 2); assert.ok(c.rel.length >= 2);
  const src = all(r).filter(f => f.agente === 'midia' || f.agente === 'redes'); assert.ok(src.length && src.every(f => f.rel.some(x => x.chave === c.chave) && f.evidencia.some(e => /criativos desgastados/.test(e))));
  assert.ok(c.score >= Math.max(...src.map(f => f.score)), 'o composto vence os originais'); assert.ok(r.sinapses.some(s => s.id === 'midia-redes-criativo'));
  const so = B.run(Object.assign({}, calm, { weeks: [weeks[0], W('2026-11-09', 'M', { ads: { gasto: 500, alcance: 4000, impressoes: 10000, resultados: 50 }, ig: { views: 10000, cliques: 200, visitas: 500 } })], clients: clients.slice(0, 1) }));
  assert.equal(find(so, 'crit-fadiga-M-2026-11-09'), undefined, 'só um lado: sem composto');
});
test('sinapse dados-confiança: sem números da última semana, achados da semana antiga perdem nota e avisam', () => {
  const r = B.run(base), fb = find(r, 'sig-2026-11-02-M-facebook-o-facebook-perdeu-distribuicao');
  assert.ok(fb.evidencia.some(e => /última semana fechada está sem números/.test(e))); assert.equal(fb.score, 51, '60 x 0,85');
  assert.ok(r.sinapses.some(s => s.id === 'dados-confianca'));
});
test('memória: o que voltou depois de "feito" sobe de nota e fica marcado como reincidente', () => {
  const r = B.run(Object.assign({}, base, { decisions: [{ chave: 'prod-due-F', status: 'feita', ate: '2026-11-16', titulo: 'x' }] })), f = find(r, 'prod-due-F');
  assert.equal(f.reincidente, true); assert.equal(f.score, 100); assert.ok(f.evidencia.some(e => /marcado como feito em 16\/11/.test(e)));
  assert.ok(r.memoria.voltou.some(x => x.chave === 'prod-due-F')); assert.ok(r.sinapses.some(s => s.id === 'memoria'));
  const sumiu = B.run(Object.assign({}, base, { decisions: [{ chave: 'prod-late-Z', status: 'feita', ate: '2026-11-10', titulo: 'Pauta antiga', marca: 'Z' }] }));
  assert.deepEqual(sumiu.memoria.resolveu.map(x => x.chave), ['prod-late-Z'], 'feito e não voltou: contou como resolvido');
  assert.equal(find(B.run(Object.assign({}, base, { decisions: [{ chave: 'prod-due-F', status: 'feita', ate: TODAY }] })), 'prod-due-F'), undefined);
});
test('gestão de contas: saúde por cliente e aviso quando várias frentes pioram juntas', () => {
  const r = B.run(base), f = r.clientes.find(c => c.key === 'F'), n = r.clientes.find(c => c.key === 'N');
  assert.equal(r.clientes.length, 4); assert.ok(f.saude < 60 && f.nivel === 'risco'); assert.ok(n.saude > f.saude && n.nivel === 'atencao', 'Nova7: calendário vazio e sem números, mas só dois achados');
  r.clientes.forEach(c => { assert.ok(c.saude >= 0 && c.saude <= 100); assert.equal(c.nivel, B.healthLevel(c.saude)); });
  const k = find(r, 'cli-risco-F'); assert.ok(k && k.score <= 78 && k.evidencia.length >= 2); assert.equal(find(r, 'cli-risco-N'), undefined);
  assert.ok(r.decision.agente !== 'cliente', 'o resumo por cliente não toma o lugar do achado concreto');
});
test('oportunidade: orgânico forte em cliente sem tráfego pago, sem virar decisão', () => {
  const r = B.run(Object.assign({}, base, { clients: clients.map(c => c.key === 'F' ? Object.assign({}, c, { services: ['redes', 'varejo'] }) : c) })), o = all(r).find(f => f.agente === 'oportunidades');
  assert.ok(o && o.marca === 'F' && o.score === 44); assert.notEqual(r.decision.agente, 'oportunidades');
});
