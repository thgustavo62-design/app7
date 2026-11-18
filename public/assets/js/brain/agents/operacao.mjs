/* Agentes de Operação: Produção, Etapas da produção, Capacidade da equipe e Aprovações. Cada função recebe o contexto e devolve achados. */
import { A, F, has, diff, plus, dm, NOT_STARTED, STATUS_NAME, STEPS, STEP_NAME, DONE } from "../util.mjs";

/* ---------- agentes ---------- */
export function producao(ctx) {
  const out = [], { today, posts } = ctx;
  ctx.clients.filter(c => has(c, "redes") || has(c, "criativos")).forEach(c => {
    const mine = posts.filter(p => p.b === c.key);
    const late = mine.filter(p => p.status !== "pub" && p.date < today).sort((a, b) => a.date.localeCompare(b.date));
    if (late.length) {
      const oldest = late[0], days = diff(today, oldest.date);
      out.push(F("producao", `prod-late-${c.key}`, { marca: c.key, nome: c.name, score: 52 + Math.min(26, days * 1.6) + Math.min(10, late.length),
        titulo: `${c.name}: ${late.length} pauta${late.length > 1 ? "s" : ""} atrasada${late.length > 1 ? "s" : ""}`, detalhe: `A mais antiga é ${oldest.code} (${oldest.title}), que era para ${dm(oldest.date)}, ${days} dia${days > 1 ? "s" : ""} atrás.`,
        evidencia: [`${late.length} pauta(s) com data vencida e fora de "Publicado"`, `Atraso máximo: ${days} dia(s)`], acao: "Reprogramar ou publicar as mais antigas e atualizar o status no Calendário.", link: { route: "calendario", brand: c.key } }));
    }
    const soon = mine.filter(p => NOT_STARTED.includes(p.status) && p.date >= today && p.date <= plus(today, 2)).sort((a, b) => a.date.localeCompare(b.date));
    if (soon.length) {
      const d = diff(soon[0].date, today);
      out.push(F("producao", `prod-due-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 90 : 78,
        titulo: `${c.name}: ${soon.length} pauta${soon.length > 1 ? "s" : ""} vence${soon.length > 1 ? "m" : ""} em até 2 dias sem ter começado`, detalhe: `${soon[0].code} (${soon[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : "em 2 dias"} e ainda está em "${soon[0].status === "prop" ? "Proposta" : "A planejar"}".`,
        evidencia: [`Status ainda sem produção: ${soon.map(p => p.code).join(", ")}`], acao: "Decidir hoje: produzir às pressas, trocar por outra pauta ou mover a data.", link: { route: "calendario", brand: c.key } }));
    }
    if (has(c, "redes") && mine.length && !mine.some(p => p.date >= today && p.date <= plus(today, 7))) {
      out.push(F("producao", `prod-empty-${c.key}`, { marca: c.key, nome: c.name, score: 62, titulo: `${c.name}: nenhuma pauta nos próximos 7 dias`,
        detalhe: "O perfil fica sem publicar se nada for planejado agora. Constância pesa mais que uma peça perfeita.", evidencia: ["Calendário vazio entre hoje e os próximos 7 dias"], acao: "Puxar uma ideia aprovada do quadro de ideias ou criar pautas para a semana.", link: { route: "calendario", brand: c.key, ideas: true } }));
    }
  });
  return out;
}
/* etapas com prazo vencido e status que ainda não avançou, em pautas que ainda não atrasaram de vez */
export function pipeline(ctx) {
  const out = [], { today, posts } = ctx;
  ctx.clients.filter(c => has(c, "redes") || has(c, "criativos")).forEach(c => {
    const items = [];
    posts.filter(p => p.b === c.key && p.status !== "pub" && p.date >= today && p.steps).forEach(p => {
      if (NOT_STARTED.includes(p.status) && p.date <= plus(today, 2)) return;            /* esse caso é da Produção */
      const done = DONE[p.status] || 0;
      const late = STEPS.map((s, i) => ({ s, i, at: p.steps[s] })).filter(x => x.i >= done && x.at && x.at < today);
      if (late.length) items.push({ p, step: late[0], n: late.length });
    });
    if (items.length) {
      items.sort((a, b) => a.p.date.localeCompare(b.p.date));
      const w = items[0], dPub = diff(w.p.date, today), days = diff(today, w.step.at);
      out.push(F("pipeline", `pipe-${c.key}`, { marca: c.key, nome: c.name, score: 48 + (dPub <= 3 ? 22 : dPub <= 7 ? 12 : 4) + Math.min(10, items.length * 2.5),
        titulo: `${c.name}: etapa atrasada em ${items.length} pauta${items.length > 1 ? "s" : ""}`,
        detalhe: `${w.p.code} (${w.p.title}): ${STEP_NAME[w.step.s]} era para ${dm(w.step.at)} (${days} dia${days > 1 ? "s" : ""} atrás) e a pauta está em "${STATUS_NAME[w.p.status] || w.p.status}". Publica em ${dm(w.p.date)}.`,
        evidencia: [`Pautas com etapa vencida: ${items.map(x => x.p.code).join(", ")}`, `A mais próxima de publicar fica a ${dPub} dia(s)`], acao: "Cobrar a etapa com quem é responsável ou mover a data de publicação antes de a pauta atrasar de vez.", link: { route: "calendario", brand: c.key } }));
    }
    const hol = [];
    posts.filter(p => p.b === c.key && p.status !== "pub" && p.steps).forEach(p => {
      const done = DONE[p.status] || 0;
      STEPS.forEach((s, i) => { const at = p.steps[s]; if (i >= done && at && at >= today && at <= plus(today, 5) && A.HOLIDAYS[at]) hol.push({ p, s, at, name: A.HOLIDAYS[at] }); });
    });
    if (hol.length) out.push(F("pipeline", `pipe-hol-${c.key}`, { marca: c.key, nome: c.name, score: 50, titulo: `${c.name}: prazo de etapa cai em feriado`,
      detalhe: `${hol[0].p.code}: ${STEP_NAME[hol[0].s]} vence em ${dm(hol[0].at)} (${hol[0].name}). ${hol.length > 1 ? `Mais ${hol.length - 1} etapa(s) no mesmo caso.` : ""}`.trim(), evidencia: [`Feriado em ${dm(hol[0].at)}: ${hol[0].name}`], acao: "Antecipar a etapa para antes do feriado ou combinar o novo prazo.", link: { route: "calendario", brand: c.key } }));
  });
  return out;
}
export function capacidade(ctx) {
  const { today, posts } = ctx, days = [];
  for (let i = 0; i < 7; i++) {
    const d = plus(today, i), g = [], e = [], t = [];
    posts.filter(p => p.status !== "pub" && p.steps && new Set(Object.values(p.steps)).size > 1).forEach(p => {
      const done = DONE[p.status] || 0;
      STEPS.forEach((s, k) => { if (k >= done && p.steps[s] === d) { t.push(p); if (s === "gravar") g.push(p); if (s === "editar") e.push(p); } });
    });
    if (g.length >= 3 || e.length >= 4 || t.length >= 7) days.push({ d, g, e, t, hol: A.HOLIDAYS[d] || "" });
  }
  if (!days.length) return [];
  const worst = days.slice().sort((a, b) => b.t.length - a.t.length)[0];
  const brands = [...new Set(worst.t.map(p => (ctx.clients.find(c => c.key === p.b) || {}).name || p.b))];
  return [F("capacidade", `cap-${worst.d}`, { score: 55 + Math.min(20, (worst.t.length - 6) * 4) + (worst.hol ? 5 : 0),
    titulo: `Equipe sobrecarregada em ${dm(worst.d)}: ${worst.t.length} etapas no mesmo dia`,
    detalhe: `${worst.g.length} gravação(ões), ${worst.e.length} edição(ões) e outras etapas vencem em ${dm(worst.d)}${worst.hol ? ` (${worst.hol})` : ""}. Clientes envolvidos: ${brands.join(", ")}.`,
    evidencia: [`Dia mais pesado: ${dm(worst.d)} com ${worst.t.length} etapas`, days.length > 1 ? `Outros dias pesados: ${days.filter(x => x !== worst).map(x => dm(x.d)).join(", ")}` : "Só este dia passa do limite"], acao: "Redistribuir: antecipar gravações em lote, mover prazos para dias mais leves ou combinar a entrega com o cliente.", link: { route: "calendario" } })];
}
export function aprovacao(ctx) {
  const out = [], { today, posts } = ctx;
  ctx.clients.forEach(c => {
    const wait = posts.filter(p => p.b === c.key && p.status !== "pub" && p.date >= today && p.date <= plus(today, 3) && ctx.needsClient(p)).sort((a, b) => a.date.localeCompare(b.date));
    if (!wait.length) return;
    const d = diff(wait[0].date, today);
    out.push(F("aprovacao", `apr-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 86 : 72,
      titulo: `${c.name}: ${wait.length} peça${wait.length > 1 ? "s" : ""} esperando a aprovação do cliente`, detalhe: `${wait[0].code} (${wait[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`}.`,
      evidencia: [`Política do cliente exige aprovação dele: ${wait.map(p => p.code).join(", ")}`, `Primeira publicação em ${d} dia(s)`], acao: "Cobrar a aprovação com o cliente hoje; sem ela a peça não pode ficar pronta.", link: { route: "calendario", brand: c.key } }));
  });
  return out;
}