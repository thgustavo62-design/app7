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

/* cartão resumido para o Painel */
export function mini(H) {
  const k = makeKit(H, () => {}), r = k.r, d = r.decision, esc = k.esc;
  if (!d) return `<a class="brain-mini calm" href="#cerebro"><span class="badge st-pub">Central de Inteligência</span><b>Tudo tranquilo por enquanto.</b><small>Nenhum agente pede ação hoje.</small></a>`;
  return `<a class="brain-mini" href="#cerebro"><span class="badge ${k.tone(d.score)}">Decisão do dia · ${esc(d.urgencia)}</span><b>${esc(d.titulo)}</b><small>${esc(d.acao)} ${r.also.length ? `Mais ${r.also.length} para hoje.` : ""}${r.risk ? ` ${r.risk} cliente(s) em risco.` : ""}</small></a>`;
}
