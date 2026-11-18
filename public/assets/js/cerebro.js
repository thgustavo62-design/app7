/* Tela "Central de Inteligência": decisão do dia, mapa do cérebro (agentes e conexões), saúde por cliente, radar por área, memória.
   A inteligência está em brain.js (regras com evidência); aqui só se monta a tela e se guarda o que foi decidido. */
(function (root) {
  const B = root.N7Brain, A = root.N7Analysis;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let H = null;                                   /* ajudantes do app.js */
  const run = () => B.run(H.input());
  const tone = s => (s >= 80 ? "p0" : s >= 60 ? "p1" : "");
  const dow = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const dateTxt = iso => { const d = A.parse(iso); return `${dow[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
  const agentName = id => (B.AGENTS[id] || {}).name || id;
  const LEVEL = { ok: ["Em ordem", "st-pub"], atencao: ["Atenção", "p1"], risco: ["Em risco", "p0"] };

  function mark(f, status) {
    const days = { feita: 0, adiada: 2, ignorada: 14 }[status], list = JSON.parse(JSON.stringify(H.store.get("decisions", [])));
    const entry = { chave: f.chave, agente: f.agente, marca: f.marca || "", titulo: f.titulo.slice(0, 200), status, ate: B.plus(H.today, days), nota: "" };
    const i = list.findIndex(x => x.chave === f.chave);
    if (i >= 0) list[i] = Object.assign({}, entry, { v: list[i].v }); else list.push(entry);
    H.store.set("decisions", list);
    H.toast({ feita: "Marcado como feito. Volta amanhã se ainda for um problema.", adiada: "Adiado por 2 dias.", ignorada: "Ignorado por 14 dias." }[status]);
  }
  const goBtn = f => f.link ? `<button type="button" class="btn sm" data-go="${H.esc(f.link.route)}" data-brand="${H.esc(f.link.brand || "")}" ${f.link.ideas ? 'data-ideas="1"' : ""}>Abrir</button>` : "";
  const acts = f => `${goBtn(f)}${H.canWrite ? `<button type="button" class="btn sm" data-mark="feita" data-key="${H.esc(f.chave)}">Feito</button><button type="button" class="btn sm" data-mark="adiada" data-key="${H.esc(f.chave)}">Adiar 2 dias</button><button type="button" class="btn sm" data-mark="ignorada" data-key="${H.esc(f.chave)}">Ignorar</button>` : ""}`;
  const flag = f => (f.reincidente ? `<span class="badge p0" title="Marcado como tratado e o problema continua">reincidente</span>` : "");
  const links = f => (f.rel && f.rel.length ? `<p class="src"><b>Ligado a:</b> ${f.rel.slice(0, 3).map(x => H.esc(agentName(x.agente) + ": " + x.titulo.replace(/^.*? · /, ""))).join(" · ")}</p>` : "");

  function heroHtml(r) {
    const d = r.decision;
    if (!d) return `<section class="brain-hero calm"><p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p><h2>Tudo tranquilo por enquanto.</h2><p class="lead">Nenhum agente encontrou algo que peça ação hoje${r.resolved ? `, e ${r.resolved} item(ns) já foram tratados.` : "."} Aproveite para adiantar o calendário ou revisar o que está funcionando.</p></section>`;
    const why = d.evidencia.map(e => `<li>${H.esc(e)}</li>`).join("") + d.rel.slice(0, 3).map(x => `<li><b>${H.esc(agentName(x.agente))}:</b> ${H.esc(x.texto || x.titulo)}</li>`).join("");
    return `<section class="brain-hero">
      <div class="brain-tags"><span class="badge ${tone(d.score)}">${H.esc(d.urgencia)} · nota ${d.score}/100</span><span class="badge">${H.esc(agentName(d.agente))}</span>${d.nome ? `<span class="badge">${H.esc(d.nome)}</span>` : ""}${flag(d)}</div>
      <p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p>
      <h2>${H.esc(d.titulo)}</h2><p class="lead">${H.esc(d.detalhe)}</p>
      <div class="brain-cols"><div><span class="col-title">Por que esta?</span><ul class="plain">${why}<li>Foi a de maior nota entre ${r.total} achado(s) abertos.</li></ul></div>
        <div><span class="col-title">O que fazer</span><p>${H.esc(d.acao)}</p></div></div>
      <div class="toolbar">${acts(d)}</div></section>`;
  }
  const smallCard = f => `<article class="brain-card"><div class="brain-tags"><span class="badge ${tone(f.score)}">${H.esc(f.urgencia || "")}${f.urgencia ? " · " : ""}${f.score}</span><span class="badge">${H.esc(agentName(f.agente))}</span>${flag(f)}</div><h3>${H.esc(f.titulo)}</h3><p>${H.esc(f.detalhe)}</p><div class="toolbar">${acts(f)}</div></article>`;
  const row = f => `<li class="brain-row"><div class="brain-row-h"><span class="badge ${tone(f.score)}">${f.score}</span><b>${H.esc(f.titulo)}</b>${flag(f)}</div><p>${H.esc(f.detalhe)}</p><p class="src"><b>Ação:</b> ${H.esc(f.acao)}</p>${links(f)}<div class="toolbar">${acts(f)}</div></li>`;

  /* ---------- mapa: agentes em anel, ligações que dispararam hoje em roxo ---------- */
  function mapHtml(r) {
    const W = 860, Hh = 470, cx = W / 2, cy = Hh / 2, rx = 345, ry = 175;
    const ids = B.AREA_ORDER.flatMap(a => B.AGENT_ORDER.filter(id => B.AGENTS[id].area === a));
    const pos = {}; ids.forEach((id, i) => { const t = -Math.PI / 2 + (i / ids.length) * Math.PI * 2; pos[id] = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }; });
    const count = id => (r.byAgent[id] || []).filter(f => f.kind === "acao").length, top = id => Math.max(0, ...(r.byAgent[id] || []).filter(f => f.kind === "acao").map(f => f.score));
    const curve = (a, b) => { const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * .38, my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * .38; return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`; };
    const spokes = ids.map(id => `<line x1="${cx}" y1="${cy}" x2="${pos[id].x.toFixed(1)}" y2="${pos[id].y.toFixed(1)}" class="bm-spoke"/>`).join("");
    const lines = r.sinapses.flatMap(s => s.de.flatMap(d => s.para.filter(p => pos[d] && pos[p] && d !== p).map(p => `<path d="${curve(pos[d], pos[p])}" class="bm-syn" style="stroke-width:${Math.min(5, 1.6 + s.qtd * .8).toFixed(1)}"><title>${H.esc(s.nome)}</title></path>`))).join("");
    const nodes = ids.map(id => { const a = B.AGENTS[id], p = pos[id], n = count(id), t = top(id), rad = 17 + Math.min(7, n * 1.5);
      return `<g class="bm-node a-${a.area}${n ? " has" : ""}" data-agent="${id}" tabindex="0" role="button" aria-label="${H.esc(a.name)}: ${n ? n + " achado(s)" : "em ordem"}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
        ${t >= 80 ? `<circle r="${rad + 7}" class="bm-pulse"/>` : ""}<circle r="${rad}" class="bm-dot"/><text class="bm-n" y="5" text-anchor="middle">${n || ""}</text>
        <text class="bm-l" y="${rad + 15}" text-anchor="middle">${H.esc(a.name)}</text><title>${H.esc(a.name)} · ${n ? n + " achado(s), maior nota " + t : "em ordem"}</title></g>`; }).join("");
    const hub = `<g class="bm-hub" transform="translate(${cx} ${cy})"><circle r="54" class="bm-hub-ring"/><circle r="42" class="bm-hub-dot"/><text y="-2" text-anchor="middle" class="bm-hub-t">Maestro</text><text y="13" text-anchor="middle" class="bm-hub-s">${r.total} abertos</text></g>`;
    const legend = B.AREA_ORDER.map(a => `<span class="bm-key a-${a}"><i></i>${H.esc(B.AREAS[a].name)}</span>`).join("");
    const syn = r.sinapses.length ? `<ul class="brain-list">${r.sinapses.map(s => `<li class="brain-row"><div class="brain-row-h"><span class="badge st-apr">${s.qtd}×</span><b>${H.esc(s.nome)}</b></div><p class="src">${s.de.map(agentName).join(" + ")} → ${s.para.map(x => x === "todos" ? "todos os agentes" : agentName(x)).join(" / ")}</p><ul class="plain">${s.casos.slice(0, 3).map(c => `<li>${c.nome ? `<b>${H.esc(c.nome)}:</b> ` : ""}${H.esc(c.texto)}</li>`).join("")}</ul></li>`).join("")}</ul>`
      : `<p class="src">Nenhuma conexão disparou hoje: os agentes não encontraram achados que se relacionem.</p>`;
    return `<div class="panel">${H.banner("target", "Mapa do cérebro", "cada agente é um ponto; as linhas roxas são as conexões que dispararam hoje")}<div class="panel-body">
      <div class="brain-map"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Mapa dos 14 agentes e das conexões ativas hoje">${spokes}${lines}${hub}${nodes}</svg></div>
      <div class="bm-legend">${legend}<span class="bm-key"><i class="syn"></i>conexão ativa hoje</span></div>
      <div class="section-title"><h2>Conexões ativas hoje</h2><span>${r.sinapses.length} de ${B.SYNAPSES.length}</span></div>${syn}</div></div>`;
  }

  function clientsHtml(r) {
    if (!r.clientes.length) return "";
    const order = r.clientes.slice().sort((a, b) => a.saude - b.saude);
    return `<div class="section-title"><h2>Saúde dos clientes</h2><span>nota de 0 a 100 somando o que todos os agentes dizem de cada um${r.risk ? ` · ${r.risk} em risco` : ""}</span></div>
      <div class="grid g2">${order.map(c => { const [lab, cls] = LEVEL[c.nivel];
        return `<article class="brain-card health-card"><div class="brain-row-h"><b>${H.esc(c.name)}</b><span class="badge ${cls}">${lab}</span></div>
          <div class="health-bar" role="img" aria-label="Saúde ${c.saude} de 100"><i class="lv-${c.nivel}" style="width:${c.saude}%"></i></div>
          <div class="health-n"><b>${c.saude}</b><span>/100 · ${c.achados} achado(s)${c.ganhos ? ` · ${c.ganhos} ganho(s)` : ""}</span></div>
          ${c.top.length ? `<ul class="plain">${c.top.map(f => `<li><b>${H.esc(agentName(f.agente))}:</b> ${H.esc(f.titulo.replace(/^.*?: /, ""))}</li>`).join("")}</ul>` : `<p class="src">Nenhum achado aberto.</p>`}
          ${c.id ? `<div class="toolbar"><button type="button" class="btn sm" data-go="${H.esc(c.id)}">Abrir cliente</button></div>` : ""}</article>`; }).join("")}</div>`;
  }

  function memoryHtml(r) {
    const m = r.memoria; if (!m.voltou.length && !m.resolveu.length) return "";
    return `<div class="panel">${H.banner("clock", "Memória do cérebro", "o que voltou depois de tratado e o que de fato foi resolvido")}<div class="panel-body"><div class="grid g2">
      <div><span class="col-title">Voltaram (${m.voltou.length})</span>${m.voltou.length ? `<ul class="plain">${m.voltou.map(f => `<li><b>${H.esc(f.nome || agentName(f.agente))}:</b> ${H.esc(f.titulo.replace(/^.*?: /, ""))}</li>`).join("")}</ul>` : `<p class="src">Nada voltou depois de marcado.</p>`}</div>
      <div><span class="col-title">Resolvidos (${m.resolveu.length})</span>${m.resolveu.length ? `<ul class="plain">${m.resolveu.slice(0, 8).map(d => `<li>${H.esc(d.titulo)} <small class="src">(feito em ${dm(d.em)})</small></li>`).join("")}</ul>` : `<p class="src">Ainda não há itens marcados como feitos que tenham deixado de aparecer.</p>`}</div></div></div></div>`;
  }

  function agentsHtml(r) {
    const hot = B.AGENT_ORDER.filter(id => r.byAgent[id].some(f => f.kind === "acao" && !(r.decision && f.chave === r.decision.chave))).sort((x, y) => r.byAgent[y][0].score - r.byAgent[x][0].score).slice(0, 2);   /* só os 2 mais quentes abrem sozinhos */
    return B.AREA_ORDER.map(area => { const ids = B.AGENT_ORDER.filter(id => B.AGENTS[id].area === area);
      return `<div class="brain-area a-${area}"><div class="brain-area-h"><b>${H.esc(B.AREAS[area].name)}</b><span>${H.esc(B.AREAS[area].does)}</span></div><div class="brain-agents">${ids.map(id => { const a = B.AGENTS[id], list = r.byAgent[id].filter(f => f.kind === "acao" && !(r.decision && f.chave === r.decision.chave));
        return `<details class="panel brain-agent" id="agent-${id}" ${hot.includes(id) ? "open" : ""}><summary><span class="tile">${H.ico(a.icon)}</span><span><b>${a.name}</b><small>${a.does}</small></span><span class="badge ${list.length ? "p1" : "st-pub"}">${list.length ? list.length + " achado(s)" : "em ordem"}</span></summary>
          <div class="panel-body">${list.length ? `<ul class="brain-list">${list.map(row).join("")}</ul>` : `<p class="src">Nenhum achado agora. Regras deste agente: ${a.rules.join("; ")}.</p>`}</div></details>`; }).join("")}</div></div>`; }).join("");
  }

  function render(view, helpers) {
    H = helpers;
    const r = run();
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Central de Inteligência</div><h1>O que fazer hoje</h1>
        <p>14 agentes olham cada parte do negócio e conversam entre si. O maestro escolhe o que mais importa agora. Tudo por regras que você pode conferir: nada de caixa-preta.</p></div></div>
      ${heroHtml(r)}
      ${r.also.length ? `<div class="section-title"><h2>Também hoje</h2><span>os próximos mais importantes, de agentes e clientes diferentes</span></div><div class="grid g2">${r.also.map(smallCard).join("")}</div>` : ""}
      ${clientsHtml(r)}
      ${mapHtml(r)}
      <div class="section-title"><h2>Radar dos agentes</h2><span>${r.total} aberto(s) · ${r.resolved} já tratado(s) hoje</span></div>
      ${agentsHtml(r)}
      ${memoryHtml(r)}
      ${r.wins.length ? `<div class="panel">${H.banner("target", "O que está funcionando", "ganhos para manter ou ampliar com cuidado")}<div class="panel-body"><ul class="brain-list">${r.wins.map(f => `<li class="brain-row"><div class="brain-row-h"><span class="badge st-pub">ganho</span><b>${H.esc(f.titulo)}</b></div><p>${H.esc(f.detalhe)}</p></li>`).join("")}</ul></div></div>` : ""}
      <details class="panel brain-how"><summary>${H.banner("file", "Como o cérebro pensa", "as regras de cada agente, as conexões e como a nota é calculada")}</summary><div class="panel-body">
        <p>A nota (0 a 100) combina <b>urgência</b> (quantos dias faltam ou de atraso), <b>impacto</b> (vendas e anúncios pesam mais) e <b>confiança</b> (base pequena, feriado, dado velho ou arredondado reduzem). Achados já tratados somem até a data escolhida e voltam, marcados como reincidentes, se o problema continuar.</p>
        <div class="section-title"><h2>As conexões</h2><span>quando um agente fala com outro</span></div>
        <ul class="brain-list">${B.SYNAPSES.map(s => `<li class="brain-row"><div class="brain-row-h"><b>${H.esc(s.nome)}</b></div><p>${H.esc(s.texto)}</p></li>`).join("")}</ul>
        <div class="section-title"><h2>As regras de cada agente</h2></div>
        <div class="grid g2">${B.AGENT_ORDER.map(id => { const a = B.AGENTS[id]; return `<div><span class="col-title">${a.name} · ${B.AREAS[a.area].name}</span><p class="src">${a.does}</p><ul class="plain">${a.rules.map(x => `<li>${x}</li>`).join("")}</ul></div>`; }).join("")}</div></div></details>
      <p class="src">Fontes de hoje: calendário (${H.esc(r.sources.calendario)}) · semana analisada: ${H.esc(r.sources.semana)} · ${r.sources.clientes} cliente(s). A parte da Meta (Windsor.ai) entra quando for conectada.</p>`;
    const every = [r.decision, ...r.also, ...r.radar, ...r.memoria.voltou].filter(Boolean).concat(Object.values(r.byAgent).flat());
    $$("[data-mark]", view).forEach(b => b.addEventListener("click", () => { const f = every.find(x => x.chave === b.dataset.key); if (f) { mark(f, b.dataset.mark); render(view, H); } }));
    $$("[data-go]", view).forEach(b => b.addEventListener("click", () => H.go(b.dataset.go, b.dataset.brand, !!b.dataset.ideas)));
    const open = id => { const d = $("#agent-" + id, view); if (d) { d.open = true; d.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); } };
    $$(".bm-node", view).forEach(g => { g.addEventListener("click", () => open(g.dataset.agent)); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(g.dataset.agent); } }); });
  }

  /* cartão resumido para o Painel */
  function mini(helpers) {
    H = helpers; const r = run(), d = r.decision;
    if (!d) return `<a class="brain-mini calm" href="#cerebro"><span class="badge st-pub">Central de Inteligência</span><b>Tudo tranquilo por enquanto.</b><small>Nenhum agente pede ação hoje.</small></a>`;
    return `<a class="brain-mini" href="#cerebro"><span class="badge ${tone(d.score)}">Decisão do dia · ${H.esc(d.urgencia)}</span><b>${H.esc(d.titulo)}</b><small>${H.esc(d.acao)} ${r.also.length ? `Mais ${r.also.length} para hoje.` : ""}${r.risk ? ` ${r.risk} cliente(s) em risco.` : ""}</small></a>`;
  }
  root.N7CerebroUI = { render, mini };
})(typeof window !== "undefined" ? window : globalThis);
