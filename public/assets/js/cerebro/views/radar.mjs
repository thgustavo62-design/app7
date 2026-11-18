/* Subaba "Radar": os achados de cada agente, agrupados por área. Os 2 agentes mais quentes abrem sozinhos. */
export const title = { eyebrow: "Central de Inteligência", h1: "Radar dos agentes", lead: "Tudo o que cada agente encontrou, por área. Marque como feito, adie ou ignore: o cérebro lembra e avisa se o problema voltar." };

export function render(host, k) {
  const { r, B, esc, row } = k, ico = k.H.ico;
  const open = id => r.byAgent[id].filter(f => f.kind === "acao" && !(r.decision && f.chave === r.decision.chave));
  const hot = B.AGENT_ORDER.filter(id => open(id).length).sort((x, y) => r.byAgent[y][0].score - r.byAgent[x][0].score).slice(0, 2);
  host.innerHTML = `<p class="src">${r.total} aberto(s) · ${r.resolved} já tratado(s) hoje${r.decision ? " · a decisão do dia fica na aba Hoje" : ""}.</p>` + B.AREA_ORDER.map(area => {
    const ids = B.AGENT_ORDER.filter(id => B.AGENTS[id].area === area);
    return `<div class="brain-area a-${area}"><div class="brain-area-h"><b>${esc(B.AREAS[area].name)}</b><span>${esc(B.AREAS[area].does)}</span></div><div class="brain-agents">${ids.map(id => { const a = B.AGENTS[id], list = open(id);
      return `<details class="panel brain-agent" id="agent-${id}" ${hot.includes(id) ? "open" : ""}><summary><span class="tile">${ico(a.icon)}</span><span><b>${a.name}</b><small>${a.does}</small></span><span class="badge ${list.length ? "p1" : "st-pub"}">${list.length ? list.length + " achado(s)" : "em ordem"}</span></summary>
        <div class="panel-body">${list.length ? `<ul class="brain-list">${list.map(row).join("")}</ul>` : `<p class="src">Nenhum achado agora. Regras deste agente: ${a.rules.join("; ")}.</p>`}</div></details>`; }).join("")}</div></div>`;
  }).join("");
  k.wire(host);
}
