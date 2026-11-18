/* Montagem comum das abas 3D (Agentes e Serviços): cena à esquerda, painel de detalhes à direita (embaixo no celular)
   e, por baixo, a lista de botões, que também é o plano B quando o aparelho não abre 3D e a forma de usar só com o teclado. */
import { buildGraph, AREA_COLOR } from "../3d/graph.mjs";
import { panelFor } from "../3d/panel.mjs";

export async function mount(host, k, mode) {
  const { r, esc, services, input, B } = k;
  const svcList = services.ORDER.map(id => ({ id, name: services.SERVICES[id].name, short: services.SERVICES[id].short }));
  const graph = buildGraph({ r, clients: input.clients, services: svcList, mode });
  const chipOf = n => `<button type="button" class="chip ${n.type === "client" ? "lv-" + n.level : n.type === "agent" ? "a-" + n.area : ""}" data-node="${n.id}" aria-pressed="false">${esc(n.label)}${n.type === "agent" && n.count ? ` <i>${n.count}</i>` : ""}</button>`;
  const groups = mode === "servicos"
    ? [["Serviços", "service"], ["Clientes", "client"], ["Agentes", "agent"]]
    : [["Agentes", "agent"], ["Serviços", "service"]];
  host.innerHTML = `<div class="sc-wrap"><div class="sc-stage" role="group" aria-label="Cena 3D: ${mode === "servicos" ? "serviços, clientes e agentes" : "agentes e serviços"}"><div class="sc-labels"></div><p class="sc-hint">Arraste para girar · role ou use dois dedos para aproximar · toque num ponto para abrir</p></div>
      <aside class="sc-panel" aria-live="polite"></aside></div>
    <div class="sc-legend">${B.AREA_ORDER.map(a => `<span class="bm-key a-${a}"><i></i>${esc(B.AREAS[a].name)}</span>`).join("")}<span class="bm-key"><i class="svc"></i>serviço</span><span class="bm-key"><i class="syn"></i>conexão ativa hoje</span><span class="bm-key"><i class="sat"></i>achado em órbita</span></div>
    <nav class="sc-list" aria-label="Lista de pontos">${groups.map(([t, type]) => `<div><span class="col-title">${t}</span><div class="chips">${graph.nodes.filter(n => n.type === type).map(chipOf).join("")}</div></div>`).join("")}</nav>`;
  const stage = host.querySelector(".sc-stage"), panel = host.querySelector(".sc-panel");
  let ctrl = null;

  function show(id) {
    const node = id ? graph.by[id] : null;
    panel.innerHTML = panelFor(k, node);
    host.querySelectorAll("[data-node]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.node === id)));
    k.wire(panel);
    panel.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { const [type, ref] = b.dataset.pick.split(":"); choose({ agent: "a:", service: "s:", client: "c:" }[type] + ref); }));
  }
  function choose(id) {
    if (!graph.by[id]) { show(null); return; }        /* ex.: cliente que só existe na aba Serviços */
    if (ctrl) ctrl.select(id); else show(id);
  }
  host.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => choose(b.dataset.node)));
  show(null);

  try {
    const { mountScene } = await import("../3d/scene.mjs");
    if (!host.isConnected) return;
    ctrl = await mountScene(stage, graph, { onSelect: show });
    stage.classList.add("ok3d");
  } catch (e) {
    stage.classList.add("no3d");
    stage.innerHTML = `<div class="sc-fallback"><b>O 3D não abriu neste aparelho.</b><p class="src">Use a lista abaixo: ela mostra os mesmos agentes, serviços e clientes, com tudo o que o cérebro sabe sobre eles.</p></div>`;
    console.warn("3D indisponível:", e && e.message);
  }
  return { select: choose, AREA_COLOR };
}
