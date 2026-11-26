// Análise profunda cupom a cupom: grupos de cupom, categorias finas, momento RELATIVO à loja e pares com lift.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../scripts/analise-local/profunda');
const J = require('../scripts/analise-local/janela');
const RH = require('../scripts/analise-local/relatorio-html');

const iso = (base, n) => J.mais(base, n);
const linha = (data, hora, lanc, barras, desc, preco, qtd, extra = {}) => Object.assign({ data, hora, lanc: String(lanc), usu: '000020', barras, desc, preco, qtd, valor: Math.round(preco * qtd * 100) / 100, oper: 'A VISTA', emp: '000000000', cli: '00000000', cx: '00001' }, extra);
/* 8 semanas completas (segunda 2026-06-01 a domingo 2026-07-26); 4 primeiras: A=100/dia, B=100/dia; 4 últimas: A=100/dia, B=50/dia (a loja cai 25%, a categoria A fica parada) */
function serie() {
  const rows = []; let n = 1;
  for (let i = 0; i < 56; i++) { const d = iso('2026-06-01', i), recente = i >= 28;
    rows.push(linha(d, '10:15', n, '7891000000011', 'DIPIRONA 500MG C/10 CPR', 10, 10)); n++;                          /* categoria Dor e febre: R$ 100/dia */
    rows.push(linha(d, '17:30', n, '7891000000028', 'FRALDA PERSONAL HIPER G C/60 UND', 50, recente ? 1 : 2)); n++;      /* categoria Bebê: fraldas: 100 -> 50 */
    rows.push(linha(d, '18:05', n, '7891000000035', 'DIPIRONA 500MG C/10 CPR', 10, 1, { cli: '00001234', oper: 'A PRAZO' })); rows.push(linha(d, '18:05', n, '7891000000042', 'LENCO UMED HUGGIES C/48 UND', 10, 1, { cli: '00001234', oper: 'A PRAZO' })); n++;
  }
  return rows;
}

test('categorias finas de farmácia: medicamento, fralda, higiene e "demais" caem no balde certo', () => {
  const c = d => globalThis.N7PromoIngest && P && require('../scripts/analise-local/profunda') && (P.categoriaFina ? P.categoriaFina(d) : null);
  const cats = Object.fromEntries(P.analisarProfundo({ rows: serie().slice(0, 12), ajustes: [] }).categorias.map(x => [x.categoria, true]));
  assert.ok(cats['Dor e febre'] && cats['Bebê: fraldas'], JSON.stringify(Object.keys(cats)));
});

test('momento das categorias é RELATIVO à loja: loja cai 25%, categoria parada é "acelerar" e a que cai 50% é "defender"', () => {
  const a = P.analisarProfundo({ rows: serie(), ajustes: [] }), mo = a.momentoCategorias, F = a.focoMarketing;
  assert.equal(mo.semanasCompletas, 8); assert.equal(mo.confianca, 'alta'); assert.ok(Math.abs(mo.variacaoTotal - (-0.2)) < 0.05, 'loja variou ' + mo.variacaoTotal);
  const dor = mo.categorias.find(c => c.categoria === 'Dor e febre'), fral = mo.categorias.find(c => c.categoria === 'Bebê: fraldas');
  assert.ok(dor.relativaAoTotal > 0.1, 'dor e febre parada, acima da loja'); assert.ok(fral.relativaAoTotal < -0.1, 'fraldas caem mais que a loja');
  assert.ok(F.acelerar.some(c => c.categoria === 'Dor e febre') && F.defender.some(c => c.categoria === 'Bebê: fraldas'));
  const e = a.oportunidades.find(o => /defender/.test(o.area)); assert.match(e.titulo, /MAIS que a loja/);
});

test('cupom a cupom: ticket, itens, pagamento, cliente identificado, pares com lift e nenhum cupom dividido', () => {
  const a = P.analisarProfundo({ rows: serie(), ajustes: [] }), n = 56 * 3;
  assert.equal(a.geral.cupons, n); assert.equal(a.geral.diasComVenda, 56);
  assert.equal(a.pagamento.find(p => /PRAZO/.test(p.forma)).cupons, 56); assert.equal(a.clientes.cuponsIdentificados, 56);
  assert.equal(a.clientes.clientesDistintos, 1); assert.equal(a.clientes.parteRecorrentes, 1, 'o mesmo cliente em dias diferentes é recorrente');
  const par = a.pares.maiorLift[0]; assert.ok(par && par.juntos === 56 && par.lift > 1, 'par dipirona + lenço sempre juntos');
  assert.equal(a.faixasItens.find(f => f.faixa === '2 itens').cupons, 84, '56 cupons de dois produtos + 28 de fralda com 2 unidades');
  const soma = a.geral.vendasCentavos; assert.equal(soma, serie().reduce((s, r) => s + Math.round(r.valor * 100), 0), 'a soma dos cupons é a soma das linhas');
});

test('relatório executivo em HTML: capa com a marca, resumo e as seções, tudo em um arquivo só', () => {
  const C = require('../scripts/analise-local/calcular'), a = P.analisarProfundo({ rows: serie(), ajustes: [] });
  const compacta = { key: 'M', nome: 'Loja Teste', atualizadoEm: '2026-11-26T12:00:00Z', cobertura: { inicio: '2026-06-01', fim: '2026-07-26', dias: 56, lacunas: 0 }, geral: a.geral, momento: { confianca: 'alta', semanasCompletas: 8, variacaoTotal: -0.2, categorias: a.momentoCategorias.categorias }, foco: a.focoMarketing, categorias: a.categorias, horas: a.horas, melhorJanela3h: a.melhorJanela3h, piorJanela3h: a.piorJanela3h, diaSemana: a.diaSemana, mapaCalor: a.mapaCalor, faixasValor: a.faixasValor, faixasItens: a.faixasItens, diaDoMes: a.diaDoMes, pagamento: a.pagamento, clientes: a.clientes, convenio: a.convenio, entregas: a.entregas, produtos: { distintos: 4, vendidosUmaVez: 0, topValor: a.produtos.topValor, topQtd: a.produtos.topQtd }, pares: a.pares.maiorLift, paresFrequentes: a.pares.maisFrequentes, puxadoresDeTicket: a.puxadoresDeTicket, margem: null, oportunidades: a.oportunidades, semanas: [], meses: [] };
  const html = RH.gerar(compacta, { marca: 'Minha Agência' });
  assert.match(html, /<title>Análise de vendas e marketing · Loja Teste<\/title>/); assert.match(html, /Minha Agência/); assert.match(html, /Resumo executivo/); assert.match(html, /Onde focar o marketing/); assert.match(html, /ao centavo/);
  assert.ok(!/<script/i.test(html) && !/https?:\/\//.test(html), 'um arquivo só, sem script e sem endereço de fora');
  assert.equal(typeof C.compactar, 'function');
});
