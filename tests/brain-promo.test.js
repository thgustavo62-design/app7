// Cérebro sobre as promoções: um achado por farmácia, sem misturar lojas, com confiança, cadência e sinapses.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/analysis.js'); require('../public/assets/js/promo.js');
const B = require('../public/assets/js/brain/index.mjs').default;

const TODAY = '2026-11-18';                                   /* quarta-feira */
const clients = [
  { key: 'M', name: 'Minas Farma', services: ['redes', 'trafego', 'varejo', 'promocoes'] }, { key: 'F', name: 'Farma e Farma', services: ['redes', 'trafego', 'varejo', 'promocoes'] },
  { key: 'C', name: 'Campo Forte', services: ['redes'] }];
const summary = (key, name, o = {}) => Object.assign({ key, name, vazio: false, estoqueEm: '2026-11-16', importacoes: 2, campanhas: [], cobertura: { inicio: '2026-08-20', fim: '2026-11-16', dias: 89 + 8 }, comEstoque: 1000, semCusto: 100, capitalCusto: 100000, capitalParado: 0, capitalQueima: 0, parados: 0, queima: 0, ruptura: 0, margemMedia: 0.27,
  topQueima: [], topRuptura: [], margemBaixa: { n: 0, abaixoCusto: 0, itens: [] }, candidatosPorCat: {}, nQueima: 0, nAtrair: 0 }, o);
const run = promo => B.run({ today: TODAY, clients, posts: [], weeks: [], gens: [], promo, planSource: { source: 'central' } });
const ofAgent = (r, a, marca) => (r.byAgent[a] || []).filter(f => !marca || f.marca === marca);

test('sem dados de promoção, o cérebro não inventa nada; só vê lojas com o serviço', () => {
  const r = run(undefined); ['estoque', 'ruptura', 'margem', 'campanha'].forEach(a => assert.equal(ofAgent(r, a).length, 0));
  const c = run({ C: summary('C', 'Campo Forte', { capitalParado: 90000 }) }); assert.equal(ofAgent(c, 'estoque').length, 0, 'Campo Forte não tem o serviço Promoções e preços');
});
test('estoque parado: um achado por farmácia, com os números da própria loja', () => {
  const r = run({ M: summary('M', 'Minas Farma', { capitalParado: 30000, capitalQueima: 20000, parados: 80, queima: 40, nQueima: 25, topQueima: [{ desc: 'FRALDA X', estoque: 90, capital: 4200, por: 58.9, desconto: .16 }] }), F: summary('F', 'Farma e Farma', { capitalParado: 2000, capitalQueima: 1000 }) });
  const m = ofAgent(r, 'estoque', 'M'); assert.equal(m.length, 1); assert.match(m[0].titulo, /Minas Farma: R\$\s50\.000 parados/); assert.match(m[0].evidencia[0], /FRALDA X: 90 un\./); assert.equal(m[0].link.route, 'promocoes/candidatos'); assert.equal(m[0].link.brand, 'M'); assert.equal(m[0].link.lista, 'queima');
  assert.equal(ofAgent(r, 'estoque', 'F').length, 0, 'a outra loja está abaixo do limite e não herda o número da primeira');
  assert.ok(m[0].detalhe.includes('80 item(ns) sem nenhuma venda'));
});
test('confiança: histórico curto de vendas baixa a nota do achado', () => {
  const nota = dias => ofAgent(run({ M: summary('M', 'Minas Farma', { capitalParado: 40000, capitalQueima: 0, nQueima: 5, cobertura: { inicio: '2026-11-01', fim: '2026-11-08', dias } }) }), 'estoque', 'M')[0];
  assert.ok(nota(95).score > nota(70).score && nota(70).score > nota(8).score, 'completo > 60 a 89 dias > menos de 60');
  assert.ok(nota(8).evidencia.some(e => /Histórico de vendas de 8 dias/.test(e)));
});
test('ruptura e margem: itens de cada loja e alerta de preço no custo', () => {
  const r = run({ F: summary('F', 'Farma e Farma', { ruptura: 6, topRuptura: [{ desc: 'LEITE NINHO', estoque: 4, dias: 5, abc: 'A', q60: 50 }], margemBaixa: { n: 9, abaixoCusto: 2, itens: [{ desc: 'DIPIRONA', margem: -0.02, v90: 3000 }] } }) });
  const rup = ofAgent(r, 'ruptura', 'F')[0], mar = ofAgent(r, 'margem', 'F')[0];
  assert.match(rup.titulo, /Farma e Farma: 6 item/); assert.match(rup.evidencia[0], /LEITE NINHO: 4 un\. para ~5 dia/); assert.equal(ofAgent(r, 'ruptura', 'M').length, 0);
  assert.equal(mar.score, 80); assert.match(mar.titulo, /2 item\(ns\) com preço de venda no custo ou abaixo/);
});
test('campanha da semana: cada loja tem a sua cadência (Minas: Dias do Leite na quarta; Farma: Atacadão do Bebê)', () => {
  const p = { M: summary('M', 'Minas Farma'), F: summary('F', 'Farma e Farma') };
  const r = run(p), m = ofAgent(r, 'campanha', 'M'), f = ofAgent(r, 'campanha', 'F');
  assert.ok(m.some(x => /Dias do Leite hoje/.test(x.titulo)) && m.every(x => x.marca === 'M')); assert.ok(f.some(x => /Atacadão do Bebê hoje/.test(x.titulo)) && f.every(x => x.marca === 'F'));
  assert.ok(m.some(x => /Quinta dos Suplementos amanhã/.test(x.titulo)), 'a campanha de amanhã também aparece'); assert.equal(m.find(x => /hoje/.test(x.titulo)).link.tipo, 'Dias do Leite'); assert.equal(m.find(x => /hoje/.test(x.titulo)).link.dia, TODAY);
  const aprov = [{ id: 'cp-1', nome: 'X', tipo: 'Atacadão do Bebê', inicio: '2026-11-18', fim: '2026-11-19', status: 'aprovada', itens: 12 }];
  assert.ok(!ofAgent(run({ ...p, F: summary('F', 'Farma e Farma', { campanhas: aprov }) }), 'campanha', 'F').some(x => /Atacadão do Bebê/.test(x.titulo)), 'aprovada cobre o dia');
  const rasc = ofAgent(run({ ...p, F: summary('F', 'Farma e Farma', { campanhas: [Object.assign({}, aprov[0], { status: 'rascunho' })] }) }), 'campanha', 'F');
  assert.ok(rasc.some(x => /ainda é rascunho/.test(x.titulo)) && rasc[0].score < f[0].score, 'rascunho pede aprovação, com nota menor que a falta total');
});
test('dados de preço: base velha, histórico curto e sem custo; sinapse baixa a confiança dos achados da mesma loja', () => {
  const base = { capitalParado: 40000, nQueima: 5 };
  const fresco = run({ M: summary('M', 'Minas Farma', base) }), velho = run({ M: summary('M', 'Minas Farma', Object.assign({ estoqueEm: '2026-11-01', semCusto: 600 }, base)) });
  const n = r => ofAgent(r, 'estoque', 'M')[0].score;
  assert.ok(ofAgent(velho, 'dados', 'M').some(f => /estoque importado tem 17 dias/.test(f.titulo)), 'estoque de 01/11 está com 17 dias'); assert.ok(ofAgent(velho, 'dados', 'M').some(f => /sem custo/.test(f.titulo)));
  assert.ok(n(velho) < n(fresco)); assert.ok(velho.sinapses.some(s => s.id === 'promo-dados-confianca' && s.casos.some(c => c.marca === 'M')));
  const vazio = run({ F: { key: 'F', name: 'Farma e Farma', vazio: true, estoqueEm: '', importacoes: 0, campanhas: [] } });
  assert.ok(ofAgent(vazio, 'dados', 'F').some(f => /ainda não tem estoque e vendas/.test(f.titulo) && f.link.route === 'promocoes/importar'));
});
test('sinapses: estoque parado + falta de campanha, e ruptura com anúncio no ar', () => {
  const comEst = run({ M: summary('M', 'Minas Farma', { capitalParado: 40000, nQueima: 12, candidatosPorCat: { 'Leite e fórmulas': 7 } }) });
  assert.ok(comEst.sinapses.some(s => s.id === 'estoque-campanha')); assert.match(ofAgent(comEst, 'campanha', 'M').find(f => /hoje/.test(f.titulo)).acao, /itens de queima/);
  const WEEK = { tipo: 'semana', inicio: '2026-11-09', fim: '2026-11-15', marca: 'M', vendas: 1000, compras: 20, dias: Array(7).fill(null), c100n: null, c100rs: null, ig: {}, fb: {}, ads: { gasto: 150, alcance: 8000, impressoes: 9000, resultados: 12 }, janela: '', fonte: '', obs: '' };
  const r = B.run({ today: TODAY, clients, posts: [], weeks: [WEEK], gens: [], promo: { M: summary('M', 'Minas Farma', { ruptura: 4, topRuptura: [{ desc: 'X', estoque: 2, dias: 3, abc: 'B', q60: 20 }] }) }, planSource: { source: 'central' } });
  assert.ok(r.sinapses.some(s => s.id === 'ruptura-midia')); assert.ok(ofAgent(r, 'ruptura', 'M')[0].evidencia.some(e => /Anúncio no ar na semana/.test(e)));
});
test('a saúde de cada farmácia considera os achados de promoção só dela', () => {
  const r = run({ M: summary('M', 'Minas Farma', { capitalParado: 60000, nQueima: 30, ruptura: 10, topRuptura: [{ desc: 'A', estoque: 1, dias: 2, abc: 'A', q60: 30 }], margemBaixa: { n: 4, abaixoCusto: 3, itens: [{ desc: 'B', margem: -.1, v90: 900 }] } }), F: summary('F', 'Farma e Farma') });
  const hm = r.clientes.find(h => h.key === 'M'), hf = r.clientes.find(h => h.key === 'F');
  assert.ok(hm.saude < hf.saude, 'a Minas Farma com problema de estoque e margem fica pior que a Farma sem problema'); assert.ok(hm.agentes.includes('estoque') && !hf.agentes.includes('estoque'));
});
