/* Subaba "Clientes": saúde de 0 a 100 de cada cliente, somando o que todos os agentes dizem dele. */
export const title = { eyebrow: "Central de Inteligência", h1: "Saúde dos clientes", lead: "Nota de 0 a 100 somando o que todos os agentes dizem de cada cliente. Quanto mais frentes abertas e quanto maior a nota delas, menor a saúde." };

export function render(host, k) {
  const { r, esc, agentName, LEVEL } = k;
  if (!r.clientes.length) { host.innerHTML = `<p class="src">Nenhum cliente cadastrado ainda.</p>`; return; }
  const order = r.clientes.slice().sort((a, b) => a.saude - b.saude);
  host.innerHTML = `<div class="grid g2">${order.map(c => { const [lab, cls] = LEVEL[c.nivel];
    return `<article class="brain-card health-card"><div class="brain-row-h"><b>${esc(c.name)}</b><span class="badge ${cls}">${lab}</span></div>
      <div class="health-bar" role="img" aria-label="Saúde ${c.saude} de 100"><i class="lv-${c.nivel}" style="width:${c.saude}%"></i></div>
      <div class="health-n"><b>${c.saude}</b><span>/100 · ${c.achados} achado(s)${c.ganhos ? ` · ${c.ganhos} ganho(s)` : ""}</span></div>
      ${c.top.length ? `<ul class="plain">${c.top.map(f => `<li><b>${esc(agentName(f.agente))}:</b> ${esc(f.titulo.replace(/^.*?: /, ""))}</li>`).join("")}</ul>` : `<p class="src">Nenhum achado aberto.</p>`}
      ${c.id ? `<div class="toolbar"><button type="button" class="btn sm" data-go="${esc(c.id)}">Abrir cliente</button></div>` : ""}</article>`; }).join("")}</div>`;
  k.wire(host);
}
