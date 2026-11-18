/* Central Nova7 · aplicação (sem build, sem dependências). */
(function () {
  const D = window.N7, C = window.Charts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- formatação ---------- */
  const brl = v => v == null ? "sem dado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const brlK = v => v === 0 ? "0" : "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  const int = v => v == null ? "sem dado" : Math.round(v).toLocaleString("pt-BR");
  const k = v => v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : String(Math.round(v));
  const pct = (a, b) => a == null || b == null || !a ? null : (b / a - 1) * 100;
  const pctTxt = p => (p > 0 ? "+" : "") + p.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const delta = (p, invert) => p == null ? "" : `<span class="delta ${(p >= 0) !== !!invert ? "up" : "down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>`;
  const toDate = s => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dm = s => { const d = toDate(s); return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—"; };
  const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const TODAY = startOfDay(new Date());
  const TODAY_ISO = toIso(TODAY);
  const monday = d => { const x = startOfDay(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  /* ---------- armazenamento local (por navegador) ---------- */
  const store = {
    get(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const KB_KEY = "nova7-kanban-v1", GOAL_KEY = "nova7-metas-v1", PREF_KEY = "nova7-prefs-v1";
  let overrides = store.get(KB_KEY, {});
  const prefs = Object.assign({ kview: "status", kbrand: "all", kfmt: "all", ins: "all" }, store.get(PREF_KEY, {}));
  const savePrefs = () => store.set(PREF_KEY, prefs);

  /* ---------- clientes e pautas ---------- */
  const CL = Object.fromEntries(D.CLIENTS.map(c => [c.key, c]));
  const byId = Object.fromEntries(D.CLIENTS.map(c => [c.id, c]));
  const STATUS = {
    prop: { name: "Proposta", hint: "aguarda revisão técnica", cls: "" },
    plan: { name: "A planejar", hint: "roteiro não iniciado", cls: "" },
    prod: { name: "Em produção", hint: "roteiro, gravação ou edição", cls: "st-prod" },
    apr: { name: "Aprovação", hint: "aguardando cliente ou revisão", cls: "st-apr" },
    agd: { name: "Pronto / agendado", hint: "arte final pronta", cls: "st-agd" },
    pub: { name: "Publicado", hint: "no ar", cls: "st-pub" }
  };
  const COLS = ["prop", "plan", "prod", "apr", "agd", "pub"];
  const STEP_NAMES = { roteiro: "Roteiro", gravar: "Gravar / captar", editar: "Editar / design", aprovar: "Aprovar", agendar: "Agendar" };
  const DONE_BY = { prop: 0, plan: 0, prod: 2, apr: 3, agd: 5, pub: 5 };

  function posts() {
    return D.PLAN.map(p => {
      const o = overrides[p.code] || {};
      const status = o.status || (p.status === "fin" ? "agd" : p.status);
      const date = o.date || p.date;
      return Object.assign({}, p, { status, date, edited: !!overrides[p.code], late: toDate(date) < TODAY && status !== "pub" });
    });
  }
  const brandBadge = b => `<span class="badge brand" style="--dot:var(${CL[b].color})">${esc(CL[b].short)}</span>`;
  const fmtBadge = f => `<span class="badge fmt-${f.toLowerCase()}">${esc(f)}</span>`;
  const stBadge = p => p.late ? `<span class="badge late">Atrasada · ${STATUS[p.status].name}</span>` : `<span class="badge ${STATUS[p.status].cls}">${STATUS[p.status].name}</span>`;

  /* ---------- ícones ---------- */
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    fb: '<path d="M15 3h-3a4 4 0 0 0-4 4v3H6v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>',
    ext: '<path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const banner = (icon, title, sub, right = "") => `<div class="panel-banner"><span class="tile">${ico(icon)}</span><div><h3>${title}</h3>${sub ? `<small>${sub}</small>` : ""}</div>${right ? `<div class="right">${right}</div>` : ""}</div>`;
  const kpi = (label, value, sub, icon, tone = "") => `<div class="kpi"><small>${label}</small><strong class="${value === "sem dado" ? "na" : ""}">${value}</strong><em>${sub || ""}</em>${icon ? `<span class="ico ${tone}">${ico(icon)}</span>` : ""}</div>`;

  /* ---------- navegação ---------- */
  const ROUTES = {
    painel: { title: "Painel", render: renderPainel },
    insights: { title: "Insights", render: renderInsights },
    calendario: { title: "Calendário Kanban", render: renderKanban },
    alertas: { title: "Alertas", render: renderAlertas }
  };
  D.CLIENTS.forEach(c => { ROUTES[c.id] = { title: c.name, render: () => renderClient(c) }; });

  function renderNav() {
    const ps = posts();
    const late = id => ps.filter(p => p.b === byId[id].key && p.late).length;
    const p0 = D.ALERTS.filter(a => a.p === "P0").length;
    $("#nav").innerHTML = `
      <div class="nav-group">Visão</div>
      <a class="nav-item" href="#painel">${ico("home")}<span>Painel</span></a>
      <a class="nav-item" href="#insights">${ico("chart")}<span>Insights</span></a>
      <div class="nav-group">Clientes</div>
      ${D.CLIENTS.map(c => `<a class="nav-item" href="#${c.id}"><i class="nav-dot" style="background:var(${c.color})"></i><span>${esc(c.name)}</span>${late(c.id) ? `<span class="nav-count" title="pautas atrasadas">${late(c.id)}</span>` : ""}</a>`).join("")}
      <div class="nav-group">Operação</div>
      <a class="nav-item" href="#calendario">${ico("cal")}<span>Calendário Kanban</span></a>
      <a class="nav-item" href="#alertas">${ico("bell")}<span>Alertas</span><span class="nav-count">${p0} P0</span></a>`;
  }
  function route() {
    const id = (location.hash || "#painel").slice(1);
    const r = ROUTES[id] ? id : "painel";
    renderNav();
    $$("#nav .nav-item").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + r));
    $("#crumb").innerHTML = `Central Nova7 › <b>${esc(ROUTES[r].title)}</b>`;
    document.title = ROUTES[r].title === "Painel" ? "Central Nova7" : `${ROUTES[r].title} · Central Nova7`;
    $(".shell").classList.remove("nav-open");
    C.hideTip();
    const view = $("#view");
    view.innerHTML = "";
    ROUTES[r].render(view);
    scrollTo(0, 0);
    current = r;
  }
  let current = null;

  /* ====================================================================
     PAINEL
     ==================================================================== */
  function renderPainel(v) {
    const ps = posts();
    const pub = ps.filter(p => p.status === "pub").length, late = ps.filter(p => p.late).length;
    const mon = monday(TODAY), sun = addDays(mon, 6);
    const week = ps.filter(p => { const d = toDate(p.date); return d >= mon && d <= sun; }).sort((a, b) => a.date.localeCompare(b.date));
    const W = D.WEEKLY, last = 2;
    const igNow = W.M.igViews[last] + W.F.igViews[last], igPrev = W.M.igViews[1] + W.F.igViews[1];
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Gestão interna · ${D.CLIENTS.length} contas</div><h1>Painel da agência</h1>
        <p>Última semana fechada: 02 a 08/11/2026. A semana 09–15/11 aguarda o PDF de vendas e a extração da Meta.</p></div>
        <div class="toolbar"><a class="btn" href="#insights">${ico("chart")} Ver insights</a><a class="btn primary" href="#calendario">${ico("cal")} Abrir calendário</a></div></div>
      <div class="kpis">
        ${kpi("Vendas · duas farmácias", "R$ 159,2 mil", `${delta(14.1)} ter–dom vs semana anterior`, "money", "green")}
        ${kpi("Ticket médio combinado", "R$ 57,96", "Minas R$ 62,87 · Farma R$ 49,36", "cart")}
        ${kpi("Visualizações no Instagram", k(igNow), `${delta(pct(igPrev, igNow))} vs 27/10–02/11`, "eye", "red")}
        ${kpi("Pautas publicadas", `${pub} de ${ps.length}`, `plano Nov–Dez · <b class="tnum" style="color:var(--red)">${late}</b> atrasadas`, "list", "amber")}
      </div>
      <div class="section-title"><h2>Clientes</h2><span>clique para abrir a página do cliente</span></div>
      <div class="grid g4">${D.CLIENTS.map(c => clientCard(c, ps)).join("")}</div>
      <div class="grid g2">
        <div class="panel">${banner("cal", "Esta semana", `${dm(toIso(mon))} a ${dm(toIso(sun))} · ${week.length} pautas`, `<a class="pill-light" href="#calendario">Kanban</a>`)}
          <div class="table-wrap"><table><thead><tr><th style="width:84px">Data</th><th style="width:96px">Marca</th><th>Pauta</th><th style="width:150px">Status</th></tr></thead><tbody>
          ${week.length ? week.map(p => `<tr data-open="${p.code}" style="cursor:pointer"><td class="num">${DOW[toDate(p.date).getDay()]} ${dm(p.date)}</td><td>${brandBadge(p.b)}</td><td><span class="code">${p.code}</span> ${esc(p.title)}</td><td>${stBadge(p)}</td></tr>`).join("") : `<tr><td colspan="4" class="src">Nenhuma pauta nesta semana.</td></tr>`}
          </tbody></table></div></div>
        <div class="panel">${banner("alert", "Prioridade imediata", "P0 da auditoria de 10/11", `<a class="pill-light down" href="#alertas">${D.ALERTS.length} alertas</a>`)}
          <div class="panel-body">${D.ALERTS.filter(a => a.p === "P0").map(alertHtml).join("")}</div></div>
      </div>
      <div class="grid g2">
        <div class="panel">${banner("money", "Vendas líquidas por janela", "Minas Farma e Farma e Farma")}
          <div class="panel-body"><div class="legend"><span><i class="sw" style="background:var(--c1)"></i>Minas Farma</span><span><i class="sw" style="background:var(--c2)"></i>Farma e Farma</span></div>
          <div class="chart" id="p-sales" data-label="Vendas por janela"></div>
          <p class="src">Fonte: Central Nova7 › 10 EVOLUÇÃO HISTÓRICA. Farma sem vendas totais em 19–25/10.</p></div></div>
        <div class="panel">${banner("clock", "Rotina da agência", "Fluxo semanal definido pela diretoria")}
          <div class="panel-body"><div class="week" style="grid-template-columns:1fr">${D.ROUTINE.map(([d, t], i) => `<div class="day ${TODAY.getDay() === i + 1 ? "today" : ""}"><b>${d}${TODAY.getDay() === i + 1 ? " · hoje" : ""}</b><span>${t}</span></div>`).join("")}</div>
          <p class="notice info">Antes de publicar: edição, revisão farmacêutica ou agronômica, validação do cliente, arquivo final no Drive e confirmação do agendamento.</p></div></div>
      </div>`;
    drawSalesChart($("#p-sales"));
    bindOpen(v);
    $$(".client-card", v).forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.go; }));
    $$(".client-card", v).forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") location.hash = el.dataset.go; }));
  }
  function clientCard(c, ps) {
    const mine = ps.filter(p => p.b === c.key), pub = mine.filter(p => p.status === "pub").length, late = mine.filter(p => p.late).length;
    const W = D.WEEKLY[c.key];
    const next = mine.filter(p => p.status !== "pub" && toDate(p.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
    return `<div class="panel client-card" tabindex="0" role="link" data-go="${c.id}">
      <div class="panel-body">
        <div style="display:flex;gap:10px;align-items:center"><span class="client-avatar" style="background:var(${c.color})">${c.short[0]}</span><div style="min-width:0"><h3 style="font-size:14px">${esc(c.name)}</h3><div class="src">${esc(c.handle)}</div></div></div>
        <div class="metric-box"><h4>Semana 02–08/11</h4>
          <div class="mrow"><span>Vendas</span><b class="${W ? "" : "na"}">${W ? brl(W.sales[2]) : "sem dado"}</b></div>
          <div class="mrow"><span>Views IG</span><b class="${W ? "" : "na"}">${W ? int(W.igViews[2]) : "sem dado"}</b></div>
          <div class="mrow"><span>Pautas atrasadas</span><b style="color:${late ? "var(--red)" : "inherit"}">${late}</b></div>
        </div>
        <div><div class="mrow" style="padding:0 0 5px"><span>Plano Nov–Dez</span><b>${pub}/${mine.length}</b></div><div class="bar"><i style="width:${pub / mine.length * 100}%;background:var(${c.color})"></i></div></div>
        <p class="src"><b>Próxima:</b> ${next ? `${dm(next.date)} · ${esc(next.title)}` : "—"}</p>
      </div></div>`;
  }
  function drawSalesChart(host) {
    C.bars(host, { cats: D.WINDOWS, series: [{ name: "Minas Farma", color: "--c1", values: D.WEEKLY.M.sales }, { name: "Farma e Farma", color: "--c2", values: D.WEEKLY.F.sales }], fmt: brlK, tipFmt: brl });
  }

  /* ====================================================================
     INSIGHTS
     ==================================================================== */
  function renderInsights(v) {
    const f = prefs.ins; // all | M | F
    const keys = f === "all" ? ["M", "F"] : [f];
    const W = D.WEEKLY, L = 2;
    const sum = (m, i) => keys.reduce((a, b) => a + (W[b][m][i] ?? 0), 0);
    const ser = m => keys.map(b => ({ name: CL[b].name, short: CL[b].short, color: CL[b].color, values: W[b][m] }));
    const ratio = b => W[b].igViews.map((v2, i) => v2 ? +(W[b].igInt[i] / v2 * 1000).toFixed(2) : null);
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Farmácias · Baixo Guandu-ES · 14/08 a 14/11/2026</div><h1>Insights</h1>
        <p>Vendas vêm dos PDFs do sistema das lojas; redes, dos relatórios semanais e da Meta Business Suite. Visualizações, cliques e visitas não são vendas atribuídas. Campo em branco é falta de dado, não zero.</p></div>
        <div class="seg" id="ins-f" role="group" aria-label="Empresa">${[["all", "Duas farmácias"], ["M", "Minas Farma"], ["F", "Farma e Farma"]].map(([k2, n]) => `<button type="button" data-v="${k2}" aria-pressed="${f === k2}">${n}</button>`).join("")}</div></div>
      <div class="kpis">
        ${kpi("Vendas líquidas 02–08/11", brl(sum("sales", L)), f === "M" ? delta(18.4) + " ter–dom" : f === "F" ? delta(5.5) + " ter–dom" : delta(14.1) + " ter–dom", "money", "green")}
        ${kpi("Compras", int(sum("orders", L)), `ticket ${brl(sum("sales", L) / sum("orders", L))}`, "cart")}
        ${kpi("Instagram · visualizações", int(sum("igViews", L)), `${delta(pct(sum("igViews", 1), sum("igViews", L)))} vs janela anterior`, "ig", "red")}
        ${kpi("Instagram · interações", int(sum("igInt", L)), `${delta(pct(sum("igInt", 1), sum("igInt", L)))} · ${(sum("igInt", L) / sum("igViews", L) * 1000).toFixed(2).replace(".", ",")} por mil views`, "eye", sum("igInt", L) >= sum("igInt", 1) ? "green" : "red")}
      </div>

      <div class="grid g2">
        <div class="panel">${banner("money", "Vendas líquidas por janela", "R$ · PDF de vendas das lojas")}
          <div class="panel-body"><div class="legend">${keys.map(b => `<span><i class="sw" style="background:var(${CL[b].color})"></i>${CL[b].name}</span>`).join("")}</div>
          <div class="chart" id="i-sales"></div>
          <div class="table-wrap" style="border:1px solid var(--line);border-radius:12px"><table><thead><tr><th>Comparação justa · ter–dom</th><th class="num">27/10–01/11</th><th class="num">03–08/11</th><th class="num">Variação</th></tr></thead><tbody>
          ${D.FAIR.filter(r => f === "all" || r.key === f).map(r => `<tr><td>${r.name}</td><td class="num">${brl(r.a)}</td><td class="num">${brl(r.b)}</td><td class="num">${delta(r.pct)}</td></tr>`).join("")}
          </tbody></table></div>
          <p class="src">Seis dias iguais, sem o feriado de 02/11. Não atribui vendas a campanhas.</p></div></div>
        <div class="panel">${banner("cart", "Ticket médio", "R$ por compra")}
          <div class="panel-body"><div class="chart" id="i-ticket"></div>
          <div class="panel-cols" style="margin:0 -18px -18px;border-top:1px solid var(--line)">${keys.map(b => `<div><span class="col-title">${CL[b].name}</span>${D.WINDOWS.map((w, i) => `<div class="mrow"><span>${w}</span><b class="${W[b].orders[i] == null ? "na" : ""}">${W[b].orders[i] == null ? "sem dado" : int(W[b].orders[i]) + " compras"}</b></div>`).join("")}</div>`).join("")}</div></div></div>
      </div>

      <div class="grid g2">
        <div class="panel">${banner("ig", "Instagram · visualizações", "janelas 27/10–02/11 e 02–08/11 compartilham o dia 02/11")}
          <div class="panel-body"><div class="chart" id="i-ig"></div>
          ${f !== "F" ? `<p class="notice info">Agosto inteiro (Minas): <b>419,6 mil</b> visualizações, 1.200 interações e 160 novos seguidores. É referência de mês completo, não o total de 14–31/08.</p>` : ""}</div></div>
        <div class="panel">${banner("eye", "Interações por mil visualizações", "quanto cada visualização gera de resposta")}
          <div class="panel-body"><div class="chart" id="i-rate"></div>
          <p class="src">Farma teve menos visualizações e mais interações em 02–08/11: ${(316 / 43200 * 1000).toFixed(2).replace(".", ",")} por mil.</p></div></div>
      </div>

      <div class="panel">${banner("list", "Instagram e Facebook · todas as métricas por janela", "relatórios semanais (valores de visualização arredondados)")}
        <div class="table-wrap"><table><thead><tr><th>Empresa</th><th>Rede</th><th>Métrica</th>${D.WINDOWS.map(w => `<th class="num">${w}</th>`).join("")}<th class="num">Última variação</th></tr></thead><tbody>
        ${keys.flatMap(b => [["ig", "Instagram"], ["fb", "Facebook"]].flatMap(([n, nn]) => [["Views", "Visualizações"], ["Int", "Interações"], ["Clicks", "Cliques no link"], ["Visits", "Visitas"], ["Follows", "Novos seguidores"]].map(([m, mn]) => {
          const vals = W[b][n + m];
          return `<tr><td>${brandBadge(b)}</td><td>${nn}</td><td>${mn}</td>${vals.map(x => `<td class="num">${int(x)}</td>`).join("")}<td class="num">${delta(pct(vals[1], vals[2]))}</td></tr>`;
        }))).join("")}
        </tbody></table></div></div>

      <div class="grid g2">
        <div class="panel">${banner("fb", "Facebook · visualizações por janela", "relatórios semanais")}
          <div class="panel-body"><div class="chart" id="i-fbw"></div>
          <p class="src">Queda forte nas duas páginas em 02–08/11: Minas ${pctTxt(pct(47700, 11700))}, Farma ${pctTxt(pct(27900, 7300))}.</p></div></div>
        <div class="panel">${banner("fb", "Farma e Farma · Facebook dia a dia", "15/10 a 13/11 · Meta Business Suite", `<span class="pill-light">92.746 views</span>`)}
          <div class="panel-body"><div class="seg" id="fb-m" role="group" aria-label="Métrica">${[["views", "Visualizações"], ["clicks", "Cliques no link"], ["visits", "Visitas"]].map(([a, n], i) => `<button type="button" data-v="${a}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
          <div class="chart" id="i-fbd"></div>
          <div class="metric-box"><div class="mrow"><span>Visualizadores únicos (30 dias)</span><b>43,6 mil</b></div><div class="mrow"><span>Cliques no link</span><b>207 · todos até 30/10</b></div><div class="mrow"><span>Visitas à página</span><b>75</b></div><div class="mrow"><span>Interações · novos seguidores</span><b>6 · 2</b></div></div></div></div>
      </div>

      ${f !== "M" ? `<div class="grid g2">
        <div class="panel">${banner("money", "Farma e Farma · vendas por dia", "02 a 08/11 · R$ 49.311,51 · 999 compras")}
          <div class="panel-body"><div class="chart" id="i-day"></div><p class="src">Fonte: PDF de 68 páginas emitido em 09/11 às 14h37.</p></div></div>
        <div class="panel">${banner("cart", "Farma e Farma · cesta", "o que pesou na semana 02–08/11")}
          <div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Volume</th><th class="num">Receita</th></tr></thead><tbody>
          ${D.FARMA_BASKET.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="num">${r[2]}</td></tr>`).join("")}
          ${D.FARMA_DAILY.labels.map((l, i) => `<tr><td>${l}</td><td>${D.FARMA_DAILY.orders[i]} compras · ticket ${brl(D.FARMA_DAILY.ticket[i])}</td><td class="num">${brl(D.FARMA_DAILY.sales[i])}</td></tr>`).join("")}
          </tbody></table></div></div>
      </div>` : ""}

      <div class="panel">${banner("target", "Achados e próximas validações", "abas ANÁLISE E AÇÕES dos insights · evidência não é causalidade")}
        <div class="table-wrap"><table><thead><tr><th>Prioridade</th><th>Empresa</th><th>Rede</th><th>Achado</th><th>Evidência</th><th>Próxima validação</th></tr></thead><tbody>
        ${D.FINDINGS.filter(x => keys.includes(x.b)).map(x => `<tr><td><span class="badge ${x.p === "ALTA" ? "alta" : "media"}">${x.p}</span></td><td>${brandBadge(x.b)}</td><td>${x.net}</td><td><b>${esc(x.t)}</b><div class="src">${esc(x.i)}</div></td><td>${esc(x.e)}</td><td>${esc(x.n)}</td></tr>`).join("")}
        </tbody></table></div></div>

      <div class="panel">${banner("file", "Qualidade dos dados", "o que existe e o que falta extrair")}
        <div class="panel-cols">
          <div><span class="col-title">Disponível</span>
            <div class="mrow"><span>Vendas Minas</span><b>3 janelas</b></div><div class="mrow"><span>Vendas Farma</span><b>2 janelas + diário 02–08/11</b></div>
            <div class="mrow"><span>Facebook Farma</span><b>30 dias diários</b></div><div class="mrow"><span>Instagram (duas)</span><b>3 janelas semanais</b></div></div>
          <div><span class="col-title">Falta extrair</span>
            <div class="mrow"><span>Instagram diário 14/08–14/11</span><b class="na">não capturado</b></div><div class="mrow"><span>Facebook Minas diário</span><b class="na">não capturado</b></div>
            <div class="mrow"><span>Semana 09–15/11</span><b class="na">aguarda fechamento</b></div><div class="mrow"><span>Campo Forte e Nova7</span><b class="na">sem exportação Meta</b></div></div>
        </div></div>`;

    $$("#ins-f button", v).forEach(b => b.onclick = () => { prefs.ins = b.dataset.v; savePrefs(); route(); });
    C.bars($("#i-sales"), { cats: D.WINDOWS, series: ser("sales"), fmt: brlK, tipFmt: brl });
    C.lines($("#i-ticket"), { cats: D.WINDOWS, series: ser("ticket"), fmt: x => "R$ " + Math.round(x), tipFmt: brl, height: 190 });
    C.lines($("#i-ig"), { cats: D.WINDOWS, series: ser("igViews"), fmt: k, tipFmt: int });
    C.bars($("#i-rate"), { cats: D.WINDOWS, series: keys.map(b => ({ name: CL[b].name, color: CL[b].color, values: ratio(b) })), fmt: x => x.toFixed(1).replace(".", ","), tipFmt: x => x.toFixed(2).replace(".", ",") + " por mil" });
    C.lines($("#i-fbw"), { cats: D.WINDOWS, series: ser("fbViews"), fmt: k, tipFmt: int });
    const fbLabels = D.FB_DAILY.views.map((_, i) => dm(toIso(addDays(toDate(D.FB_DAILY.start), i))));
    const drawFb = m => C.area($("#i-fbd"), { labels: fbLabels, values: D.FB_DAILY[m], color: "--c2", fmt: m === "views" ? k : x => String(Math.round(x)), tipFmt: int, name: { views: "Visualizações", clicks: "Cliques", visits: "Visitas" }[m], ticksAt: [0, 7, 14, 21, 29] });
    drawFb("views");
    $$("#fb-m button", v).forEach(b => b.onclick = () => { $$("#fb-m button", v).forEach(x => x.setAttribute("aria-pressed", x === b)); drawFb(b.dataset.v); });
    if ($("#i-day")) C.bars($("#i-day"), { cats: D.FARMA_DAILY.labels, series: [{ name: "Vendas", color: "--c2", values: D.FARMA_DAILY.sales }], fmt: brlK, tipFmt: brl });
  }

  /* ====================================================================
     CLIENTE
     ==================================================================== */
  function renderClient(c, v) {
    v = v || $("#view");
    const ps = posts().filter(p => p.b === c.key);
    const W = D.WEEKLY[c.key];
    const counts = Object.fromEntries(COLS.map(s => [s, ps.filter(p => p.status === s).length]));
    const late = ps.filter(p => p.late).sort((a, b) => a.date.localeCompare(b.date));
    const next = ps.filter(p => p.status !== "pub" && toDate(p.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const reels = ps.filter(p => p.format === "Reels").length;
    const alerts = D.ALERTS.filter(a => a.b === c.key);
    const findings = D.FINDINGS.filter(x => x.b === c.key);
    const igp = D.IG_POSTS[c.key] || [];
    v.innerHTML = `
      <div class="hero"><span class="client-avatar" style="background:var(${c.color})">${c.short[0]}</span>
        <div style="min-width:0"><div class="eyebrow" style="color:#b9a2ff">Cliente</div><h1>${esc(c.name)}</h1><p>${esc(c.about)}</p>
          <div class="meta"><span>${esc(c.segment)}</span><span>${esc(c.handle)}</span>${c.postsProfile ? `<span>${int(c.postsProfile)} posts no perfil</span>` : ""}${c.club ? `<span>${c.club}</span>` : ""}</div></div>
        <div class="actions toolbar"><a class="btn" href="${c.ig}" target="_blank" rel="noopener">${ico("ig")} Instagram</a><a class="btn" href="${c.docs[0][1]}" target="_blank" rel="noopener">${ico("file")} Pasta no Drive</a></div></div>
      <div class="kpis">
        ${kpi("Vendas 02–08/11", W ? brl(W.sales[2]) : "sem dado", W && W.sales[1] ? `${delta(c.key === "M" ? 18.4 : 5.5)} ter–dom vs semana anterior` : "sem PDF de vendas no Drive", "money", "green")}
        ${kpi("Ticket médio", W ? brl(W.ticket[2]) : "sem dado", W ? `${int(W.orders[2])} compras` : "—", "cart")}
        ${kpi("Instagram · visualizações", W ? int(W.igViews[2]) : "sem dado", W ? `${delta(pct(W.igViews[1], W.igViews[2]))} vs 27/10–02/11` : "exportar métricas da Meta", "ig", W && W.igViews[2] < W.igViews[1] ? "red" : "green")}
        ${kpi("Plano Nov–Dez", `${counts.pub} de ${ps.length}`, `${reels} Reels · ${ps.length - reels} carrosséis · <b style="color:var(--red)">${late.length}</b> atrasadas`, "list", "amber")}
      </div>
      ${W ? `<div class="grid g2">
        <div class="panel">${banner("money", "Vendas e Instagram por janela", "relatórios semanais da Nova7")}
          <div class="panel-cols"><div><span class="col-title">Vendas líquidas</span><div class="chart" id="c-sales"></div></div><div><span class="col-title">Visualizações no Instagram</span><div class="chart" id="c-ig"></div></div></div></div>
        <div class="panel">${banner("eye", "Métricas da última janela", "02–08/11 comparado a 27/10–02/11")}
          <div class="panel-cols">
            <div><span class="col-title">Instagram</span>${[["Visualizações", "igViews"], ["Interações", "igInt"], ["Cliques no link", "igClicks"], ["Visitas ao perfil", "igVisits"], ["Novos seguidores", "igFollows"]].map(([n, m]) => `<div class="mrow"><span>${n}</span><b>${int(W[m][2])} ${delta(pct(W[m][1], W[m][2]))}</b></div>`).join("")}</div>
            <div><span class="col-title">Facebook</span>${[["Visualizações", "fbViews"], ["Interações", "fbInt"], ["Cliques no link", "fbClicks"], ["Visitas", "fbVisits"], ["Novos seguidores", "fbFollows"]].map(([n, m]) => `<div class="mrow"><span>${n}</span><b>${int(W[m][2])} ${delta(pct(W[m][1], W[m][2]))}</b></div>`).join("")}</div>
          </div></div>
      </div>` : `<p class="notice"><b>Sem métricas no Drive.</b> Para acompanhar resultados de ${esc(c.name)}, exporte da Meta Business Suite as visualizações, interações, cliques e visitas de 14/08 a 14/11 e salve na pasta do cliente. ${c.key === "C" ? "Para a Campo Forte, as métricas que importam são mensagens de produtores, pedidos de avaliação, visitas realizadas e propostas aceitas." : "Para a Nova7, acompanhe também pedidos de orçamento e cases autorizados."}</p>`}

      <div class="grid g2">
        <div class="panel">${banner("list", "Andamento do plano", `${ps.length} pautas de novembro e dezembro`, `<a class="pill-light" href="#calendario" data-brand="${c.key}">Abrir no Kanban</a>`)}
          <div class="panel-body">
            <div class="bar" style="height:12px">${COLS.map((s, i) => counts[s] ? `<i title="${STATUS[s].name}: ${counts[s]}" style="width:${counts[s] / ps.length * 100}%;background:var(--st${Math.min(4, [5, 4, 3, 3, 2, 1][i])})"></i>` : "").join("")}</div>
            <div class="legend">${COLS.filter(s => counts[s]).map((s, i) => `<span>${STATUS[s].name} <b class="tnum">${counts[s]}</b></span>`).join("")}</div>
            <span class="col-title">Próximas</span>
            <div class="post-list">${next.length ? next.map(p => `<button type="button" class="post-row" data-open="${p.code}" style="background:none;text-align:left">${fmtBadge(p.format)}<span class="t">${esc(p.title)}<small>${p.code} · publicar ${DOW[toDate(p.date).getDay()]} ${dm(p.date)}</small></span>${stBadge(p)}</button>`).join("") : `<div class="empty">Nenhuma pauta futura.</div>`}</div>
            ${late.length ? `<span class="col-title" style="color:var(--red)">Atrasadas (${late.length})</span><div class="post-list">${late.slice(0, 8).map(p => `<button type="button" class="post-row" data-open="${p.code}" style="background:none;text-align:left">${fmtBadge(p.format)}<span class="t">${esc(p.title)}<small>${p.code} · era para ${dm(p.date)}</small></span>${stBadge(p)}</button>`).join("")}</div>${late.length > 8 ? `<p class="src">e mais ${late.length - 8} no Kanban.</p>` : ""}` : ""}
          </div></div>
        <div class="panel">${banner("target", "Metas", "publicações vêm do plano; as demais você define")}
          <div class="panel-body" id="c-goals"></div></div>
      </div>

      <div class="grid g2">
        <div class="panel">${banner("ig", "Publicações vistas no Instagram", "amostra da auditoria; data exata e alcance por post ainda não extraídos")}
          <div class="panel-body"><div class="post-list">${igp.map(([sc, f, t, code, seen]) => `<a class="post-row" href="${c.ig}${f === "Reels" ? "reel" : "p"}/${sc}/" target="_blank" rel="noopener">${fmtBadge(f === "Post" ? "Post" : f)}<span class="t">${esc(t)}<small>${code ? code + " · " : ""}visto ${seen}</small></span>${ico("ext").replace("<svg", '<svg width="14" height="14"')}</a>`).join("") || `<div class="empty">Sem publicações auditadas.</div>`}</div></div></div>
        <div class="panel">${banner("file", "Documentos", "Google Drive")}
          <div class="panel-body"><div class="doc-list">${c.docs.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}<span>${u.includes("spreadsheets") ? "planilha" : u.includes("document") ? "documento" : u.includes("folders") ? "pasta" : "arquivo"}</span></a>`).join("")}</div></div></div>
      </div>

      <div class="section-title"><h2>Alertas de ${esc(c.name)}</h2><span>${alerts.length} itens</span></div>
      <div class="grid" style="gap:10px">${alerts.map(alertHtml).join("") || `<div class="empty">Nenhum alerta aberto.</div>`}</div>
      ${findings.length ? `<div class="panel">${banner("target", "Achados dos insights", "evidência não é causalidade")}<div class="table-wrap"><table><thead><tr><th>Prioridade</th><th>Rede</th><th>Achado</th><th>Próxima validação</th></tr></thead><tbody>${findings.map(x => `<tr><td><span class="badge ${x.p === "ALTA" ? "alta" : "media"}">${x.p}</span></td><td>${x.net}</td><td><b>${esc(x.t)}</b><div class="src">${esc(x.e)}</div></td><td>${esc(x.n)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
    if (W) {
      C.bars($("#c-sales"), { cats: D.WINDOWS, series: [{ name: "Vendas", color: c.color, values: W.sales }], fmt: brlK, tipFmt: brl, height: 200 });
      C.bars($("#c-ig"), { cats: D.WINDOWS, series: [{ name: "Visualizações", color: c.color, values: W.igViews }], fmt: k, tipFmt: int, height: 200 });
    }
    renderGoals(c, ps, W);
    bindOpen(v);
    const kb = $('[data-brand]', v); if (kb) kb.addEventListener("click", () => { prefs.kbrand = c.key; savePrefs(); });
  }

  function renderGoals(c, ps, W) {
    const saved = store.get(GOAL_KEY, {});
    const pub = ps.filter(p => p.status === "pub").length;
    const defs = [{ id: "posts", name: "Publicações Nov–Dez", fixed: ps.length, cur: pub, f: int, src: "plano editorial" }];
    if (W) defs.push({ id: "sales", name: "Vendas semanais", unit: "R$", cur: W.sales[2], f: brl }, { id: "ig", name: "Visualizações IG por semana", unit: "views", cur: W.igViews[2], f: int }, { id: "int", name: "Interações IG por semana", unit: "interações", cur: W.igInt[2], f: int });
    else if (c.key === "C") defs.push({ id: "leads", name: "Pedidos de avaliação técnica", unit: "contatos", cur: null, f: int }, { id: "visits", name: "Visitas técnicas realizadas", unit: "visitas", cur: null, f: int });
    else defs.push({ id: "cases", name: "Cases autorizados no portfólio", unit: "cases", cur: null, f: int }, { id: "leads", name: "Pedidos de orçamento", unit: "pedidos", cur: null, f: int });
    const host = $("#c-goals");
    host.innerHTML = defs.map(r => {
      const key = c.key + "-" + r.id, goal = r.fixed ?? saved[key] ?? null;
      const p = goal && r.cur != null ? Math.min(100, r.cur / goal * 100) : 0;
      return `<div class="goal"><div class="n">${r.name}<small>atual: ${r.cur == null ? "sem medição" : r.f(r.cur)}</small></div>
        <div><div class="v"><span>${goal ? p.toFixed(0) + "% da meta" : "—"}</span><span>${goal ? r.f(goal) : "meta a definir"}</span></div><div class="bar"><i style="width:${p}%;background:${p >= 100 ? "var(--green)" : `var(${c.color})`}"></i></div></div>
        ${r.fixed != null ? `<div><span class="lbl">Origem</span><span class="src">${r.src}</span></div>` : `<div><label class="lbl" for="g-${key}">Meta (${r.unit})</label><input type="number" min="0" step="any" id="g-${key}" data-k="${key}" value="${goal ?? ""}" placeholder="definir"></div>`}</div>`;
    }).join("") + `<p class="src">As metas digitadas ficam salvas neste navegador.</p>`;
    $$("input[data-k]", host).forEach(inp => inp.addEventListener("change", () => {
      const s = store.get(GOAL_KEY, {}), val = parseFloat(inp.value);
      if (isFinite(val) && val > 0) s[inp.dataset.k] = val; else delete s[inp.dataset.k];
      store.set(GOAL_KEY, s); renderGoals(c, ps, W); toast("Meta salva");
    }));
  }

  /* ====================================================================
     CALENDÁRIO KANBAN
     ==================================================================== */
  let kWeek = monday(TODAY), kMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  function renderKanban(v) {
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Planejamento e produção · Nov–Dez 2026</div><h1>Calendário Kanban</h1>
        <p>Arraste os cartões para mudar o status ou a data de publicação. Clique num cartão para ver as etapas (roteiro, gravação, edição, aprovação, agendamento) e editar. As mudanças ficam salvas neste navegador até a integração com a planilha.</p></div>
        <div class="toolbar"><button type="button" class="btn sm" id="k-export">Copiar alterações</button><button type="button" class="btn sm" id="k-reset">Desfazer alterações</button></div></div>
      <div class="toolbar">
        <div class="seg" id="k-view" role="group" aria-label="Visualização">${[["status", "Por status"], ["semana", "Semana"], ["mes", "Mês"]].map(([a, n]) => `<button type="button" data-v="${a}" aria-pressed="${prefs.kview === a}">${n}</button>`).join("")}</div>
        <div class="seg" id="k-brand" role="group" aria-label="Marca">${[["all", "Todas"], ...D.CLIENTS.map(c => [c.key, c.short])].map(([a, n]) => `<button type="button" data-v="${a}" aria-pressed="${prefs.kbrand === a}">${n}</button>`).join("")}</div>
        <select id="k-fmt" aria-label="Formato"><option value="all">Todos os formatos</option><option value="Reels">Reels</option><option value="Carrossel">Carrossel</option></select>
        <input type="search" id="k-q" placeholder="Buscar título ou código" aria-label="Buscar">
        <span class="spacer" style="flex:1"></span>
        <div class="toolbar" id="k-nav"></div>
      </div>
      <div id="k-summary" class="legend"></div>
      <div id="k-board"></div>`;
    $("#k-fmt").value = prefs.kfmt;
    $$("#k-view button").forEach(b => b.onclick = () => { prefs.kview = b.dataset.v; savePrefs(); $$("#k-view button").forEach(x => x.setAttribute("aria-pressed", x === b)); drawBoard(); });
    $$("#k-brand button").forEach(b => b.onclick = () => { prefs.kbrand = b.dataset.v; savePrefs(); $$("#k-brand button").forEach(x => x.setAttribute("aria-pressed", x === b)); drawBoard(); });
    $("#k-fmt").onchange = e => { prefs.kfmt = e.target.value; savePrefs(); drawBoard(); };
    $("#k-q").oninput = drawBoard;
    $("#k-export").onclick = () => {
      const txt = JSON.stringify(overrides, null, 2);
      const done = () => toast(Object.keys(overrides).length ? `${Object.keys(overrides).length} alterações copiadas` : "Nenhuma alteração para copiar");
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => toast("Não foi possível copiar")); else toast("Não foi possível copiar");
    };
    let armed = false;
    $("#k-reset").onclick = e => {
      if (!Object.keys(overrides).length) return toast("Nada para desfazer");
      if (!armed) { armed = true; e.target.textContent = "Confirmar: voltar ao original"; setTimeout(() => { armed = false; e.target.textContent = "Desfazer alterações"; }, 4000); return; }
      overrides = {}; store.set(KB_KEY, overrides); armed = false; e.target.textContent = "Desfazer alterações"; drawBoard(); renderNav(); markNav(); toast("Calendário voltou ao plano original");
    };
    drawBoard();
  }
  function filtered() {
    const q = ($("#k-q")?.value || "").trim().toLowerCase();
    return posts().filter(p => (prefs.kbrand === "all" || p.b === prefs.kbrand) && (prefs.kfmt === "all" || p.format === prefs.kfmt) && (!q || p.title.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
  }
  function card(p) {
    const d = toDate(p.date);
    return `<button type="button" class="kcard" data-drag data-code="${p.code}" style="--dot:var(${CL[p.b].color})">
      <span class="kcard-top">${brandBadge(p.b)}${fmtBadge(p.format)}<span class="code">${p.code}</span></span>
      <strong>${esc(p.title)}</strong>
      <span class="kcard-foot"><span class="${p.late ? "late" : ""}">${ico("cal").replace("<svg", '<svg width="12" height="12"')} ${DOW[d.getDay()]} ${dm(p.date)}${p.late ? " · atrasada" : ""}</span>${p.edited ? `<span title="alterado neste navegador">editado</span>` : ""}</span></button>`;
  }
  function drawBoard() {
    const ps = filtered(), board = $("#k-board"), nav = $("#k-nav");
    const late = ps.filter(p => p.late).length;
    $("#k-summary").innerHTML = `<span><b class="tnum">${ps.length}</b> pautas</span>${COLS.map(s => `<span>${STATUS[s].name} <b class="tnum">${ps.filter(p => p.status === s).length}</b></span>`).join("")}<span style="color:var(--red)">Atrasadas <b class="tnum">${late}</b></span>`;
    nav.innerHTML = "";
    if (prefs.kview === "status") {
      board.innerHTML = `<div class="kanban">${COLS.map(s => {
        const items = ps.filter(p => p.status === s).sort((a, b) => a.date.localeCompare(b.date));
        const shown = s === "pub" ? items.slice(-30) : items;
        return `<div class="kcol" data-status="${s}"><div class="kcol-head"><span>${STATUS[s].name}<br><small>${STATUS[s].hint}</small></span><b>${items.length}</b></div><div class="kcards">${shown.map(card).join("") || `<div class="kempty">Solte um cartão aqui</div>`}</div></div>`;
      }).join("")}</div>`;
    } else if (prefs.kview === "semana") {
      const days = [...Array(7)].map((_, i) => addDays(kWeek, i));
      nav.innerHTML = `<button type="button" class="btn sm" data-w="-1" aria-label="Semana anterior">‹</button><button type="button" class="btn sm" data-w="0">Hoje</button><button type="button" class="btn sm" data-w="1" aria-label="Próxima semana">›</button><b style="font-size:12.5px">${dm(toIso(days[0]))} a ${dm(toIso(days[6]))}</b>`;
      $$("[data-w]", nav).forEach(b => b.onclick = () => { const n = +b.dataset.w; kWeek = n ? addDays(kWeek, 7 * n) : monday(TODAY); drawBoard(); });
      board.innerHTML = `<div class="kanban">${days.map(d => {
        const iso = toIso(d), items = ps.filter(p => p.date === iso);
        return `<div class="kcol ${iso === TODAY_ISO ? "today" : ""}" data-date="${iso}"><div class="kcol-head"><span>${DOW[d.getDay()]} ${dm(iso)}${iso === TODAY_ISO ? " · hoje" : ""}</span><b>${items.length}</b></div><div class="kcards">${items.map(card).join("") || `<div class="kempty">Sem publicações</div>`}</div></div>`;
      }).join("")}</div>`;
    } else {
      const y = kMonth.getFullYear(), m = kMonth.getMonth();
      nav.innerHTML = `<button type="button" class="btn sm" data-m="-1" aria-label="Mês anterior">‹</button><button type="button" class="btn sm" data-m="0">Hoje</button><button type="button" class="btn sm" data-m="1" aria-label="Próximo mês">›</button><b style="font-size:12.5px;text-transform:capitalize">${MONTHS[m]} ${y}</b>`;
      $$("[data-m]", nav).forEach(b => b.onclick = () => { const n = +b.dataset.m; kMonth = n ? new Date(y, m + n, 1) : new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); drawBoard(); });
      const start = monday(new Date(y, m, 1)), cells = [];
      for (let i = 0; i < 42; i++) { const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m) break; cells.push(d); }
      board.innerHTML = `<div class="month">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="dow">${d}</div>`).join("")}${cells.map(d => {
        const iso = toIso(d), items = ps.filter(p => p.date === iso), out = d.getMonth() !== m;
        return `<div class="mday ${out ? "out" + (items.length ? "" : " blank") : ""} ${iso === TODAY_ISO ? "today" : ""}" data-date="${iso}"><div class="d"><span>${DOW[d.getDay()]} ${d.getDate()}</span>${items.length ? `<span>${items.length}</span>` : ""}</div>${items.map(p => `<button type="button" class="mchip ${p.status === "pub" ? "pub" : ""}" data-drag data-code="${p.code}" style="--dot:var(${CL[p.b].color})" title="${esc(p.code + " · " + p.title + " · " + STATUS[p.status].name)}">${p.late ? "⚠ " : ""}${esc(p.title)}</button>`).join("")}</div>`;
      }).join("")}</div>`;
    }
    bindDrag(board);
    bindOpen(board);
  }
  /* Arrastar com eventos de ponteiro: mouse arrasta direto; no toque,
     segurar ~0,45 s inicia o arraste (assim a rolagem continua livre). */
  let suppressClick = false, touchDragging = false;
  document.addEventListener("touchmove", e => { if (touchDragging) e.preventDefault(); }, { passive: false });
  document.addEventListener("click", e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
  function bindDrag(board) {
    $$("[data-drag]", board).forEach(el => {
      el.addEventListener("dragstart", e => e.preventDefault());
      el.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY, isTouch = e.pointerType !== "mouse";
        let ghost = null, zone = null, timer = null, active = false;
        const start = () => {
          active = true; touchDragging = isTouch;
          const r = el.getBoundingClientRect();
          ghost = el.cloneNode(true); ghost.classList.add("ghost");
          Object.assign(ghost.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", pointerEvents: "none", zIndex: 70, transform: "rotate(-2deg)", boxShadow: "0 12px 30px rgba(0,0,0,.25)" });
          ghost.dataset.dx = sx - r.left; ghost.dataset.dy = sy - r.top;
          document.body.appendChild(ghost); el.classList.add("dragging");
          if (navigator.vibrate && isTouch) navigator.vibrate(15);
        };
        const move = ev => {
          if (!active) {
            const far = Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6;
            if (isTouch) { if (far) cleanup(); return; }
            if (far) start(); else return;
          }
          ghost.style.left = ev.clientX - ghost.dataset.dx + "px"; ghost.style.top = ev.clientY - ghost.dataset.dy + "px";
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          const z = under && under.closest("[data-status],[data-date]");
          if (z !== zone) { zone && zone.classList.remove("over"); zone = z; zone && zone.classList.add("over"); }
          const kb = board.querySelector(".kanban");
          if (kb) { const r = kb.getBoundingClientRect(); if (ev.clientX > r.right - 40) kb.scrollLeft += 12; else if (ev.clientX < r.left + 40) kb.scrollLeft -= 12; }
        };
        const up = () => {
          const code = el.dataset.code, z = zone, was = active;
          cleanup();
          if (!was) return;
          suppressClick = true; setTimeout(() => { suppressClick = false; }, 50);
          if (!z) return;
          if (z.dataset.status) update(code, { status: z.dataset.status }, `${code} movida para ${STATUS[z.dataset.status].name}`);
          else update(code, { date: z.dataset.date }, `${code} remarcada para ${dm(z.dataset.date)}`);
        };
        function cleanup() {
          clearTimeout(timer); touchDragging = false;
          removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cleanup);
          if (ghost) ghost.remove(); el.classList.remove("dragging"); zone && zone.classList.remove("over");
          ghost = null; active = false;
        }
        if (isTouch) timer = setTimeout(start, 450);
        addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", cleanup);
      });
    });
  }
  function update(code, patch, msg) {
    const orig = D.PLAN.find(p => p.code === code);
    const o = Object.assign({}, overrides[code], patch);
    const origStatus = orig.status === "fin" ? "agd" : orig.status;
    if (o.status === origStatus) delete o.status;
    if (o.date === orig.date) delete o.date;
    if (Object.keys(o).length) overrides[code] = o; else delete overrides[code];
    store.set(KB_KEY, overrides);
    if (current === "calendario") drawBoard(); else route();
    renderNav(); markNav();
    if (msg) toast(msg);
  }
  const markNav = () => $$("#nav .nav-item").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));

  /* ---------- gaveta de detalhe ---------- */
  function bindOpen(root) {
    $$("[data-open],[data-code]", root).forEach(el => el.addEventListener("click", () => openDrawer(el.dataset.open || el.dataset.code)));
  }
  function openDrawer(code) {
    const p = posts().find(x => x.code === code); if (!p) return;
    const done = DONE_BY[p.status];
    const steps = Object.entries(p.steps);
    const dlg = $("#drawer");
    dlg.innerHTML = `<div class="drawer-head"><span class="client-avatar" style="background:var(${CL[p.b].color})">${CL[p.b].short[0]}</span><div><small style="color:var(--banner-muted)">${p.code} · ${esc(CL[p.b].name)} · ${p.format}</small><h2>${esc(p.title)}</h2></div><button type="button" class="x" id="d-close">Fechar</button></div>
      <div class="drawer-body">
        <div class="toolbar">${stBadge(p)}${fmtBadge(p.format)}${p.edited ? `<span class="badge">editado neste navegador</span>` : ""}</div>
        ${p.note ? `<p class="notice">${esc(p.note)}</p>` : ""}
        <div class="form-row">
          <div><label class="lbl" for="d-status">Status</label><select id="d-status">${COLS.map(s => `<option value="${s}" ${s === p.status ? "selected" : ""}>${STATUS[s].name}</option>`).join("")}</select></div>
          <div><label class="lbl" for="d-date">Publicar em</label><input type="date" id="d-date" value="${p.date}"></div>
        </div>
        <div><span class="col-title">Etapas de produção</span>
          <ul class="steps" style="margin-top:10px">${steps.map(([k2, d], i) => { const isDone = i < done || p.status === "pub"; const isLate = !isDone && d && toDate(d) < TODAY; return `<li class="${isDone ? "done" : isLate ? "late" : ""}"><i></i><span>${STEP_NAMES[k2]}${isLate ? " · atrasada" : ""}</span><span class="tnum">${d ? DOW[toDate(d).getDay()] + " " + dm(d) : "não se aplica"}</span></li>`; }).join("")}
          <li class="${p.status === "pub" ? "done" : p.late ? "late" : ""}"><i></i><span><b>Publicar</b></span><span class="tnum"><b>${DOW[toDate(p.date).getDay()]} ${dm(p.date)}</b></span></li></ul></div>
        <div class="doc-list"><a href="${p.doc}" target="_blank" rel="noopener">Abrir roteiro ${p.format === "Reels" ? "de Reels" : "de carrosséis"}<span>Google Docs</span></a><a href="${D.CENTRAL}" target="_blank" rel="noopener">Central editorial<span>planilha</span></a></div>
        <div class="toolbar"><button type="button" class="btn primary" id="d-save">Salvar</button>${p.edited ? `<button type="button" class="btn" id="d-revert">Voltar ao plano original</button>` : ""}</div>
      </div>`;
    const close = () => dlg.close();
    $("#d-close").onclick = close;
    dlg.onclick = e => { if (e.target === dlg) close(); };
    $("#d-save").onclick = () => { const date = $("#d-date").value || p.date; update(p.code, { status: $("#d-status").value, date }, `${p.code} salva`); close(); };
    const rv = $("#d-revert"); if (rv) rv.onclick = () => { delete overrides[p.code]; store.set(KB_KEY, overrides); close(); if (current === "calendario") drawBoard(); else route(); renderNav(); markNav(); toast(`${p.code} voltou ao plano original`); };
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  /* ====================================================================
     ALERTAS
     ==================================================================== */
  let aFilter = "all";
  function alertHtml(a) {
    return `<div class="alert ${a.p.toLowerCase()}"><span class="sev" aria-hidden="true"></span>
      <div class="h"><span class="badge ${a.p.toLowerCase()}">${a.p}</span>${brandBadge(a.b)}<h3>${esc(a.t)}</h3></div>
      <p>${esc(a.d)}</p><p class="act"><b>Ação:</b> ${esc(a.a)} <a href="${a.u}" target="_blank" rel="noopener">abrir</a></p></div>`;
  }
  function renderAlertas(v) {
    const list = D.ALERTS.filter(a => aFilter === "all" || a.p === aFilter).sort((a, b) => a.p.localeCompare(b.p));
    v.innerHTML = `<div class="page-head"><div><div class="eyebrow">Auditoria de 10/11 · insights de 14/11</div><h1>Alertas e próximas ações</h1>
      <p>P0 é imediato, P1 para os próximos dois dias, P2 para o próximo fechamento semanal.</p></div>
      <div class="seg" id="a-f" role="group" aria-label="Prioridade">${[["all", "Todos"], ["P0", "P0"], ["P1", "P1"], ["P2", "P2"]].map(([a, n]) => `<button type="button" data-v="${a}" aria-pressed="${aFilter === a}">${n} <span class="tnum">${a === "all" ? D.ALERTS.length : D.ALERTS.filter(x => x.p === a).length}</span></button>`).join("")}</div></div>
      <div class="kpis k3">${["P0", "P1", "P2"].map((p, i) => kpi(["Imediato", "Próximos 2 dias", "Fechamento semanal"][i], String(D.ALERTS.filter(a => a.p === p).length), D.CLIENTS.map(c => `${c.short} ${D.ALERTS.filter(a => a.p === p && a.b === c.key).length}`).join(" · "), "alert", ["red", "amber", ""][i])).join("")}</div>
      <div class="grid" style="gap:10px">${list.map(alertHtml).join("")}</div>`;
    $$("#a-f button", v).forEach(b => b.onclick = () => { aFilter = b.dataset.v; route(); });
  }

  /* ---------- toast ---------- */
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600); }

  /* ---------- inicialização ---------- */
  $("#menu-btn").addEventListener("click", () => $(".shell").classList.toggle("nav-open"));
  $(".sidebar").addEventListener("click", e => { if (e.target.closest(".nav-item")) $(".shell").classList.remove("nav-open"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $(".shell").classList.remove("nav-open"); });
  addEventListener("scroll", () => $(".topbar").classList.toggle("scrolled", scrollY > 4), { passive: true });
  addEventListener("hashchange", route);
  let rt; const redraw = () => { clearTimeout(rt); rt = setTimeout(() => { if (current !== "calendario") { const y = scrollY; route(); scrollTo(0, y); } }, 160); };
  let lastW = innerWidth; addEventListener("resize", () => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; redraw(); } });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  route();
})();
