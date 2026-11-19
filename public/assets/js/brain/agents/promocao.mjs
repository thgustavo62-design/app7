/* Agentes de Promoções: leem o resumo que a Central de Promoções faz de CADA farmácia (ctx.promo[chave]) e devolvem achados por loja.
   As lojas nunca se misturam: cada achado carrega a chave e o nome da loja, e o custo, o estoque e as campanhas são sempre da própria loja.
   Estoque (dinheiro parado), Ruptura (vende bem e vai faltar), Margem (preço vendido perto do custo), Campanha (a da cadência semanal) e dados de preço. */
import { A, F, clamp, diff, plus, dm } from "../util.mjs";

const money = v => "R$ " + Math.round(v).toLocaleString("pt-BR");
const pct = v => Math.round(v * 100) + "%";
const lojas = ctx => ctx.clients.filter(c => (c.services || []).includes("promocoes") && ctx.promo && ctx.promo[c.key] && !ctx.promo[c.key].vazio).map(c => ({ c, s: ctx.promo[c.key] }));
/* confiança do giro: depende de quantos dias de vendas a loja tem importados */
const conf = s => (s.cobertura.dias >= 90 ? 1 : s.cobertura.dias >= 60 ? .85 : .6);
const confTxt = s => (s.cobertura.dias >= 90 ? "" : `Histórico de vendas de ${s.cobertura.dias} dias (o ideal é 90): confiança menor.`);
const link = (c, lista) => ({ route: "promocoes/candidatos", brand: c.key, lista });

export function estoque(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const preso = (s.capitalParado || 0) + (s.capitalQueima || 0), share = s.capitalCusto ? preso / s.capitalCusto : 0;
    if (!(share >= 0.2 || preso >= 15000)) return [];
    const score = clamp((40 + share * 70 + Math.min(15, preso / 8000)) * conf(s));
    return [F("estoque", `pestoque-${c.key}`, { marca: c.key, nome: c.name, score, tags: ["estoque"], titulo: `${c.name}: ${money(preso)} parados no estoque`,
      detalhe: `${money(s.capitalParado)} em ${s.parados} item(ns) sem nenhuma venda em 90 dias e ${money(s.capitalQueima)} em ${s.queima} item(ns) com 6 meses ou mais de estoque: ${pct(share)} do dinheiro em estoque (a custo).`,
      evidencia: s.topQueima.map(i => `${i.desc}: ${i.estoque} un. (${money(i.capital)})${i.por ? `, preço de queima sugerido R$ ${i.por.toFixed(2).replace(".", ",")}` : ""}`).concat(confTxt(s) ? [confTxt(s)] : []),
      acao: s.nQueima ? `Montar uma campanha de queima com os itens mais caros parados (${s.nQueima} candidatos que respeitam o piso). Piso de 5% na queima; nunca abaixo do custo.` : "Conferir os itens parados: nenhum tem preço de queima acima do piso. Avaliar devolução ou transferência.", link: link(c, "queima") })];
  });
}

export function ruptura(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    if (!s.ruptura) return [];
    const nA = s.topRuptura.filter(i => i.abc === "A").length;
    return [F("ruptura", `pruptura-${c.key}`, { marca: c.key, nome: c.name, score: clamp((52 + Math.min(24, s.ruptura * 2.5) + (nA ? 8 : 0)) * conf(s)), tags: ["ruptura"], titulo: `${c.name}: ${s.ruptura} item(ns) que vendem bem vão faltar`,
      detalhe: `Itens de classe A ou B (os que mais faturam) com estoque para 15 dias ou menos no ritmo de venda dos últimos 60 dias.`,
      evidencia: s.topRuptura.map(i => `${i.desc}: ${i.estoque} un. para ~${i.dias} dia(s) (classe ${i.abc})`).concat(confTxt(s) ? [confTxt(s)] : []),
      acao: "Conferir a reposição desses itens hoje, antes de anunciar qualquer promoção neles.", link: link(c, "ruptura") })];
  });
}

export function margem(ctx) {
  return lojas(ctx).flatMap(({ c, s }) => {
    const m = s.margemBaixa; if (!m || !m.n) return [];
    const zero = m.abaixoCusto > 0;
    if (!zero && m.n < 5) return [];
    return [F("margem", `pmargem-${c.key}`, { marca: c.key, nome: c.name, score: clamp(zero ? 80 : 48 + Math.min(20, m.n / 2)), tags: ["margem"], titulo: zero ? `${c.name}: ${m.abaixoCusto} item(ns) com preço de venda no custo ou abaixo` : `${c.name}: ${m.n} item(ns) que vendem com margem abaixo de 12%`,
      detalhe: zero ? "O preço de venda da exportação está igual ou abaixo do último preço de entrada: confira se é preço errado ou custo desatualizado antes de qualquer promoção." : "Itens que vendem, mas deixam menos de 12% de margem sobre a venda.",
      evidencia: m.itens.map(i => `${i.desc}: margem ${pct(i.margem)} (vendeu ${money(i.v90)} em 90 dias)`), acao: zero ? "Corrigir preço ou custo desses itens no sistema." : "Rever o preço desses itens: o desconto deles já está embutido no dia a dia.", link: link(c, "semDescontoReal") })];
  });
}

/* a campanha da cadência semanal (hoje e os 2 próximos dias): existe uma salva e aprovada para o dia? */
export function campanha(ctx) {
  const P = globalThis.N7Promo; if (!P || !P.CADENCIA) return [];
  const out = [];
  lojas(ctx).forEach(({ c, s }) => {
    const cad = P.CADENCIA[c.key]; if (!cad) return;
    const seen = new Set();
    for (let i = 0; i <= 2; i++) {
      const d = plus(ctx.today, i), dow = A.parse(d).getDay();
      (cad[dow] || []).forEach(tipo => {
        if (seen.has(tipo)) return; seen.add(tipo);
        const cover = s.campanhas.filter(x => x.tipo === tipo && x.inicio && x.inicio <= d && (x.fim || x.inicio) >= d && x.status !== "encerrada");
        if (cover.some(x => x.status === "aprovada" || x.status === "publicada")) return;
        const rascunho = cover.length > 0, quando = i === 0 ? "hoje" : i === 1 ? "amanhã" : `em ${i} dias`;
        const preset = (P.CAMPANHAS.find(x => x.tipo === tipo) || { cats: [] }), cats = preset.cats.filter(k => s.candidatosPorCat[k]), n = cats.reduce((t, k) => t + s.candidatosPorCat[k], 0);
        out.push(F("campanha", `pcamp-${rascunho ? "rasc" : "falta"}-${c.key}-${d}`, { marca: c.key, nome: c.name, score: clamp((rascunho ? 60 : 72) - i * 5), tags: [rascunho ? "campanha_rascunho" : "campanha_falta"],
          titulo: rascunho ? `${c.name}: a campanha ${tipo} ${quando} ainda é rascunho` : `${c.name}: falta a campanha ${tipo} ${quando} (${dm(d)})`,
          detalhe: rascunho ? "Há uma campanha salva para esse dia, mas ela não foi aprovada." : `A cadência semanal pede ${tipo} ${quando}${n ? `, e há ${n} candidato(s) com preço acima do piso em ${cats.join(" e ")}` : ""}.`,
          evidencia: [`Cadência de ${c.name}: ${tipo}`, n ? `${n} candidato(s) viáveis nas categorias da campanha` : "Sem candidatos viáveis nas categorias da campanha: monte pelo Corta Preço"], acao: rascunho ? "Revisar a cesta, conferir o piso e aprovar." : "Montar a campanha na Central de Promoções e mandar o briefing para a arte.",
          link: { route: "promocoes/campanha", brand: c.key, tipo, dia: d } }));
      });
    }
  });
  return out;
}

/* dados da central de promoções: sem base, base velha, histórico curto ou muito item sem custo */
export function dadosPromo(ctx) {
  const out = [];
  ctx.clients.filter(c => (c.services || []).includes("promocoes") && ctx.promo && ctx.promo[c.key]).forEach(c => {
    const s = ctx.promo[c.key];
    if (s.vazio) { out.push(F("dados", `pdados-vazio-${c.key}`, { marca: c.key, nome: c.name, score: 70, tags: ["stale"], titulo: `${c.name}: a Central de Promoções ainda não tem estoque e vendas`, detalhe: "Sem a base, o cérebro não vigia estoque parado, ruptura nem margem desta loja.", evidencia: [s.importacoes ? "Há importações, mas sem vendas ou sem estoque" : "Nada importado"], acao: "Importar a exportação de estoque e o analítico de vendas.", link: { route: "promocoes/importar", brand: c.key } })); return; }
    const velEst = s.estoqueEm ? diff(ctx.today, s.estoqueEm) : 999, velVen = diff(ctx.today, s.cobertura.fim);
    if (velEst > 7) out.push(F("dados", `pdados-estoque-${c.key}`, { marca: c.key, nome: c.name, score: clamp(52 + Math.min(22, (velEst - 7) * 1.5)), tags: ["stale"], titulo: `${c.name}: o estoque importado tem ${velEst >= 999 ? "data desconhecida" : velEst + " dias"}`, detalhe: "Estoque velho distorce meses de estoque, ruptura e preço de queima.", evidencia: [s.estoqueEm ? `Último estoque: ${dm(s.estoqueEm)}` : "Nenhuma data de estoque"], acao: "Importar a exportação de estoque atual.", link: { route: "promocoes/importar", brand: c.key } }));
    if (velVen > 8) out.push(F("dados", `pdados-vendas-${c.key}`, { marca: c.key, nome: c.name, score: clamp(58 + Math.min(20, (velVen - 8) * 1.2)), tags: ["stale"], titulo: `${c.name}: as vendas importadas vão só até ${dm(s.cobertura.fim)}`, detalhe: `Faltam ${velVen} dias de vendas: o giro de 60 e 90 dias olha para o passado.`, evidencia: [`Cobertura: ${dm(s.cobertura.inicio)} a ${dm(s.cobertura.fim)}`], acao: "Importar o analítico de vendas dos dias que faltam (sem o dia da emissão, que sai cortado).", link: { route: "promocoes/importar", brand: c.key } }));
    if (s.cobertura.dias < 90) out.push(F("dados", `pdados-curto-${c.key}`, { marca: c.key, nome: c.name, score: s.cobertura.dias < 60 ? 46 : 36, tags: ["curto"], titulo: `${c.name}: histórico de vendas de ${s.cobertura.dias} dias (o ideal é 90)`, detalhe: "Parado e encalhado valem só para o que foi coberto; o giro de 90 dias ainda é parcial.", evidencia: [`Cobertura: ${dm(s.cobertura.inicio)} a ${dm(s.cobertura.fim)}`], acao: "Importar os meses anteriores, em arquivos separados.", link: { route: "promocoes/importar", brand: c.key } }));
    if (s.comEstoque && s.semCusto / s.comEstoque > 0.3) out.push(F("dados", `pdados-custo-${c.key}`, { marca: c.key, nome: c.name, score: 48, tags: ["semcusto"], titulo: `${c.name}: ${s.semCusto} de ${s.comEstoque} itens com estoque estão sem custo`, detalhe: "Sem custo não existe piso: nesses itens não dá para afirmar que o preço respeita a margem mínima.", evidencia: [`${pct(s.semCusto / s.comEstoque)} dos itens com estoque`], acao: "Pedir ao sistema da loja que complete o último preço de entrada.", link: { route: "promocoes/candidatos", brand: c.key, lista: "semCusto" } }));
  });
  return out;
}
