/* Tela "Relatórios": fechamento do mês de cada cliente, montado conforme os serviços que a Nova7 presta a ele,
   com PowerPoint para enviar ao cliente. O cálculo está em relatorio.js (funções puras). */
(function (root) {
  const A = root.N7Analysis, R = root.N7Relatorio, SV = root.N7Services, S = root.N7Store;
  const { brl, int, dec, dm } = A.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ui = Object.assign({ marca: "", inicio: "" }, (() => { try { return S.get("relatorios", {}) || {}; } catch (e) { return {}; } })());
  const isAdmin = () => !!root.N7User && root.N7User.tipo !== "cliente" && root.N7User.papel === "admin";
  const obsKey = (m, i) => `${m}|${i}`;
  const getObs = (m, i) => { try { return (S.get("relobs", {}) || {})[obsKey(m, i)] || ""; } catch (e) { return ""; } };
  const setObs = (m, i, t) => { try { const o = Object.assign({}, S.get("relobs", {}) || {}); if (t) o[obsKey(m, i)] = t; else delete o[obsKey(m, i)]; S.set("relobs", o); } catch (e) { /* sem armazenamento local */ } };
  const FONTE = { mes: "Números do mês inteiro (busca da Meta pelo período do mês).", semanas: "Soma das semanas inteiras dentro do mês.", misto: "Parte vem do mês inteiro e parte da soma das semanas.", vazio: "Ainda não há números deste mês." };

  function render(view, H) {
    const clients = H.clients().filter(c => (c.services || []).length);
    if (!clients.length) { view.innerHTML = `<div class="page-head"><div><h1>Relatórios</h1><p>Nenhum cliente com serviço cadastrado. Cadastre em Configurações.</p></div></div>`; return; }
    if (!clients.some(c => c.key === ui.marca)) ui.marca = clients[0].key;
    if (!ui.inicio || !/^\d{4}-\d{2}-01$/.test(ui.inicio)) ui.inicio = A.lastClosed("mes", new Date());
    const c = clients.find(x => x.key === ui.marca), weeks = S.get("weeks", []);
    const m = R.model({ client: c, weeks, inicio: ui.inicio, posts: H.posts() });
    const last = A.lastClosed("mes", new Date());
    const row = (k) => `<tr><td>${esc(k.label)}${k.nota ? ` <small class="src">(${esc(k.nota)})</small>` : ""}</td><td class="num">${esc(k.prevText)}</td><td class="num"><b>${esc(k.text)}</b></td><td class="num">${k.pct == null ? `<span class="na">—</span>` : H.delta(k.pct, k.dir === "down")}</td></tr>`;
    const sec = s => `<div class="panel">${H.banner(({ trafego: "target", redes: "ig", varejo: "cart", entregas: "cal" })[s.id] || "file", esc(s.nome), s.vazio ? "sem números neste mês" : `${esc(m.periodo.label)} comparado a ${esc(m.anterior.label)}`)}
      ${s.vazio ? `<div class="panel-body"><p class="notice">Sem números de ${esc(s.nome.toLowerCase())} neste mês. ${s.id === "entregas" ? "" : "Informe na tela Semana ou busque da Meta."}</p></div>`
        : `<div class="table-wrap"><table><thead><tr><th>Indicador</th><th class="num">Mês anterior</th><th class="num">${esc(m.periodo.label.split(" de ")[0])}</th><th class="num">Variação</th></tr></thead><tbody>${s.kpis.filter(k => k.cur != null || k.prev != null || (k.nota && s.id === "trafego")).map(row).join("")}</tbody></table></div>`}
      ${s.id === "trafego" && !s.vazio ? `<div class="panel-body"><div class="chart" id="rel-ads"></div><p class="src">Investimento por semana inteira dentro do mês.</p></div>` : ""}</div>`;
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Fechamento do mês · só para a equipe</div><h1>Relatórios</h1>
        <p>O relatório de cada cliente segue os serviços que a Nova7 presta a ele. Campo sem número aparece como "sem dado", nunca como zero.</p></div></div>
      <div class="toolbar sem-nav">
        <select id="rel-cli" aria-label="Cliente">${clients.map(x => `<option value="${esc(x.key)}" ${x.key === ui.marca ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <button type="button" class="btn sm" id="rel-prev" aria-label="Mês anterior">‹</button><b class="sem-label">${esc(m.periodo.label)}</b><button type="button" class="btn sm" id="rel-next" aria-label="Próximo mês">›</button>
        <button type="button" class="btn sm" id="rel-last">Último mês fechado</button>
        ${ui.inicio > last ? `<span class="badge p1">mês ainda não fechou</span>` : ""}
        <span class="spacer"></span>
        ${isAdmin() && ["trafego", "redes"].some(x => SV.has(c, x)) ? `<button type="button" class="btn" id="rel-meta">Buscar Meta do mês</button>` : ""}
        <button type="button" class="btn primary" id="rel-pptx"${m.vazio ? " disabled" : ""}>Baixar PowerPoint</button>
      </div>
      <p class="svc-chips" style="margin:0">${SV.ORDER.filter(s => SV.has(c, s)).map(s => `<span class="svc-chip" style="--svc:var(${SV.SERVICES[s].color})">${SV.SERVICES[s].name}</span>`).join("")}</p>
      <p class="notice info"><b>Origem dos números:</b> ${esc(FONTE[m.fonte])}</p>
      ${m.avisos.map(a => `<p class="notice">${esc(a)}</p>`).join("")}
      ${m.destaques.length ? `<div class="panel">${H.banner("bell", "Destaques do mês", "maiores variações com base suficiente")}<div class="panel-body"><ul class="plain">${m.destaques.map(d => `<li><b style="color:var(${d.tone === "good" ? "--green" : d.tone === "bad" ? "--red" : "--muted"})">${d.tone === "good" ? "▲" : d.tone === "bad" ? "▼" : "•"}</b> ${esc(d.texto)}</li>`).join("")}</ul></div></div>` : ""}
      <div class="grid g2">${m.sections.map(sec).join("")}</div>
      <div class="panel">${H.banner("file", "Próximos passos (vão no PowerPoint)", "uma linha por item; fica salvo neste navegador")}<div class="panel-body"><textarea id="rel-obs" rows="4" maxlength="1200" placeholder="Ex.: Subir a frequência de Reels em dezembro.">${esc(getObs(ui.marca, ui.inicio))}</textarea></div></div>`;
    const redraw = () => { S.set("relatorios", { marca: ui.marca, inicio: ui.inicio }); render(view, H); };
    $("#rel-cli", view).onchange = e => { ui.marca = e.target.value; redraw(); };
    $("#rel-prev", view).onclick = () => { ui.inicio = A.prevStart("mes", ui.inicio); redraw(); };
    $("#rel-next", view).onclick = () => { ui.inicio = A.nextStart("mes", ui.inicio); redraw(); };
    $("#rel-last", view).onclick = () => { ui.inicio = last; redraw(); };
    $("#rel-obs", view).addEventListener("change", e => setObs(ui.marca, ui.inicio, e.target.value.trim()));
    $("#rel-pptx", view).onclick = () => {
      setObs(ui.marca, ui.inicio, $("#rel-obs", view).value.trim());
      if (!root.N7Relatorio) return H.toast("O gerador de PowerPoint não carregou. Recarregue a página.");
      H.toast("Preparando o PowerPoint…");
      root.N7Lazy.pptx().then(() => R.download(m, { obs: $("#rel-obs", view).value })).then(n => H.toast("PowerPoint gerado: " + n), e => { console.error(e); H.toast("Não foi possível gerar o PowerPoint."); });
    };
    const mb = $("#rel-meta", view);
    if (mb) mb.onclick = async () => {
      mb.disabled = true; mb.textContent = "Buscando…";
      try {
        const r = await fetch("/api/windsor", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify({ action: "sync", tipo: "mes", inicio: ui.inicio }) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Não foi possível buscar a Meta.");
        const st = await fetch("/api/state"); if (st.ok) { const j = await st.json(); S.hydrate({ weeks: j.state.weeks }); }
        H.toast(b.report && b.report.aviso ? b.report.aviso : `Meta do mês buscada: ${(b.report && b.report.saved) || 0} cliente(s) atualizados.`);
        redraw();
      } catch (e) { H.toast(e.message); mb.disabled = false; mb.textContent = "Buscar Meta do mês"; }
    };
    const host = $("#rel-ads", view);
    if (host && root.Charts) {
      const ws = m.porSemana.filter(w => w.n && w.n.ads.gasto != null);
      if (ws.length) root.Charts.bars(host, { cats: ws.map(w => w.label), series: [{ name: "Investimento", color: c.color, values: ws.map(w => w.n.ads.gasto) }], fmt: v => "R$ " + Math.round(v), tipFmt: brl, height: 190 });
      else host.innerHTML = `<p class="src">Nenhuma semana inteira com investimento informado.</p>`;
    }
  }
  root.N7Relatorios = { render };
})(typeof window !== "undefined" ? window : globalThis);
