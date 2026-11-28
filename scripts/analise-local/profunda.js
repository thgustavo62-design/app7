/* Análise PROFUNDA das vendas, cupom a cupom, a partir das linhas que já fecharam com o Total do rodapé de cada relatório.
   Serve para relatórios fracionados (um por dia, por semana...): recebe as linhas de TODOS os relatórios juntos, sem repetir dia.
   Tudo em centavos inteiros. Cupom = data + nº de lançamento (todas as linhas do mesmo cupom, inclusive taxa de entrega e arredondamento).
   Entrega: resumo geral, horário e dia da semana (mapa de calor), faixas de valor e de itens por cupom, pagamento, clientes, convênio, caixas e operadores,
   produtos e categorias, o que se compra junto (pares com lift), puxadores de ticket, margem estimada (se houver custo), entregas e oportunidades com evidência. */
require('../../public/assets/js/promo-ingest.js');
const I = globalThis.N7PromoIngest;
const cents = n => Math.round(n * 100);
const t0 = iso => Date.parse(iso + 'T12:00:00Z');
const dowDe = iso => (new Date(t0(iso)).getUTCDay() + 6) % 7;                  /* 0 = segunda */
const NOMES = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const pctil = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null);
const soma = (l, f) => l.reduce((s, x) => s + f(x), 0);
const ZERO_EMP = /^0+$/;
const { segunda, mais } = require('./janela');
const cat7 = m => Array.from({ length: 7 }, (_, i) => mais(m, i));
const CATS_FINAS = [
  ['Bebê: fraldas', /\b(fralda|pants|babysec|pampers|huggies|personal hiper)\b/],
  ['Bebê: higiene e cuidados', /\b(lenco umed|pomada assadura|hipogloss|mamadeira|chupeta|turma da monica|johnson baby|shampoo infantil)\b/],
  ['Leite e fórmulas', /\b(ninho|aptamil|nestogeno|similac|enfamil|mucilon|neston|formula infantil|leite em po|composto lacteo|nan )\b/],
  ['Suplementos e vitaminas', /\b(whey|creatina|bcaa|proteina|omega|colageno|polivitaminico|centrum|suplemento|pre treino|termogenico|vitamina|zinco|magnesio|probiotico|melatonina|mind force|nutra gold|max titanium|growth|pea c|supra up|cabelo pele)\b/],
  ['Dor e febre', /\b(dipirona|paracetamol|ibuprofeno|novalgina|tylenol|neosaldina|dorflex|torsilax|cetoprofeno|diclofenaco|nimesulida|naproxeno|buscopan|maxalgina|doril|aspirina|cataflam|toragesic|tramadol|cetoprofeno)\b/],
  ['Gripe, tosse e alergia', /\b(multigrip|benegrip|resfenol|cimegripe|descongestionante|xarope|spray nasal|sol nasal|neosoro|sorine|loratadina|desloratadina|cetirizina|allegra|histamin|ambroxol|acetilcisteina|fluimucil|bisolvon|nasonex|pastilha)\b/],
  ['Estômago e digestão', /\b(omeprazol|pantoprazol|esomeprazol|ranitidina|sal de fruta|estomazil|simeticona|luftal|lufta|domperidona|plasil|lactulona|dulcolax|simeco|sonrisal|digesplus|gastro|eno )\b/],
  ['Pressão e coração', /\b(losartana|enalapril|captopril|anlodipino|atenolol|carvedilol|hidroclorotiazida|valsartana|olmesartana|sinvastatina|rosuvastatina|atorvastatina|clopidogrel|manivasc|entresto|trezete|ezetimiba|bisoprolol|metoprolol|espironolactona|furosemida|amiodarona|varfarina|xarelto|eliquis)\b/],
  ['Diabetes', /\b(metformina|glifage|glibenclamida|gliclazida|jardiance|glyxambi|forxiga|januvia|galvus|trayenta|lantus|insulina|glicemia|accu chek|vildagliptina|sitagliptina|dapagliflozina|empagliflozina)\b/],
  ['Saúde mental e sono', /\b(sertralina|escitalopram|fluoxetina|paroxetina|venlafaxina|bupropiona|clonazepam|alprazolam|zolpidem|rivotril|pondera|lexapro|zoloft|desvenlafaxina|quetiapina|risperidona|amitriptilina|pregabalina|gabapentina|lamotrigina|topiramato)\b/],
  ['Antibióticos e antimicrobianos', /\b(amoxicilina|azitromicina|cefalexina|ciprofloxacino|levofloxacino|claritromicina|metronidazol|nitrofurantoina|sulfametoxazol|fluconazol|cetoconazol|albendazol|ivermectina|nistatina|clindamicina|doxiciclina)\b/],
  ['Hormônios e contraceptivos', /\b(levotiroxina|puran|euthyrox|anticoncepcional|diane|yasmin|selene|ciclo 21|microvlar|gestinol|cerazette|desogestrel|etinilestradiol|drospirenona|postinor|levonorgestrel|estradiol)\b/],
  ['Sexual e próstata', /\b(sildenafila|tadalafila|viagra|cialis|finasterida|propecia|dutasterida|tamsulosina)\b/],
  ['Dermatológicos e pele', /\b(protetor solar|hidratante|dermocosmetico|bepantol|nivea|cetaphil|la roche|vichy|eucerin|neutrogena|isdin|pomada|creme|gel aquoso|adapaleno|isotretinoina|minoxidil|locao|acne)\b/],
  ['Cabelo, beleza e perfumaria', /\b(shampoo|condicionador|tintura|coloracao|mascara capilar|elseve|pantene|tresemme|dove|garnier|salon line|wella|igora|esmalte|batom|base liquida|rimel|perfume|colonia|desodorante|deo|antitranspirante)\b/],
  ['Higiene pessoal', /\b(absorvente|protetor diario|papel hig|fio dental|escova dental|creme dental|enxaguante|antisseptico|sabonete|sab\.|barbeador|prestobarba|lamina|cotonete|algodao|haste flexivel|preservativo|camisinha|olla|jontex|lubrificante|gel intimo)\b/],
  ['Limpeza e casa', /\b(detergente|lava roupas|sabao em po|amaciante|desinfetante|agua sanitaria|limpador|esponja|multiuso|limpol|omo|ype|brilhante|veja|lysoform)\b/],
  ['Olhos e ouvidos', /\b(colirio|lagrima|systane|hylo|optive|refresh|lacrima|otosporin|oftalmic)\b/],
  ['Primeiros socorros e aparelhos', /\b(curativo|band aid|gaze|esparadrapo|atadura|termometro|nebulizador|inalador|aparelho de pressao|medidor|seringa|agulha|luva|mascara|teste de gravidez|teste rapido|micropore|compressa|soro fisiologico|agua oxigenada|mertiolate|povidine|alcool)\b/],
  ['Conveniência e alimentos', /\b(biscoito|chocolate|bala|chiclete|refrigerante|agua mineral|suco|cafe|barra de cereal|salgadinho|snack|energetico|gatorade|isotonico|achocolatado)\b/],
  ['Pet', /\b(pet|racao|antipulgas|nexgard|bravecto|simparic|frontline)\b/]
];
const FORMA = /\b(cpr|cps|cp|comp|caps|dr|drg|gts|gotas|amp|susp|sol|xpe|inj|inalat|ung|pom|supos|adesivo|pastilha|sach|c\/\d+)\b/;
const catCache = new Map();
function categoriaFina(desc) {
  const t = I.strip(desc); let r = catCache.get(t); if (r) return r;
  r = (CATS_FINAS.find(([, re]) => re.test(t)) || [])[0] || (FORMA.test(t) ? 'Medicamentos (demais)' : 'Outros');
  catCache.set(t, r); return r;
}
function categoriaPadrao() { return categoriaFina; }
function categoriaPadraoAntiga() { try { require('../../public/assets/js/services.js'); require('../../public/assets/js/promo.js'); return globalThis.N7Promo.categoria; } catch (e) { return null; } }

/* Momento de cada categoria: últimas semanas completas contra as anteriores (4 contra 4 quando há 8 semanas; menos semanas, menos confiança) */
function momentoCategorias(rows, categoria, diasCobertos) {
  const dias = diasCobertos ? [...diasCobertos].sort() : [...new Set(rows.map(r => r.data))].sort(), cob = new Set(dias);
  const mondays = [...new Set(dias.map(segunda))].filter(m => cat7(m).every(d => cob.has(d))).sort(), ms = new Set(mondays), n = mondays.length;
  const k = n >= 8 ? 4 : n >= 4 ? 2 : n >= 2 ? 1 : 0, recentes = mondays.slice(n - k), anteriores = mondays.slice(Math.max(0, n - 2 * k), n - k);
  const wk = {}, cache = new Map(); let totW = {};
  rows.forEach(r => { if (I.isNaoProduto(r)) return; const m = segunda(r.data); if (!ms.has(m)) return; let c = cache.get(r.barras); if (c === undefined) { c = categoria(r.desc) || 'Outros'; cache.set(r.barras, c); } const v = cents(r.valor); (wk[c] || (wk[c] = {}))[m] = (wk[c][m] || 0) + v; totW[m] = (totW[m] || 0) + v; });
  const sum = (o, l) => l.reduce((t, m) => t + (o[m] || 0), 0), TR = sum(totW, recentes), TA = sum(totW, anteriores);
  const varTotal = TA > 0 ? TR / TA - 1 : null;
  const lista = Object.entries(wk).map(([c, o]) => { const r = sum(o, recentes), a = sum(o, anteriores); return { categoria: c, relativaAoTotal: a > 0 && varTotal != null ? (r / a) / (1 + varTotal) - 1 : null, serie: mondays.map(m => o[m] || 0), recentesCentavos: r, anterioresCentavos: a, variacao: a > 0 ? r / a - 1 : null, share: TR ? r / TR : null, shareAnterior: TA ? a / TA : null, deltaShare: TR && TA ? r / TR - a / TA : null }; }).sort((x, y) => y.recentesCentavos - x.recentesCentavos);
  return { semanasCompletas: n, semanas: mondays, semanasRecentes: recentes, semanasAnteriores: anteriores, confianca: n >= 8 ? 'alta' : n >= 4 ? 'média' : n >= 2 ? 'baixa' : 'sem base', totalRecentesCentavos: TR, totalAnterioresCentavos: TA, variacaoTotal: varTotal, categorias: lista };
}

/* onde focar o marketing: junta momento (sobe ou cai), peso na venda e margem (quando há custo) */
function focoMarketing(mom, margemCat) {
  if (!mom || mom.confianca === 'sem base') return { defender: [], acelerar: [], reanimar: [], ativar: [], nota: 'Poucas semanas completas para comparar categorias: continue alimentando relatórios.' };
  const C = mom.categorias.filter(c => c.categoria !== 'Outros' && c.recentesCentavos > 0), mk = {}; (margemCat || []).forEach(m => { mk[m.categoria] = m.margem; });
  const margens = Object.values(mk).filter(x => x != null).sort((a, b) => a - b), mMed = margens.length ? margens[margens.length >> 1] : null;
  const ev = c => ({ categoria: c.categoria, share: c.share, variacao: c.variacao, relativa: c.relativaAoTotal, variacaoTotal: mom.variacaoTotal, deltaShare: c.deltaShare, recentesCentavos: c.recentesCentavos, margem: mk[c.categoria] == null ? null : mk[c.categoria] });
  const defender = C.filter(c => c.share >= 0.04 && c.relativaAoTotal != null && c.relativaAoTotal <= -0.08).map(ev).sort((a, b) => a.relativa - b.relativa);
  const acelerar = C.filter(c => c.share >= 0.01 && c.relativaAoTotal != null && c.relativaAoTotal >= 0.10).map(ev).sort((a, b) => b.relativa - a.relativa);
  const reanimar = C.filter(c => c.share < 0.04 && c.relativaAoTotal != null && c.relativaAoTotal <= -0.15).map(ev).sort((a, b) => a.relativa - b.relativa);
  const jaTratadas = new Set([...defender, ...reanimar].map(x => x.categoria));
  const ativar = mMed == null ? [] : C.filter(c => mk[c.categoria] != null && mk[c.categoria] >= mMed + 0.05 && c.share < 0.04 && c.share >= 0.003 && !jaTratadas.has(c.categoria)).map(ev).sort((a, b) => b.margem - a.margem);
  return { defender, acelerar, reanimar, ativar, confianca: mom.confianca, nota: `Base: ${mom.semanasRecentes.length} semana(s) recente(s) contra ${mom.semanasAnteriores.length} anterior(es) (confiança ${mom.confianca}).` };
}


function analisarProfundo({ rows, ajustes = [], custos = null, categoria = null, diasCobertos = null, minPar = 15, minProd = 30, leve = false }) {
  if (!rows.length) return null;
  categoria = categoria || categoriaPadrao();
  /* ---- 1. cupons ---- */
  const cup = new Map();
  const novo = (r) => ({ d: r.data, h: r.hora, hh: +r.hora.slice(0, 2), lanc: r.lanc, v: 0, vp: 0, itens: 0, linhas: 0, prods: new Map(), oper: new Set(), usu: new Set(), cx: new Set(), cli: new Set(), emp: new Set(), taxa: 0, aj: 0 });
  rows.forEach(r => {
    const k = r.data + '|' + r.lanc; let c = cup.get(k); if (!c) { c = novo(r); cup.set(k, c); } if (r.hora < c.h) { c.h = r.hora; c.hh = +r.hora.slice(0, 2); }
    const v = cents(r.valor), nao = I.isNaoProduto(r); c.v += v; c.linhas++; c.oper.add(r.oper); c.usu.add(r.usu); c.cx.add(r.cx || ''); if (!ZERO_EMP.test(r.cli)) c.cli.add(r.cli); if (!ZERO_EMP.test(r.emp)) c.emp.add(r.emp);
    if (I.isTaxa(r)) c.taxa += v;
    else if (!nao) { c.vp += v; c.itens += r.qtd; const p = c.prods.get(r.barras) || { desc: r.desc, qtd: 0, v: 0, preco: r.preco }; p.qtd += r.qtd; p.v += v; c.prods.set(r.barras, p); }
  });
  ajustes.forEach(a => { const c = cup.get(a.data + '|' + a.lanc); if (c) { c.v += cents(a.valor); c.aj += cents(a.valor); } });
  const L = [...cup.values()], N = L.length, V = soma(L, c => c.v), VP = soma(L, c => c.vp);
  const dias = new Set(L.map(c => c.d)), nDias = dias.size;
  const vs = L.map(c => c.v).sort((a, b) => a - b), its = L.map(c => c.itens).sort((a, b) => a - b);

  const geral = { cupons: N, vendasCentavos: V, produtosCentavos: VP, itens: soma(L, c => c.itens), diasComVenda: nDias, ticketMedioCentavos: Math.round(V / N), ticketMedianaCentavos: pctil(vs, 0.5), ticketP90Centavos: pctil(vs, 0.9), itensPorCupom: soma(L, c => c.itens) / N, cuponsPorDia: N / nDias, vendasPorDiaCentavos: Math.round(V / nDias), ate: { inicio: L.map(c => c.d).sort()[0], fim: L.map(c => c.d).sort().pop() } };

  /* ---- 2. horário e dia da semana ---- */
  const hora = Array.from({ length: 24 }, (_, h) => ({ hora: h, vendasCentavos: 0, cupons: 0, itens: 0 }));
  const mapa = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ v: 0, n: 0 })));
  const dowAgg = Array.from({ length: 7 }, () => ({ v: 0, n: 0, dias: new Set() }));
  L.forEach(c => { const h = hora[c.hh]; h.vendasCentavos += c.v; h.cupons++; h.itens += c.itens; const w = dowDe(c.d); mapa[w][c.hh].v += c.v; mapa[w][c.hh].n++; dowAgg[w].v += c.v; dowAgg[w].n++; dowAgg[w].dias.add(c.d); });
  const horas = hora.filter(h => h.cupons).map(h => Object.assign(h, { ticketCentavos: Math.round(h.vendasCentavos / h.cupons), parte: h.vendasCentavos / V }));
  const diaSemana = dowAgg.map((x, i) => ({ dia: NOMES[i], dias: x.dias.size, vendasCentavos: x.v, cupons: x.n, mediaPorDiaCentavos: x.dias.size ? Math.round(x.v / x.dias.size) : null, ticketCentavos: x.n ? Math.round(x.v / x.n) : null, parte: x.v / V }));
  const hMin = horas.length ? horas[0].hora : 0, hMax = horas.length ? horas[horas.length - 1].hora : 0;
  /* melhor janela de 3 horas seguidas e pior (entre as horas com movimento) */
  const jan = (n) => { let best = null, worst = null; for (let h = hMin; h + n - 1 <= hMax; h++) { const s = soma(hora.slice(h, h + n), x => x.vendasCentavos); const o = { de: h, ate: h + n, vendasCentavos: s, parte: s / V }; if (!best || s > best.vendasCentavos) best = o; if (!worst || s < worst.vendasCentavos) worst = o; } return { melhor: best, pior: worst }; };
  const periodo = { manha: soma(hora.slice(0, 12), x => x.vendasCentavos), tarde: soma(hora.slice(12, 18), x => x.vendasCentavos), noite: soma(hora.slice(18), x => x.vendasCentavos) };
  const mapaCalor = { horas: Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i), linhas: NOMES.map((n, w) => ({ dia: n, vendasCentavos: Array.from({ length: hMax - hMin + 1 }, (_, i) => mapa[w][hMin + i].v), cupons: Array.from({ length: hMax - hMin + 1 }, (_, i) => mapa[w][hMin + i].n) })) };

  /* ---- 3. faixas de valor, itens por cupom, dia do mês ---- */
  const faixasV = [[0, 2000, 'até R$ 20'], [2000, 5000, 'R$ 20 a 50'], [5000, 10000, 'R$ 50 a 100'], [10000, 20000, 'R$ 100 a 200'], [20000, Infinity, 'acima de R$ 200']].map(([a, b, nome]) => { const l = L.filter(c => c.v >= a && c.v < b); return { faixa: nome, cupons: l.length, parteCupons: l.length / N, vendasCentavos: soma(l, c => c.v), parteVendas: soma(l, c => c.v) / V }; });
  const faixasI = [[1, 1, '1 item'], [2, 2, '2 itens'], [3, 3, '3 itens'], [4, 5, '4 a 5 itens'], [6, Infinity, '6 ou mais']].map(([a, b, nome]) => { const l = L.filter(c => c.itens >= a && c.itens <= b); return { faixa: nome, cupons: l.length, parteCupons: l.length / N, ticketCentavos: l.length ? Math.round(soma(l, c => c.v) / l.length) : null }; });
  const doMes = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 31]].map(([a, b]) => { const l = L.filter(c => { const d = +c.d.slice(8); return d >= a && d <= b; }), ds = new Set(l.map(c => c.d)); return { dias: `${a} a ${b}`, nDias: ds.size, vendasCentavos: soma(l, c => c.v), mediaPorDiaCentavos: ds.size ? Math.round(soma(l, c => c.v) / ds.size) : null }; });

  /* ---- 4. pagamento, clientes, convênio, entrega ---- */
  const pg = {}; L.forEach(c => { const k = c.oper.size === 1 ? [...c.oper][0] : 'MISTO'; const x = pg[k] || (pg[k] = { forma: k, cupons: 0, vendasCentavos: 0 }); x.cupons++; x.vendasCentavos += c.v; });
  const pagamento = Object.values(pg).map(x => Object.assign(x, { ticketCentavos: Math.round(x.vendasCentavos / x.cupons), parteVendas: x.vendasCentavos / V })).sort((a, b) => b.vendasCentavos - a.vendasCentavos);
  const ident = L.filter(c => c.cli.size), porCli = new Map();
  ident.forEach(c => { const id = [...c.cli][0]; const x = porCli.get(id) || { id, cupons: 0, v: 0, dias: new Set() }; x.cupons++; x.v += c.v; x.dias.add(c.d); porCli.set(id, x); });
  const cl = [...porCli.values()], recorrentes = cl.filter(x => x.dias.size >= 2);
  const clientes = { cuponsIdentificados: ident.length, parteCupons: ident.length / N, vendasIdentificadasCentavos: soma(ident, c => c.v), parteVendas: soma(ident, c => c.v) / V, clientesDistintos: cl.length, recorrentes: recorrentes.length, parteRecorrentes: cl.length ? recorrentes.length / cl.length : null,
    ticketIdentificadoCentavos: ident.length ? Math.round(soma(ident, c => c.v) / ident.length) : null, ticketBalcaoCentavos: N - ident.length ? Math.round(soma(L.filter(c => !c.cli.size), c => c.v) / (N - ident.length)) : null, visitasPorCliente: cl.length ? ident.length / cl.length : null, top: cl.sort((a, b) => b.v - a.v).slice(0, 10).map(x => ({ id: x.id, vendasCentavos: x.v, cupons: x.cupons, dias: x.dias.size })) };
  const conv = L.filter(c => c.emp.size); const convenio = { cupons: conv.length, parteCupons: conv.length / N, vendasCentavos: soma(conv, c => c.v), parteVendas: soma(conv, c => c.v) / V, ticketCentavos: conv.length ? Math.round(soma(conv, c => c.v) / conv.length) : null };
  const ent = L.filter(c => c.taxa > 0), balc = L.filter(c => !(c.taxa > 0));
  const entregas = { cupons: ent.length, parteCupons: ent.length / N, vendasCentavos: soma(ent, c => c.v), taxaCentavos: soma(ent, c => c.taxa), ticketEntregaCentavos: ent.length ? Math.round(soma(ent, c => c.v) / ent.length) : null, ticketBalcaoCentavos: balc.length ? Math.round(soma(balc, c => c.v) / balc.length) : null, porHora: Array.from({ length: 24 }, (_, h) => ({ hora: h, cupons: ent.filter(c => c.hh === h).length })).filter(x => x.cupons) };

  /* ---- 5. caixas e operadores ---- */
  const agr = (campo) => { const m = new Map(); L.forEach(c => c[campo].forEach(id => { const x = m.get(id) || { id, cupons: 0, v: 0, itens: 0, horas: new Set(), dias: new Set() }; x.cupons++; x.v += c.v; x.itens += c.itens; x.horas.add(c.d + 'T' + c.hh); x.dias.add(c.d); m.set(id, x); })); return [...m.values()].map(x => ({ id: x.id, cupons: x.cupons, vendasCentavos: x.v, parteVendas: x.v / V, ticketCentavos: Math.round(x.v / x.cupons), itensPorCupom: x.itens / x.cupons, dias: x.dias.size, vendasPorHoraAtivaCentavos: Math.round(x.v / x.horas.size) })).sort((a, b) => b.vendasCentavos - a.vendasCentavos); };
  const operadores = agr('usu'), caixas = agr('cx');

  /* ---- 6. produtos e categorias ---- */
  const pr = new Map(); L.forEach(c => c.prods.forEach((p, b) => { const x = pr.get(b) || { barras: b, desc: p.desc, qtd: 0, v: 0, cupons: 0, min: p.preco, max: p.preco, horas: Array(24).fill(0) }; x.qtd += p.qtd; x.v += p.v; x.cupons++; if (p.preco < x.min) x.min = p.preco; if (p.preco > x.max) x.max = p.preco; x.horas[c.hh] += p.v; pr.set(b, x); }));
  const prods = [...pr.values()], PROD = soma(prods, x => x.v);
  const topValor = prods.slice().sort((a, b) => b.v - a.v).slice(0, 30).map(x => ({ barras: x.barras, desc: x.desc, qtd: x.qtd, vendasCentavos: x.v, cupons: x.cupons, penetracao: x.cupons / N }));
  const topQtd = prods.slice().sort((a, b) => b.qtd - a.qtd).slice(0, 30).map(x => ({ barras: x.barras, desc: x.desc, qtd: x.qtd, vendasCentavos: x.v, cupons: x.cupons }));
  const variacaoPreco = prods.filter(x => x.cupons >= 10 && x.max > x.min * 1.05).sort((a, b) => (b.max / b.min) - (a.max / a.min)).slice(0, 15).map(x => ({ barras: x.barras, desc: x.desc, precoMin: cents(x.min), precoMax: cents(x.max), cupons: x.cupons }));
  const unicos = prods.filter(x => x.cupons === 1).length;
  const cat = {}; if (categoria) prods.forEach(x => { const k = categoria(x.desc) || 'Outros'; const c2 = cat[k] || (cat[k] = { categoria: k, vendasCentavos: 0, qtd: 0, produtos: 0, horas: Array(24).fill(0) }); c2.vendasCentavos += x.v; c2.qtd += x.qtd; c2.produtos++; x.horas.forEach((v, h) => { c2.horas[h] += v; }); });
  const categorias = Object.values(cat).map(x => { const pk = x.horas.indexOf(Math.max(...x.horas)); return { categoria: x.categoria, vendasCentavos: x.vendasCentavos, parte: x.vendasCentavos / PROD, qtd: x.qtd, produtos: x.produtos, horaDePico: pk }; }).sort((a, b) => b.vendasCentavos - a.vendasCentavos);
  const horasTop = hora.filter(h => h.cupons).map(h => ({ hora: h.hora, top: prods.filter(x => x.horas[h.hora] > 0).sort((a, b) => b.horas[h.hora] - a.horas[h.hora]).slice(0, 3).map(x => ({ desc: x.desc, vendasCentavos: x.horas[h.hora] })) }));

  /* ---- 7. o que se compra junto (pares) e puxadores de ticket ---- */
  const nProd = new Map(), par = new Map(); const multi = [];
  L.forEach(c => { const ks = [...c.prods.keys()]; ks.forEach(k => nProd.set(k, (nProd.get(k) || 0) + 1)); if (ks.length >= 2 && ks.length <= 14) { multi.push(ks); ks.sort(); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const kk = ks[i] + '|' + ks[j]; par.set(kk, (par.get(kk) || 0) + 1); } } });
  const pares = []; par.forEach((n, kk) => { if (n < minPar) return; const [a, b] = kk.split('|'), na = nProd.get(a), nb = nProd.get(b); if (na < minProd || nb < minProd) return; const lift = (n / N) / ((na / N) * (nb / N)); pares.push({ a, b, descA: pr.get(a).desc, descB: pr.get(b).desc, juntos: n, nA: na, nB: nb, suporte: n / N, confiancaAB: n / na, confiancaBA: n / nb, lift }); });
  pares.sort((x, y) => y.lift - x.lift || y.juntos - x.juntos);
  const maisJuntos = pares.slice().sort((x, y) => y.juntos - x.juntos).slice(0, 20);
  const puxadores = prods.filter(x => x.cupons >= 40).map(x => { const l = L.filter(c => c.prods.has(x.barras)); const m = soma(l, c => c.v) / l.length; return { barras: x.barras, desc: x.desc, cupons: x.cupons, ticketComProdutoCentavos: Math.round(m), ganhoSobreOGeral: m / (V / N) }; }).sort((a, b) => b.ganhoSobreOGeral - a.ganhoSobreOGeral).slice(0, 15);

  /* ---- 8. margem estimada (custo atual do estoque x preço vendido; é estimativa, o custo de ontem pode ser outro) ---- */
  let margem = null;
  if (custos && custos.size) {
    let vCom = 0, lucro = 0, abaixo = [], porHora = Array(24).fill(0), porHoraV = Array(24).fill(0); const cm = new Map();
    rows.forEach(r => { if (I.isNaoProduto(r)) return; const c = custos.get(r.barras); if (!c) return; const v = cents(r.valor), l = v - Math.round(c * 100 * r.qtd); vCom += v; lucro += l; const h = +r.hora.slice(0, 2); porHora[h] += l; porHoraV[h] += v; const x = cm.get(r.barras) || { barras: r.barras, desc: r.desc, v: 0, l: 0, qtd: 0 }; x.v += v; x.l += l; x.qtd += r.qtd; cm.set(r.barras, x); });
    const lst = [...cm.values()]; lst.forEach(x => { if (x.l < 0) abaixo.push(x); });
    const mc = {}; if (categoria) rows.forEach(r => { if (I.isNaoProduto(r)) return; const c = custos.get(r.barras); if (!c) return; const k = categoria(r.desc) || 'Outros', v = cents(r.valor), x = mc[k] || (mc[k] = { categoria: k, v: 0, l: 0 }); x.v += v; x.l += v - Math.round(c * 100 * r.qtd); });
    margem = { margemPorCategoria: Object.values(mc).map(x => ({ categoria: x.categoria, vendasCentavos: x.v, lucroCentavos: x.l, margem: x.v ? x.l / x.v : null })).sort((a, b) => b.vendasCentavos - a.vendasCentavos), cobertura: vCom / VP, vendasComCustoCentavos: vCom, lucroEstimadoCentavos: lucro, margem: vCom ? lucro / vCom : null,
      porHora: porHora.map((l, h) => ({ hora: h, lucroCentavos: l, margem: porHoraV[h] ? l / porHoraV[h] : null })).filter(x => porHoraV[x.hora]), maioresLucros: lst.sort((a, b) => b.l - a.l).slice(0, 15).map(x => ({ barras: x.barras, desc: x.desc, lucroCentavos: x.l, margem: x.v ? x.l / x.v : null })),
      vendidosAbaixoDoCusto: abaixo.sort((a, b) => a.l - b.l).slice(0, 15).map(x => ({ barras: x.barras, desc: x.desc, perdaCentavos: -x.l, qtd: x.qtd })), nAbaixoDoCusto: abaixo.length, aviso: 'Margem estimada com o custo ATUAL do estoque; o custo na data da venda pode ter sido outro.' };
  }

  const momento = categoria && !leve ? momentoCategorias(rows, categoria, diasCobertos) : null, foco = momento ? focoMarketing(momento, margem && margem.margemPorCategoria) : null;
  const out = { momentoCategorias: momento, focoMarketing: foco, geral, horas, melhorJanela3h: jan(3).melhor, piorJanela3h: jan(3).pior, periodoDoDia: { manhaCentavos: periodo.manha, tardeCentavos: periodo.tarde, noiteCentavos: periodo.noite }, diaSemana, mapaCalor, faixasValor: faixasV, faixasItens: faixasI, diaDoMes: doMes, pagamento, clientes, convenio, entregas, operadores, caixas,
    produtos: { distintos: prods.length, vendidosUmaVez: unicos, topValor, topQtd, variacaoPreco, porHora: horasTop }, categorias, pares: { analisados: par.size, cuponsComVariosProdutos: multi.length, maiorLift: pares.slice(0, 25), maisFrequentes: maisJuntos }, puxadoresDeTicket: puxadores, margem };
  if (leve) return out;
  out.oportunidades = oportunidades(out);
  out.semanasDetalhe = detalheSemanas(rows, ajustes, categoria, diasCobertos, custos);
  return out;
}

/* A análise de CADA semana: o mesmo olhar do período inteiro, mas só com os cupons daquela semana (segunda a domingo), comparado com a semana anterior */
function detalheSemanas(rows, ajustes, categoria, diasCobertos, custos) {
  const cob = diasCobertos ? new Set(diasCobertos) : new Set(rows.map(r => r.data)), por = new Map(), ajp = new Map();
  rows.forEach(r => { const m = segunda(r.data); (por.get(m) || por.set(m, []).get(m)).push(r); });
  (ajustes || []).forEach(a => { const m = segunda(a.data); (ajp.get(m) || ajp.set(m, []).get(m)).push(a); });
  const ms = [...por.keys()].sort(), out = []; let ant = null;
  ms.forEach(m => {
    const a = analisarProfundo({ rows: por.get(m), ajustes: ajp.get(m) || [], custos, categoria, minPar: 5, minProd: 5, leve: true }); if (!a) return;
    const dias7 = cat7(m), g = a.geral, c100 = a.faixasValor.filter(f => /100 a 200|acima de R\$ 200/.test(f.faixa));
    const cats = {}; (a.categorias || []).forEach(c => { cats[c.categoria] = c.vendasCentavos; }); const totC = Object.values(cats).reduce((x, y) => x + y, 0) || 1;
    const w = { inicio: m, fim: mais(m, 6), completa: dias7.every(d => cob.has(d)), diasCobertos: dias7.filter(d => cob.has(d)).length, vendasCentavos: g.vendasCentavos, cupons: g.cupons, ticketCentavos: g.ticketMedioCentavos, itensPorCupom: g.itensPorCupom,
      c100n: c100.reduce((x, f) => x + f.cupons, 0), c100Centavos: c100.reduce((x, f) => x + f.vendasCentavos, 0), melhorJanela3h: a.melhorJanela3h, piorJanela3h: a.piorJanela3h,
      topHoras: a.horas.slice().sort((x, y) => y.vendasCentavos - x.vendasCentavos).slice(0, 3).map(h => ({ hora: h.hora, vendasCentavos: h.vendasCentavos, parte: h.parte })),
      porDia: a.diaSemana.map(d => ({ dia: d.dia, vendasCentavos: d.vendasCentavos, cupons: d.cupons })),
      categorias: (a.categorias || []).slice(0, 8).map(c => ({ categoria: c.categoria, vendasCentavos: c.vendasCentavos, parte: c.vendasCentavos / totC })), topProdutos: a.produtos.topValor.slice(0, 6).map(p => ({ desc: p.desc, qtd: p.qtd, vendasCentavos: p.vendasCentavos })),
      pagamento: a.pagamento.map(p => ({ forma: p.forma, parteVendas: p.parteVendas })), clientesParte: a.clientes.parteCupons, entregaParte: a.entregas.parteCupons, margem: a.margem ? a.margem.margem : null,
      unitarios: (a.faixasItens[0] || {}).parteCupons };
    if (ant && ant.completa && w.completa && J_mais(ant.inicio, 7) === w.inicio) {
      const v = (x, y) => (y > 0 ? x / y - 1 : null);
      w.vsAnterior = { vendas: v(w.vendasCentavos, ant.vendasCentavos), cupons: v(w.cupons, ant.cupons), ticket: v(w.ticketCentavos, ant.ticketCentavos), itens: v(w.itensPorCupom, ant.itensPorCupom) };
      const ct = Object.keys({ ...ant._cats, ...cats }).map(k => ({ categoria: k, deltaPontos: (cats[k] || 0) / totC - (ant._cats[k] || 0) / ant._tot, vendasCentavos: cats[k] || 0, anteriorCentavos: ant._cats[k] || 0 })).filter(x => Math.abs(x.deltaPontos) >= 0.004);
      w.categoriasQueMexeram = ct.sort((x, y) => Math.abs(y.deltaPontos) - Math.abs(x.deltaPontos)).slice(0, 6);
    }
    out.push(Object.assign({}, w)); ant = Object.assign({}, w, { _cats: cats, _tot: totC });
  });
  return out;
}
const J_mais = (d, n) => mais(d, n);

/* regras simples que transformam os números em "o que dá para fazer", sempre com a evidência (são hipóteses a testar, não promessas) */
function oportunidades(a) {
  const o = [], R = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), P = x => (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', H = h => String(h).padStart(2, '0') + 'h';
  const add = (area, titulo, evidencia, acao) => o.push({ area, titulo, evidencia, acao });
  const g = a.geral;
  if (a.melhorJanela3h) add('Equipe e caixas', `Das ${H(a.melhorJanela3h.de)} às ${H(a.melhorJanela3h.ate)} entra ${P(a.melhorJanela3h.parte)} das vendas`, `Melhor janela de 3 horas seguidas: ${R(a.melhorJanela3h.vendasCentavos)} no período analisado.`, 'Reforçar caixas e atendimento nesse horário e evitar tarefas internas nele.');
  if (a.piorJanela3h) add('Promoção de horário', `Das ${H(a.piorJanela3h.de)} às ${H(a.piorJanela3h.ate)} é o vale: só ${P(a.piorJanela3h.parte)} das vendas`, `Pior janela de 3 horas com movimento: ${R(a.piorJanela3h.vendasCentavos)}.`, 'Testar promoção relâmpago, entrega grátis ou disparo de WhatsApp nesse horário e comparar com semanas sem ação.');
  const dsw = a.diaSemana.filter(d => d.mediaPorDiaCentavos), fraco = dsw.slice().sort((x, y) => x.mediaPorDiaCentavos - y.mediaPorDiaCentavos)[0], forte = dsw.slice().sort((x, y) => y.mediaPorDiaCentavos - x.mediaPorDiaCentavos)[0];
  if (fraco && forte && forte.mediaPorDiaCentavos > fraco.mediaPorDiaCentavos * 1.25) add('Calendário de campanhas', `${fraco.dia} é o dia mais fraco (${R(fraco.mediaPorDiaCentavos)} por dia) e ${forte.dia} o mais forte (${R(forte.mediaPorDiaCentavos)})`, `Diferença de ${P(forte.mediaPorDiaCentavos / fraco.mediaPorDiaCentavos - 1)} entre os dois.`, `Concentrar ofertas de atração em ${fraco.dia} e manter margem em ${forte.dia}.`);
  const f1 = a.faixasItens[0]; if (f1 && f1.parteCupons > 0.45) add('Venda adicional no caixa', `${P(f1.parteCupons)} dos cupons têm um item só`, `Ticket desses cupons: ${R(f1.ticketCentavos)}; média geral ${R(g.ticketMedioCentavos)}.`, 'Exposição de itens de impulso no caixa e oferta "leve 2" nos produtos mais vendidos sozinhos.');
  const top = a.pares.maiorLift[0]; if (top) add('Combos', `${top.descA} + ${top.descB} aparecem juntos ${top.lift.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vezes mais do que o acaso`, `${top.juntos} cupons com os dois; quem leva um leva o outro em ${P(Math.max(top.confiancaAB, top.confiancaBA))} dos casos.`, 'Montar combo ou posicionar os dois lado a lado; lista completa em pares.');
  const cli = a.clientes; if (cli.parteCupons < 0.35) add('Fidelização', `Só ${P(cli.parteCupons)} dos cupons têm cliente identificado`, `Identificados gastam ${cli.ticketIdentificadoCentavos ? R(cli.ticketIdentificadoCentavos) : '—'} por cupom contra ${cli.ticketBalcaoCentavos ? R(cli.ticketBalcaoCentavos) : '—'} no balcão.`, 'Pedir CPF/telefone no caixa em troca de benefício e medir o retorno em 30 dias.');
  else if (cli.parteRecorrentes != null) add('Fidelização', `${P(cli.parteRecorrentes)} dos clientes identificados voltaram em outro dia`, `${cli.clientesDistintos} clientes, ${cli.visitasPorCliente.toFixed(1)} cupons por cliente.`, 'Campanha de retorno para quem comprou uma vez e sumiu.');
  const ent = a.entregas; if (ent.cupons) add('Entrega', `${P(ent.parteCupons)} dos cupons têm taxa de entrega`, `Ticket com entrega ${R(ent.ticketEntregaCentavos)} contra ${R(ent.ticketBalcaoCentavos)} no balcão; taxa cobrada ${R(ent.taxaCentavos)}.`, ent.ticketEntregaCentavos > ent.ticketBalcaoCentavos * 1.2 ? 'A entrega traz cupom maior: divulgar e testar frete grátis acima de um valor.' : 'Conferir se a taxa cobre o custo da entrega.');
  const ap = a.pagamento.find(x => /PRAZO/.test(x.forma)); if (ap && ap.parteVendas > 0.08) add('Crédito próprio', `Vendas A PRAZO são ${P(ap.parteVendas)} do faturamento`, `${ap.cupons} cupons, ticket ${R(ap.ticketCentavos)}.`, 'Acompanhar inadimplência e prazo médio; a margem desse grupo precisa cobrir o custo do dinheiro.');
  const op = a.operadores.filter(x => x.cupons >= 100); if (op.length >= 3) { const med = g.ticketMedioCentavos, baixo = op.filter(x => x.ticketCentavos < med * 0.85); if (baixo.length) add('Treinamento de venda', `${baixo.length} operador(es) com ticket médio 15% abaixo da média (${R(med)})`, baixo.map(x => `operador ${x.id}: ${R(x.ticketCentavos)} em ${x.cupons} cupons`).join('; '), 'Comparar com o horário em que trabalham antes de concluir (horário fraco também baixa o ticket); usar como conversa, não como punição.'); }
  if (a.margem && a.margem.nAbaixoDoCusto) add('Preço e margem', `${a.margem.nAbaixoDoCusto} produto(s) vendidos abaixo do custo atual`, a.margem.vendidosAbaixoDoCusto.slice(0, 3).map(x => `${x.desc}: perda de ${R(x.perdaCentavos)}`).join('; '), 'Revisar o preço ou o custo cadastrado (custo desatualizado também aparece assim).');
  const F = a.focoMarketing; if (F) {
    F.defender.slice(0, 2).forEach(c => add('Foco de marketing: defender', `${c.categoria} pesa ${P(c.share)} das vendas e caiu ${P(Math.abs(c.relativa))} MAIS que a loja`, `A loja variou ${P(c.variacaoTotal)} e a categoria ${P(c.variacao)}; ${R(c.recentesCentavos)} nas últimas semanas completas; participação variou ${(c.deltaShare * 100).toFixed(1)} pontos.`, 'Campanha de recompra e destaque no feed e no WhatsApp; conferir ruptura e preço antes de investir em mídia.'));
    F.acelerar.slice(0, 2).forEach(c => add('Foco de marketing: acelerar', `${c.categoria} cresceu ${P(c.relativa)} MAIS que a loja (${P(c.share)} das vendas)`, `A loja variou ${P(c.variacaoTotal)} e a categoria ${P(c.variacao)}; ${R(c.recentesCentavos)} nas últimas semanas completas.`, 'Colocar verba e conteúdo onde já há tração: Reels e carrossel da categoria, oferta de combo.'));
    F.reanimar.slice(0, 2).forEach(c => add('Foco de marketing: reanimar', `${c.categoria} caiu ${P(Math.abs(c.relativa))} MAIS que a loja e pesa só ${P(c.share)}`, `A loja variou ${P(c.variacaoTotal)} e a categoria ${P(c.variacao)}; ${R(c.recentesCentavos)} nas últimas semanas completas.`, 'Teste de promoção de reativação por 2 semanas e leitura do resultado; se não reagir, rever sortimento.'));
    F.ativar.slice(0, 2).forEach(c => add('Foco de marketing: ativar', `${c.categoria} tem margem alta (${P(c.margem)}) e pouco peso (${P(c.share)})`, `Margem acima da mediana das categorias.`, 'Dar mais vitrine, conteúdo e combo: cada real vendido aqui rende mais.'));
  }
  if (a.produtos.vendidosUmaVez > a.produtos.distintos * 0.25) add('Cauda longa', `${P(a.produtos.vendidosUmaVez / a.produtos.distintos)} dos produtos venderam só uma vez no período`, `${a.produtos.vendidosUmaVez} de ${a.produtos.distintos}.`, 'Rever sortimento e capital parado nessa cauda (cruzar com o estoque em Promoções).');
  return o;
}

const cuponsCsv = (L) => L;
function listaCupons(rows, ajustes = []) {
  const cup = new Map();
  rows.forEach(r => { const k = r.data + '|' + r.lanc; let c = cup.get(k); if (!c) { c = { data: r.data, hora: r.hora, lanc: r.lanc, linhas: 0, itens: 0, valor: 0, taxa: 0, pagamento: r.oper, operador: r.usu, caixa: r.cx, cliente: ZERO_EMP.test(r.cli) ? '' : r.cli, convenio: ZERO_EMP.test(r.emp) ? '' : r.emp }; cup.set(k, c); } if (r.hora < c.hora) c.hora = r.hora; c.linhas++; const v = cents(r.valor); c.valor += v; if (I.isTaxa(r)) c.taxa += v; else if (!I.isNaoProduto(r)) c.itens += r.qtd; });
  ajustes.forEach(a => { const c = cup.get(a.data + '|' + a.lanc); if (c) c.valor += cents(a.valor); });
  return [...cup.values()].sort((a, b) => (a.data + a.hora + a.lanc).localeCompare(b.data + b.hora + b.lanc));
}

module.exports = { categoriaFina, analisarProfundo, oportunidades, listaCupons, momentoCategorias, focoMarketing, NOMES };
