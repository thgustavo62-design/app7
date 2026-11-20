/* Central de Inteligência (telas): barra de subabas no topo e uma subaba por arquivo em views/, carregadas só quando abertas.
   Para criar uma subaba: escreva views/<nome>.mjs exportando { title, render(host, kit) } e liste em TABS. */
import { makeKit } from "./kit.mjs";

export const TABS = [
  ["hoje", "Hoje", () => import("./views/hoje.mjs")],
  ["clientes", "Clientes", () => import("./views/clientes.mjs")],
  ["radar", "Radar", () => import("./views/radar.mjs")],
  ["agentes", "Agentes 3D", () => import("./views/agentes.mjs")],
  ["servicos", "Serviços 3D", () => import("./views/servicos.mjs")],
  ["conexoes", "Conexões", () => import("./views/conexoes.mjs")],
  ["memoria", "Memória", () => import("./views/memoria.mjs")],
  ["regras", "Como pensa", () => import("./views/regras.mjs")]
];
export const tabIds = TABS.map(t => t[0]);

export async function render(view, sub, H) {
  const id = tabIds.includes(sub) ? sub : "hoje", tab = TABS.find(t => t[0] === id);
  const again = () => render(view, sub, H);
  const k = makeKit(H, again), r = k.r;
  const badge = { clientes: r.risk ? `${r.risk}` : "", radar: r.total ? `${r.total}` : "", conexoes: r.sinapses.length ? `${r.sinapses.length}` : "", memoria: r.memoria.voltou.length ? `${r.memoria.voltou.length}` : "" };
  const nav = `<nav class="subtabs scroll" aria-label="Central de Inteligência">${TABS.map(([t, name]) => `<a href="#cerebro${t === "hoje" ? "" : "/" + t}" ${t === id ? 'aria-current="page"' : ""}>${name}${badge[t] ? ` <i class="tab-n${t === "clientes" ? " risk" : ""}">${badge[t]}</i>` : ""}</a>`).join("")}</nav>`;
  view.innerHTML = `${nav}<div class="page-head"><div><div class="eyebrow">Central de Inteligência</div><h1 id="cb-h1">…</h1><p id="cb-lead"></p></div></div><div id="cb-body"><p class="src">Carregando…</p></div>`;
  const mod = await tab[2]();
  if (!view.isConnected || !view.querySelector("#cb-body")) return;                   /* o usuário já trocou de tela */
  view.querySelector("#cb-h1").textContent = mod.title.h1; view.querySelector("#cb-lead").textContent = mod.title.lead;
  const body = view.querySelector("#cb-body"); body.innerHTML = "";
  await mod.render(body, k);
}

/* "O que precisa ser resolvido hoje": abre o Painel com os 5 itens mais importantes (cliente, problema, por quê, próxima ação e fonte) */
export function mini(H) {
  const k = makeKit(H, () => {}), r = k.r, esc = k.esc;
  const seen = new Set(), list = [r.decision, ...r.also, ...(r.radar || []).slice().sort((a, b) => b.score - a.score)].filter(f => f && f.kind !== "ganho" && !seen.has(f.chave) && seen.add(f.chave)).slice(0, 5);
  if (!list.length) return `<section class="today calm" id="today"><div class="today-h"><h2>O que resolver hoje</h2><span class="badge st-pub">tudo tranquilo</span></div><p class="src">Nenhum agente pede ação hoje${r.resolved ? `, e ${r.resolved} item(ns) já foram resolvidos` : ""}. Fontes: calendário (${esc(r.sources.calendario)}) · semana analisada: ${esc(r.sources.semana)}.</p></section>`;
  const row = f => `<li class="today-row"><div class="today-main"><div class="brain-tags"><span class="badge ${k.tone(f.score)}">${esc(f.urgencia || k.B.urgencia(f.score))} · ${f.score}</span>${f.nome ? `<span class="badge">${esc(f.nome)}</span>` : ""}<span class="badge" title="Agente que encontrou">${esc(k.agentName(f.agente))}</span>${k.flag(f)}</div>
    <b>${esc(f.titulo)}</b>${f.evidencia && f.evidencia[0] ? `<p class="src">Por quê: ${esc(f.evidencia[0])}</p>` : ""}<p><span class="src">Próxima ação:</span> ${esc(f.acao)}</p></div><div class="today-go">${k.goBtn(f)}</div></li>`;
  const mais = r.total > list.length ? `<a class="today-more" href="#cerebro/radar">Ver os outros ${r.total - list.length} no Radar</a>` : "";
  return `<section class="today" id="today"><div class="today-h"><h2>O que resolver hoje</h2><span class="src">${r.total} item(ns) em aberto${r.risk ? ` · ${r.risk} cliente(s) em risco` : ""}</span></div><ol class="today-list">${list.map(row).join("")}</ol>${mais}
    <p class="src today-src">Fontes: calendário (${esc(r.sources.calendario)}) · semana analisada: ${esc(r.sources.semana)} · ${r.sources.clientes} cliente(s). Cada item mostra o agente e a evidência; o detalhe está na <a href="#cerebro">Central de Inteligência</a>.</p></section>`;
}
export function wireToday(root, H) {
  root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => H.go(b.dataset.go, b.dataset.brand, !!b.dataset.ideas, { lista: b.dataset.lista, tipo: b.dataset.tipo, dia: b.dataset.dia })));
}

/* "O que o cérebro vê neste cliente": saúde e os achados em aberto (para a visão 360° da página do cliente) */
export function clientPanel(H, key) {
  const k = makeKit(H, () => {}), r = k.r, esc = k.esc, h = (r.clientes || []).find(x => x.key === key);
  const seen = new Set(), list = [r.decision, ...r.also, ...(r.radar || []).slice().sort((a, b) => b.score - a.score)].filter(f => f && f.marca === key && f.kind !== "ganho" && !seen.has(f.chave) && seen.add(f.chave)).slice(0, 3);
  const wins = (r.wins || []).filter(f => f.marca === key).slice(0, 2);
  const head = h ? `<div class="c360-health"><span class="badge ${(k.LEVEL[h.nivel] || ["", ""])[1]}">Saúde ${h.saude}/100 · ${esc((k.LEVEL[h.nivel] || [h.nivel])[0])}</span><span class="src">${h.achados} achado(s) em aberto, ${h.fortes} forte(s)</span></div>` : "";
  const row = f => `<li class="c360-row"><div class="brain-tags"><span class="badge ${k.tone(f.score)}">${esc(f.urgencia || k.B.urgencia(f.score))} · ${f.score}</span><span class="badge">${esc(k.agentName(f.agente))}</span></div><b>${esc(f.titulo.replace(/^.*?: /, ""))}</b><p class="src">${esc(f.acao)}</p><div class="today-go">${k.goBtn(f)}</div></li>`;
  return `<div id="c360-brain">${head}${list.length ? `<ul class="c360-list">${list.map(row).join("")}</ul>` : `<p class="src">Nenhum agente pede ação para este cliente agora.</p>`}${wins.length ? `<p class="src"><b>Funcionando:</b> ${wins.map(f => esc(f.titulo.replace(/^.*?: /, ""))).join(" · ")}</p>` : ""}</div>`;
}
