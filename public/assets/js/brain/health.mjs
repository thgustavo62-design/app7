/* Gestão de contas: saúde de 0 a 100 por cliente (soma suave dos achados abertos) e o aviso de várias frentes piorando juntas. */
import { F, clamp } from "./util.mjs";
import { AGENTS } from "./catalog.mjs";

export const healthLevel = s => (s >= 80 ? "ok" : s >= 60 ? "atencao" : "risco");
export function health(open, ctx) {
  return ctx.clients.map(c => {
    const list = open.filter(f => f.marca === c.key && f.kind === "acao" && f.agente !== "cliente").sort((a, b) => b.score - a.score);
    const penalty = list.reduce((s, f) => s + Math.max(0, f.score - 35) * .35, 0), saude = clamp(100 - 80 * (1 - Math.exp(-penalty / 55)));   /* queda suave: muitos achados pioram, mas a nota não zera */
    const wins = open.filter(f => f.marca === c.key && f.kind === "ganho").length;
    return { key: c.key, id: c.id || "", name: c.name, saude, nivel: healthLevel(saude), achados: list.length, fortes: list.filter(f => f.score >= 60).length, agentes: [...new Set(list.map(f => f.agente))], top: list.slice(0, 3), ganhos: wins };
  });
}
export function clienteAgent(clientes) {
  return clientes.filter(h => h.fortes >= 3 || (h.saude < 60 && h.achados >= 2)).map(h => F("cliente", `cli-risco-${h.key}`, { marca: h.key, nome: h.name, score: Math.min(78, 60 + Math.max(0, (60 - h.saude) / 2) + (h.fortes - 2) * 3),
    titulo: `${h.name}: várias frentes pedindo atenção ao mesmo tempo`, detalhe: `Saúde ${h.saude}/100 com ${h.achados} achado(s) abertos em ${h.agentes.length} agente(s): ${h.agentes.map(a => AGENTS[a].name).join(", ")}.`,
    evidencia: h.top.map(f => `${AGENTS[f.agente].name}: ${f.titulo.replace(/^.*?: /, "")} (nota ${f.score})`), acao: "Conversar com o cliente e definir uma prioridade só para a semana; resolver o de maior nota primeiro.", link: { route: h.id || "painel" } }));
}