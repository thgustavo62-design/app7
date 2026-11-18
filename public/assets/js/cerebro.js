/* Tela "Central de Inteligência": decisão do dia, "também hoje", radar por agente e o que está funcionando.
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
  const agentName = id => (B.AGENTS[id] || {}).name || id;

  function heroHtml(r) {
    const d = r.decision;
    if (!d) return `<section class="brain-hero calm"><p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p><h2>Tudo tranquilo por enquanto.</h2><p class="lead">Nenhum agente encontrou algo que peça ação hoje${r.resolved ? `, e ${r.resolved} item(ns) já foram tratados.` : "."} Aproveite para adiantar o calendário ou revisar o que está funcionando.</p></section>`;
    return `<section class="brain-hero">
      <div class="brain-tags"><span class="badge ${tone(d.score)}">${H.esc(d.urgencia)} · nota ${d.score}/100</span><span class="badge">${H.esc(agentName(d.agente))}</span>${d.nome ? `<span class="badge">${H.esc(d.nome)}</span>` : ""}</div>
      <p class="eyebrow">Decisão do dia · ${dateTxt(r.today)}</p>
      <h2>${H.esc(d.titulo)}</h2><p class="lead">${H.esc(d.detalhe)}</p>
      <div class="brain-cols"><div><span class="col-title">Por que esta?</span><ul class="plain">${d.evidencia.map(e => `<li>${H.esc(e)}</li>`).join("")}<li>Foi a de maior nota entre ${r.total} achado(s) abertos.</li></ul></div>
        <div><span class="col-title">O que fazer</span><p>${H.esc(d.acao)}</p></div></div>
      <div class="toolbar">${acts(d)}</div></section>`;
  }
  const smallCard = f => `<article class="brain-card"><div class="brain-tags"><span class="badge ${tone(f.score)}">${H.esc(f.urgencia || "")}${f.urgencia ? " · " : ""}${f.score}</span><span class="badge">${H.esc(agentName(f.agente))}</span></div><h3>${H.esc(f.titulo)}</h3><p>${H.esc(f.detalhe)}</p><div class="toolbar">${acts(f)}</div></article>`;
  const row = f => `<li class="brain-row"><div class="brain-row-h"><span class="badge ${tone(f.score)}">${f.score}</span><b>${H.esc(f.titulo)}</b></div><p>${H.esc(f.detalhe)}</p><p class="src"><b>Ação:</b> ${H.esc(f.acao)}</p><div class="toolbar">${acts(f)}</div></li>`;

  function render(view, helpers) {
    H = helpers;
    const r = run();
    const open = B.AGENT_ORDER.filter(id => r.byAgent[id].length);
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Central de Inteligência</div><h1>O que fazer hoje</h1>
        <p>Cada agente olha uma parte do negócio e o maestro escolhe o que mais importa agora. Tudo por regras que você pode conferir: nada de caixa-preta.</p></div></div>
      ${heroHtml(r)}
      ${r.also.length ? `<div class="section-title"><h2>Também hoje</h2><span>os próximos mais importantes, de agentes e clientes diferentes</span></div><div class="grid g2">${r.also.map(smallCard).join("")}</div>` : ""}
      <div class="section-title"><h2>Radar dos agentes</h2><span>${r.total} aberto(s) · ${r.resolved} já tratado(s) hoje</span></div>
      <div class="brain-agents">${B.AGENT_ORDER.map(id => { const a = B.AGENTS[id], list = r.byAgent[id].filter(f => f.kind === "acao" && !(r.decision && f.chave === r.decision.chave));
        return `<details class="panel brain-agent" ${list.length && open.indexOf(id) < 2 ? "open" : ""}><summary><span class="tile">${H.ico(a.icon)}</span><span><b>${a.name}</b><small>${a.does}</small></span><span class="badge ${list.length ? "p1" : "st-pub"}">${list.length ? list.length + " achado(s)" : "em ordem"}</span></summary>
          <div class="panel-body">${list.length ? `<ul class="brain-list">${list.map(row).join("")}</ul>` : `<p class="src">Nenhum achado agora. Regras deste agente: ${a.rules.join("; ")}.</p>`}</div></details>`; }).join("")}</div>
      ${r.wins.length ? `<div class="panel">${H.banner("target", "O que está funcionando", "ganhos para manter ou ampliar com cuidado")}<div class="panel-body"><ul class="brain-list">${r.wins.map(f => `<li class="brain-row"><div class="brain-row-h"><span class="badge st-pub">ganho</span><b>${H.esc(f.titulo)}</b></div><p>${H.esc(f.detalhe)}</p></li>`).join("")}</ul></div></div>` : ""}
      <details class="panel brain-how"><summary>${H.banner("file", "Como o cérebro pensa", "as regras de cada agente e como a nota é calculada")}</summary><div class="panel-body">
        <p>A nota (0 a 100) combina <b>urgência</b> (quantos dias faltam ou de atraso), <b>impacto</b> (vendas e anúncios pesam mais) e <b>confiança</b> (base pequena, feriado ou dado arredondado reduzem). Achados já tratados somem até a data escolhida e voltam se o problema continuar.</p>
        <div class="grid g2">${B.AGENT_ORDER.map(id => { const a = B.AGENTS[id]; return `<div><span class="col-title">${a.name}</span><p class="src">${a.does}</p><ul class="plain">${a.rules.map(x => `<li>${x}</li>`).join("")}</ul></div>`; }).join("")}</div></div></details>
      <p class="src">Fontes de hoje: calendário (${H.esc(r.sources.calendario)}) · semana analisada: ${H.esc(r.sources.semana)} · ${r.sources.clientes} cliente(s). A parte da Meta (Windsor.ai) entra quando for conectada.</p>`;
    const all = [r.decision, ...r.also, ...r.radar].filter(Boolean);
    $$("[data-mark]", view).forEach(b => b.addEventListener("click", () => { const f = all.concat(Object.values(r.byAgent).flat()).find(x => x.chave === b.dataset.key); if (f) { mark(f, b.dataset.mark); render(view, H); } }));
    $$("[data-go]", view).forEach(b => b.addEventListener("click", () => H.go(b.dataset.go, b.dataset.brand, !!b.dataset.ideas)));
  }

  /* cartão resumido para o Painel */
  function mini(helpers) {
    H = helpers; const r = run(), d = r.decision;
    if (!d) return `<a class="brain-mini calm" href="#cerebro"><span class="badge st-pub">Central de Inteligência</span><b>Tudo tranquilo por enquanto.</b><small>Nenhum agente pede ação hoje.</small></a>`;
    return `<a class="brain-mini" href="#cerebro"><span class="badge ${tone(d.score)}">Decisão do dia · ${H.esc(d.urgencia)}</span><b>${H.esc(d.titulo)}</b><small>${H.esc(d.acao)} ${r.also.length ? `Mais ${r.also.length} para hoje.` : ""}</small></a>`;
  }
  root.N7CerebroUI = { render, mini };
})(typeof window !== "undefined" ? window : globalThis);
