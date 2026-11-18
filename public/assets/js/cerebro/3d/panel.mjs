/* Painel de detalhes ao lado do 3D: o que é o agente / serviço / cliente selecionado, com tudo o que importa sobre ele.
   Devolve HTML; os botões data-pick="tipo:id" trocam a seleção (quem monta a tela cuida disso). */
import { AGENTS, AREAS, SYNAPSES, SERVICE_AGENTS, servicesOf } from "../../brain/catalog.mjs";

export function panelFor(k, node) {
  if (!node) return `<div class="sc-empty"><b>Escolha um ponto</b><p class="src">Toque ou clique em um agente, serviço ou cliente para ver o que ele faz, o que encontrou e com quem conversa.</p></div>`;
  if (node.type === "agent") return agentPanel(k, node.ref);
  if (node.type === "service") return servicePanel(k, node.ref);
  if (node.type === "client") return clientPanel(k, node.ref);
  return hubPanel(k);
}
const pick = (type, id, label, cls = "") => `<button type="button" class="chip ${cls}" data-pick="${type}:${id}">${label}</button>`;
const head = (k, tile, name, badges) => `<div class="sc-head"><span class="tile">${tile}</span><div><b>${name}</b><div class="brain-tags">${badges}</div></div></div>`;

function agentPanel(k, id) {
  const { r, esc, row, services } = k, a = AGENTS[id], list = (r.byAgent[id] || []).filter(f => f.kind === "acao");
  const syn = SYNAPSES.filter(s => s.de.includes(id) || s.para.includes(id)), firedIds = new Set(r.sinapses.map(s => s.id));
  const svcs = servicesOf(id).filter(s => services.SERVICES[s]);
  const brands = [...new Set(list.map(f => f.marca).filter(Boolean))].map(m => r.clientes.find(c => c.key === m)).filter(Boolean);
  return `${head(k, k.H.ico(a.icon), esc(a.name), `<span class="badge a-${a.area} area-b">${esc(AREAS[a.area].name)}</span><span class="badge ${list.length ? "p1" : "st-pub"}">${list.length ? list.length + " achado(s)" : "em ordem"}</span>`)}
    <p>${esc(a.does)}</p>
    <span class="col-title">Regras</span><ul class="plain">${a.rules.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    ${syn.length ? `<span class="col-title">Conversa com</span><ul class="plain">${syn.map(s => `<li>${esc(s.nome)} ${firedIds.has(s.id) ? '<span class="badge st-apr">ativa hoje</span>' : ""}</li>`).join("")}</ul>` : ""}
    ${svcs.length ? `<span class="col-title">Trabalha para os serviços</span><div class="chips">${svcs.map(s => pick("service", s, esc(services.SERVICES[s].short || services.SERVICES[s].name))).join("")}</div>` : ""}
    ${brands.length ? `<span class="col-title">Clientes com achado</span><div class="chips">${brands.map(c => pick("client", c.key, esc(c.name), "lv-" + c.nivel)).join("")}</div>` : ""}
    <span class="col-title">Achados abertos</span>${list.length ? `<ul class="brain-list">${list.slice(0, 5).map(row).join("")}</ul>${list.length > 5 ? `<p class="src">Mais ${list.length - 5} na aba Radar.</p>` : ""}` : `<p class="src">Nenhum achado agora: este agente não viu nada que peça ação.</p>`}`;
}

function servicePanel(k, id) {
  const { r, esc, services, input, moduleName } = k, s = services.SERVICES[id]; if (!s) return "";
  const users = input.clients.filter(c => (c.services || []).includes(id)), ags = SERVICE_AGENTS[id] || [];
  const keys = new Set(users.map(c => c.key)), found = ags.flatMap(a => (r.byAgent[a] || []).filter(f => f.kind === "acao" && keys.has(f.marca)));
  return `${head(k, k.H.ico(s.icon || "target"), esc(s.name), `<span class="badge">${users.length} cliente(s)</span><span class="badge ${found.length ? "p1" : "st-pub"}">${found.length} achado(s) abertos</span>`)}
    <p>${esc(s.desc)}</p>
    <span class="col-title">O que o painel do cliente mostra</span><ul class="plain">${(s.modules || []).map(m => `<li>${esc(moduleName(m))}</li>`).join("")}</ul>
    <span class="col-title">Clientes que contratam</span>${users.length ? `<div class="chips">${users.map(c => { const h = r.clientes.find(x => x.key === c.key); return pick("client", c.key, esc(c.name), h ? "lv-" + h.nivel : ""); }).join("")}</div>` : `<p class="src">Nenhum cliente com este serviço.</p>`}
    <span class="col-title">Agentes que trabalham para ele</span><div class="chips">${ags.map(a => pick("agent", a, esc(AGENTS[a].name))).join("")}</div>
    ${found.length ? `<span class="col-title">Mais urgentes agora</span><ul class="brain-list">${found.sort((x, y) => y.score - x.score).slice(0, 3).map(k.row).join("")}</ul>` : ""}`;
}

function clientPanel(k, key) {
  const { r, esc, services, input, LEVEL, agentName } = k, c = input.clients.find(x => x.key === key), h = r.clientes.find(x => x.key === key); if (!c || !h) return "";
  const [lab, cls] = LEVEL[h.nivel];
  return `${head(k, k.H.ico("home"), esc(c.name), `<span class="badge ${cls}">${lab}</span><span class="badge">saúde ${h.saude}/100</span>`)}
    <div class="health-bar" role="img" aria-label="Saúde ${h.saude} de 100"><i class="lv-${h.nivel}" style="width:${h.saude}%"></i></div>
    <span class="col-title">Serviços contratados</span><div class="chips">${(c.services || []).filter(s => services.SERVICES[s]).map(s => pick("service", s, esc(services.SERVICES[s].short || services.SERVICES[s].name))).join("") || '<span class="src">nenhum</span>'}</div>
    <span class="col-title">Agentes com achado neste cliente</span><div class="chips">${h.agentes.map(a => pick("agent", a, esc(agentName(a)))).join("") || '<span class="src">nenhum</span>'}</div>
    <span class="col-title">Principais achados</span>${h.top.length ? `<ul class="brain-list">${h.top.map(k.row).join("")}</ul>` : `<p class="src">Nenhum achado aberto.</p>`}
    ${c.id ? `<div class="toolbar"><button type="button" class="btn sm" data-go="${esc(c.id)}">Abrir cliente</button></div>` : ""}`;
}

function hubPanel(k) {
  const { r, esc } = k;
  return `${head(k, k.H.ico("target"), "Maestro", `<span class="badge">${r.total} aberto(s)</span>`)}
    <p>Junta o que os 14 agentes encontraram, aplica as conexões e a memória e escolhe a decisão do dia.</p>
    ${r.decision ? `<span class="col-title">Decisão de hoje</span><p><b>${esc(r.decision.titulo)}</b></p><p class="src">${esc(r.decision.acao)}</p>` : `<p class="src">Hoje nenhum agente pede ação.</p>`}`;
}
