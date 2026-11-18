/* Agente de Estratégia: Oportunidades. (Gestão de contas está em health.mjs.) */
import { F, has } from "../util.mjs";

export function oportunidades(ctx) {
  const out = [], a = ctx.analysis; if (!a) return out;
  ctx.clients.filter(c => has(c, "redes") && !has(c, "trafego")).forEach(c => {
    const up = a.signals.find(s => s.marca === c.key && (s.canal === "Instagram" || s.canal === "Facebook") && s.tom === "up" && s.classe === "MANTER");
    if (up) out.push(F("oportunidades", `opp-trafego-${c.key}-${a.period.inicio}`, { marca: c.key, nome: c.name, score: 44, titulo: `${c.name}: orgânico forte, vale propor tráfego pago`,
      detalhe: `${up.canal}: ${up.titulo}. O cliente ainda não contrata tráfego pago; um teste pequeno pode ampliar o que já funciona.`, evidencia: [`Sinal positivo em ${up.canal} na semana ${a.period.label}`, "Cliente sem o serviço de tráfego pago"], acao: "Levar uma proposta de teste curto, com verba pequena e meta clara, na próxima conversa.", link: { route: "semana", brand: c.key } }));
  });
  return out;
}