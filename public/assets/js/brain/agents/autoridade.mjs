/* Agentes de Autoridade: leem as linhas semanais de Autoridade (ctx.authority) de cada cliente com o serviço e devolvem achados
   por cliente. Consistência (ritmo de publicação), Autoridade (alcance e engajamento qualificado por canal) e Convites (visitas ao perfil
   e reuniões). A análise é a mesma da tela Autoridade (N7Authority.analyze): base pequena é INCONCLUSIVO e dado que falta nunca vira zero. */
import { A, F, slug, plus, CLASS_BASE, CONF, has } from "../util.mjs";

const AG = { "Consistência": "consistencia", Convites: "convites" };            /* os demais canais (LinkedIn, Instagram) são do agente "autoridade" */
const clientes = ctx => ctx.clients.filter(c => has(c, "autoridade"));
const metaOf = (ctx, k) => { const g = (ctx.goals || {})[`${k}-postsemana`]; return g > 0 ? Number(g) : (globalThis.N7Authority || {}).META_POSTS || 3; };
/* última semana fechada com algum número informado, por cliente */
const semanaDe = (ctx, c) => { const U = globalThis.N7Authority, lastClosed = A.lastClosed("semana", A.parse(ctx.today)); return U ? (U.periodsWith(ctx.authority || [], c.key).filter(i => i <= lastClosed).pop() || null) : null; };

export function autoridade(ctx) {
  const U = globalThis.N7Authority, out = []; if (!U) return out;
  clientes(ctx).forEach(c => {
    const ini = semanaDe(ctx, c); if (!ini) return;
    const a = U.analyze({ rows: ctx.authority || [], client: { key: c.key, name: c.name }, inicio: ini, metaPosts: metaOf(ctx, c.key) });
    a.signals.forEach(s => {
      const agente = AG[s.canal] || "autoridade", win = (s.classe === "ESCALAR" || s.classe === "MANTER") && s.tom === "up";
      const base = (CLASS_BASE[s.classe] || 15) * (CONF[s.confianca] || .6) + (agente === "consistencia" ? 8 : 0);
      const tags = [];
      if (agente === "consistencia" && s.tom === "down") tags.push("ritmo_baixo");
      if (agente === "autoridade" && /Alcance caiu/.test(s.titulo)) tags.push("alcance_down");
      if (agente === "autoridade" && /Engajamento qualificado caiu/.test(s.titulo)) tags.push("engaj_down");
      out.push(F(agente, `aut-${ini}-${c.key}-${agente}-${slug(s.canal)}-${slug(s.titulo)}`, { marca: c.key, nome: c.name, kind: win ? "ganho" : "acao", score: win ? Math.min(base, 35) : base, tags, classe: s.classe,
        titulo: `${c.name} · ${s.canal}: ${s.titulo}`, detalhe: s.texto, evidencia: [`Classificação: ${s.classe}`, `Confiança: ${s.confianca}`, `Semana ${a.period.label}`],
        acao: s.classe === "CORRIGIR" ? "Corrigir já: ritmo, bio ou chamada para ação." : s.classe === "TESTAR" ? "Testar um formato ou gancho diferente e medir na semana seguinte." : s.classe === "ESCALAR" ? "Repetir o que funcionou e registrar qual peça puxou." : s.classe === "INCONCLUSIVO" ? "Base pequena: acompanhar mais uma semana antes de concluir." : "Manter o ritmo.",
        link: { route: "autoridade", brand: c.key } }));
    });
  });
  return out;
}

/* dados de autoridade: semana fechada sem números, ou números só de semanas antigas */
export function dadosAutoridade(ctx) {
  const U = globalThis.N7Authority, out = []; if (!U) return out;
  const lastClosed = A.lastClosed("semana", A.parse(ctx.today)), dow = A.parse(ctx.today).getDay(), early = dow >= 1 && dow <= 3;
  clientes(ctx).forEach(c => {
    const ini = semanaDe(ctx, c); if (ini === lastClosed) return;
    const atraso = ini ? Math.round((A.parse(lastClosed) - A.parse(ini)) / (7 * 86400000)) : null;
    out.push(F("dados", `aut-dados-${c.key}-${lastClosed}`, { marca: c.key, nome: c.name, score: early ? 70 : 54, tags: ["stale"],
      titulo: `${c.name}: sem números de autoridade da semana ${A.period("semana", lastClosed).label}`,
      detalhe: ini ? `Os últimos números são de ${atraso} semana(s) atrás: o painel de autoridade olha para o passado.` : "Nenhuma semana com números: o cérebro não mede ritmo, alcance nem convites deste cliente.",
      evidencia: [ini ? `Última semana com dado: ${A.period("semana", ini).label}` : "Aba Autoridade sem linhas deste cliente"], acao: "Informar na tela Autoridade os números do LinkedIn, do Instagram e os convites da semana.", link: { route: "autoridade", brand: c.key } }));
  });
  return out;
}
