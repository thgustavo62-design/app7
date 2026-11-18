/* Subaba "Conexões": mapa plano (2D) dos agentes com as conexões que dispararam hoje e a lista do que cada uma encontrou.
   O mapa em 3D está na aba Agentes; este continua útil no celular e para imprimir. */
export const title = { eyebrow: "Central de Inteligência", h1: "Conexões entre os agentes", lead: "Quando um agente descobre algo que muda a leitura de outro, as conexões disparam. As linhas roxas são as que dispararam hoje." };

export function render(host, k) {
  const { r, B, esc, agentName } = k, W = 860, Hh = 470, cx = W / 2, cy = Hh / 2, rx = 345, ry = 175;
  const ids = B.AREA_ORDER.flatMap(a => B.AGENT_ORDER.filter(id => B.AGENTS[id].area === a));
  const pos = {}; ids.forEach((id, i) => { const t = -Math.PI / 2 + (i / ids.length) * Math.PI * 2; pos[id] = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }; });
  const open = id => (r.byAgent[id] || []).filter(f => f.kind === "acao"), count = id => open(id).length, top = id => Math.max(0, ...open(id).map(f => f.score));
  const curve = (a, b) => { const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * .38, my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * .38; return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`; };
  const spokes = ids.map(id => `<line x1="${cx}" y1="${cy}" x2="${pos[id].x.toFixed(1)}" y2="${pos[id].y.toFixed(1)}" class="bm-spoke"/>`).join("");
  const lines = r.sinapses.flatMap(s => s.de.flatMap(d => s.para.filter(p => pos[d] && pos[p] && d !== p).map(p => `<path d="${curve(pos[d], pos[p])}" class="bm-syn" style="stroke-width:${Math.min(5, 1.6 + s.qtd * .8).toFixed(1)}"><title>${esc(s.nome)}</title></path>`))).join("");
  const nodes = ids.map(id => { const a = B.AGENTS[id], p = pos[id], n = count(id), t = top(id), rad = 17 + Math.min(7, n * 1.5);
    return `<g class="bm-node a-${a.area}${n ? " has" : ""}" data-agent="${id}" tabindex="0" role="button" aria-label="${esc(a.name)}: ${n ? n + " achado(s)" : "em ordem"}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
      ${t >= 80 ? `<circle r="${rad + 7}" class="bm-pulse"/>` : ""}<circle r="${rad}" class="bm-dot"/><text class="bm-n" y="5" text-anchor="middle">${n || ""}</text>
      <text class="bm-l" y="${rad + 15}" text-anchor="middle">${esc(a.name)}</text><title>${esc(a.name)} · ${n ? n + " achado(s), maior nota " + t : "em ordem"}</title></g>`; }).join("");
  const hub = `<g class="bm-hub" transform="translate(${cx} ${cy})"><circle r="54" class="bm-hub-ring"/><circle r="42" class="bm-hub-dot"/><text y="-2" text-anchor="middle" class="bm-hub-t">Maestro</text><text y="13" text-anchor="middle" class="bm-hub-s">${r.total} abertos</text></g>`;
  const legend = B.AREA_ORDER.map(a => `<span class="bm-key a-${a}"><i></i>${esc(B.AREAS[a].name)}</span>`).join("");
  const fired = r.sinapses.length ? `<ul class="brain-list">${r.sinapses.map(s => `<li class="brain-row"><div class="brain-row-h"><span class="badge st-apr">${s.qtd}×</span><b>${esc(s.nome)}</b></div><p class="src">${s.de.map(agentName).join(" + ")} → ${s.para.map(x => x === "todos" ? "todos os agentes" : agentName(x)).join(" / ")}</p><ul class="plain">${s.casos.slice(0, 3).map(c => `<li>${c.nome ? `<b>${esc(c.nome)}:</b> ` : ""}${esc(c.texto)}</li>`).join("")}</ul></li>`).join("")}</ul>`
    : `<p class="src">Nenhuma conexão disparou hoje: os agentes não encontraram achados que se relacionem.</p>`;
  host.innerHTML = `<div class="panel"><div class="panel-body">
      <div class="brain-map"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Mapa dos 14 agentes e das conexões ativas hoje">${spokes}${lines}${hub}${nodes}</svg></div>
      <div class="bm-legend">${legend}<span class="bm-key"><i class="syn"></i>conexão ativa hoje</span></div></div></div>
    <div class="section-title"><h2>Conexões ativas hoje</h2><span>${r.sinapses.length} de ${B.SYNAPSES.length}</span></div>${fired}`;
  const jump = id => { location.hash = "#cerebro/radar"; setTimeout(() => { const d = document.getElementById("agent-" + id); if (d) { d.open = true; d.scrollIntoView({ block: "center" }); } }, 350); };
  host.querySelectorAll(".bm-node").forEach(g => { g.addEventListener("click", () => jump(g.dataset.agent)); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(g.dataset.agent); } }); });
}
