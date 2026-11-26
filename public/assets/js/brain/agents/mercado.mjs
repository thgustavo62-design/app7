/* Agentes de Mercado: leem a análise profunda das vendas, cupom a cupom (ctx.vendas[chave]), feita no computador da agência (PowerShell) a partir
   dos relatórios de vendas já conferidos ao centavo. Cada loja é lida à parte. Categorias (o que sobe e o que cai RELATIVO à loja), Horários
   (pico e vale), Cesta (o que se compra junto), Fidelização (cliente identificado e retorno) e Foco de marketing (a síntese: onde pôr o esforço). */
import { F, clamp } from "../util.mjs";

const money = c => "R$ " + Math.round(c / 100).toLocaleString("pt-BR");
const pct = v => Math.round(v * 100) + "%";
const H = h => String(h).padStart(2, "0") + "h";
const lojas = ctx => ctx.clients.filter(c => ctx.vendas && ctx.vendas[c.key] && ctx.vendas[c.key].geral).map(c => ({ c, s: ctx.vendas[c.key] }));
const dias = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
/* confiança: base curta ou dado velho baixam a nota e viram aviso na evidência */
const conf = (s, ctx) => { let k = ({ alta: 1, "média": .85, baixa: .6 })[(s.momento && s.momento.confianca) || "baixa"] || .6; const velho = s.cobertura && ctx.today && dias(s.cobertura.fim, ctx.today) > 21; if (velho) k *= .75; return k; };
const aviso = (s, ctx) => { const o = []; if (s.momento && s.momento.confianca !== "alta") o.push(`Base de ${s.momento.semanasCompletas} semana(s) completa(s) (confiança ${s.momento.confianca}): continue alimentando relatórios.`); if (s.cobertura && ctx.today && dias(s.cobertura.fim, ctx.today) > 21) o.push(`Últimos dados de ${s.cobertura.fim}: faz mais de 3 semanas.`); return o; };
const link = (c) => ({ route: "promocoes/analise", brand: c.key });

export function categorias(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const fo = s.foco; if (!fo) return []; const k = conf(s, ctx), out = [];
    const ev = x => `${x.categoria}: ${money(x.recentesCentavos)} nas últimas semanas, ${pct(x.share)} das vendas; loja ${pct(x.variacaoTotal)}, categoria ${pct(x.variacao)}`;
    fo.defender.slice(0, 2).forEach(x => out.push(F("categorias", `cat-defender-${c.key}-${x.categoria}`, { marca: c.key, nome: c.name, score: clamp((50 + Math.min(25, Math.abs(x.relativa) * 120) + x.share * 60) * k), tags: ["categoria", "defender"], titulo: `${c.name}: ${x.categoria} perde força (${pct(Math.abs(x.relativa))} pior que a loja)`, detalhe: `Pesa ${pct(x.share)} das vendas e caiu mais do que o resto da loja nas últimas semanas completas.`, evidencia: [ev(x), ...aviso(s, ctx)], acao: "Campanha de recompra e destaque no feed; conferir ruptura e preço antes de investir em mídia.", link: link(c) })));
    fo.reanimar.slice(0, 2).forEach(x => out.push(F("categorias", `cat-reanimar-${c.key}-${x.categoria}`, { marca: c.key, nome: c.name, score: clamp((42 + Math.min(20, Math.abs(x.relativa) * 90)) * k), tags: ["categoria", "reanimar"], titulo: `${c.name}: ${x.categoria} caiu ${pct(Math.abs(x.relativa))} mais que a loja`, detalhe: `Categoria pequena (${pct(x.share)}) em queda forte.`, evidencia: [ev(x), ...aviso(s, ctx)], acao: "Teste de promoção de reativação por 2 semanas e leitura do resultado; se não reagir, rever sortimento.", link: link(c) })));
    fo.acelerar.slice(0, 2).forEach(x => out.push(F("categorias", `cat-acelerar-${c.key}-${x.categoria}`, { marca: c.key, nome: c.name, kind: "ganho", score: clamp((45 + Math.min(25, x.relativa * 100)) * k), tags: ["categoria", "acelerar"], titulo: `${c.name}: ${x.categoria} cresce ${pct(x.relativa)} acima da loja`, detalhe: `Tração real: ${pct(x.share)} das vendas e subindo.`, evidencia: [ev(x), ...aviso(s, ctx)], acao: "Pôr verba e conteúdo onde já há tração: Reels e carrossel da categoria, combo.", link: link(c) })));
    return out;
  });
}

export function horarios(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const mj = s.melhorJanela3h, pj = s.piorJanela3h; if (!mj || !pj || mj.parte < 0.2 || pj.parte > 0.16) return [];
    return [F("horarios", `hor-${c.key}`, { marca: c.key, nome: c.name, score: clamp((44 + (mj.parte - pj.parte) * 80) * conf(s, ctx)), tags: ["horario"], titulo: `${c.name}: vale das ${H(pj.de)} às ${H(pj.ate)}, pico das ${H(mj.de)} às ${H(mj.ate)}`, detalhe: `O pico concentra ${pct(mj.parte)} das vendas; o vale, só ${pct(pj.parte)}.`,
      evidencia: [`Pico ${H(mj.de)}–${H(mj.ate)}: ${money(mj.vendasCentavos)}`, `Vale ${H(pj.de)}–${H(pj.ate)}: ${money(pj.vendasCentavos)}`, ...aviso(s, ctx)], acao: "Reforçar caixas no pico; testar promoção relâmpago, entrega grátis ou WhatsApp no vale e comparar com semanas sem ação.", link: link(c) })];
  });
}

export function cesta(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const p = (s.pares || [])[0], f1 = (s.faixasItens || [])[0], out = [], base = conf(s, ctx);
    if (p && p.juntos >= 15) out.push(F("cesta", `cesta-par-${c.key}`, { marca: c.key, nome: c.name, kind: "ganho", score: clamp((40 + Math.min(20, Math.log2(p.juntos) * 4)) * base), tags: ["cesta"], titulo: `${c.name}: combo natural entre ${p.descA} e ${p.descB}`, detalhe: `Aparecem juntos ${p.lift.toFixed(0)} vezes mais do que o acaso (${p.juntos} cupons).`, evidencia: [`Quem leva um leva o outro em ${pct(Math.max(p.confiancaAB, p.confiancaBA))} dos casos`, ...aviso(s, ctx)], acao: "Montar combo ou pôr os dois lado a lado; ver a lista de pares na análise completa.", link: link(c) }));
    if (f1 && f1.parteCupons > 0.45) out.push(F("cesta", `cesta-unitario-${c.key}`, { marca: c.key, nome: c.name, score: clamp((46 + (f1.parteCupons - 0.45) * 90) * base), tags: ["cesta"], titulo: `${c.name}: ${pct(f1.parteCupons)} dos cupons têm um item só`, detalhe: `Ticket desses cupons: ${money(f1.ticketCentavos)}; média da loja ${money(s.geral.ticketMedioCentavos)}.`, evidencia: aviso(s, ctx), acao: "Itens de impulso no caixa e oferta 'leve 2' nos produtos mais vendidos sozinhos.", link: link(c) }));
    return out;
  });
}

export function fidelizacao(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const cl = s.clientes; if (!cl || cl.parteCupons >= 0.35) return [];
    return [F("fidelizacao", `fid-${c.key}`, { marca: c.key, nome: c.name, score: clamp((48 + (0.35 - cl.parteCupons) * 110) * conf(s, ctx)), tags: ["fidelizacao"], titulo: `${c.name}: só ${pct(cl.parteCupons)} dos cupons têm cliente identificado`, detalhe: `Sem identificação não dá para chamar o cliente de volta.`,
      evidencia: [cl.ticketIdentificadoCentavos ? `Identificados gastam ${money(cl.ticketIdentificadoCentavos)} por cupom contra ${money(cl.ticketBalcaoCentavos || 0)} no balcão` : "", cl.parteRecorrentes != null ? `${pct(cl.parteRecorrentes)} dos identificados voltaram em outro dia` : "", ...aviso(s, ctx)].filter(Boolean), acao: "Pedir CPF ou telefone no caixa em troca de benefício e medir o retorno em 30 dias.", link: link(c) })];
  });
}

/* a síntese: junta categoria, horário e estoque parado numa recomendação só por loja */
export function foco(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const fo = s.foco; if (!fo || !(fo.defender.length || fo.acelerar.length || fo.reanimar.length)) return [];
    const pr = ctx.promo && ctx.promo[c.key] && !ctx.promo[c.key].vazio ? ctx.promo[c.key] : null, linhas = [];
    if (fo.defender[0]) linhas.push(`Defender ${fo.defender[0].categoria} (${pct(fo.defender[0].share)} das vendas, ${pct(Math.abs(fo.defender[0].relativa))} pior que a loja)`);
    if (fo.acelerar[0]) linhas.push(`Acelerar ${fo.acelerar[0].categoria} (${pct(fo.acelerar[0].relativa)} acima da loja)`);
    if (fo.reanimar[0]) linhas.push(`Reanimar ${fo.reanimar[0].categoria} (${pct(Math.abs(fo.reanimar[0].relativa))} pior que a loja)`);
    if (s.piorJanela3h) linhas.push(`Ações de vale das ${H(s.piorJanela3h.de)} às ${H(s.piorJanela3h.ate)}`);
    if (pr && pr.capitalParado > 0) linhas.push(`Queimar ${money(pr.capitalParado * 100)} de estoque parado com campanha focada`);
    const base = Math.max(...[fo.defender[0] && 50 + fo.defender[0].share * 60, fo.reanimar[0] && 44, fo.acelerar[0] && 46].filter(Boolean));
    return [F("foco", `foco-${c.key}`, { marca: c.key, nome: c.name, score: clamp((base + Math.min(12, linhas.length * 3)) * conf(s, ctx)), tags: ["foco"], titulo: `${c.name}: foco de marketing da semana`, detalhe: linhas[0] + (linhas[1] ? "; " + linhas[1] : ""),
      evidencia: [...linhas, fo.nota, ...aviso(s, ctx)].filter(Boolean), acao: "Montar o plano da semana nessa ordem: conteúdo e verba onde há tração, campanha de defesa onde a participação cai e promoção de vale no horário fraco.", link: link(c) })];
  });
}
