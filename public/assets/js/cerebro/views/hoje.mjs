/* Subaba "Hoje": a decisão do dia, o que mais pede atenção e o que está funcionando. */
export const title = { eyebrow: "Central de Inteligência", h1: "O que fazer hoje", lead: "26 agentes olham cada parte do negócio e conversam entre si. O maestro escolhe o que mais importa agora. Tudo por regras que você pode conferir: nada de caixa-preta." };

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
    <div id="brain-ps"></div>
    <p class="src">Fontes de hoje: calendário (${esc(r.sources.calendario)}) · semana analisada: ${esc(r.sources.semana)} · ${r.sources.clientes} cliente(s). A parte da Meta (Windsor.ai) entra quando for conectada.</p>`;
  k.wire(host);
  psPainel(host, k);
}

/* quando e como os agentes rodaram no computador da agência (PowerShell): hora, núcleos, tempo, e cada agente */
function psPainel(host, k) {
  const el = host.querySelector("#brain-ps"); if (!el) return; const { esc, H } = k;
  fetch("/api/leitura?acao=cerebro", { headers: { "X-N7": "1" } }).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!el.isConnected) return;
    if (!j || !j.cerebro) { el.innerHTML = `<div class="panel">${H.banner("spark", "Agentes no computador da agência (PowerShell)", "ainda não rodaram")}<div class="panel-body"><p class="src">Ligue o <code>Agente.ps1</code> no computador da agência: ele roda os 26 agentes sozinho, usando o processador dele, e o resultado aparece aqui.</p></div></div>`; return; }
    const c = j.cerebro, min = Math.round((Date.now() - new Date(j.publicadoEm).getTime()) / 60000), velho = min > 120, hh = new Date(j.publicadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const ex = c.execucao || {}, ag = c.agentes || [];
    el.innerHTML = `<div class="panel">${H.banner("spark", "Agentes no computador da agência (PowerShell)", `rodado às ${hh} (há ${min < 60 ? min + " min" : Math.round(min / 60) + " h"}) em ${esc(c.computador || "computador da agência")}`)}<div class="panel-body">
      ${velho ? `<p class="notice">A última execução foi há mais de 2 horas: o computador da agência pode estar desligado ou o <code>Agente.ps1</code> parado.</p>` : ""}
      <p><b>${ag.length} funções de agente</b> (${(c.cerebro && c.cerebro.porAgente ? Object.keys(c.cerebro.porAgente).length : 26)} agentes) em até <b>${ex.nucleosUsados || "?"} núcleo(s)</b> em <b>${((ex.tempoTotalMs || 0) / 1000).toFixed(1)} s</b>; achados abertos: <b>${c.cerebro ? c.cerebro.total : "?"}</b>${c.cerebro && c.cerebro.decisao ? ` · decisão calculada lá: <b>${esc(c.cerebro.decisao.titulo)}</b>` : ""}.</p>
      <details><summary>Ver cada agente (núcleo, tempo e achados)</summary><div class="table-wrap"><table><thead><tr><th>Agente</th><th class="num">Núcleo</th><th class="num">Tempo</th><th class="num">Achados</th></tr></thead><tbody>${ag.map(a => `<tr><td>${esc(a.runner)}</td><td class="num">${a.nucleo}</td><td class="num">${a.ms} ms</td><td class="num">${a.achados}</td></tr>`).join("")}</tbody></table></div></details></div></div>`;
  }).catch(() => { /* sem painel */ });
}
