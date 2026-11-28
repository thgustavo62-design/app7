/* Inteligência de vendas da SEMANA: o que vendeu, o que subiu, o que caiu e onde focar, só a partir das linhas de venda já conferidas ao centavo.
   Olha PRODUTO e CATEGORIA (nunca cliente: o código do cliente nem é lido). Tudo em centavos inteiros.
   A semana de referência é a última semana completa (segunda a domingo); ela é comparada com a semana anterior e com a média das até 4 semanas antes dela.
   "Relativo à loja": se a loja inteira subiu ou caiu, o esperado de cada item sobe ou cai junto; o que importa é o que fugiu do ritmo da loja.
   "R$ em jogo" é sempre uma diferença MEDIDA contra o esperado (nada de previsão inventada).
   Cada agente abaixo é uma função pura sobre as mesmas linhas, para rodar em paralelo (worker_threads) ou junto. */
require('../../public/assets/js/promo-ingest.js');
const I = globalThis.N7PromoIngest;
const { segunda, mais } = require('./janela');
const { categoriaFina } = require('./profunda');

const cents = n => Math.round(n * 100);
const R$ = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = v => (v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v * 100) + '%');
const sem7 = m => Array.from({ length: 7 }, (_, i) => mais(m, i));
const soma = (l, f) => l.reduce((t, x) => t + f(x), 0);
const media = l => (l.length ? soma(l, x => x) / l.length : 0);
const NOME_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const dowDe = iso => (new Date(Date.parse(iso + 'T12:00:00Z')).getUTCDay() + 6) % 7;
const H = h => String(h).padStart(2, '0') + 'h';

/* limites para não tratar ruído como notícia */
const MIN_PROD_BASE = 3000;        /* produto: média das semanas anteriores de ao menos R$ 30 */
const MIN_PROD_NOVO = 5000;        /* produto novo na semana: ao menos R$ 50 */
const MIN_PROD_PAROU = 15000;      /* produto que parou: vendia ao menos R$ 150 por semana, em TODAS as semanas da base (3 ou mais) */
const MIN_RS = 10000;              /* diferença mínima de R$ 100 para virar foco */
const GENERICAS = new Set(['Outros', 'Medicamentos (demais)']);   /* baldes de "o resto": servem para somar, não para decidir */

/* semanas completas: os 7 dias estão cobertos pelos relatórios (mesmo que o dia tenha sido sem venda) */
function semanasCompletas(dias) {
  const cob = new Set(dias);
  return [...new Set([...cob].map(segunda))].filter(m => sem7(m).every(d => cob.has(d))).sort();
}

/* um passe só pelas linhas: totais por semana, por categoria, por produto, por dia e por hora */
function agregar(rows, semanas, categoria) {
  const alvo = new Set(semanas), cache = new Map(), porSem = new Map(), porDia = new Map(), cupons = [];
  semanas.forEach(m => porSem.set(m, { v: 0, q: 0, cat: new Map(), prod: new Map(), hora: Array(24).fill(0) }));
  const cup = new Map();
  rows.forEach(r => {
    if (I.isNaoProduto(r)) return;
    const m = segunda(r.data); if (!alvo.has(m)) return;
    const v = cents(r.valor), q = Number(r.qtd) || 0, S = porSem.get(m);
    let c = cache.get(r.barras); if (c === undefined) { c = categoria(r.desc) || 'Outros'; cache.set(r.barras, c); }
    S.v += v; S.q += q; S.cat.set(c, (S.cat.get(c) || 0) + v);
    const p = S.prod.get(r.barras) || { desc: r.desc, cat: c, v: 0, q: 0 }; p.v += v; p.q += q; S.prod.set(r.barras, p);
    porDia.set(r.data, (porDia.get(r.data) || 0) + v);
    const h = parseInt(String(r.hora).slice(0, 2), 10); if (h >= 0 && h < 24) S.hora[h] += v;
    const k = r.data + '|' + r.lanc; let s = cup.get(k); if (!s) { s = new Set(); cup.set(k, s); } s.add(r.barras);
  });
  cup.forEach((s, k) => cupons.push({ m: segunda(k.slice(0, 10)), itens: [...s] }));
  return { porSem, porDia, cupons };
}

/* ---------- agente MOVIMENTO: categorias e produtos contra o esperado da loja ---------- */
function movimento(A, ref, baseW) {
  const R = A.porSem.get(ref), B = baseW.map(m => A.porSem.get(m)), nB = B.length;
  const totBase = media(B.map(s => s.v)), tendencia = totBase > 0 ? R.v / totBase - 1 : 0;
  const lin = (ref_, bases, extra) => {
    const bm = media(bases), esp = Math.round(bm * (1 + tendencia));
    return Object.assign({ semanaCentavos: ref_, baseMediaCentavos: Math.round(bm), esperadoCentavos: esp, difCentavos: ref_ - esp, deltaBaseCentavos: ref_ - Math.round(bm), varBase: bm > 0 ? ref_ / bm - 1 : null, relativaALoja: esp > 0 ? ref_ / esp - 1 : null }, extra);
  };
  const nomesCat = new Set([...R.cat.keys(), ...B.flatMap(s => [...s.cat.keys()])]);
  const categorias = [...nomesCat].map(c => lin(R.cat.get(c) || 0, B.map(s => s.cat.get(c) || 0), { categoria: c, share: R.v > 0 ? (R.cat.get(c) || 0) / R.v : 0 })).sort((a, b) => b.semanaCentavos - a.semanaCentavos);
  const barras = new Set([...R.prod.keys(), ...B.flatMap(s => [...s.prod.keys()])]);
  const produtos = [...barras].map(b => {
    const pr = R.prod.get(b) || B.map(s => s.prod.get(b)).find(Boolean), desc = pr.desc, cat = pr.cat;
    const bv = B.map(s => (s.prod.get(b) || { v: 0 }).v), vendeuEm = bv.filter(x => x > 0).length, q = (R.prod.get(b) || { q: 0 }).q;
    return lin((R.prod.get(b) || { v: 0 }).v, bv, { barras: b, desc, categoria: cat, qtd: q, semanasVendidasNaBase: vendeuEm });
  });
  const firme = p => p.baseMediaCentavos >= MIN_PROD_BASE && p.semanasVendidasNaBase >= Math.min(2, nB);
  const lim = (l, n = 10) => l.slice(0, n);
  const topValor = lim(produtos.slice().sort((a, b) => b.semanaCentavos - a.semanaCentavos).filter(p => p.semanaCentavos > 0));
  const topQtd = lim(produtos.slice().sort((a, b) => b.qtd - a.qtd).filter(p => p.qtd > 0));
  const subiram = lim(produtos.filter(p => firme(p) && p.difCentavos > 0).sort((a, b) => b.difCentavos - a.difCentavos));
  const cairam = lim(produtos.filter(p => firme(p) && p.semanaCentavos > 0 && p.difCentavos < 0).sort((a, b) => a.difCentavos - b.difCentavos));
  const novos = lim(produtos.filter(p => nB >= 1 && p.semanasVendidasNaBase === 0 && p.semanaCentavos >= MIN_PROD_NOVO).sort((a, b) => b.semanaCentavos - a.semanaCentavos), 8);
  const pararam = lim(produtos.filter(p => nB >= 3 && p.semanaCentavos <= 0 && p.baseMediaCentavos >= MIN_PROD_PAROU && p.semanasVendidasNaBase >= nB).sort((a, b) => b.baseMediaCentavos - a.baseMediaCentavos), 8);
  return { tendenciaLoja: tendencia, categorias, topValor, topQtd, subiram, cairam, novos, pararam, totalProdutosVendidos: [...R.prod.values()].filter(p => p.v > 0).length };
}

/* ---------- agente DIAS: cada dia da semana contra o mesmo dia da semana nas semanas anteriores ---------- */
function dias(A, ref, baseW) {
  return sem7(ref).map(d => {
    const dow = dowDe(d), anteriores = baseW.map(m => A.porDia.get(mais(m, dow)) || 0), esp = Math.round(media(anteriores)), v = A.porDia.get(d) || 0;
    return { data: d, dia: NOME_DIA[dow], vendasCentavos: v, esperadoCentavos: esp, var: esp > 0 ? v / esp - 1 : null };
  });
}

/* ---------- agente HORÁRIO: pico e vale (3 horas seguidas) dentro do expediente que a loja de fato teve ---------- */
function horario(A, ref) {
  const h = A.porSem.get(ref).hora, T = soma(h, x => x); if (T <= 0) return null;
  const abertas = h.map((v, i) => (v > T * 0.005 ? i : -1)).filter(i => i >= 0); if (!abertas.length) return null;
  const a = abertas[0], b = abertas[abertas.length - 1]; if (b - a + 1 < 6) return null;
  const jan = []; for (let i = a; i + 2 <= b; i++) jan.push({ de: i, ate: i + 3, vendasCentavos: h[i] + h[i + 1] + h[i + 2] });
  const miolo = jan.filter(j => j.de > a && j.ate <= b);                                   /* abertura e fechamento não são "vale": a loja está começando ou acabando */
  const pico = jan.reduce((x, y) => (y.vendasCentavos > x.vendasCentavos ? y : x)), vale = (miolo.length ? miolo : jan).reduce((x, y) => (y.vendasCentavos < x.vendasCentavos ? y : x));
  const mediaJanela = Math.round((soma(h.slice(a, b + 1), x => x) / (b - a + 1)) * 3), add = j => Object.assign({ parte: j.vendasCentavos / T }, j);
  return { expediente: [a, b + 1], pico: add(pico), vale: add(vale), mediaJanelaCentavos: mediaJanela };
}

/* ---------- agente CESTA: pares que saem juntos no mesmo cupom (semana de referência + até 3 anteriores) ---------- */
function cesta(A, ref, baseW, descPorBarras, catDe) {
  const janela = new Set([...baseW.slice(-3), ref]), cs = A.cupons.filter(c => janela.has(c.m)), N = cs.length;
  if (N < 200) return { pares: [], cupons: N };
  const sup = new Map(); cs.forEach(c => c.itens.forEach(b => sup.set(b, (sup.get(b) || 0) + 1)));
  const topo = new Set([...sup.entries()].filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]).slice(0, 80).map(x => x[0]));
  const par = new Map();
  cs.forEach(c => { const it = c.itens.filter(b => topo.has(b)).sort(); for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) { const k = it[i] + '|' + it[j]; par.set(k, (par.get(k) || 0) + 1); } });
  const primeira = d => String(d || '').trim().split(/[\s\/.,-]+/)[0].toUpperCase();
  const palavras = d => new Set(String(d || '').toUpperCase().split(/[^A-ZÀ-Ú]+/).filter(w => w.length >= 5));
  const parecidos = (x, y) => { const a = palavras(x); for (const w of palavras(y)) if (a.has(w)) return true; return false; };       /* "SABOR ABACAXI" nos dois nomes: é variante, não complemento */
  const complementar = (x, y) => { if (primeira(x) === primeira(y) || parecidos(x, y)) return false; const cx = catDe(x), cy = catDe(y); return GENERICAS.has(cx) || GENERICAS.has(cy) || cx !== cy; };   /* sabores e marcas do mesmo produto, ou da mesma categoria, são substitutos: não formam combo */
  const pares = [...par.entries()].filter(([, n]) => n >= 6).map(([k, n]) => { const [a, b] = k.split('|'); return { descA: descPorBarras.get(a), descB: descPorBarras.get(b), juntos: n, lift: (n * N) / (sup.get(a) * sup.get(b)) }; })
      .filter(p => p.lift >= 4 && complementar(p.descA, p.descB)).sort((x, y) => y.lift - x.lift || y.juntos - x.juntos).slice(0, 5);
  return { pares, cupons: N };
}

/* ---------- MAESTRO: o foco da semana, até 3, ordenados pelo R$ em jogo medido ---------- */
function foco({ mov, hor, ces, ref, nB }) {
  const C = [], ct = mov.categorias.filter(c => !GENERICAS.has(c.categoria));
  const rel = c => (c.esperadoCentavos > 0 ? Math.abs(c.difCentavos) / c.esperadoCentavos : 0);
  const cair = ct.filter(c => c.share >= 0.03 && c.difCentavos <= -MIN_RS && rel(c) >= 0.08).sort((a, b) => a.difCentavos - b.difCentavos)[0];
  if (cair) C.push({ tipo: 'defender', alvo: cair.categoria, titulo: `Defender ${cair.categoria}`, detalhe: `Vendeu ${R$(cair.semanaCentavos)} na semana; o esperado pelo ritmo da loja era ${R$(cair.esperadoCentavos)}.`, rsEmJogoCentavos: -cair.difCentavos,
    evidencia: [`${cair.categoria}: ${pct(cair.relativaALoja)} contra o ritmo da loja (${pct(mov.tendenciaLoja)})`, `Pesa ${Math.round(cair.share * 100)}% das vendas da semana`], acao: 'Conteúdo e oferta nessa categoria; conferir ruptura e preço antes de investir em mídia.' });
  const subir = ct.filter(c => c.share >= 0.01 && c.difCentavos >= MIN_RS && rel(c) >= 0.10).sort((a, b) => b.difCentavos - a.difCentavos)[0];
  if (subir) C.push({ tipo: 'acelerar', alvo: subir.categoria, titulo: `Acelerar ${subir.categoria}`, detalhe: `Vendeu ${R$(subir.semanaCentavos)}, ${R$(subir.difCentavos)} acima do esperado pelo ritmo da loja.`, rsEmJogoCentavos: subir.difCentavos,
    evidencia: [`${subir.categoria}: ${pct(subir.relativaALoja)} contra o ritmo da loja (${pct(mov.tendenciaLoja)})`], acao: 'Dar espaço na semana: destaque no feed e nos stories, produto à vista no balcão, e garantir estoque.' });
  const pc = mov.cairam.find(p => !(cair && p.categoria === cair.categoria));          /* o produto só entra se a queda não for a da categoria que já é foco */
  if (pc && -pc.difCentavos >= MIN_RS) C.push({ tipo: 'produto', alvo: pc.desc, titulo: `Olhar ${pc.desc}`, detalhe: `Caiu ${R$(-pc.difCentavos)} abaixo do esperado (vendeu ${R$(pc.semanaCentavos)}).`, rsEmJogoCentavos: -pc.difCentavos,
    evidencia: [`Média das semanas anteriores: ${R$(pc.baseMediaCentavos)}`, `Categoria: ${pc.categoria}`], acao: 'Ver se faltou estoque, se o preço mudou ou se um concorrente entrou; só depois decidir a ação de marketing.' });
  if (hor && hor.vale && hor.mediaJanelaCentavos - hor.vale.vendasCentavos >= MIN_RS && hor.vale.vendasCentavos < hor.mediaJanelaCentavos * 0.8) {
    const dif = hor.mediaJanelaCentavos - hor.vale.vendasCentavos;
    C.push({ tipo: 'horario', alvo: `${H(hor.vale.de)}-${H(hor.vale.ate)}`, titulo: `Movimentar o vale das ${H(hor.vale.de)} às ${H(hor.vale.ate)}`, detalhe: `Vendeu ${R$(hor.vale.vendasCentavos)} nessa janela; uma janela média do expediente vende ${R$(hor.mediaJanelaCentavos)}.`, rsEmJogoCentavos: dif,
      evidencia: [`Pico: ${H(hor.pico.de)}–${H(hor.pico.ate)}, ${Math.round(hor.pico.parte * 100)}% das vendas`, `Vale: ${H(hor.vale.de)}–${H(hor.vale.ate)}, ${Math.round(hor.vale.parte * 100)}%`], acao: 'Promoção relâmpago, entrega grátis ou aviso no WhatsApp nessa janela, comparando com a semana sem ação.' });
  }
  const par = ces && ces.pares[0];
  if (par) C.push({ tipo: 'combo', alvo: `${par.descA} + ${par.descB}`, titulo: `Combo: ${par.descA} + ${par.descB}`, detalhe: `Saem juntos em ${par.juntos} cupons, ${par.lift.toFixed(0)} vezes mais que o acaso.`, rsEmJogoCentavos: null,
    evidencia: [`${par.juntos} cupons nas últimas semanas`], acao: 'Montar combo ou colocar um ao lado do outro no balcão; testar uma semana e medir.' });
  const mudou = c => (c.tipo === 'defender' || c.tipo === 'acelerar' || c.tipo === 'produto' ? 1 : 0);          /* o que mudou nesta semana vem antes do que é estrutural; dentro de cada grupo, o maior R$ */
  C.sort((a, b) => mudou(b) - mudou(a) || (b.rsEmJogoCentavos == null ? -1 : b.rsEmJogoCentavos) - (a.rsEmJogoCentavos == null ? -1 : a.rsEmJogoCentavos));
  const out = [], vez = {}; C.forEach(c => { if (out.length < 3 && (vez[c.tipo] = (vez[c.tipo] || 0) + 1) <= 1) out.push(c); });
  return out;
}

/* ---------- SEMANA EM ANDAMENTO: os dias já fechados desta semana contra os MESMOS dias (seg, ter...) das semanas completas anteriores ---------- */
function andamentoSemana({ rows, cob, ultimo, base, cat }) {
  const m = segunda(ultimo); let n = 0; while (n < 7 && cob.has(mais(m, n))) n++;                      /* dias seguidos cobertos a partir da segunda */
  if (n < 1 || !base.length) return null;
  const diasDe = ini => Array.from({ length: n }, (_, i) => mais(ini, i)), alvo = new Set(diasDe(m)), bases = base.map(b => new Set(diasDe(b)));
  const soma = set => { const t = { v: 0, cat: new Map(), prod: new Map(), dia: new Map() };
    rows.forEach(r => { if (!set.has(r.data) || I.isNaoProduto(r)) return; const v = cents(r.valor); t.v += v; t.dia.set(r.data, (t.dia.get(r.data) || 0) + v);
      const p = t.prod.get(r.barras) || { desc: r.desc, cat: cat(r.desc) || 'Outros', v: 0 }; p.v += v; t.prod.set(r.barras, p); t.cat.set(p.cat, (t.cat.get(p.cat) || 0) + v); });
    return t; };
  const A = soma(alvo), B = bases.map(soma), esp = Math.round(media(B.map(x => x.v))), tend = esp > 0 ? A.v / esp - 1 : 0;
  const lin = (v, bs, extra) => { const bm = media(bs), e = Math.round(bm * (1 + tend)); return Object.assign({ vendeuCentavos: v, baseMediaCentavos: Math.round(bm), esperadoCentavos: e, difCentavos: v - e, relativaAoRitmo: e > 0 ? v / e - 1 : null }, extra); };
  const minimo = Math.max(1500, Math.round(MIN_PROD_BASE * n / 7));
  const barras = new Set([...A.prod.keys(), ...B.flatMap(x => [...x.prod.keys()])]);
  const produtos = [...barras].map(b => { const pr = A.prod.get(b) || B.map(x => x.prod.get(b)).find(Boolean); return lin((A.prod.get(b) || { v: 0 }).v, B.map(x => (x.prod.get(b) || { v: 0 }).v), { desc: pr.desc, categoria: pr.cat }); })
    .filter(p => p.baseMediaCentavos >= minimo);
  const categorias = [...new Set([...A.cat.keys(), ...B.flatMap(x => [...x.cat.keys()])])].filter(c => !GENERICAS.has(c)).map(c => lin(A.cat.get(c) || 0, B.map(x => x.cat.get(c) || 0), { categoria: c })).filter(c => c.baseMediaCentavos >= minimo * 2);
  const porDia = diasDe(m).map(d => { const dow = dowDe(d), esperado = Math.round(media(base.map((b, k) => B[k].dia.get(mais(b, dow)) || 0))), v = A.dia.get(d) || 0; return { data: d, dia: NOME_DIA[dow], vendasCentavos: v, esperadoCentavos: esperado, var: esperado > 0 ? v / esperado - 1 : null }; });
  return { semana: { inicio: m, dias: n, ate: mais(m, n - 1) }, base: { semanas: base, n: base.length },
    total: { vendasCentavos: A.v, esperadoCentavos: esp, var: esp > 0 ? A.v / esp - 1 : null }, porDia, hoje: porDia[porDia.length - 1],
    acima: produtos.filter(p => p.difCentavos > 0).sort((a, b) => b.difCentavos - a.difCentavos).slice(0, 8), abaixo: produtos.filter(p => p.difCentavos < 0 && p.vendeuCentavos > 0).sort((a, b) => a.difCentavos - b.difCentavos).slice(0, 8),
    categorias: categorias.sort((a, b) => b.difCentavos - a.difCentavos).slice(0, 12),
    nota: `Os ${n} dia(s) fechados desta semana (${mais(m, 0).slice(8, 10)}/${mais(m, 0).slice(5, 7)} a ${mais(m, n - 1).slice(8, 10)}/${mais(m, n - 1).slice(5, 7)}) contra os mesmos dias das ${base.length} semana(s) completas anteriores. Semana ainda aberta: o resultado final pode mudar.` };
}

/* ponto de entrada: rows = linhas de venda conferidas (formato do armazém); retorna null se não há o que comparar */
function analisarSemana({ rows, diasCobertos = null, categoria = null, semana = null }) {
  const cat = categoria || categoriaFina;
  const dl = diasCobertos ? [...diasCobertos] : [...new Set(rows.map(r => r.data))], ms = semanasCompletas(dl);
  if (ms.length < 2) return { ok: false, semanasCompletas: ms.length, nota: 'Precisa de ao menos 2 semanas completas (segunda a domingo) nos relatórios para comparar. Continue alimentando.' };
  const ref = semana && ms.includes(semana) ? semana : ms[ms.length - 1], idx = ms.indexOf(ref);
  if (idx < 1) return { ok: false, semanasCompletas: ms.length, nota: 'A semana pedida é a mais antiga: não há semana anterior para comparar.' };
  const baseW = ms.slice(Math.max(0, idx - 4), idx), A = agregar(rows, [...baseW, ref], cat), R = A.porSem.get(ref);
  const desc = new Map(); A.porSem.forEach(s => s.prod.forEach((p, b) => desc.set(b, p.desc)));
  const mov = movimento(A, ref, baseW), dia = dias(A, ref, baseW), hor = horario(A, ref), ces = cesta(A, ref, baseW, desc, d => cat(d) || 'Outros');
  const ant = A.porSem.get(baseW[baseW.length - 1]).v, baseMed = Math.round(media(baseW.map(m => A.porSem.get(m).v)));
  const semCat = R.v > 0 ? [...R.cat.entries()].filter(([c]) => GENERICAS.has(c)).reduce((t, [, v]) => t + v, 0) / R.v : 0;
  const confianca = baseW.length >= 4 ? 'alta' : baseW.length >= 2 ? 'média' : 'baixa';
  const ultimo = dl.slice().sort().pop(), andamento = !semana && segunda(ultimo) > ref ? andamentoSemana({ rows, cob: new Set(dl), ultimo, base: ms.slice(-4), cat }) : null;      /* semana aberta: só quando há dias depois da última semana completa */
  return {
    ok: true, confianca, andamento, qualidade: { semCategoriaEspecifica: semCat }, semana: { inicio: ref, fim: mais(ref, 6) }, base: { semanas: baseW, n: baseW.length },
    total: { semanaCentavos: R.v, anteriorCentavos: ant, baseMediaCentavos: baseMed, varAnterior: ant > 0 ? R.v / ant - 1 : null, varBase: baseMed > 0 ? R.v / baseMed - 1 : null },
    movimento: { tendenciaLoja: mov.tendenciaLoja, categorias: mov.categorias.slice(0, 25), topValor: mov.topValor, topQtd: mov.topQtd, subiram: mov.subiram, cairam: mov.cairam, novos: mov.novos, pararam: mov.pararam, produtosVendidos: mov.totalProdutosVendidos },
    dias: dia, horario: hor, cesta: ces.pares, foco: foco({ mov, hor, ces, ref, nB: baseW.length }),
    nota: `Semana de ${ref.split('-').reverse().slice(0, 2).join('/')} comparada com ${baseW.length} semana(s) anterior(es) (confiança ${confianca}). Esperado de cada item = média das anteriores ajustada pelo ritmo da loja.`
  };
}

/* ---------- relatório da semana em texto (Markdown): o que a equipe lê na segunda-feira ---------- */
function markdown(nome, i) {
  if (!i || !i.ok) return `# Inteligência de vendas — ${nome}\n\n${(i && i.nota) || 'Sem análise.'}\n`;
  const d = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7), m = i.movimento, t = i.total, L = [];
  const lista = (tit, l, linha, vazio) => { L.push(`## ${tit}`, ''); if (l.length) l.forEach(x => L.push('- ' + linha(x))); else if (vazio) L.push(vazio); L.push(''); };
  L.push(`# Inteligência de vendas — ${nome}`, '', `Semana de ${d(i.semana.inicio)} a ${d(i.semana.fim)} · comparada com ${i.base.n} semana(s) anterior(es) · confiança ${i.confianca}`, '',
    `Vendas da semana **${R$(t.semanaCentavos)}** (${pct(t.varAnterior)} contra a semana anterior; ${pct(t.varBase)} contra a média das anteriores, ${R$(t.baseMediaCentavos)}). Ritmo da loja: ${pct(m.tendenciaLoja)}.`, '');
  if (i.qualidade && i.qualidade.semCategoriaEspecifica > 0.4) L.push(`> ${Math.round(i.qualidade.semCategoriaEspecifica * 100)}% das vendas estão em "Outros" ou "Medicamentos (demais)": o relatório de vendas não traz a categoria. Os focos de categoria usam só o restante.`, '');
  if (i.andamento) { const e = i.andamento; L.push(`## Semana em andamento (${d(e.semana.inicio)} a ${d(e.semana.ate)}, ${e.semana.dias} dia(s) fechado(s))`, '',
    `Vendeu **${R$(e.total.vendasCentavos)}** contra ${R$(e.total.esperadoCentavos)} nos mesmos dias das ${e.base.n} semana(s) anteriores (${pct(e.total.var)}).`, '', ...e.porDia.map(x => `- ${x.dia} ${d(x.data)}: ${R$(x.vendasCentavos)} (${pct(x.var)} contra a média do mesmo dia)`), '',
      'Acima do ritmo:', ...(e.acima.length ? e.acima.slice(0, 6).map(p => `- ${p.desc}: ${R$(p.vendeuCentavos)}, ${R$(p.difCentavos)} acima do esperado`) : ['- nenhum']), '', 'Abaixo do ritmo:', ...(e.abaixo.length ? e.abaixo.slice(0, 6).map(p => `- ${p.desc}: ${R$(p.vendeuCentavos)}, ${R$(-p.difCentavos)} abaixo do esperado`) : ['- nenhum']), '', `_${e.nota}_`, ''); }
  L.push('## Foco da semana', '');
  if (i.foco.length) i.foco.forEach((f, n) => { L.push(`${n + 1}. **${f.titulo}**${f.rsEmJogoCentavos != null ? ` — ${R$(f.rsEmJogoCentavos)} em jogo` : ''}`, `   - ${f.detalhe}`, ...f.evidencia.map(e => `   - ${e}`), `   - Próximo passo: ${f.acao}`); }); else L.push('Nada fugiu do ritmo da loja o bastante para virar foco.');
  L.push('');
  lista('O que mais vendeu', m.topValor, p => `${p.desc}: ${R$(p.semanaCentavos)} (${p.qtd} un.; ${pct(p.relativaALoja)} contra o esperado)`, 'Sem vendas.');
  lista('Subiu', m.subiram, p => `${p.desc}: ${R$(p.semanaCentavos)}, ${R$(p.difCentavos)} acima do esperado`, 'Nenhum produto firme subiu o bastante.');
  lista('Caiu', m.cairam, p => `${p.desc}: ${R$(p.semanaCentavos)}, ${R$(-p.difCentavos)} abaixo do esperado`, 'Nenhum produto firme caiu o bastante.');
  lista('Novos na semana', m.novos, p => `${p.desc}: ${R$(p.semanaCentavos)}`, 'Nenhum produto novo relevante.');
  lista('Pararam de vender', m.pararam, p => `${p.desc}: vendia ${R$(p.baseMediaCentavos)} por semana`, i.base.n >= 3 ? 'Nenhum item firme parou.' : 'Precisa de 3 semanas anteriores para afirmar que um item parou.');
  lista('Categorias', m.categorias.slice(0, 12), k => `${k.categoria}: ${R$(k.semanaCentavos)} (${Math.round(k.share * 100)}% das vendas; ${pct(k.relativaALoja)} contra a loja)`, 'Sem categorias.');
  lista('Dia a dia', i.dias, x => `${x.dia} ${d(x.data)}: ${R$(x.vendasCentavos)} (${pct(x.var)} contra o mesmo dia nas semanas anteriores)`, '');
  L.push('## Horário', '', i.horario ? `Pico ${H(i.horario.pico.de)}–${H(i.horario.pico.ate)} (${Math.round(i.horario.pico.parte * 100)}% das vendas); vale ${H(i.horario.vale.de)}–${H(i.horario.vale.ate)} (${Math.round(i.horario.vale.parte * 100)}%).` : 'Expediente curto demais.', '');
  lista('Compram junto', i.cesta, p => `${p.descA} + ${p.descB} (${p.juntos} cupons)`, 'Nenhum par se repetiu o bastante.');
  L.push(`_${i.nota} "Em jogo", "acima" e "abaixo" são diferenças medidas contra o esperado, não previsões. Nenhum dado de cliente é usado._`, '');
  return L.join('\n');
}

module.exports = { analisarSemana, semanasCompletas, agentes: { movimento, dias, horario, cesta, foco }, agregar, markdown, R$, pct };
