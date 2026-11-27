// Agentes de Criação (Postagens, Drive e Agente criativo) lendo ctx.criacao: o que falta, o que está fora do padrão e os rascunhos para revisar.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js');
const B = require('../public/assets/js/brain/index.mjs').default;

const clients = [{ key: 'M', name: 'Minas Farma', services: ['redes'] }];
const posts = [
  { code: 'C-M10', b: 'M', title: 'Fraldas em oferta', date: '2026-11-28', status: 'plan', format: 'Carrossel', steps: {} },
  { code: 'C-M11', b: 'M', title: 'Dicas de verão', date: '2026-12-02', status: 'plan', format: 'Reels', steps: {} },
  { code: 'C-M12', b: 'M', title: 'Minas Club', date: '2026-11-29', status: 'prod', format: 'Carrossel', steps: {} },
  { code: 'C-M13', b: 'M', title: 'Já publicado', date: '2026-11-20', status: 'pub', format: 'Post', steps: {} }
];
const base = { today: '2026-11-27', clients, posts, weeks: [], gens: [], needsClient: () => false, planSource: { source: 'central' } };
const todos = r => [r.decision, ...r.also, ...r.radar, ...r.wins].filter(Boolean);
const criacao = (over = {}) => Object.assign({ criativoLigado: true, rascunhos: [], drive: { M: { ligado: true, posts: [
  { codigo: 'C-M12', data: '2026-11-29', titulo: 'Minas Club', midias: 2, temLegenda: true },
  { codigo: '', data: '', titulo: 'pasta qualquer', midias: 1, temLegenda: false },
  { codigo: 'X-99', data: '2026-11-25', titulo: 'codigo inexistente', midias: 1, temLegenda: true }] } } }, over);

test('Postagens: pauta dos próximos 7 dias sem material vira achado urgente; arte e legenda completas pedem Aprovação; publicada fica de fora', () => {
  const r = B.run(Object.assign({}, base, { criacao: criacao() })), f = todos(r).filter(x => x.agente === 'postagens');
  const sem = f.find(x => x.chave === 'post-sem-material-M'); assert.ok(sem && /2 pauta\(s\)/.test(sem.titulo), sem && sem.titulo); assert.ok(sem.evidencia.some(e => /C-M10/.test(e)) && !sem.evidencia.some(e => /C-M13/.test(e)));
  assert.ok(sem.score > 60, 'falta 1 dia: sobe a nota (' + sem.score + ')');
  const pronto = f.find(x => x.chave === 'post-pronto-M'); assert.ok(pronto && /C-M12/.test(pronto.evidencia.join()), 'C-M12 tem arte e legenda e está em produção');
});

test('Drive: pasta fora do padrão, código sem pauta e arte sem legenda; Agente criativo: rascunho novo para revisar e aviso se estiver desligado', () => {
  const r = B.run(Object.assign({}, base, { criacao: criacao({ rascunhos: [{ codigo: 'C-M10', marca: 'M', titulo: 'Fraldas em oferta', status: 'novo', alertas: ['Revisar: promete garantia.'] }, { codigo: 'C-M11', marca: 'M', titulo: 'x', status: 'aprovado' }] }) })), f = todos(r);
  assert.ok(f.some(x => x.chave === 'drive-padrao-M' && /2 pasta/.test(x.titulo)), 'uma pasta sem padrão e uma com código que não existe');
  assert.ok(f.some(x => x.chave === 'drive-legenda-M'), 'arte sem legenda');
  const c = f.find(x => x.chave === 'cria-rascunhos-M'); assert.ok(c && /1 rascunho/.test(c.titulo) && /1 alerta/.test(c.evidencia.join()), 'só o rascunho "novo" conta, com o alerta');
  assert.ok(!f.some(x => x.chave === 'cria-desligado'));
  const off = todos(B.run(Object.assign({}, base, { criacao: criacao({ criativoLigado: false }) }))); assert.ok(off.some(x => x.chave === 'cria-desligado'), 'avisa que o agente criativo está desligado');
});

test('Criação: sem Drive ligado ou sem dados, os agentes ficam quietos; nenhum achado inventa publicação', () => {
  const nada = todos(B.run(base)).filter(x => ['postagens', 'drive', 'criacao'].includes(x.agente)); assert.equal(nada.length, 0);
  const desligado = todos(B.run(Object.assign({}, base, { criacao: { drive: { M: { ligado: false, posts: [] } }, rascunhos: [], criativoLigado: true } }))).filter(x => ['postagens', 'drive'].includes(x.agente)); assert.equal(desligado.length, 0);
});
