/* Análise da JANELA inteira de um relatório de vendas já conferido: dia por dia, semana por semana (segunda a domingo), mês por mês,
   por hora e por dia da semana. Tudo em centavos inteiros, a partir das mesmas linhas que fecharam com o Total do rodapé.
   As semanas seguem a definição da tela Semana: vendas = total do relatório no período (inclui taxa de entrega e arredondamentos),
   compras = cupons (data + nº de lançamento), cestas acima de R$ 100 = cupons com total maior que R$ 100, dias = os 7 dias de segunda a domingo. */
require('../../public/assets/js/promo-ingest.js');
const I = globalThis.N7PromoIngest;
const cents = n => Math.round(n * 100);
const t0 = iso => Date.parse(iso + 'T12:00:00Z');
const iso = t => new Date(t).toISOString().slice(0, 10);
const mais = (d, n) => iso(t0(d) + n * 864e5);
const segunda = d => mais(d, -((new Date(t0(d)).getUTCDay() + 6) % 7));
const dias = (a, b) => { const o = []; for (let t = t0(a); t <= t0(b); t += 864e5) o.push(iso(t)); return o; };
const mediana = v => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

function analisarJanela({ rows, ajustes = [], cobertura, diaParcial = '', diasCobertos = null }) {
  if (!cobertura) return null;
  const lanc = new Map(), dia = {};
  const D = d => dia[d] || (dia[d] = { v: 0, vp: 0, taxa: 0, div: 0, aj: 0, itens: 0, cupons: new Set() });
  const cupom = (d, l, v) => { const k = d + '|' + l; lanc.set(k, (lanc.get(k) || 0) + v); D(d).cupons.add(l); };
  const hora = Array(24).fill(0);
  rows.forEach(r => {
    const v = cents(r.valor), x = D(r.data), nao = I.isNaoProduto(r); x.v += v; cupom(r.data, r.lanc, v);
    if (!nao) { x.vp += v; x.itens += r.qtd; } else if (I.isTaxa(r)) x.taxa += v; else if (/^diversos/.test(I.strip(r.desc))) x.div += v;
    if (r.data >= cobertura.inicio && r.data <= cobertura.fim) hora[+r.hora.slice(0, 2)] += v;
  });
  ajustes.forEach(a => { const v = cents(a.valor), x = D(a.data); x.v += v; x.aj += v; if (a.lanc) cupom(a.data, a.lanc, v); });

  const lista = dias(cobertura.inicio, cobertura.fim).filter(d => !diasCobertos || diasCobertos.has(d)), cob = new Set(lista);
  const porDia = lista.map(d => { const x = dia[d] || { v: 0, vp: 0, taxa: 0, div: 0, aj: 0, itens: 0, cupons: new Set() }; return { d, v: x.v, vp: x.vp, taxa: x.taxa, div: x.div, aj: x.aj, itens: x.itens, cupons: x.cupons.size }; });
  const cuponsDoDia = d => [...lanc.entries()].filter(([k]) => k.startsWith(d + '|'));
  const cestas = {}; lista.forEach(d => { const c = cuponsDoDia(d).map(([, v]) => v).filter(v => v > 10000); cestas[d] = { n: c.length, v: c.reduce((s, v) => s + v, 0) }; });

  const agrupa = (chave, completoDe) => {
    const g = {}; porDia.forEach(x => { const k = chave(x.d); (g[k] || (g[k] = [])).push(x); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)).map(([k, l]) => {
      const v = l.reduce((s, x) => s + x.v, 0), c = l.reduce((s, x) => s + x.cupons, 0), n100 = l.reduce((s, x) => s + cestas[x.d].n, 0), v100 = l.reduce((s, x) => s + cestas[x.d].v, 0);
      return Object.assign({ chave: k, diasCobertos: l.length, completa: completoDe(k).every(d => cob.has(d)), vendasCentavos: v, produtosCentavos: l.reduce((s, x) => s + x.vp, 0), cupons: c, itens: l.reduce((s, x) => s + x.itens, 0), c100n: n100, c100Centavos: v100, ticketCentavos: c ? Math.round(v / c) : null }, { l });
    });
  };
  const semanas = agrupa(segunda, k => dias(k, mais(k, 6))).map(w => ({ inicio: w.chave, fim: mais(w.chave, 6), completa: w.completa, diasCobertos: w.diasCobertos, vendasCentavos: w.vendasCentavos, produtosCentavos: w.produtosCentavos, cupons: w.cupons, itens: w.itens, c100n: w.c100n, c100Centavos: w.c100Centavos, ticketCentavos: w.ticketCentavos,
    dias7: dias(w.chave, mais(w.chave, 6)).map(d => (cob.has(d) ? (porDia.find(x => x.d === d) || { v: 0 }).v : null)) }));
  const meses = agrupa(d => d.slice(0, 7), m => dias(m + '-01', mais(iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)), -1))).map(m => ({ mes: m.chave, completo: m.completa, diasCobertos: m.diasCobertos, vendasCentavos: m.vendasCentavos, cupons: m.cupons, ticketCentavos: m.ticketCentavos }));

  /* dia da semana: soma e média por ocorrência; dias atípicos = bem abaixo da mediana do mesmo dia da semana (com ao menos 4 ocorrências) */
  const dow = Array.from({ length: 7 }, () => []); porDia.forEach(x => dow[(new Date(t0(x.d)).getUTCDay() + 6) % 7].push(x));
  const nomes = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const porDiaDaSemana = dow.map((l, i) => ({ dia: nomes[i], ocorrencias: l.length, vendasCentavos: l.reduce((s, x) => s + x.v, 0), mediaCentavos: l.length ? Math.round(l.reduce((s, x) => s + x.v, 0) / l.length) : null, medianaCentavos: mediana(l.map(x => x.v)) }));
  const atipicos = []; dow.forEach((l, i) => { const m = mediana(l.map(x => x.v)); if (l.length >= 4 && m > 0) l.forEach(x => { if (x.v < m * 0.4) atipicos.push({ d: x.d, dia: nomes[i], vendasCentavos: x.v, medianaDoDiaCentavos: m, motivo: 'abaixo de 40% da mediana do mesmo dia da semana' }); else if (x.v > m * 2) atipicos.push({ d: x.d, dia: nomes[i], vendasCentavos: x.v, medianaDoDiaCentavos: m, motivo: 'acima de 2 vezes a mediana do mesmo dia da semana' }); }); });
  const semVenda = porDia.filter(x => x.v === 0).map(x => x.d);
  const parcial = diaParcial && dia[diaParcial] ? { d: diaParcial, vendasCentavos: dia[diaParcial].v, cupons: dia[diaParcial].cupons.size } : null;
  return { inicio: cobertura.inicio, fim: cobertura.fim, nDias: lista.length, vendasForaDaJanelaCentavos: Object.entries(dia).filter(([d]) => !cob.has(d)).reduce((s, [, x]) => s + x.v, 0), vendasCentavos: porDia.reduce((s, x) => s + x.v, 0), porDia, semanas, meses, porHora: hora.map((v, h) => ({ hora: h, vendasCentavos: v })).filter(x => x.vendasCentavos), porDiaDaSemana, diasSemVenda: semVenda, diasAtipicos: atipicos, diaParcial: parcial };
}

/* a janela fecha com o relatório: soma dos dias da janela + o dia cortado (fora da janela) = Total do rodapé, ao centavo */
function conferirJanela(v, j) {
  if (!j) return { id: 'janela', ok: false, aviso: false, msg: 'Não consegui montar a janela de datas do relatório', detalhe: null };
  const soma = j.vendasCentavos + j.vendasForaDaJanelaCentavos, ok = soma === v.totalRodape;
  return { id: 'janela', ok, aviso: false, msg: ok ? `Janela de ${j.nDias} dias (${j.inicio} a ${j.fim}), ${j.semanas.filter(w => w.completa).length} semana(s) completa(s): a soma dia a dia fecha com o Total do rodapé` : `A soma dia a dia (${soma}) não fecha com o Total do rodapé (${v.totalRodape})`, detalhe: ok ? null : { somaDias: soma, rodape: v.totalRodape } };
}

module.exports = { analisarJanela, conferirJanela, segunda, mais, dias };
