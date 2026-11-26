// Agentes de Mercado (categorias, horários, cesta, fidelização, foco) e a sinapse com o estoque, sobre a análise de vendas de uma loja.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js');
const B = require('../public/assets/js/brain/index.mjs').default;

const clients = [{ key: 'M', name: 'Minas Farma', services: ['redes', 'varejo', 'promocoes'] }];
const cat = (categoria, share, variacao, relativa) => ({ categoria, share, variacao, relativa, variacaoTotal: -0.14, deltaShare: 0.01, recentesCentavos: Math.round(share * 20000000) });
const vendas = (over = {}) => Object.assign({
  key: 'M', nome: 'Minas Farma', cobertura: { inicio: '2026-06-01', fim: '2026-11-22', dias: 90 }, geral: { cupons: 26000, ticketMedioCentavos: 6400 },
  momento: { confianca: 'alta', semanasCompletas: 13, variacaoTotal: -0.14 },
  foco: { defender: [cat('Bebê: fraldas', 0.063, -0.23, -0.10)], acelerar: [cat('Pressão e coração', 0.038, -0.06, 0.12)], reanimar: [cat('Suplementos e vitaminas', 0.027, -0.28, -0.17)], ativar: [], nota: 'Base: 4 contra 4 semanas' },
  melhorJanela3h: { de: 16, ate: 19, parte: 0.27, vendasCentavos: 4500000 }, piorJanela3h: { de: 19, ate: 22, parte: 0.12, vendasCentavos: 2100000 },
  faixasItens: [{ faixa: '1 item', parteCupons: 0.52, ticketCentavos: 2800 }], pares: [{ descA: 'SAB. A', descB: 'SAB. B', juntos: 30, lift: 120, confiancaAB: 0.4, confiancaBA: 0.3 }],
  clientes: { parteCupons: 0.26, parteRecorrentes: 0.22, ticketIdentificadoCentavos: 9000, ticketBalcaoCentavos: 5200 } }, over);
const base = { today: '2026-11-26', clients, posts: [], weeks: [], gens: [], planSource: { source: 'central' }, needsClient: () => false };
const todos = r => [r.decision, ...r.also, ...r.radar, ...r.wins].filter(Boolean);

test('mercado: os 5 agentes geram achados por loja a partir da análise de vendas, com evidência', () => {
  const r = B.run(Object.assign({}, base, { vendas: { M: vendas() } })), f = todos(r), por = a => f.filter(x => x.agente === a);
  assert.ok(por('categorias').some(x => /defender/.test(x.chave) && /Bebê: fraldas/.test(x.titulo)), 'defender fraldas');
  assert.ok(por('categorias').some(x => /reanimar/.test(x.chave)), 'reanimar suplementos');
  assert.ok(r.wins.some(x => x.agente === 'categorias' && /Pressão e coração/.test(x.titulo)), 'acelerar vira ganho, não decisão');
  assert.equal(por('horarios').length, 1); assert.equal(por('cesta').length, 2); assert.equal(por('fidelizacao').length, 1);
  const foco = por('foco')[0]; assert.ok(foco && /foco de marketing/.test(foco.titulo) && foco.evidencia.length >= 3 && foco.acao);
  f.forEach(x => { assert.ok(x.score >= 0 && x.score <= 100); assert.equal(x.marca, 'M'); });
});

test('mercado: relativo à loja, dado velho e base curta baixam a nota; sem análise não há achado', () => {
  const nota = ctx => todos(B.run(Object.assign({}, base, ctx))).find(x => x.chave === 'cat-defender-M-Bebê: fraldas').score;
  const forte = nota({ vendas: { M: vendas() } });
  assert.ok(nota({ vendas: { M: vendas({ momento: { confianca: 'baixa', semanasCompletas: 2, variacaoTotal: -0.14 } }) } }) < forte, 'base curta baixa a nota');
  assert.ok(nota({ vendas: { M: vendas({ cobertura: { inicio: '2026-06-01', fim: '2026-10-01', dias: 90 } }) } }) < forte, 'dado com mais de 3 semanas baixa a nota');
  assert.equal(todos(B.run(base)).filter(x => ['categorias', 'horarios', 'cesta', 'fidelizacao', 'foco'].includes(x.agente)).length, 0);
});

test('mercado: sinapse categoria em queda + estoque parado na mesma loja liga os dois agentes', () => {
  const promo = { M: { key: 'M', name: 'Minas Farma', vazio: false, cobertura: { dias: 90 }, comEstoque: 1000, semCusto: 0, capitalCusto: 200000, capitalParado: 60000, capitalQueima: 30000, parados: 300, queima: 100, ruptura: 0, margemMedia: .3, topQueima: [{ desc: 'X', estoque: 5, capital: 100, por: 9.9, desconto: .1 }], topRuptura: [], margemBaixa: { n: 0, abaixoCusto: 0, itens: [] }, candidatosPorCat: {}, nQueima: 10, nAtrair: 5, estoqueEm: '2026-11-20', importacoes: 3, campanhas: [] } };
  const r = B.run(Object.assign({}, base, { vendas: { M: vendas() }, promo })), s = r.sinapses.find(x => x.id === 'cat-estoque');
  assert.ok(s && s.casos.length === 1, 'sinapse disparou');
  const f = todos(r), est = f.find(x => x.agente === 'estoque'); assert.ok(est && est.rel.some(x => x.sinapse === 'cat-estoque'));
});
