/* Calcula TUDO de uma loja a partir do armazém do computador da agência: janela (dia, semana, mês), análise profunda cupom a cupom,
   momento das categorias e resumo de Promoções (estoque, giro, margem) no formato que os agentes do cérebro leem. */
require('../../public/assets/js/services.js'); require('../../public/assets/js/promo-ingest.js'); require('../../public/assets/js/promo.js');
const I = globalThis.N7PromoIngest, PR = globalThis.N7Promo;
const Z = require('./armazem'), J = require('./janela'), P = require('./profunda');

function intervalos(dias) {                                                       /* dias seguidos viram um intervalo; buraco no meio vira lacuna */
  const l = [...dias].sort(), out = []; let ini = null, ant = null;
  l.forEach(d => { if (ini == null) { ini = d; ant = d; } else if (J.mais(ant, 1) === d) ant = d; else { out.push([ini, ant, '']); ini = d; ant = d; } });
  if (ini != null) out.push([ini, ant, '']); return out;
}

function calcularLoja(loja, nome) {
  const w = Z.carregar(loja); if (!w.dias.size) return null;
  const est = Z.carregarEstoque(loja), dias = [...w.dias].sort(), cobertura = { inicio: dias[0], fim: dias[dias.length - 1] };
  const custos = est ? new Map(est.items.filter(i => i.custo > 0).map(i => [i.barras, i.custo])) : null;
  const janela = J.analisarJanela({ rows: w.rows, ajustes: w.ajustes, cobertura, diasCobertos: w.dias });
  const profunda = w.rows.length ? P.analisarProfundo({ rows: w.rows, ajustes: w.ajustes, custos, diasCobertos: w.dias }) : null;
  let promo = null, promoAnalise = null;
  if (est) {
    const itens = new Map(est.items.map(it => [it.barras, { barras: it.barras, desc: it.desc, estoque: it.estoque, estoqueConhecido: true, preco: it.preco, custo: it.custo || null, promoSistema: it.promoSistema, aprox: it.aprox, ultEntrada: it.ultEntrada, fiscal: it.fiscal, dias: {} }]));
    const ag = I.aggregate(w.rows, {});
    Object.entries(ag).forEach(([b, p]) => { const it = itens.get(b) || (itens.set(b, { barras: b, desc: p.desc, estoque: 0, estoqueConhecido: false, preco: null, custo: null, promoSistema: null, aprox: null, ultEntrada: '', fiscal: '', dias: {} }), itens.get(b)); Object.assign(it.dias, p.dias); });
    const iv = intervalos(w.dias), data = { items: [...itens.values()], importacoes: iv.map(x => ({ tipo: 'vendas', inicio: x[0], fim: x[1] })), campanhas: [], intervalos: iv, cobertura, estoqueEm: est.em.slice(0, 10) };
    promoAnalise = PR.analyze({ items: data.items, params: { coberturaInicio: cobertura.inicio, coberturaIntervalos: iv } });
    promo = PR.brainSummary(loja, nome || loja, data, promoAnalise);
  }
  return { loja, nome: nome || loja, geradoEm: new Date().toISOString(), cobertura: Object.assign({ dias: dias.length, lacunas: intervalos(w.dias).length - 1 }, cobertura), estoqueEm: est ? est.em : null, arquivosDeVendas: new Set(Object.values(w.manifesto.dias).map(x => x.arquivo)).size, janela, profunda, promoBrain: promo, promoResumo: promoAnalise && promoAnalise.resumo };
}

/* o que é publicado no site (sem linhas de venda e sem identificadores de clientes): é o contrato que os agentes de Mercado leem (ctx.vendas[loja]) */
function compactar(r) {
  const p = r && r.profunda; if (!p) return null;
  const mo = p.momentoCategorias, cl = Object.assign({}, p.clientes); delete cl.top;
  return { key: r.loja, nome: r.nome, atualizadoEm: r.geradoEm, cobertura: r.cobertura, estoqueEm: r.estoqueEm, arquivosDeVendas: r.arquivosDeVendas,
    geral: p.geral, momento: mo && { confianca: mo.confianca, semanasCompletas: mo.semanasCompletas, variacaoTotal: mo.variacaoTotal, semanasRecentes: mo.semanasRecentes, semanasAnteriores: mo.semanasAnteriores, categorias: mo.categorias.slice(0, 30) },
    foco: p.focoMarketing, categorias: p.categorias, horas: p.horas, melhorJanela3h: p.melhorJanela3h, piorJanela3h: p.piorJanela3h, periodoDoDia: p.periodoDoDia, diaSemana: p.diaSemana, mapaCalor: p.mapaCalor,
    faixasValor: p.faixasValor, faixasItens: p.faixasItens, diaDoMes: p.diaDoMes, pagamento: p.pagamento, clientes: cl, convenio: p.convenio, entregas: p.entregas, operadores: p.operadores.slice(0, 20), caixas: p.caixas,
    produtos: { distintos: p.produtos.distintos, vendidosUmaVez: p.produtos.vendidosUmaVez, topValor: p.produtos.topValor.slice(0, 20), topQtd: p.produtos.topQtd.slice(0, 20), variacaoPreco: p.produtos.variacaoPreco.slice(0, 10), porHora: p.produtos.porHora },
    pares: p.pares.maiorLift.slice(0, 15), paresFrequentes: p.pares.maisFrequentes.slice(0, 15), puxadoresDeTicket: p.puxadoresDeTicket, margem: p.margem && { cobertura: p.margem.cobertura, margem: p.margem.margem, lucroEstimadoCentavos: p.margem.lucroEstimadoCentavos, nAbaixoDoCusto: p.margem.nAbaixoDoCusto, vendidosAbaixoDoCusto: p.margem.vendidosAbaixoDoCusto, maioresLucros: p.margem.maioresLucros, margemPorCategoria: p.margem.margemPorCategoria, porHora: p.margem.porHora, aviso: p.margem.aviso },
    oportunidades: p.oportunidades, semanas: r.janela ? r.janela.semanas.slice(-30).map(w => ({ inicio: w.inicio, fim: w.fim, completa: w.completa, vendasCentavos: w.vendasCentavos, cupons: w.cupons, ticketCentavos: w.ticketCentavos, c100n: w.c100n })) : [], meses: r.janela ? r.janela.meses : [],
    promoResumo: r.promoResumo || null, promoBrain: r.promoBrain || null };
}

module.exports = { calcularLoja, compactar, intervalos };
