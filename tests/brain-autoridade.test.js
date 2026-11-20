// Cérebro sobre a autoridade: um achado por cliente, ritmo e alcance conversando, dado velho baixando a confiança.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js'); require('../public/assets/js/authority.js');
const B = require('../public/assets/js/brain/index.mjs').default;

const TODAY = '2026-11-18';                                   /* quarta-feira: última semana fechada é 09/11 */
const clients = [{ key: 'W', name: 'Werllem Polac', services: ['redes', 'autoridade'] }, { key: 'X', name: 'Contador Teste', services: ['redes', 'autoridade'] }, { key: 'C', name: 'Campo Forte', services: ['redes'] }];
const row = (inicio, marca, canal, o = {}) => Object.assign({ tipo: 'semana', inicio, marca, canal }, o);
const run = (authority, goals = {}) => B.run({ today: TODAY, clients, posts: [], weeks: [], gens: [], authority, goals, planSource: { source: 'central' } });
const of = (r, a, m) => (r.byAgent[a] || []).filter(f => !m || f.marca === m);

test('sem dados de autoridade, só o aviso de dados, e só para quem tem o serviço', () => {
  const r = run([]);
  ['consistencia', 'autoridade', 'convites'].forEach(a => assert.equal(of(r, a).length, 0));
  const d = of(r, 'dados').filter(f => /^aut-dados-/.test(f.chave)); assert.deepEqual(d.map(f => f.marca).sort(), ['W', 'X']);
  assert.ok(!d.some(f => f.marca === 'C'), 'Campo Forte não tem o serviço');
});
test('ritmo baixo e alcance em queda: dois achados do mesmo cliente que se ligam, sem vazar para o outro', () => {
  const rows = [row('2026-11-09', 'W', 'li', { alcance: 3000, posts: 1 }), row('2026-11-02', 'W', 'li', { alcance: 6000, posts: 3 }), row('2026-11-09', 'X', 'li', { alcance: 3000, posts: 3 }), row('2026-11-02', 'X', 'li', { alcance: 3100, posts: 3 })];
  const r = run(rows);
  const ritmo = of(r, 'consistencia', 'W'), alc = of(r, 'autoridade', 'W');
  assert.equal(ritmo.length, 1); assert.ok(ritmo[0].tags.includes('ritmo_baixo'));
  assert.equal(alc.length, 1); assert.match(alc[0].titulo, /Werllem Polac · LinkedIn: Alcance caiu/);
  assert.ok(alc[0].evidencia.some(e => /abaixo da meta/.test(e)) && r.sinapses.some(s => s.id === 'aut-ritmo-alcance' && s.casos[0].marca === 'W'), 'sinapse disparou para o Werllem');
  assert.equal(of(r, 'autoridade', 'X').length, 0, 'o outro cliente não tem queda e não herda o achado');
  assert.ok(of(r, 'consistencia', 'X').every(f => f.kind === 'ganho'), 'ritmo em dia do outro cliente é ganho');
});
test('meta de publicação vem das metas do cliente', () => {
  const rows = [row('2026-11-09', 'W', 'li', { alcance: 2000, posts: 2 })];
  assert.equal(of(run(rows, { 'W-postsemana': 2 }), 'consistencia', 'W')[0].kind, 'ganho');
  assert.equal(of(run(rows, { 'W-postsemana': 5 }), 'consistencia', 'W')[0].kind, 'acao');
});
test('dado velho: números de semana antiga baixam a nota e o aviso pede a semana fechada', () => {
  const rows = [row('2026-10-26', 'W', 'li', { alcance: 3000, posts: 0 })];
  const stale = of(run(rows), 'dados', 'W').find(f => /^aut-dados-/.test(f.chave));
  assert.ok(stale && stale.tags.includes('stale')); assert.match(stale.detalhe, /2 semana\(s\) atrás/);
  const fresh = of(run([row('2026-11-09', 'W', 'li', { alcance: 3000, posts: 0 })]), 'consistencia', 'W')[0], old = of(run(rows), 'consistencia', 'W')[0];
  assert.ok(old.score < fresh.score || old.tags.includes('ritmo_baixo'), 'achado de semana antiga não pesa mais');
  assert.ok(run(rows).sinapses.some(s => s.id === 'aut-dados-confianca'));
});
