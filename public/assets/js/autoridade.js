/* Tela "Autoridade": entrada semanal dos números de marca pessoal ou profissional (LinkedIn, Instagram e convites)
   e o painel de autoridade. A análise vem de authority.js (funções puras); aqui só se monta a tela e se grava no armazenamento sincronizado. */
(function (root) {
  const U = root.N7Authority, A = root.N7Analysis, S = root.N7Store, I = root.N7Ingest;
  const { int, dec, pctTxt, dm } = A.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inp = v => (v == null ? "" : String(v).replace(".", ","));
  const CLASS_BADGE = { CORRIGIR: "p0", TESTAR: "p1", ESCALAR: "st-pub", MANTER: "st-pub", INCONCLUSIVO: "" };
  const CH = [["li", "LinkedIn", ["impressoes", "alcance", "interacoes", "comentarios", "compartilhamentos", "salvamentos", "visitas", "segNovos", "segTotal", "posts"]],
    ["ig", "Instagram", ["impressoes", "alcance", "interacoes", "comentarios", "compartilhamentos", "salvamentos", "visitas", "segNovos", "segTotal", "posts"]],
    ["geral", "Convites e contatos (todos os canais)", ["contatos", "reunioes", "mencoes"]]];
  const NAME = Object.assign({}, U.FIELDS, U.GERAL);
  let H = null;
  const ui = Object.assign({ inicio: null, marca: "" }, (() => { try { return S.get("autoridadeUi", {}) || {}; } catch (e) { return {}; } })());
  const drafts = {};
  const saveUi = () => S.set("autoridadeUi", { inicio: ui.inicio, marca: ui.marca });
  const readOnly = () => !!(root.N7User && root.N7User.papel === "leitura");
  const list = () => S.get("authority", []);
  const clientList = () => (H ? H.clients() : []).filter(c => (c.services || []).includes("autoridade"));
  const clientOf = k => (H ? H.clients() : []).find(c => c.key === k) || { key: k, name: k, color: "--c7" };
  const goalKey = m => `${m}-postsemana`;
  const metaPosts = m => { const g = S.get("goals", {}) || {}; return g[goalKey(m)] > 0 ? Number(g[goalKey(m)]) : U.META_POSTS; };
  const stored = (inicio, marca, canal) => list().find(r => r.tipo === "semana" && r.inicio === inicio && r.marca === marca && r.canal === canal) || null;
  const dk = (inicio, marca, canal) => `${inicio}|${marca}|${canal}`;
  const rowFor = (inicio, marca, canal) => drafts[dk(inicio, marca, canal)] || stored(inicio, marca, canal) || null;

  /* ---------- leitura do formulário ---------- */
  function collect(form) {
    const bad = [], out = {};
    CH.forEach(([ch, , fields]) => {
      const row = { tipo: "semana", inicio: ui.inicio, fim: A.period("semana", ui.inicio).fim, marca: ui.marca, canal: ch, obs: "" };
      const old = stored(ui.inicio, ui.marca, ch); if (old) row.v = old.v;
      fields.forEach(f => {
        const el = form.elements[`${ch}.${f}`]; if (!el) return;
        const t = el.value.trim(); el.removeAttribute("aria-invalid");
        if (t === "") { row[f] = null; return; }
        const v = I.num(t);
        if (v == null || v < 0) { el.setAttribute("aria-invalid", "true"); bad.push(el.name); row[f] = null; } else row[f] = Math.round(v * 100) / 100;
      });
      if (ch === "geral") { const o = form.elements["geral.obs"]; row.obs = o ? o.value.trim() : ""; }
      out[ch] = row;
    });
    return { rows: out, bad };
  }
  const sameData = (a, b) => Object.keys(NAME).every(k => (a && a[k] != null ? a[k] : null) === (b && b[k] != null ? b[k] : null)) && ((a && a.obs) || "") === ((b && b.obs) || "");
  function stash(view) {
    const form = $("#au-form", view); if (!form || readOnly()) return [];
    const { rows, bad } = collect(form);
    Object.keys(rows).forEach(ch => { const k = dk(ui.inicio, ui.marca, ch); if (sameData(rows[ch], stored(ui.inicio, ui.marca, ch))) delete drafts[k]; else drafts[k] = rows[ch]; });
    const dd = $("#au-dirty", view); if (dd) dd.hidden = !Object.keys(drafts).length;
    return bad;
  }
  function save(view) {
    const bad = stash(view);
    if (bad.length) { H.toast("Confira os campos em vermelho: use só números."); return false; }
    let l = JSON.parse(JSON.stringify(list())), n = 0;
    Object.keys(drafts).forEach(k => {
      const d = drafts[k], i = l.findIndex(x => x.tipo === "semana" && x.inicio === d.inicio && x.marca === d.marca && x.canal === d.canal);
      const vazio = !U.hasData(U.norm(d)) && !d.obs;
      if (i < 0 && vazio) { delete drafts[k]; return; }
      if (i >= 0 && vazio) l.splice(i, 1); else if (i >= 0) l[i] = Object.assign({}, d, { v: l[i].v }); else l.push(d);
      delete drafts[k]; n++;
    });
    if (n) S.set("authority", l);
    return n;
  }

  /* ---------- peças de tela ---------- */
  const num = (name, label, v) => `<label class="fld"><span>${label}</span><input type="text" inputmode="decimal" name="${name}" value="${esc(inp(v))}" autocomplete="off"${readOnly() ? " disabled" : ""}></label>`;
  function formHtml() {
    return `<form id="au-form" autocomplete="off" novalidate>${CH.map(([ch, nome, fields]) => {
      const r = rowFor(ui.inicio, ui.marca, ch) || {};
      return `<fieldset><legend>${nome}</legend><div class="fgrid">${fields.map(f => num(`${ch}.${f}`, NAME[f], r[f])).join("")}</div>
        ${ch === "geral" ? `<div class="fgrid one"><label class="fld wide"><span>Observação (quem convidou, que evento, qual peça gerou)</span><input type="text" name="geral.obs" maxlength="300" value="${esc(r.obs || "")}" autocomplete="off"${readOnly() ? " disabled" : ""}></label></div>` : ""}</fieldset>`;
    }).join("")}</form>`;
  }
  const dlt = p => (p == null ? `<span class="src">sem base</span>` : H.delta(p));
  const val = (v, f) => (v == null ? `<span class="na">sem dado</span>` : f(v));

  function analysisHtml(a) {
    const m = metaPosts(ui.marca), li = a.canais[0], ig = a.canais[1], k = [];
    k.push(H.kpi("Publicações", a.posts.atual == null ? "sem dado" : `${int(a.posts.atual)} de ${int(m)}`, a.posts.atual == null ? "informe quantas peças foram ao ar" : a.posts.atual >= m ? "meta da semana cumprida" : "abaixo da meta semanal", "cal", a.posts.atual != null && a.posts.atual < m ? "amber" : "green"));
    [li, ig].forEach(c => { if (c.ativo || c.row) k.push(H.kpi(`${c.nome} · alcance`, c.row && c.row.alcance != null ? int(c.row.alcance) : "sem dado", c.cmp.alcance.pct != null ? dlt(c.cmp.alcance.pct) + " vs semana anterior" : "sem semana anterior para comparar", c.canal === "li" ? "target" : "ig", "red")); });
    const eq = [li, ig].filter(c => c.d.engQualMil != null);
    if (eq.length) k.push(H.kpi("Engajamento qualificado", eq.map(c => `${dec(c.d.engQualMil, 1)} ${c.canal === "li" ? "LI" : "IG"}`).join(" · "), "comentários, compartilhamentos e salvamentos por mil alcançadas", "spark", "green"));
    const g = a.geral.row;
    k.push(H.kpi("Convites", g && (g.reunioes != null || g.mencoes != null || g.contatos != null) ? int((g.contatos || 0) + (g.reunioes || 0) + (g.mencoes || 0)) : "sem dado", g ? `${g.contatos != null ? int(g.contatos) + " contatos" : "contatos sem dado"} · ${g.reunioes != null ? int(g.reunioes) + " reuniões" : "reuniões sem dado"}` : "o que o conteúdo trouxe de fato", "bell", "amber"));
    const canalTable = [li, ig].filter(c => c.row).map(c => `<tr><td>${c.nome}</td>${["alcance", "impressoes", "interacoes", "comentarios", "compartilhamentos", "salvamentos", "visitas", "segNovos"].map(f => `<td class="num">${val(c.row[f], int)}<br>${dlt(c.cmp[f].pct)}</td>`).join("")}<td class="num">${val(c.d.engQualMil, v => dec(v, 1))}</td></tr>`).join("");
    const table = canalTable ? `<div class="panel">${H.banner("chart", "Por canal", "Alcance de canais diferentes nunca é somado: as mesmas pessoas se repetem")}
      <div class="table-wrap"><table><thead><tr><th>Canal</th>${["alcance", "impressoes", "interacoes", "comentarios", "compartilhamentos", "salvamentos", "visitas", "segNovos"].map(f => `<th class="num">${NAME[f]}</th>`).join("")}<th class="num">Qualificado por mil</th></tr></thead><tbody>${canalTable}</tbody></table></div></div>` : "";
    const evo = `<div class="panel">${H.banner("chart", "Evolução", "Últimas 8 semanas; semana sem número fica em branco")}<div class="panel-body">
      <div class="legend"><span><i class="sw" style="background:var(--c7)"></i>LinkedIn</span><span><i class="sw" style="background:var(--c2)"></i>Instagram</span></div>
      <h3 class="sub">Alcance</h3><div class="chart" id="au-alc"></div><h3 class="sub">Publicações por semana (meta ${int(m)})</h3><div class="chart" id="au-posts"></div></div></div>`;
    const sig = `<div class="panel">${H.banner("bell", "O que os números dizem", "Classe e confiança em cada leitura")}<div class="panel-body">${a.signals.length ? a.signals.map(s => `<div class="sig"><div class="sig-h"><span class="badge ${CLASS_BADGE[s.classe]}">${s.classe}</span><span class="badge">${esc(s.canal)}</span><span class="badge">confiança ${s.confianca}</span></div><b>${esc(s.titulo)}</b><p>${esc(s.texto)}</p></div>`).join("") : `<p class="src">${a.vazio ? "Ainda não há números nesta semana." : "Nenhuma variação relevante nesta semana."}</p>`}</div></div>`;
    const miss = a.missing.concat(["Perfil de quem visita e de quem comenta (decisor, cargo, setor): nenhuma das redes entrega isso por semana, só dá para registrar pela observação", "Convites que não vieram pela rede (indicação direta) não são medidos aqui"]);
    return `<div class="kpis">${k.join("")}</div>${evo}${table}${sig}<div class="panel">${H.banner("file", "O que não pôde ser respondido", "Falta de dado listada, nunca preenchida com zero")}<div class="panel-body"><ul class="plain">${miss.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>`;
  }

  let curSub = "painel";
  function render(view, helpers, sub) {
    H = helpers; if (sub !== undefined) curSub = sub === "entrada" ? "entrada" : "painel";
    const cl = clientList();
    if (!ui.inicio || A.parse(ui.inicio) == null) ui.inicio = A.lastClosed("semana", new Date());
    if (!cl.some(c => c.key === ui.marca)) ui.marca = (cl[0] || {}).key || "";
    if (!ui.marca) { view.innerHTML = `<div class="page-head"><div><h1>Autoridade</h1><p>Nenhum cliente com o serviço Autoridade e posicionamento. Marque o serviço em Configurações.</p></div></div>`; return; }
    const ro = readOnly(), per = A.period("semana", ui.inicio), last = A.lastClosed("semana", new Date());
    const rows = list().map(r => drafts[dk(r.inicio, r.marca, r.canal)] || r).concat(Object.values(drafts).filter(d => !list().some(r => r.inicio === d.inicio && r.marca === d.marca && r.canal === d.canal)));
    const a = U.analyze({ rows, client: { key: ui.marca, name: clientOf(ui.marca).name }, inicio: ui.inicio, metaPosts: metaPosts(ui.marca) });
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Marca pessoal e profissional</div><h1>Autoridade</h1>
        <p>Consistência de publicação, engajamento que importa (comentário, compartilhamento e salvamento) e, no fim, o convite. A análise não troca dado que falta por zero e não soma canais.</p></div></div>
      <div class="toolbar sem-nav"><button type="button" class="btn sm" id="au-prev" aria-label="Semana anterior">‹</button><b class="sem-label">${esc(per.label)}</b><button type="button" class="btn sm" id="au-next" aria-label="Próxima semana">›</button>
        <button type="button" class="btn sm" id="au-last">Última semana fechada</button><span class="spacer"></span>${curSub === "painel" ? `<a class="btn sm" href="#autoridade/entrada">Digitar os números →</a>` : `<a class="btn sm" href="#autoridade/painel">Ver o painel →</a>`}${ui.inicio > last ? `<span class="badge p1">semana ainda não fechou</span>` : ""}</div>
      ${ro ? `<p class="notice info">Seu acesso é só de leitura.</p>` : ""}
      ${curSub === "entrada" ? `<div class="panel">${H.banner("file", "Entrada dos números", esc(per.label), ro ? "" : `<span class="badge" id="au-dirty"${Object.keys(drafts).length ? "" : " hidden"}>alterações não salvas</span><button type="button" class="btn sm primary" id="au-save">Salvar</button>`)}
        <div class="panel-body"><div class="seg" id="au-marca" role="group" aria-label="Cliente">${cl.map(c => `<button type="button" data-v="${c.key}" aria-pressed="${ui.marca === c.key}">${esc(c.name)}</button>`).join("")}</div>
          ${formHtml()}
          <div class="fgrid"><label class="fld"><span>Meta de publicações por semana</span><input type="text" inputmode="decimal" id="au-meta" value="${esc(inp(metaPosts(ui.marca)))}"${ro ? " disabled" : ""}></label></div>
          <p class="src">Em branco é falta de dado, não zero. Pegue os números no LinkedIn (Análises do perfil e das publicações) e no Instagram (Insights), sempre de segunda a domingo.</p>
        </div></div>` : `<div id="au-analysis">${analysisHtml(a)}</div>`}`;
    wire(view); draw(view, rows, a);
  }

  function draw(view, rows, a) {
    const C = root.Charts; if (!C) return;
    const alc = U.CANAIS && ["li", "ig"].map(ch => U.series(rows, ui.marca, ch, n => n.alcance, ui.inicio, 8)), cats = alc[0].map(p => dm(p.inicio));
    const h1 = $("#au-alc", view), h2 = $("#au-posts", view);
    if (h1 && alc.some(s => s.some(p => p.valor != null))) C.lines(h1, { cats, series: [{ name: "LinkedIn", short: "LinkedIn", color: "--c7", values: alc[0].map(p => p.valor) }, { name: "Instagram", short: "Instagram", color: "--c2", values: alc[1].map(p => p.valor) }], fmt: v => int(v), tipFmt: int, height: 200 });
    else if (h1) h1.innerHTML = `<p class="src">Nenhum alcance registrado nas últimas 8 semanas.</p>`;
    const ps = ["li", "ig"].map(ch => U.series(rows, ui.marca, ch, n => n.posts, ui.inicio, 8));
    if (h2 && ps.some(s => s.some(p => p.valor != null))) C.bars(h2, { cats, series: [{ name: "LinkedIn", color: "--c7", values: ps[0].map(p => p.valor) }, { name: "Instagram", color: "--c2", values: ps[1].map(p => p.valor) }], fmt: v => String(Math.round(v * 10) / 10).replace(".", ","), tipFmt: int, height: 180 });
    else if (h2) h2.innerHTML = `<p class="src">Nenhuma publicação registrada nas últimas 8 semanas.</p>`;
  }

  function wire(view) {
    const redraw = () => { saveUi(); render(view, H, curSub); scrollTo(0, 0); };
    const nav = fn => () => { stash(view); fn(); redraw(); };
    $("#au-prev", view).onclick = nav(() => { ui.inicio = A.prevStart("semana", ui.inicio); });
    $("#au-next", view).onclick = nav(() => { ui.inicio = A.nextStart("semana", ui.inicio); });
    $("#au-last", view).onclick = nav(() => { ui.inicio = A.lastClosed("semana", new Date()); });
    $$("#au-marca button", view).forEach(b => b.onclick = () => { stash(view); ui.marca = b.dataset.v; redraw(); });
    $$("#au-form input", view).forEach(el => el.addEventListener("change", () => stash(view)));
    const sv = $("#au-save", view);
    if (sv) sv.onclick = () => { const n = save(view); if (n === false) return; H.toast(n ? "Salvo na planilha." : "Nada mudou desde o último salvamento."); saveUi(); render(view, H, curSub); };
    const mt = $("#au-meta", view);
    if (mt) mt.onchange = () => {
      const v = I.num(mt.value), g = Object.assign({}, S.get("goals", {}) || {});
      if (v != null && v > 0 && v <= 50) g[goalKey(ui.marca)] = v; else delete g[goalKey(ui.marca)];
      S.set("goals", g); H.toast("Meta salva."); stash(view); render(view, H, curSub);
    };
  }

  root.N7Autoridade = { render, _drafts: drafts };
})(typeof window !== "undefined" ? window : globalThis);
