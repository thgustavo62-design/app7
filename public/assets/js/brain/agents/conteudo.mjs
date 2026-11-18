/* Agentes de Conteúdo: Ritmo editorial e Qualidade. (Criativos nasce de uma sinapse, em synapses.mjs.) */
import { A, F, has, diff, plus, dm } from "../util.mjs";

export function editorial(ctx) {
  const out = [], { today, posts } = ctx, slots = ctx.slots || {}, ideas = ctx.ideas || [];
  ctx.clients.filter(c => has(c, "redes")).forEach(c => {
    const mine = posts.filter(p => p.b === c.key), mySlots = slots[c.key] || [];
    const next7 = mine.filter(p => p.date >= today && p.date <= plus(today, 6));
    if (mySlots.length && next7.length > 0 && next7.length < Math.ceil(mySlots.length / 2)) out.push(F("editorial", `edit-cad-${c.key}`, { marca: c.key, nome: c.name, score: 54,
      titulo: `${c.name}: ritmo abaixo do combinado (${next7.length} de ${mySlots.length} horários fixos)`, detalhe: `Os horários fixos da semana são ${mySlots.length}, mas só ${next7.length} pauta(s) caem nos próximos 7 dias.`,
      evidencia: [`${mySlots.length} horários fixos combinados`, `${next7.length} pauta(s) nos próximos 7 dias`], acao: "Preencher os horários vagos com pautas ou ideias aprovadas.", link: { route: "calendario", brand: c.key, ideas: true } }));
    const n14 = mine.filter(p => p.date >= today && p.date <= plus(today, 13));
    if (n14.length >= 4 && new Set(n14.map(p => p.format)).size === 1) out.push(F("editorial", `edit-mix-${c.key}`, { marca: c.key, nome: c.name, score: 40,
      titulo: `${c.name}: só ${n14[0].format} nos próximos 14 dias`, detalhe: `Todas as ${n14.length} pautas das próximas duas semanas são ${n14[0].format}. Variar formato ajuda a testar o que o público prefere.`,
      evidencia: [`${n14.length} pautas, um único formato`], acao: "Trocar ao menos uma pauta por outro formato (Reels, carrossel).", link: { route: "calendario", brand: c.key } }));
    const old = ideas.filter(i => i.b === c.key && i.stage === "aprovada" && i.at && i.at <= plus(today, -7)).sort((a, b) => a.at.localeCompare(b.at));
    if (old.length) out.push(F("editorial", `edit-ideas-${c.key}`, { marca: c.key, nome: c.name, score: 46 + Math.min(10, old.length * 3), tags: ["ideias"],
      titulo: `${c.name}: ${old.length} ideia${old.length > 1 ? "s" : ""} aprovada${old.length > 1 ? "s" : ""} parada${old.length > 1 ? "s" : ""} há mais de 7 dias`, detalhe: `A mais antiga é "${old[0].title}", aprovada em ${dm(old[0].at)}, ainda sem data de publicação.`,
      evidencia: [`${old.length} ideia(s) com etapa "aprovada" e sem pauta`], acao: "Agendar nos horários fixos do cliente ou descartar para o quadro não acumular.", link: { route: "calendario", brand: c.key, ideas: true } }));
    const byDay = {}; mine.filter(p => p.date >= today && p.date <= plus(today, 13)).forEach(p => { (byDay[p.date + "|" + p.format] = byDay[p.date + "|" + p.format] || []).push(p); });
    const dup = Object.entries(byDay).filter(([, l]) => l.length >= 2).sort()[0];
    if (dup) out.push(F("editorial", `edit-dup-${c.key}`, { marca: c.key, nome: c.name, score: 44, titulo: `${c.name}: duas pautas de ${dup[1][0].format} no mesmo dia`,
      detalhe: `${dup[1].map(p => p.code).join(" e ")} caem em ${dm(dup[1][0].date)}. Publicar duas do mesmo formato juntas divide o alcance.`, evidencia: [`Dia ${dm(dup[1][0].date)}`], acao: "Mover uma das duas para outro horário fixo.", link: { route: "calendario", brand: c.key } }));
  });
  return out;
}
export function qualidade(ctx) {
  const out = [], { today, posts } = ctx; if (!ctx.checks) return out;
  ctx.clients.forEach(c => {
    const miss = posts.filter(p => p.b === c.key && ["apr", "agd"].includes(p.status) && p.date >= today && p.date <= plus(today, 2) && !ctx.checks[p.code]).sort((a, b) => a.date.localeCompare(b.date));
    if (!miss.length) return;
    const d = diff(miss[0].date, today);
    out.push(F("qualidade", `qual-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 66 : 58, titulo: `${c.name}: ${miss.length} peça${miss.length > 1 ? "s" : ""} pronta${miss.length > 1 ? "s" : ""} sem checagem de qualidade`,
      detalhe: `${miss[0].code} (${miss[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : "em 2 dias"} e ainda não passou pela checagem.`, evidencia: [`Sem checagem: ${miss.map(p => p.code).join(", ")}`], acao: "Rodar a checagem de qualidade da peça antes de agendar.", link: { route: "calendario", brand: c.key } }));
  });
  return out;
}