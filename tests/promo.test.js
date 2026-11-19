// Central de Promoções: leitura do analítico de vendas e do estoque, e o motor de preço, giro e candidatos.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/promo-ingest.js'); require('../public/assets/js/promo.js');
const I = globalThis.N7PromoIngest, P = globalThis.N7Promo;

/* linhas no formato do analítico do sistema da farmácia */
const hdr = ['                    09/11/2026 14:37 Pag.: 1/3', 'Drogaria Teste LTDA', 'ANALITICO DE VENDAS', 'Periodo de: 01/11/2026 a 09/11/2026 Horario das 00:00:00 as 23:59:59'];
const L = (d, h, lanc, barras, desc, pu, q, v, extra = 'A VISTA 000000000 00000000 00001') => `${d} ${h}   ${lanc} 000073 ${barras} ${desc}    ${pu}   ${q}   ${v} ${extra}`;
const rows = [
  L('01/11/2026', '08:05', 34608, '7898215151807', 'BEBIDA LACTEA PIRAKIDS 200ML CHOCOLATE', '1,99', 2, '3,98'),
  L('02/11/2026', '09:15', 34613, '7899547543766', 'PARACETAMOL 750MG 20 CPS', '7,99', 1, '7,99', 'A PRAZO 000000002 01090003 00002'),
  L('02/11/2026', '09:15', 34613, '0000000061718', 'TAXA DE ENTREGA ES', '2,00', 1, '2,00', 'A VISTA 000000002 01090003 00002'),
  L('02/11/2026', '09:20', 34614, '0000000060778', 'DIVERSOS', '1,00', 15, '15,00'),
  L('02/11/2026', '10:00', 34620, '7898593053267', 'REHIDRALIN EM PO AGUA DE COCO C/ 4 ENV 28G MAXINUT 19,99', '19,99', 1, '19,99', 'A VISTA 000000000 00000000'),
  L('09/11/2026', '10:00', 34900, '7899547543766', 'PARACETAMOL 750MG 20 CPS', '7,99', 3, '23,97'),
  L('03/11/2026', '11:00', 34650, '7896026306751', 'GLYXAMBI 25+5MG C/30 CPR', '299,89', -1, '-299,89'),
  '01/11/2026 08:05   34608 000073 7898215151807 PRODUTO SEM PRECO NEM QUANTIDADE A VISTA 000000000'];

test('analítico: lê as linhas, ignora o cabeçalho, conta o que não leu e traz período e emissão', () => {
  const r = I.parseSalesLines(hdr.concat(rows));
  assert.deepEqual(r.header.periodo, { inicio: '2026-11-01', fim: '2026-11-09' }); assert.deepEqual(r.header.emissao, { data: '2026-11-09', hora: '14:37' });
  assert.equal(r.stats.lidas, 7); assert.equal(r.stats.candidatas, 8); assert.equal(r.stats.rejeitadas, 1, 'a linha quebrada é contada, não some em silêncio');
  const reh = r.rows.find(x => x.barras === '7898593053267'); assert.equal(reh.preco, 19.99); assert.equal(reh.qtd, 1); assert.equal(reh.valor, 19.99, 'preço colado na descrição não confunde');
  assert.equal(r.rows.find(x => x.barras === '7896026306751').qtd, -1, 'devolução entra como quantidade negativa');
  assert.equal(r.rows.find(x => x.barras === '7898215151807').valor, 3.98);
});
test('analítico: dia da emissão fora, taxa de entrega não é produto, soma por produto e por dia', () => {
  const r = I.parseSalesLines(hdr.concat(rows)), drop = I.partialDay(r.header);
  assert.equal(drop, '2026-11-09', 'relatório tirado às 14:37 do último dia: o dia está cortado');
  assert.equal(I.partialDay({ periodo: { fim: '2026-11-09' }, emissao: { data: '2026-11-10', hora: '08:00' } }), null);
  const ag = I.aggregate(r.rows, { dropDay: drop });
  assert.ok(!ag['0000000061718'], 'TAXA DE ENTREGA fora'); assert.ok(!ag['0000000060778'], 'DIVERSOS (venda sem cadastro) não é produto'); assert.deepEqual(ag['7899547543766'].dias, { '2026-11-02': [1, 7.99] }, 'a venda de 09/11 foi descartada');
  assert.deepEqual(I.coverage(r.rows, drop), { inicio: '2026-11-01', fim: '2026-11-03' });
});

test('estoque: acha o cabeçalho, lê números e datas do Excel, e conta item sem custo, duplicado e sem barras', () => {
  const grid = [['Relatório de estoque'], [], ['Barras', 'Descrição', 'Estoque', 'Totalizador Fiscal', 'Preço de Venda', 'Últ. Prc. Entrada', 'Val. Cal. Totalizador', 'Preço de Promoção', 'Valor Aproximado', 'Últ. Entrada'],
    [7898215151807, 'BEBIDA LACTEA', 12, 'F', 1.99, 1.2, 1.33, 0, 1.99, 46000],
    ['7899547543766', 'PARACETAMOL 750MG', '30', 'F', '7,99', '', 0, 0, 7.99, '05/10/2026'],
    [7899547543766, 'DUPLICADO', 1, 'F', 1, 1, 0, 0, 1, ''], ['0000000000000', 'SEM BARRAS', 1, 'F', 1, 1, 0, 0, 1, ''], [null, null, null]];
  const r = I.parseStockGrid(grid);
  assert.equal(r.erro, null); assert.equal(r.items.length, 2); assert.deepEqual([r.stats.semCusto, r.stats.duplicados, r.stats.semBarras], [1, 1, 1]);
  assert.equal(r.items[0].barras, '7898215151807'); assert.equal(r.items[0].custo, 1.2); assert.match(r.items[0].ultEntrada, /^20\d\d-\d\d-\d\d$/, 'serial do Excel vira data');
  assert.equal(r.items[1].estoque, 30); assert.equal(r.items[1].preco, 7.99); assert.equal(r.items[1].custo, null, 'custo zerado ou vazio fica sem custo (nunca zero)'); assert.equal(r.items[1].ultEntrada, '2026-10-05');
  assert.match(I.parseStockGrid([['Produto', 'Qtd']]).erro, /cabeçalho/); assert.match(I.parseStockGrid([['Barras', 'Descrição']]).erro, /Faltam colunas/);
});

/* ---------- motor ---------- */
const dias = (ref, lista) => Object.fromEntries(lista.map(([off, q, v]) => [P.iso(P.day(ref) - off), [q, v]]));
const REF = '2026-11-08';
const it = (barras, o = {}) => Object.assign({ barras, desc: 'PRODUTO ' + barras, estoque: 10, preco: 20, custo: 12, dias: {} }, o);

test('terminação ,90: o menor valor ,90 que não fica abaixo do piso', () => {
  assert.equal(P.ceil90(48.59), 48.9); assert.equal(P.ceil90(49.95), 50.9); assert.equal(P.ceil90(22), 22.9); assert.equal(P.ceil90(2.36), 2.9); assert.equal(P.ceil90(48.9), 48.9);
});
test('preço sugerido: nunca fura o piso, termina em ,90, e diz por que não sugere', () => {
  const regra = P.REGRAS.padrao;                                           /* piso 20% */
  const a = P.suggest(it('1', { preco: 99.99, custo: 66.06 }), regra, 'estoque');
  assert.ok(a.ok); assert.ok(a.por >= 66.06 / 0.8 - 1e-9, 'por ≥ piso'); assert.equal(Math.round((a.por % 1) * 100), 90); assert.ok(a.margem >= 0.2); assert.ok(a.por < 99.99);
  const b = P.suggest(it('2', { preco: 4.9, custo: 2.12 }), regra, 'giro');
  assert.equal(b.ok, false); assert.match(b.motivo, /Sem desconto real/, 'custo + R$3 passa do preço de venda: não há desconto');
  assert.match(P.suggest(it('3', { custo: null }), regra, 'giro').motivo, /sem custo não existe piso/);
  assert.match(P.suggest(it('4', { estoque: 0 }), regra, 'giro').motivo, /Sem estoque/);
  const corta = P.suggest(it('5', { preco: 30, custo: 20 }), P.REGRAS.corta, 'estoque'), padrao = P.suggest(it('5', { preco: 30, custo: 20 }), regra, 'estoque');
  assert.ok(corta.por <= padrao.por, 'Corta Preço (piso 10%) pode ir mais baixo que a campanha padrão (piso 20%)'); assert.ok(corta.por >= 20 / 0.9 - 1e-9);
  const m = P.suggest(it('6', { preco: 100, custo: 40 }), regra, 'margem');
  assert.ok(m.desconto <= 0.15 + 0.01, 'papel Margem: desconto até 15%');
});
test('análise: histórico curto avisa, parado e encalhado saem do giro, ruptura e curva ABC', () => {
  const items = [
    it('A1', { estoque: 3, dias: dias(REF, [[0, 20, 400], [10, 20, 400], [20, 20, 400], [40, 20, 400], [70, 20, 400]]) }),   /* giro alto, estoque baixo: ruptura */
    it('P1', { estoque: 40, dias: {} }),                                                                                       /* estoque sem venda nenhuma */
    it('E1', { estoque: 200, dias: dias(REF, [[5, 3, 60], [50, 3, 60]]) }),                                                      /* estoque para muitos meses */
    it('S1', { estoque: 0, dias: dias(REF, [[1, 5, 100]]) }),
    it('C1', { estoque: 8, custo: null, dias: dias(REF, [[2, 4, 80]]) })];
  const a = P.analyze({ items, ref: REF, params: { coberturaInicio: P.iso(P.day(REF) - 89) } });
  const by = k => a.items.find(i => i.barras === k);
  assert.deepEqual(a.items.map(i => i.papel), ['giro', 'parado', 'queima', 'semestoque', 'semcusto'].map((x, i) => by(['A1', 'P1', 'E1', 'S1', 'C1'][i]).papel));
  assert.equal(by('P1').papel, 'parado'); assert.equal(by('E1').papel, 'queima'); assert.equal(by('S1').papel, 'semestoque'); assert.equal(by('C1').papel, 'semcusto');
  assert.ok(by('E1').mesesEstoque >= 6); assert.equal(by('P1').mesesEstoque, Infinity);
  assert.equal(by('A1').q60, 80, 'janela de 60 dias pega 4 dias de venda (0, 10, 20 e 40 dias atrás)'); assert.equal(by('A1').q90, 100);
  assert.equal(a.resumo.capitalParado, 40 * 12); assert.equal(a.resumo.parados, 1); assert.equal(a.resumo.semCusto, 1);
  assert.equal(a.resumo.cobertura.dias, 90); assert.equal(a.resumo.cobertura.completa90, true); assert.ok(!a.avisos.some(x => /cobrem só/.test(x)));
  assert.ok(a.avisos.some(x => /sem custo/.test(x)));
  assert.equal(by('A1').abc, 'A'); assert.ok(a.items.filter(i => i.abc === 'A').length >= 1);
  const c = P.candidatos(a); assert.deepEqual(c.ruptura.map(i => i.barras), ['A1']); assert.ok(c.queima.some(i => i.barras === 'P1'));
  assert.deepEqual(c.semCusto.map(i => i.barras), ['C1']);
  const curto = P.analyze({ items, ref: REF, params: { coberturaInicio: P.iso(P.day(REF) - 9) } });
  assert.ok(curto.avisos.some(x => /cobrem só 10 dias/.test(x)), 'histórico de 10 dias não vira "giro de 90 dias"');
  assert.equal(P.analyze({ items: [], ref: null }).ref, null);
});
test('campanha: totais pelo giro de 60 dias, alerta de item abaixo do piso e sem custo; lojas cruzadas', () => {
  const a = P.analyze({ items: [it('X', { preco: 30, custo: 20, estoque: 50, dias: dias(REF, [[1, 30, 900], [30, 30, 900]]) }), it('Y', { custo: null, dias: dias(REF, [[1, 3, 60]]) })], ref: REF, params: { coberturaInicio: P.iso(P.day(REF) - 59) } });
  const x = a.items[0], y = a.items[1], regra = P.REGRAS.padrao;
  const t = P.campaignTotals([{ item: x, por: 26.9 }, { item: y, por: 10 }], regra, 7);
  assert.equal(t.semCusto, 1); assert.equal(t.abaixoDoPiso, 0); assert.equal(t.itens, 2); assert.ok(t.unidadesBase > 0 && t.margemBase > 0.2);
  assert.equal(P.campaignTotals([{ item: x, por: 22.9 }], regra, 7).abaixoDoPiso, 1, '22,90 com custo 20 fica abaixo do piso de 25,00');
  const b = P.analyze({ items: [it('X', { estoque: 0, dias: dias(REF, [[3, 20, 600]]) })], ref: REF }), a2 = P.analyze({ items: [it('X', { estoque: 40, custo: 12, dias: {} })], ref: REF, params: { coberturaInicio: P.iso(P.day(REF) - 89) } });
  const tr = P.cruzarLojas(a2, b); assert.equal(tr.length, 1); assert.equal(tr[0].de, 'a'); assert.equal(tr[0].giroPara, 20);
});
