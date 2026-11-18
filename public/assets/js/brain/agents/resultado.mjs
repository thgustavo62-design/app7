/* Agentes de Resultado: Vendas, Mídia paga e Redes sociais, que lêem a análise semanal (mesmas regras da tela Semana). */
import { F, slug, CLASS_BASE, CONF } from "../util.mjs";

const TAGS = [[/frequ/i, "freq"], [/acima da popula/i, "saturacao"], [/custo por resultado subiu/i, "cpr_up"], [/menos visualiza/i, "views_down"], [/perdeu distribui/i, "views_down"], [/cliques no link caíram|mais visitas, menos cliques/i, "cliques_down"], [/menos intera/i, "interacao_down"]];
export function fromAnalysis(ctx) {
  const out = [], a = ctx.analysis; if (!a) return out;
  const AG = { Vendas: "vendas", "Meta Ads": "midia", Instagram: "redes", Facebook: "redes" };
  a.signals.forEach(s => {
    const agente = AG[s.canal]; if (!agente) return;
    const win = (s.classe === "ESCALAR" || s.classe === "MANTER") && s.tom === "up";
    const base = (CLASS_BASE[s.classe] || 15) * (CONF[s.confianca] || .6) + (s.canal === "Vendas" ? 10 : s.canal === "Meta Ads" ? 8 : 0);
    const tags = TAGS.filter(([re]) => re.test(s.titulo)).map(t => t[1]); if (agente === "vendas" && s.tom === "down") tags.push("vendas_down");
    out.push(F(agente, `sig-${a.period.inicio}-${s.marca}-${slug(s.canal)}-${slug(s.titulo)}`, { marca: s.marca, nome: s.nome, kind: win ? "ganho" : "acao", score: win ? Math.min(base, 35) : base, tags, canal: s.canal, tom: s.tom, classe: s.classe,
      titulo: `${s.nome} · ${s.canal}: ${s.titulo}`, detalhe: s.texto, evidencia: [`Classificação: ${s.classe}`, `Confiança: ${s.confianca}`, `Semana ${a.period.label}`],
      acao: s.classe === "CORRIGIR" ? "Corrigir antes de gastar ou publicar mais." : s.classe === "TESTAR" ? "Montar um teste curto e medir antes de decidir." : s.classe === "ESCALAR" ? "Pode crescer: aumente aos poucos e acompanhe." : s.classe === "INCONCLUSIVO" ? "Base pequena ou feriado: espere mais dados antes de concluir." : "Manter como está.",
      link: { route: "semana", brand: s.marca } }));
  });
  return out;
}