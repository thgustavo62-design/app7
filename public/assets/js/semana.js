/* Tela "Semana": entrada dos números (formulário e tabelas coladas), análise e exportação.
   A análise vem de analysis.js (funções puras); aqui só se monta a tela e se grava no armazenamento sincronizado. */
(function (root) {
  const A = root.N7Analysis, I = root.N7Ingest, S = root.N7Store;
  const { brl, int, dec, pctTxt, short, dm } = A.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const round2 = n => Math.round(n * 100) / 100;
  const inp = v => (v == null ? "" : String(v).replace(".", ","));
  /* empresas que entram na tela: as que têm redes, tráfego ou varejo (só criativos não tem número semanal) */
  const clientList = () => (H ? H.clients() : []).filter(c => ["redes", "trafego", "varejo"].some(s => (c.services || []).includes(s)));
  const clientOf = k => (H ? H.clients() : []).find(c => c.key === k) || { key: k, name: k, services: [], color: "--c1" };
  const svcOf = (k, s) => (clientOf(k).services || []).includes(s);
  const nameOf = k => clientOf(k).name;
  const colorOf = k => clientOf(k).color;
  const analysisClients = () => clientList().map(c => ({ key: c.key, name: c.name, services: c.services }));
  const CHANNELS = { ig: ["Instagram", "social", A.SOCIAL, A.SOCIAL_NAME], fb: ["Facebook", "social", A.SOCIAL, A.SOCIAL_NAME], ads: ["Meta Ads", "ads", A.ADS, A.ADS_NAME] };
  const CLASS_BADGE = { CORRIGIR: "p0", TESTAR: "p1", ESCALAR: "st-pub", MANTER: "st-pub", INCONCLUSIVO: "" };

  let H = null;                                   /* ajudantes do app.js: ico, banner, kpi, delta, toast, redraw */
  const ui = Object.assign({ tipo: "semana", inicio: null, marca: "M" }, (() => { try { return S.get("semana", {}) || {}; } catch (e) { return {}; } })());
  const drafts = {};                              /* alterações ainda não salvas: "tipo|inicio|marca" -> linha */
  const pasted = {};                              /* última leitura de tabela colada, por canal */
  const saveUi = () => S.set("semana", { tipo: ui.tipo, inicio: ui.inicio, marca: ui.marca });
  const readOnly = () => !!(root.N7User && root.N7User.papel === "leitura");
  const keyOf = (tipo, inicio, marca) => `${tipo}|${inicio}|${marca}`;

  const weeks = () => S.get("weeks", []);
  const gens = () => S.get("weekGen", []);
  const stored = (tipo, inicio, marca) => weeks().find(r => r.tipo === tipo && r.inicio === inicio && r.marca === marca) || null;
  const storedGen = (tipo, inicio) => gens().find(r => r.tipo === tipo && r.inicio === inicio) || null;
  const blank = (tipo, inicio, marca) => Object.assign({ tipo, inicio, fim: A.period(tipo, inicio).fim, marca }, A.norm({}));
  const rowFor = (tipo, inicio, marca) => drafts[keyOf(tipo, inicio, marca)] || (stored(tipo, inicio, marca) ? Object.assign({ tipo, inicio, fim: A.period(tipo, inicio).fim, marca, v: stored(tipo, inicio, marca).v }, A.norm(stored(tipo, inicio, marca))) : blank(tipo, inicio, marca));
  const dirty = () => Object.keys(drafts).length > 0 || !!drafts.__gen;

  /* ---------- leitura do formulário ---------- */
  function collect(form, tipo, inicio, marca) {
    const bad = [];
    const n = name => {
      const el = form.elements[name]; if (!el) return null;
      const t = el.value.trim(); el.removeAttribute("aria-invalid");
      if (t === "") return null;
      const v = I.num(t);
      if (v == null || v < 0) { el.setAttribute("aria-invalid", "true"); bad.push(name); return null; }
      return round2(v);
    };
    const t = name => (form.elements[name] ? form.elements[name].value.trim() : "");
    const old = stored(tipo, inicio, marca);
    const row = Object.assign(blank(tipo, inicio, marca), old ? A.norm(old) : {});
    if (old) row.v = old.v;
    const on = name => !!form.elements[name];                     /* o que não está na tela (serviço que o cliente não tem) fica como estava */
    if (on("vendas")) {
      row.vendas = n("vendas"); row.compras = n("compras"); row.c100n = n("c100n"); row.c100rs = n("c100rs");
      if (tipo === "semana") row.dias = [0, 1, 2, 3, 4, 5, 6].map(i => n("dia" + i));
    }
    Object.keys(CHANNELS).forEach(ch => CHANNELS[ch][2].forEach(f => { if (on(`${ch}.${f}`)) row[ch][f] = n(`${ch}.${f}`); }));
    row.janela = t("janela"); row.fonte = t("fonte"); row.obs = t("obs");
    return { row, bad };
  }
  function collectGen(form, tipo, inicio) {
    const t = name => (form.elements[name] ? form.elements[name].value.trim() : "");
    const r = form.querySelector('input[name="rumo"]:checked');
    const old = storedGen(tipo, inicio);
    return { tipo, inicio, promocao: t("promocao"), concorrencia: t("concorrencia"), decisao: t("decisao"), rumo: r ? r.value : "", notas: t("notas"), v: old ? old.v : undefined };
  }
  const sameRow = (a, b) => JSON.stringify(Object.assign({}, a, { v: 0 })) === JSON.stringify(Object.assign({}, b, { v: 0 }));
  const emptyRow = r => !A.hasData(A.norm(r)) && !r.janela && !r.fonte && !r.obs;

  /* guarda o que está digitado como rascunho (só se mudou) */
  function stash(view) {
    const form = $("#sem-form", view); if (!form || readOnly()) return [];
    const k = keyOf(ui.tipo, ui.inicio, ui.marca), res = collect(form, ui.tipo, ui.inicio, ui.marca);
    const base = stored(ui.tipo, ui.inicio, ui.marca), baseRow = base ? Object.assign({ tipo: ui.tipo, inicio: ui.inicio, fim: A.period(ui.tipo, ui.inicio).fim, marca: ui.marca }, A.norm(base)) : blank(ui.tipo, ui.inicio, ui.marca);
    if (sameRow(Object.assign({}, res.row, { v: 0 }), Object.assign({}, baseRow, { v: 0 }))) delete drafts[k]; else drafts[k] = res.row;
    const g = $("#gen-form", view);
    if (g) {
      const gr = collectGen(g, ui.tipo, ui.inicio), old = storedGen(ui.tipo, ui.inicio) || { promocao: "", concorrencia: "", decisao: "", rumo: "", notas: "" };
      const same = ["promocao", "concorrencia", "decisao", "rumo", "notas"].every(f => (gr[f] || "") === (old[f] || ""));
      const key = "__gen|" + ui.tipo + "|" + ui.inicio;
      if (same) delete drafts[key]; else drafts[key] = gr;
    }
    const dd = $("#sem-dirty", view); if (dd) dd.hidden = !Object.keys(drafts).length;
    return res.bad;
  }

  function save(view) {
    const bad = stash(view);
    if (bad.length) { H.toast("Confira os campos em vermelho: use só números."); return false; }
    let list = JSON.parse(JSON.stringify(weeks())), gl = JSON.parse(JSON.stringify(gens())), nW = 0, nG = 0;
    Object.keys(drafts).forEach(k => {
      const d = drafts[k];
      if (k.startsWith("__gen|")) {
        const i = gl.findIndex(x => x.tipo === d.tipo && x.inicio === d.inicio);
        if (i >= 0) gl[i] = Object.assign({}, d, { v: gl[i].v }); else gl.push(d);
        nG++;
      } else {
        const i = list.findIndex(x => x.tipo === d.tipo && x.inicio === d.inicio && x.marca === d.marca);
        if (i < 0 && emptyRow(d)) return;
        if (i >= 0) list[i] = Object.assign({}, d, { v: list[i].v }); else list.push(d);
        nW++;
      }
      delete drafts[k];
    });
    Object.keys(drafts).forEach(k => delete drafts[k]);
    if (nW) S.set("weeks", list);
    if (nG) S.set("weekGen", gl);
    return nW + nG;
  }

  /* ---------- tabelas coladas ---------- */
  function showPaste(view, ch) {
    const ta = $(`[data-paste-text="${ch}"]`, view), out = $(`[data-paste-out="${ch}"]`, view);
    const per = A.period(ui.tipo, ui.inicio);
    const r = I.parse(ta.value, CHANNELS[ch][1], { inicio: per.inicio, fim: per.fim });
    pasted[ch] = r;
    const names = CHANNELS[ch][3], found = Object.keys(r.fields);
    const modo = { tabela: "tabela com cabeçalho", diario: "série diária (só os dias do período)", linhas: "linhas soltas", vazio: "nada colado" }[r.mode];
    out.innerHTML = `<div class="paste-res"><b>Lido como ${esc(modo)}</b>${r.mode === "diario" ? ` · ${r.used} dia(s) dentro do período${r.ignored ? `, ${r.ignored} fora` : ""}` : ""}
      ${found.length ? `<ul>${found.map(f => `<li><span>${esc(names[f] || f)}</span><b>${esc(inp(r.fields[f]))}</b></li>`).join("")}</ul><button type="button" class="btn sm primary" data-paste-apply="${ch}">Aplicar nos campos</button>` : ""}
      ${r.notes.map(t => `<p class="src">${esc(t)}</p>`).join("")}</div>`;
    const ap = $(`[data-paste-apply="${ch}"]`, view);
    if (ap) ap.onclick = () => {
      Object.keys(r.fields).forEach(f => { const el = $("#sem-form", view).elements[`${ch}.${f}`]; if (el) el.value = inp(r.fields[f]); });
      stash(view); H.toast(`${CHANNELS[ch][0]}: ${found.length} campo(s) preenchido(s). Confira e clique em Salvar.`);
      out.innerHTML = `<p class="src">Aplicado. Campos não encontrados ficaram como estavam.</p>`;
    };
  }

  /* ---------- peças de tela ---------- */
  const num = (name, label, v, extra = "") => `<label class="fld"><span>${label}</span><input type="text" inputmode="decimal" name="${name}" value="${esc(inp(v))}" autocomplete="off"${readOnly() ? " disabled" : ""}${extra}></label>`;
  const txt = (name, label, v, ph = "") => `<label class="fld wide"><span>${label}</span><input type="text" name="${name}" value="${esc(v || "")}" placeholder="${esc(ph)}" maxlength="300" autocomplete="off"${readOnly() ? " disabled" : ""}></label>`;
  const area = (name, label, v, ph = "", rows = 2) => `<label class="fld wide"><span>${label}</span><textarea name="${name}" rows="${rows}" maxlength="800" placeholder="${esc(ph)}"${readOnly() ? " disabled" : ""}>${esc(v || "")}</textarea></label>`;

  function pasteBox(ch) {
    const [name, kind] = CHANNELS[ch];
    const ph = kind === "ads" ? "Cole a tabela do Gerenciador de Anúncios (com a linha de cabeçalho)" : "Cole a tabela da Meta Business Suite ou linhas como: Visualizações 119,6 mil";
    return `<details class="paste"><summary>Colar tabela do ${name}</summary>
      <textarea data-paste-text="${ch}" rows="5" placeholder="${esc(ph)}" spellcheck="false"></textarea>
      <div class="toolbar"><button type="button" class="btn sm" data-paste-read="${ch}">Ler tabela</button><span class="src">Nada é gravado até você clicar em Salvar.</span></div>
      <div data-paste-out="${ch}"></div></details>`;
  }

  function formHtml(tipo, inicio, marca) {
    const r = rowFor(tipo, inicio, marca), ph = svcOf(marca, "varejo"), per = A.period(tipo, inicio);
    const days = [...Array(7)].map((_, i) => { const d = A.addDays(A.parse(inicio), i); return { i, iso: A.iso(d), hol: A.HOLIDAYS[A.iso(d)] }; });
    const group = (ch) => `<fieldset><legend>${CHANNELS[ch][0]}</legend>
      <div class="fgrid">${CHANNELS[ch][2].map(f => num(`${ch}.${f}`, CHANNELS[ch][3][f], r[ch][f])).join("")}</div>${readOnly() ? "" : pasteBox(ch)}</fieldset>`;
    return `<form id="sem-form" autocomplete="off" novalidate>
      ${ph ? `<fieldset><legend>Vendas · ${esc(nameOf(marca))}</legend>
        <div class="fgrid">${num("vendas", "Vendas do período (R$)", r.vendas)}${num("compras", "Compras (cupons)", r.compras)}${num("c100n", "Cestas acima de R$ 100 (nº)", r.c100n)}${num("c100rs", "Cestas acima de R$ 100 (R$)", r.c100rs)}</div>
        ${tipo === "semana" ? `<p class="src">Vendas por dia: deixe em branco o dia sem relatório. Em branco é falta de dado, não zero.</p>
        <div class="fgrid days">${days.map(d => num("dia" + d.i, `${A.DOW[d.i]} ${dm(d.iso)}${d.hol ? " · " + esc(d.hol) : ""}`, r.dias[d.i])).join("")}</div>` : ""}
      </fieldset>` : `<p class="notice info">${esc(nameOf(marca))} não tem análise de varejo: aqui entram só os serviços contratados (${esc(window.N7Services.label(clientOf(marca)))}).</p>`}
      ${svcOf(marca, "redes") ? group("ig") + group("fb") : ""}${svcOf(marca, "trafego") ? group("ads") : ""}
      <fieldset><legend>Origem dos números</legend><div class="fgrid one">
        ${txt("janela", "Janela diferente da semana (se as redes usaram outras datas)", r.janela, "Ex.: Redes de 27/10 a 02/11")}
        ${txt("fonte", "Fonte", r.fonte, "Ex.: PDF analítico de 09/11 e Meta Business Suite")}
        ${txt("obs", "Observação", r.obs)}</div></fieldset>
      </form>`;
  }

  function genHtml(tipo, inicio) {
    const g = drafts["__gen|" + tipo + "|" + inicio] || storedGen(tipo, inicio) || { promocao: "", concorrencia: "", decisao: "", rumo: "", notas: "" };
    const rd = readOnly() ? " disabled" : "";
    return `<form id="gen-form" autocomplete="off">
      <div class="fgrid one">${txt("promocao", "Qual promoção rodou, e a que preço", g.promocao)}${txt("concorrencia", "Concorrência (Inova/Circulista, Indiana, Lavagnoli)", g.concorrencia, "O que publicaram, a que preço, em que dia")}</div>
      <fieldset><legend>Fechamento</legend>
        <p class="lbl">Se continuarmos fazendo exatamente o que fazemos hoje, estamos no melhor caminho possível?</p>
        <div class="radio-row"><label class="check"><input type="radio" name="rumo" value="sim"${g.rumo === "sim" ? " checked" : ""}${rd}> Sim</label><label class="check"><input type="radio" name="rumo" value="nao"${g.rumo === "nao" ? " checked" : ""}${rd}> Não</label></div>
        <div class="fgrid one">${txt("decisao", "Qual é a decisão comercial mais importante desta semana? (apenas uma)", g.decisao)}${area("notas", "Notas da semana", g.notas)}</div>
      </fieldset></form>`;
  }

  /* ---------- análise na tela ---------- */
  const dlt = p => (p == null ? `<span class="src">sem base</span>` : H.delta(p));
  const val = (v, f) => (v == null ? `<span class="na">sem dado</span>` : f(v));
  function analysisHtml(a) {
    const clients = a.clients, ph = clients.filter(c => c.farmacia);
    const kpis = `<div class="kpis">
      ${ph.slice(0, 3).map(c => H.kpi(`Vendas · ${esc(c.nome)}`, c.row.vendas == null ? "sem dado" : brl(c.row.vendas), c.mesmosDias && c.mesmosDias.pct != null ? dlt(c.mesmosDias.pct) + " nos mesmos dias da semana" : c.cmp.vendas.pct != null ? dlt(c.cmp.vendas.pct) + " vs anterior" : "sem base de comparação", "money", "green")).join("")}
      ${H.kpi("Sinais para agir", String(a.signals.filter(s => s.classe === "CORRIGIR" || s.classe === "TESTAR").length), `${a.signals.length} no total`, "bell", "red")}
    </div>`;
    const row = (label, fn) => `<tr><td>${label}</td>${ph.map(c => `<td class="num">${fn(c)}</td>`).join("")}</tr>`;
    const sales = `<div class="panel">${H.banner("money", "Vendas por filial", `${esc(a.period.label)} contra ${esc(a.prevPeriod.label)}`)}
      <div class="table-wrap"><table><thead><tr><th></th>${ph.map(c => `<th class="num">${esc(c.nome)}</th>`).join("")}</tr></thead><tbody>
      ${row("Vendas", c => val(c.row.vendas, brl))}
      ${row("Período anterior", c => val(c.prev && c.prev.vendas, brl))}
      ${row("Variação", c => dlt(c.cmp.vendas.pct))}
      ${row("Mesmos dias da semana", c => c.mesmosDias ? `${dlt(c.mesmosDias.pct)} <small class="src">${c.mesmosDias.dias.map(i => A.DOW[i]).join(", ")}</small>` : `<span class="na">sem dado</span>`)}
      ${row("Compras", c => val(c.row.compras, int))}
      ${row("Ticket médio", c => val(c.d.ticket, brl))}
      ${row("Cestas acima de R$ 100", c => c.d.c100Compras == null ? `<span class="na">sem dado</span>` : `${dec(c.d.c100Compras, 1)}% das compras · ${c.d.c100Receita == null ? "" : dec(c.d.c100Receita, 1) + "% da receita"}`)}
      ${row("Melhor dia", c => c.d.melhorDia ? `${A.DOW[c.d.melhorDia.i]} · ${brl(c.d.melhorDia.v)}` : `<span class="na">sem dado</span>`)}
      </tbody></table></div></div>`;
    /* dia a dia */
    const days = [...Array(7)].map((_, i) => ({ i, d: A.iso(A.addDays(A.parse(a.period.inicio), i)) }));
    const hol = a.holidays.filter(h => h.date >= a.period.inicio && h.date <= a.period.fim);
    const hasDays = a.period.tipo === "semana" && ph.some(c => c.row.dias.some(v => v != null));
    const daily = hasDays ? `<div class="panel">${H.banner("cal", "Dia a dia", hol.length ? "Feriado ou data atípica marcado no gráfico" : "Vendas por dia da semana")}
      <div class="panel-body"><div class="legend">${ph.map(c => `<span><i class="sw" style="background:var(${colorOf(c.marca)})"></i>${esc(c.nome)}</span>`).join("")}</div><div class="chart" id="sem-daily"></div>
      ${hol.length ? `<p class="notice">${hol.map(h => `<b>${dm(h.date)}</b> ${esc(h.name)}`).join(" · ")}. Confira antes de concluir queda: feriado não é demanda.</p>` : ""}
      <p class="src">Dias em branco no gráfico são dias sem relatório, não vendas zero.</p></div></div>` : "";
    /* redes e anúncios */
    const social = clients.filter(c => !c.vazio).flatMap(c => ["ig", "fb"].filter(ch => Object.values(c.row[ch]).some(v => v != null)).map(ch => ({ c, ch })));
    const socialTable = social.length ? `<div class="panel">${H.banner("ig", "Instagram e Facebook", "Visualizações, cliques e visitas não são vendas atribuídas")}
      <div class="table-wrap"><table><thead><tr><th>Perfil</th>${A.SOCIAL.map(f => `<th class="num">${A.SOCIAL_NAME[f]}</th>`).join("")}<th class="num">Interações por mil views</th></tr></thead><tbody>
      ${social.map(({ c, ch }) => `<tr><td>${esc(c.nome)} · ${CHANNELS[ch][0]}</td>${A.SOCIAL.map(f => `<td class="num">${val(c.row[ch][f], v => short(v))}<br>${dlt(c.cmp[ch][f].pct)}</td>`).join("")}<td class="num">${val(ch === "ig" ? c.d.igPorMil : c.d.fbPorMil, v => dec(v, 2))}</td></tr>`).join("")}
      </tbody></table></div></div>` : "";
    const ads = clients.filter(c => !c.vazio && Object.values(c.row.ads).some(v => v != null));
    const adsTable = ads.length ? `<div class="panel">${H.banner("eye", "Meta Ads", "Frequência acima de 1,5 ou alcance acima de 30.674 pessoas indica saturação")}
      <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="num">Gasto</th><th class="num">Alcance</th><th class="num">Impressões</th><th class="num">Resultados</th><th class="num">CPM</th><th class="num">Frequência</th><th class="num">Custo por resultado</th></tr></thead><tbody>
      ${ads.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${val(c.row.ads.gasto, brl)}</td><td class="num">${val(c.row.ads.alcance, int)}</td><td class="num">${val(c.row.ads.impressoes, int)}</td><td class="num">${val(c.row.ads.resultados, int)}</td><td class="num">${val(c.d.adsCpm, brl)}</td><td class="num">${val(c.d.adsFreq, v => dec(v, 2))}</td><td class="num">${val(c.d.adsCusto, brl)}</td></tr>`).join("")}
      </tbody></table></div></div>` : "";
    /* evolução */
    const evo = ph.some(c => A.series(weeks(), a.period.tipo, a.period.inicio, c.marca, r => r.vendas).filter(p => p.valor != null).length >= 2)
      ? `<div class="panel">${H.banner("chart", "Evolução das vendas", `Últimos ${a.period.tipo === "mes" ? "meses" : "períodos"} registrados`)}<div class="panel-body"><div class="legend">${ph.map(c => `<span><i class="sw" style="background:var(${colorOf(c.marca)})"></i>${esc(c.nome)}</span>`).join("")}</div><div class="chart" id="sem-evo"></div><p class="src">Períodos sem registro aparecem como lacuna.</p></div></div>` : "";
    /* sinais */
    const sig = `<div class="panel">${H.banner("bell", "O que os números dizem", "Classificação e confiança de cada leitura")}
      <div class="panel-body">${a.signals.length ? a.signals.map(s => `<div class="sig"><div class="sig-h"><span class="badge ${CLASS_BADGE[s.classe]}">${s.classe}</span><span class="badge">${esc(s.nome)} · ${esc(s.canal)}</span><span class="badge">confiança ${s.confianca}</span></div><b>${esc(s.titulo)}</b><p>${esc(s.texto)}</p></div>`).join("") : `<p class="src">Nenhum sinal acima dos limites. Com poucos números informados isso não significa que está tudo bem.</p>`}</div></div>`;
    const miss = [...a.missing, "Margem, lift e margem incremental das promoções: exigem o PDF analítico por item e a exportação de estoque", "Campo de origem no cupom (Instagram, WhatsApp, balcão, indicação): sem ele nenhuma campanha é avaliada por venda"];
    const missing = `<div class="panel">${H.banner("file", "O que não pôde ser respondido", "Falta de dado listada, nunca preenchida com zero")}<div class="panel-body"><ul class="plain">${miss.map(m => `<li>${esc(m)}</li>`).join("")}</ul></div></div>`;
    const g = a.gen;
    const close = `<div class="panel">${H.banner("sliders", "Fechamento da semana", "As duas perguntas de toda segunda-feira")}<div class="panel-body">
      <p class="lbl">Se continuarmos fazendo exatamente o que fazemos hoje, estamos no melhor caminho possível?</p>
      <p><span class="badge ${g && g.rumo === "nao" ? "p0" : g && g.rumo === "sim" ? "st-pub" : ""}">${g && g.rumo ? (g.rumo === "sim" ? "SIM" : "NÃO") : "ainda não respondida"}</span></p>
      <p class="lbl">Qual é a decisão comercial mais importante desta semana?</p>
      <p>${g && g.decisao ? `<b>${esc(g.decisao)}</b>` : `<span class="src">Ainda sem decisão registrada.</span>${a.suggestion ? ` Ponto de partida pelos sinais: ${esc(a.suggestion)}` : ""}`}</p></div></div>`;
    return kpis + sales + daily + evo + socialTable + adsTable + sig + missing + close;
  }

  /* ---------- tela ---------- */
  let curSub = "entrada";
  function render(view, helpers, sub) {
    H = helpers; if (sub !== undefined) curSub = sub === "analise" ? "analise" : "entrada";
    if (!ui.inicio || A.parse(ui.inicio) == null) ui.inicio = A.lastClosed(ui.tipo, new Date());
    if (!clientList().some(c => c.key === ui.marca)) ui.marca = (clientList()[0] || {}).key || "";
    if (!ui.marca) { view.innerHTML = `<div class="page-head"><div><h1>Semana</h1><p>Nenhum cliente com redes sociais, tráfego pago ou análise de varejo. Cadastre os serviços em Configurações.</p></div></div>`; return; }
    const ro = readOnly(), per = A.period(ui.tipo, ui.inicio), list = weeks();
    const a = A.analyze({ weeks: list, gens: gens(), tipo: ui.tipo, inicio: ui.inicio, clients: analysisClients() });
    const last = A.lastClosed(ui.tipo, new Date()), isFuture = ui.inicio > last;
    const unsaved = Object.keys(drafts).length > 0;
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Rotina de segunda-feira · Baixo Guandu-ES</div><h1>${ui.tipo === "mes" ? "Mês" : "Semana"}</h1>
        <p>Digite os números do período ou cole as tabelas da Meta. A análise compara sempre o mesmo dia da semana, marca feriados e nunca troca dado que falta por zero.</p></div>
        <div class="seg" id="sem-tipo" role="group" aria-label="Período">${[["semana", "Semana"], ["mes", "Mês"]].map(([k, n]) => `<button type="button" data-v="${k}" aria-pressed="${ui.tipo === k}">${n}</button>`).join("")}</div></div>
      <div class="toolbar sem-nav">
        <button type="button" class="btn sm" id="sem-prev" aria-label="Período anterior">‹</button>
        <b class="sem-label">${esc(per.label)}</b>
        <button type="button" class="btn sm" id="sem-next" aria-label="Próximo período">›</button>
        <button type="button" class="btn sm" id="sem-last">${ui.tipo === "mes" ? "Último mês fechado" : "Última semana fechada"}</button>
        ${isFuture ? `<span class="badge p1">período ainda não fechou</span>` : ""}
        <span class="spacer"></span>
        ${curSub === "analise" ? `<button type="button" class="btn primary" id="sem-pptx">Baixar PowerPoint</button>` : `<a class="btn" href="#semana/analise">Ver a análise →</a>`}
      </div>
      ${ro ? `<p class="notice info">Seu acesso é só de leitura: você vê a análise, mas não digita números.</p>` : ""}
      ${a.holidays.length ? `<p class="notice"><b>Atenção ao calendário:</b> ${a.holidays.map(h => `${dm(h.date)} ${esc(h.name)}`).join(" · ")}. Confirme antes de concluir queda.</p>` : ""}
      ${curSub === "entrada" ? `<div class="panel">${H.banner("file", "Entrada dos números", `${esc(per.label)}`, ro ? "" : `<span class="badge" id="sem-dirty"${unsaved ? "" : " hidden"}>alterações não salvas</span><button type="button" class="btn sm primary" id="sem-save">Salvar</button>`)}
        <div class="panel-body">
          <div class="seg" id="sem-marca" role="group" aria-label="Empresa">${clientList().map(c => c.key).map(m => `<button type="button" data-v="${m}" aria-pressed="${ui.marca === m}">${esc(nameOf(m))}${stored(ui.tipo, ui.inicio, m) || drafts[keyOf(ui.tipo, ui.inicio, m)] ? " ●" : ""}</button>`).join("")}</div>
          ${formHtml(ui.tipo, ui.inicio, ui.marca)}
          <h3 class="sub">Contexto e decisão do período</h3>
          ${genHtml(ui.tipo, ui.inicio)}
        </div></div>` : `<div class="sem-analysis">${analysisHtml(a)}</div>`}`;
    wire(view);
    draw(view, a);
  }

  function draw(view, a) {
    const C = root.Charts, ph = a.clients.filter(c => c.farmacia);
    const money = v => "R$ " + (v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil" : Math.round(v));
    const host = $("#sem-daily", view);
    if (host && C) {
      const cats = [...Array(7)].map((_, i) => { const d = A.iso(A.addDays(A.parse(a.period.inicio), i)); return `${A.DOW[i]}${A.HOLIDAYS[d] ? " *" : ""}`; });
      const series = ph.map(c => ({ name: c.nome, color: colorOf(c.marca), values: c.row.dias }));
      if (series.some(s => s.values.some(v => v != null))) C.bars(host, { cats, series, fmt: money, tipFmt: brl, height: 230 });
    }
    const evo = $("#sem-evo", view);
    if (evo && C) {
      const ser = ph.map(c => A.series(weeks(), a.period.tipo, a.period.inicio, c.marca, r => r.vendas));
      const cats = ser[0].map(p => dm(p.inicio));
      C.lines(evo, { cats, series: ph.map((c, i) => ({ name: c.nome, short: c.nome.split(" ")[0], color: colorOf(c.marca), values: ser[i].map(p => p.valor) })), fmt: money, tipFmt: brl, height: 220 });
    }
  }

  function wire(view) {
    const redraw = () => { saveUi(); render(view, H, curSub); scrollTo(0, 0); };
    const keep = () => { stash(view); };
    const nav = fn => () => { keep(); fn(); redraw(); };
    $$("#sem-tipo button", view).forEach(b => b.onclick = nav(() => { if (b.dataset.v !== ui.tipo) { ui.tipo = b.dataset.v; ui.inicio = A.lastClosed(ui.tipo, new Date()); } }));
    $("#sem-prev", view).onclick = nav(() => { ui.inicio = A.prevStart(ui.tipo, ui.inicio); });
    $("#sem-next", view).onclick = nav(() => { ui.inicio = A.nextStart(ui.tipo, ui.inicio); });
    $("#sem-last", view).onclick = nav(() => { ui.inicio = A.lastClosed(ui.tipo, new Date()); });
    $$("#sem-marca button", view).forEach(b => b.onclick = () => { keep(); ui.marca = b.dataset.v; saveUi(); render(view, H, curSub); });
    $$("#sem-form input, #gen-form input, #gen-form textarea", view).forEach(el => el.addEventListener("change", () => stash(view)));
    $$("[data-paste-read]", view).forEach(b => b.onclick = () => showPaste(view, b.dataset.pasteRead));
    const sv = $("#sem-save", view);
    if (sv) sv.onclick = () => { const n = save(view); if (n === false) return; H.toast(n ? "Salvo na planilha." : "Nada mudou desde o último salvamento."); saveUi(); render(view, H, curSub); };
    const pp = $("#sem-pptx", view);
    if (pp) pp.onclick = () => {
      if (Object.keys(drafts).length) { stash(view); if (Object.keys(drafts).length) return H.toast("Há alterações não salvas. Clique em Salvar antes de gerar o PowerPoint."); }
      if (!root.N7Report) return H.toast("O gerador de PowerPoint não carregou. Recarregue a página.");
      const an = A.analyze({ weeks: weeks(), gens: gens(), tipo: ui.tipo, inicio: ui.inicio, clients: analysisClients() });
      if (!an.clients.some(c => !c.vazio)) return H.toast("Informe pelo menos um número do período antes de gerar o PowerPoint.");
      H.toast("Preparando o PowerPoint…");
      root.N7Lazy.pptx().then(() => root.N7Report.download(an)).then(name => H.toast("PowerPoint gerado: " + name), e => { console.error(e); H.toast("Não foi possível gerar o PowerPoint."); });
    };
  }

  root.N7Semana = { render, _drafts: drafts };
})(typeof window !== "undefined" ? window : globalThis);
