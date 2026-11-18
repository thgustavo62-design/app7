/* Subaba "Hoje": a decisão do dia, o que mais pede atenção e o que está funcionando. */
export const title = { eyebrow: "Central de Inteligência", h1: "O que fazer hoje", lead: "14 agentes olham cada parte do negócio e conversam entre si. O maestro escolhe o que mais importa agora. Tudo por regras que você pode conferir: nada de caixa-preta." };

export function render(host, k) {
  const { r, esc, tone, flag, dateTxt, agentName, acts, smallCard } = k, d = r.decision;
  const hero = !d
    ? `<section class="brain-hero calm"><p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p><h2>Tudo tranquilo por enquanto.</h2><p class="lead">Nenhum agente encontrou algo que peça ação hoje${r.resolved ? `, e ${r.resolved} item(ns) já foram tratados.` : "."} Aproveite para adiantar o calendário ou revisar o que está funcionando.</p></section>`
    : `<section class="brain-hero">
      <div class="brain-tags"><span class="badge ${tone(d.score)}">${esc(d.urgencia)} · nota ${d.score}/100</span><span class="badge">${esc(agentName(d.agente))}</span>${d.nome ? `<span class="badge">${esc(d.nome)}</span>` : ""}${flag(d)}</div>
      <p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p>
      <h2>${esc(d.titulo)}</h2><p class="lead">${esc(d.detalhe)}</p>
      <div class="brain-cols"><div><span class="col-title">Por que esta?</span><ul class="plain">${d.evidencia.map(e => `<li>${esc(e)}</li>`).join("")}${d.rel.slice(0, 3).map(x => `<li><b>${esc(agentName(x.agente))}:</b> ${esc(x.texto || x.titulo)}</li>`).join("")}<li>Foi a de maior nota entre ${r.total} achado(s) abertos.</li></ul></div>
        <div><span class="col-title">O que fazer</span><p>${esc(d.acao)}</p></div></div>
      <div class="toolbar">${acts(d)}</div></section>`;
  host.innerHTML = `${hero}
    ${r.also.length ? `<div class="section-title"><h2>Também hoje</h2><span>os próximos mais importantes, de agentes e clientes diferentes</span></div><div class="grid g2">${r.also.map(smallCard).join("")}</div>` : ""}
    ${r.wins.length ? `<div class="panel">${k.H.banner("target", "O que está funcionando", "ganhos para manter ou ampliar com cuidado")}<div class="panel-body"><ul class="brain-list">${r.wins.map(f => `<li class="brain-row"><div class="brain-row-h"><span class="badge st-pub">ganho</span><b>${esc(f.titulo)}</b></div><p>${esc(f.detalhe)}</p></li>`).join("")}</ul></div></div>` : ""}
    <p class="src">Fontes de hoje: calendário (${esc(r.sources.calendario)}) · semana analisada: ${esc(r.sources.semana)} · ${r.sources.clientes} cliente(s). A parte da Meta (Windsor.ai) entra quando for conectada.</p>`;
  k.wire(host);
}
