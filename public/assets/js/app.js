/* Central Nova7 · aplicação (sem build, sem dependências). */
(function () {
  const D = window.N7, C = window.Charts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- formatação ---------- */
  const brl = v => v == null ? "sem dado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const brlK = v => v === 0 ? "0" : Math.abs(v) < 1000 ? "R$ " + Math.round(v) : "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
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
  /* armazenamento sincronizado com o servidor (store.js); "prefs" fica só neste navegador */
  const store = window.N7Store;
  const KB_KEY = "overrides", GOAL_KEY = "goals", PREF_KEY = "prefs", CHECK_KEY = "checks";
  const PB = window.N7_PLAYBOOK;
  const F = window.N7Flow;
  let checks = store.get(CHECK_KEY, {});
  let overrides = store.get(KB_KEY, {});
  const prefs = Object.assign({ kview: "status", kbrand: "all", kfmt: "all", ins: "all" }, store.get(PREF_KEY, {}));
  const savePrefs = () => store.set(PREF_KEY, prefs);

  /* ---------- clientes e pautas ---------- */
  /* quem está usando e quais empresas existem (cadastro vem do servidor; os detalhes antigos vêm do conjunto de dados) */
  const SVC = window.N7Services, AN = window.N7Analysis;
  const ME = window.N7User || { tipo: "equipe", papel: "admin", empresas: [] };
  const REG = window.N7Registry || { clients: [], users: [] };
  const IS_CLIENT = ME.tipo === "cliente", IS_ADMIN = !IS_CLIENT && ME.papel === "admin";
  const CAN_WRITE = !IS_CLIENT && (ME.papel === "admin" || ME.papel === "editor");
  const has = (c, s) => SVC.has(c, s);
  let CLIENTS = [], CL = {}, byId = {};
  function setupClients() {
    const legacy = Object.fromEntries(D.CLIENTS.map(c => [c.key, c]));
    CLIENTS = REG.clients.filter(c => c.active).map(r => Object.assign({ about: "", docs: [], ig: "", club: "", postsProfile: 0 }, legacy[r.key] || {}, r));
    CL = Object.fromEntries(CLIENTS.map(c => [c.key, c]));
    byId = Object.fromEntries(CLIENTS.map(c => [c.id, c]));
    Object.keys(ROUTES).forEach(id => { if (ROUTES[id].client) ROUTES[id] = undefined; });
    Object.keys(ROUTES).forEach(id => { if (ROUTES[id] === undefined) Reflect.deleteProperty(ROUTES, id); });
    CLIENTS.forEach(c => { ROUTES[c.id] = { title: c.name, client: true, render: v => renderClient(c, v) }; });
  }
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

  const plan = () => D.PLAN.concat(F.getCustom());
  const brandOfCode = code => (plan().find(x => x.code === code) || {}).b;
  function posts() {
    return plan().filter(p => CL[p.b]).map(p => {
      const o = overrides[p.code] || {};
      const status = o.status || (p.status === "fin" ? "agd" : p.status);
      const date = o.date || p.date;
      return Object.assign({}, p, { status, date, edited: !!overrides[p.code], late: toDate(date) < TODAY && status !== "pub" });
    });
  }
  const brandBadge = b => !CL[b] ? "" : `<span class="badge brand" style="--dot:var(${CL[b].color})">${esc(CL[b].short)}</span>`;
  const fmtBadge = f => `<span class="badge fmt-${f.toLowerCase()}">${esc(f)}</span>`;
  /* ---------- nota de saúde do cliente (método do playbook) ---------- */
  const clamp = v => Math.max(0, Math.min(100, v));
  const SECTORS_REG = ["saude", "agro", "contabilidade", "executivo"];     /* setores com checklist e notas próprios */
  const sectorOf = b => { const st = CL[b] && CL[b].setor; return SECTORS_REG.includes(st) ? st : "agencia"; };
  const roleOf = b => F.INTERNAL_ROLE[b] || ({ saude: "farmacêutico responsável", agro: "revisão agronômica", contabilidade: "contador responsável (revisão técnica e de ética)", executivo: "o próprio titular (revisão técnica e de conflito de interesses)" })[CL[b] && CL[b].setor] || "revisão interna";
  function health(c, all) {
    const ps = all.filter(p => p.b === c.key), W = D.WEEKLY[c.key];
    const due = ps.filter(p => toDate(p.date) <= TODAY);
    const d14 = addDays(TODAY, 14), d7 = addDays(TODAY, 7);
    const next = ps.filter(p => { const d = toDate(p.date); return d > TODAY && d <= d14; });
    const ready = s => ["prod", "apr", "agd", "pub"].includes(s);
    let pipe = next.length ? next.filter(p => ready(p.status)).length / next.length * 100 : 100;
    if (next.some(p => toDate(p.date) <= d7) && !next.some(p => toDate(p.date) <= d7 && ["apr", "agd", "pub"].includes(p.status))) pipe -= 25;
    const al = D.ALERTS.filter(a => a.b === c.key);
    const n = p => al.filter(a => a.p === p).length;
    const fair = D.FAIR.find(f => f.key === c.key);
    const rate = i => W.igInt[i] / W.igViews[i] * 1000;
    const vals = {
      pub: due.length ? due.filter(p => p.status === "pub").length / due.length * 100 : 100,
      pipe: clamp(pipe),
      res: W ? (clamp(70 + pct(W.igViews[1], W.igViews[2]) * 1.5) + (fair ? clamp(70 + fair.pct * 1.5) : clamp(70 + pct(W.igViews[1], W.igViews[2]) * 1.5))) / 2 : null,
      eng: W ? clamp(70 + pct(rate(1), rate(2)) * .5) : null,
      comp: clamp(100 - 25 * n("P0") - 10 * n("P1") - 4 * n("P2"))
    };
    const dims = PB.health.map(h => Object.assign({}, h, { value: vals[h.id] }));
    const used = dims.filter(d => d.value != null);
    const score = Math.round(used.reduce((a, d) => a + d.value * d.weight, 0) / used.reduce((a, d) => a + d.weight, 0));
    const light = PB.lights.find(l => score >= l.min);
    const weakest = used.slice().sort((a, b) => a.value - b.value)[0];
    return { score, light, dims, weakest, due: due.length, dueDone: due.filter(p => p.status === "pub").length, next: next.length };
  }
  const healthChip = h => `<span class="badge ${h.light.tone === "green" ? "st-pub" : h.light.tone === "amber" ? "st-apr" : "late"}" title="Nota de saúde">${h.score} · ${h.light.name}</span>`;
  function checkScore(code) {
    const c = checks[code]; if (!c || !c.dims) return null;
    const ids = PB.rubric.filter(r => c.dims[r.id] != null); if (ids.length < PB.rubric.length) return null;
    return Math.round(PB.rubric.reduce((a, r) => a + Number(c.dims[r.id]) * r.weight, 0) / 100);
  }
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
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.4c1.9.8 3 2.8 3 5.6"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'
  };
  const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const banner = (icon, title, sub, right = "") => `<div class="panel-banner"><span class="tile">${ico(icon)}</span><div><h3>${title}</h3>${sub ? `<small>${sub}</small>` : ""}</div>${right ? `<div class="right">${right}</div>` : ""}</div>`;
  const kpi = (label, value, sub, icon, tone = "") => `<div class="kpi"><small>${label}</small><strong class="${value === "sem dado" ? "na" : ""}">${value}</strong><em>${sub || ""}</em>${icon ? `<span class="ico ${tone}">${ico(icon)}</span>` : ""}</div>`;

  /* ---------- navegação ---------- */
  const ROUTES = {
    painel: { title: "Painel", render: renderPainel },
    insights: { title: "Insights", render: renderInsights },
    semana: { title: "Semana", render: v => window.N7Semana.render(v, { ico, banner, kpi, delta, toast, clients: () => CLIENTS }) },
    autoridade: { title: "Autoridade", render: v => window.N7Autoridade.render(v, { ico, banner, kpi, delta, toast, clients: () => CLIENTS }) },
    promocoes: { title: "Central de Promoções", render: (v, sub) => window.N7Promocoes.render(v, { ico, banner, kpi, delta, toast, clients: () => CLIENTS }, sub) },
    relatorios: { title: "Relatórios", render: v => window.N7Relatorios.render(v, { ico, banner, kpi, delta, toast, clients: () => CLIENTS, posts }) },
    cerebro: { title: "Central de Inteligência", render: (v, sub) => window.N7Cerebro.render(v, sub, brainHelpers()) },
    calendario: { title: "Calendário Kanban", render: renderKanban },
    alertas: { title: "Alertas", render: renderAlertas },
    fluxo: { title: "Fluxo e horários", render: renderFluxo },
    playbook: { title: "Playbook", render: renderPlaybook },
    config: { title: "Configurações", render: (v, sub) => window.N7Settings.render(v, sub, settingsCtx()) }
  };
  const anyPostClients = () => CLIENTS.some(c => has(c, "redes") || has(c, "criativos"));
  /* o que cada tipo de usuário enxerga no menu e nas rotas */
  const ACCESS = {
    painel: () => true,
    insights: () => !IS_CLIENT && !!CL.M && !!CL.F && !!D.FARMA_DAILY && !!D.MINAS_AUG,
    semana: () => !IS_CLIENT && CLIENTS.length > 0,
    cerebro: () => !IS_CLIENT && CLIENTS.length > 0,
    relatorios: () => !IS_CLIENT && CLIENTS.some(c => (c.services || []).length),
    promocoes: () => !IS_CLIENT && CLIENTS.some(c => has(c, "promocoes")),
    autoridade: () => !IS_CLIENT && CLIENTS.some(c => has(c, "autoridade")),
    calendario: () => anyPostClients(),
    fluxo: () => !IS_CLIENT && anyPostClients(),
    alertas: () => !IS_CLIENT && D.ALERTS.length > 0,
    playbook: () => !IS_CLIENT,
    config: () => IS_ADMIN
  };
  const allowedRoute = id => !!ROUTES[id] && (ROUTES[id].client || !ACCESS[id] || ACCESS[id]());
  async function reloadRegistry() {
    const r = await fetch("/api/state"); if (!r.ok) throw new Error("Não foi possível recarregar o cadastro.");
    const b = await r.json(); REG.clients = b.registry.clients; REG.users = b.registry.users || [];
    setupClients(); route();
  }
  /* ajudantes da Central de Inteligência: dados do site entregues às funções puras do cérebro (assets/js/brain/) */
  const brainHelpers = () => ({ ico, banner, toast, esc, store, canWrite: CAN_WRITE, today: TODAY_ISO,
    input: () => ({ today: TODAY_ISO, clients: CLIENTS.map(c => ({ key: c.key, id: c.id, name: c.name, services: c.services })), posts: posts(), weeks: allWeeks(), gens: store.get("weekGen", []), decisions: store.get("decisions", []),
      promo: window.N7PromoBrain ? window.N7PromoBrain.summaries() : {}, authority: store.get("authority", []), goals: store.get("goals", {}), ideas: F.getIdeas(), slots: F.getFlow().slots, checks,
      needsClient: p => { const st = F.approvalState(p.code, p.b); return st.needs.includes("client") && !st.rec.client; }, planSource: D.PLAN_SOURCE }),
    go: (route, brand, ideas, extra) => { if (brand) prefs.kbrand = brand; if (ideas) prefs.kview = "ideias"; if (brand || ideas) savePrefs(); if (/^promocoes/.test(route) && window.N7Promocoes) window.N7Promocoes.focus(Object.assign({ loja: brand }, extra || {})); location.hash = "#" + route; } });
  const settingsCtx = () => ({ REG, ME, clients: () => CLIENTS, banner, ico, toast, esc, reload: reloadRegistry });
  setupClients();

  function renderNav() {
    const ps = posts();
    const late = id => ps.filter(p => p.b === byId[id].key && p.late).length;
    const p0 = D.ALERTS.filter(a => a.p === "P0").length;
    const ops = [["calendario", "cal", "Calendário Kanban", ""], ["fluxo", "sliders", "Fluxo e horários", ""], ["alertas", "bell", "Alertas", `<span class="nav-count">${p0} P0</span>`], ["playbook", "file", "Playbook", ""]].filter(([id]) => ACCESS[id]());
    $("#nav").innerHTML = `
      <div class="nav-group">Visão</div>
      <a class="nav-item" href="#painel">${ico("home")}<span>Painel</span></a>
      ${ACCESS.cerebro() ? `<a class="nav-item" href="#cerebro">${ico("target")}<span>Central de Inteligência</span></a>` : ""}
      ${ACCESS.insights() ? `<a class="nav-item" href="#insights">${ico("chart")}<span>Insights</span></a>` : ""}
      ${ACCESS.semana() ? `<a class="nav-item" href="#semana">${ico("file")}<span>Semana</span></a>` : ""}
      ${ACCESS.relatorios() ? `<a class="nav-item" href="#relatorios">${ico("list")}<span>Relatórios</span></a>` : ""}
      ${ACCESS.promocoes() ? `<a class="nav-item" href="#promocoes">${ico("tag")}<span>Promoções</span></a>` : ""}
      ${ACCESS.autoridade() ? `<a class="nav-item" href="#autoridade">${ico("eye")}<span>Autoridade</span></a>` : ""}
      ${CLIENTS.length ? `<div class="nav-group">${IS_CLIENT ? "Sua empresa" : "Clientes"}</div>
      ${CLIENTS.map(c => `<a class="nav-item" href="#${c.id}"><i class="nav-dot" style="background:var(${c.color})"></i><span>${esc(c.name)}</span>${late(c.id) && !IS_CLIENT ? `<span class="nav-count" title="pautas atrasadas">${late(c.id)}</span>` : ""}</a>`).join("")}` : ""}
      ${ops.length ? `<div class="nav-group">Operação</div>${ops.map(([id, ic, name, extra]) => `<a class="nav-item" href="#${id}">${ico(ic)}<span>${name}</span>${extra}</a>`).join("")}` : ""}
      ${IS_ADMIN ? `<div class="nav-group">Sistema</div><a class="nav-item" href="#config">${ico("sliders")}<span>Configurações</span></a>` : ""}`;
  }
  /* barra de abas do celular (a navegação completa fica em "Mais") */
  function renderTabbar(active) {
    const tb = $("#tabbar"); if (!tb) return;
    const items = [["painel", "home", "Painel"]];
    if (ACCESS.calendario()) items.push(["calendario", "cal", "Calendário"]);
    if (ACCESS.semana()) items.push(["semana", "file", "Semana"]);
    if (ACCESS.cerebro()) items.push(["cerebro", "target", "Cérebro"]);
    if (ACCESS.insights()) items.push(["insights", "chart", "Insights"]);
    tb.innerHTML = items.slice(0, 4).map(([id, ic, name]) => `<a class="tab" href="#${id}"${active === id ? ' aria-current="page"' : ""}>${ico(ic)}<span>${name}</span></a>`).join("") +
      `<button type="button" class="tab" data-more aria-label="Abrir o menu completo">${ico("list")}<span>Mais</span></button>`;
  }
  function route() {
    const [id, sub] = (location.hash || "#painel").slice(1).split("/");
    const r = allowedRoute(id) ? id : "painel";
    renderNav(); renderTabbar(r);
    $$("#nav .nav-item").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + r));
    $("#crumb").innerHTML = `Central Nova7 › <b>${esc(ROUTES[r].title)}</b>`;
    document.title = ROUTES[r].title === "Painel" ? "Central Nova7" : `${ROUTES[r].title} · Central Nova7`;
    $(".shell").classList.remove("nav-open");
    C.hideTip();
    const view = $("#view");
    view.innerHTML = "";
    /* o cérebro lê o resumo das promoções de cada farmácia; carrega em segundo plano e atualiza a tela quando chega */
    if (ACCESS.cerebro() && CLIENTS.some(c => has(c, "promocoes")) && window.N7PromoBrain) window.N7PromoBrain.ensure(() => { if (current === "cerebro" || current === "painel") route(); });
    ROUTES[r].render(view, sub);
    scrollTo(0, 0);
    current = r;
  }
  let current = null;

  /* ---------- números vindos da tela Semana ---------- */
  const dec = AN.fmt.dec;
  const allWeeks = () => store.get("weeks", []);
  const analysisClients = () => CLIENTS.map(c => ({ key: c.key, name: c.name, services: c.services }));
  const lastClosedIso = () => AN.lastClosed("semana", new Date());
  const hasAds = n => Object.values(n.ads).some(x => x != null), hasIg = n => Object.values(n.ig).some(x => x != null), hasSales = n => n.vendas != null || n.dias.some(x => x != null);
  function latestWith(c, test) { return allWeeks().filter(r => r.marca === c.key && r.tipo === "semana" && r.inicio <= lastClosedIso() && test(AN.norm(r))).sort((a, b) => b.inicio.localeCompare(a.inicio))[0] || null; }
  const analyzeAt = inicio => AN.analyze({ weeks: allWeeks(), gens: store.get("weekGen", []), tipo: "semana", inicio, clients: analysisClients() });
  const clientAt = (a, c) => a.clients.find(x => x.marca === c.key);
  const periodTxt = inicio => { const p = AN.period("semana", inicio); return `${dm(p.inicio)}–${dm(p.fim)}`; };
  const igUrl = c => c.ig || (c.handle && c.handle.startsWith("@") ? `https://www.instagram.com/${c.handle.slice(1)}/` : "");
  const noteSemana = txt => `<p class="notice"><b>${txt}</b>${CAN_WRITE ? ` Informe os números na tela <a href="#semana">Semana</a>.` : ""}</p>`;

  /* pautas que ainda esperam a aprovação do cliente */
  const awaitingClient = ps => ps.filter(p => { if (p.status === "pub") return false; const st = F.approvalState(p.code, p.b); return st.needs.includes("client") && !st.rec.client; });
  const postRow = (p, note) => `<button type="button" class="post-row" data-open="${p.code}" style="background:none;text-align:left">${fmtBadge(p.format)}<span class="t">${esc(p.title)}<small>${esc(CL[p.b].short)} · ${p.code} · ${note}</small></span>${stBadge(p)}</button>`;

  /* indicadores de cada serviço; o painel junta os de todos os serviços do cliente */
  function svcKpis(c, ps) {
    const out = {};
    const pub = ps.filter(p => p.status === "pub").length, late = ps.filter(p => p.late).length, reels = ps.filter(p => p.format === "Reels").length;
    if (has(c, "redes")) {
      const hl = health(c, posts()), list = [kpi("Plano Nov–Dez", ps.length ? `${pub} de ${ps.length}` : "sem pautas", ps.length ? `${reels} Reels · ${ps.length - reels} carrosséis · <b style="color:var(--red)">${late}</b> atrasadas` : "crie ideias no Calendário", "list", "amber")];
      list.push(kpi("Nota de saúde", ps.length ? String(hl.score) : "sem dado", ps.length ? hl.light.name : "precisa de pautas no plano", "target", hl.light.tone === "green" ? "green" : hl.light.tone === "amber" ? "amber" : "red"));
      const lw = latestWith(c, hasIg);
      if (lw) { const prev = allWeeks().find(r => r.marca === c.key && r.tipo === "semana" && r.inicio === AN.prevStart("semana", lw.inicio)); list.push(kpi("Instagram · visualizações", int(lw.ig.views), `${prev && prev.ig.views != null && lw.ig.views != null ? delta(pct(prev.ig.views, lw.ig.views)) + " vs anterior" : periodTxt(lw.inicio)}`, "ig", "red")); }
      out.redes = list;
    }
    if (has(c, "varejo")) {
      const lw = latestWith(c, hasSales), list = [];
      if (lw) { const cc = clientAt(analyzeAt(lw.inicio), c); list.push(kpi(`Vendas ${periodTxt(lw.inicio)}`, cc.row.vendas == null ? "sem total" : brl(cc.row.vendas), cc.mesmosDias && cc.mesmosDias.pct != null ? `${delta(cc.mesmosDias.pct)} nos mesmos dias da semana` : "sem base de comparação", "money", "green"), kpi("Ticket médio", cc.d.ticket == null ? "sem dado" : brl(cc.d.ticket), cc.row.compras != null ? `${int(cc.row.compras)} compras` : "", "cart")); }
      else list.push(kpi("Vendas", "sem dado", "informe na tela Semana", "money", "green"));
      out.varejo = list;
    }
    if (has(c, "trafego")) {
      const lw = latestWith(c, hasAds), list = [];
      if (lw) { const n = AN.norm(lw), d = AN.derive(n); list.push(kpi(`Meta Ads ${periodTxt(lw.inicio)}`, n.ads.gasto == null ? "sem gasto" : brl(n.ads.gasto), d.adsCusto != null ? `custo por resultado ${brl(d.adsCusto)}` : "sem resultado informado", "target", "amber"), kpi("Frequência", d.adsFreq == null ? "sem dado" : dec(d.adsFreq, 2), d.adsFreq != null && d.adsFreq > 1.5 ? "acima de 1,5: saturação" : "limite saudável: 1,5", "eye", d.adsFreq != null && d.adsFreq > 1.5 ? "red" : "green")); }
      else list.push(kpi("Meta Ads", "sem dado", "informe na tela Semana", "target", "amber"));
      out.trafego = list;
    }
    if (has(c, "autoridade")) {
      const ini = AU.periodsWith(store.get("authority", []), c.key).filter(i => i <= lastClosedIso()).pop(), list = [];
      if (ini) { const a = AU.analyze({ rows: store.get("authority", []), client: c, inicio: ini, metaPosts: authMeta(c) });
        list.push(kpi(`Publicações ${periodTxt(ini)}`, a.posts.atual == null ? "sem dado" : `${int(a.posts.atual)} de ${int(a.posts.meta)}`, a.posts.atual != null && a.posts.atual >= a.posts.meta ? "meta cumprida" : "regularidade é a base da autoridade", "cal", a.posts.atual != null && a.posts.atual < a.posts.meta ? "amber" : "green"));
        a.canais.filter(x => x.row).slice(0, 2).forEach(x => list.push(kpi(`${x.nome} · alcance`, x.row.alcance == null ? "sem dado" : int(x.row.alcance), x.cmp.alcance.pct != null ? delta(x.cmp.alcance.pct) + " vs anterior" : "sem semana anterior", x.canal === "li" ? "target" : "ig", "red"))); }
      else list.push(kpi("Autoridade", "sem dado", "informe na tela Autoridade", "eye", "amber"));
      out.autoridade = list;
    }
    if (has(c, "criativos")) {
      const n = s => ps.filter(p => p.status === s).length;
      out.criativos = [kpi("Peças em produção", String(n("prod") + n("plan")), `${n("prop")} propostas`, "file"), kpi("Em aprovação", String(n("apr")), `${n("agd")} prontas · ${n("pub")} publicadas`, "list", "amber")];
      if (!has(c, "redes")) out.criativos.push(kpi("Atrasadas", String(late), late ? "revisar prazos" : "tudo no prazo", "alert", late ? "red" : "green"));
    }
    return out;
  }
  function pickKpis(groups, max = 4) {
    const lists = SVC.ORDER.map(s => groups[s]).filter(Boolean), out = [];
    for (let i = 0; out.length < max && lists.some(l => l[i]); i++) lists.forEach(l => { if (l[i] && out.length < max) out.push(l[i]); });
    return out;
  }
  const svcChips = c => `<span class="svc-chips">${SVC.ORDER.filter(s => has(c, s)).map(s => `<span class="svc-chip" style="--svc:var(${SVC.SERVICES[s].color})">${SVC.SERVICES[s].short}</span>`).join("")}</span>`;

  /* ====================================================================
     PAINEL
     ==================================================================== */
  function renderPainel(v) {
    if (IS_CLIENT) return renderPainelCliente(v);
    const ps = posts(), anyPosts = CLIENTS.some(c => has(c, "redes") || has(c, "criativos"));
    const pub = ps.filter(p => p.status === "pub").length, late = ps.filter(p => p.late).length;
    const mon = monday(TODAY), sun = addDays(mon, 6);
    const week = ps.filter(p => { const d = toDate(p.date); return d >= mon && d <= sun; }).sort((a, b) => a.date.localeCompare(b.date));
    const varejo = CLIENTS.filter(c => has(c, "varejo")), trafego = CLIENTS.filter(c => has(c, "trafego"));
    const ini = AN.periodsWith(allWeeks().filter(r => r.inicio <= lastClosedIso()), "semana").pop();
    const an = ini ? analyzeAt(ini) : null;
    const kp = [kpi("Clientes ativos", String(CLIENTS.length), SVC.ORDER.map(s => [s, CLIENTS.filter(c => has(c, s)).length]).filter(x => x[1]).map(([s, n]) => `${n} ${SVC.SERVICES[s].short.toLowerCase()}`).join(" · ") || "cadastre em Configurações", "list")];
    if (anyPosts) kp.push(kpi("Pautas publicadas", `${pub} de ${ps.length}`, `plano Nov–Dez · <b class="tnum" style="color:var(--red)">${late}</b> atrasadas`, "cal", "amber"));
    /* cada farmácia à parte: nunca somamos vendas nem anúncios de lojas diferentes */
    if (an) varejo.forEach(c => { const cc = clientAt(an, c); if (cc && cc.row.vendas != null) kp.push(kpi(`Vendas · ${c.short} ${periodTxt(ini)}`, brl(cc.row.vendas), cc.mesmosDias && cc.mesmosDias.pct != null ? `${delta(cc.mesmosDias.pct)} nos mesmos dias da semana` : "sem base de comparação", "money", "green")); });
    if (kp.length < 4 && anyPosts) kp.push(kpi("Aguardando aprovação", String(ps.filter(p => p.status === "apr").length), "pautas na etapa de aprovação", "list", "amber"));
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Gestão interna · ${CLIENTS.length} contas</div><h1>Painel da agência</h1>
        <p>${ini ? `Última semana com números: ${esc(AN.period("semana", ini).label)}.` : "Ainda não há números de semana."} Cada cliente mostra o que importa para os serviços que a Nova7 presta a ele.</p></div>
        <div class="toolbar">${CAN_WRITE ? `<a class="btn" href="#semana">${ico("file")} Semana</a>` : ""}${anyPosts ? `<a class="btn primary" href="#calendario">${ico("cal")} Abrir calendário</a>` : ""}</div></div>
      <div class="kpis">${kp.slice(0, 4).join("")}</div>
      ${ACCESS.cerebro() ? window.N7Cerebro.mini(brainHelpers()) : ""}
      <div class="section-title"><h2>Clientes</h2><span>clique para abrir a página do cliente</span></div>
      ${CLIENTS.length ? `<div class="grid g4">${CLIENTS.map(c => clientCard(c, ps)).join("")}</div>` : `<div class="empty">Nenhum cliente ativo. ${IS_ADMIN ? `Cadastre em <a href="#config/clientes">Configurações</a>.` : ""}</div>`}
      <div class="grid g2">
        ${anyPosts ? `<div class="panel">${banner("cal", "Esta semana", `${dm(toIso(mon))} a ${dm(toIso(sun))} · ${week.length} pautas`, `<a class="pill-light" href="#calendario">Kanban</a>`)}
          <div class="table-wrap"><table><thead><tr><th style="width:84px">Data</th><th style="width:96px">Marca</th><th>Pauta</th><th style="width:150px">Status</th></tr></thead><tbody>
          ${week.length ? week.map(p => `<tr data-open="${p.code}" style="cursor:pointer"><td class="num">${DOW[toDate(p.date).getDay()]} ${dm(p.date)}</td><td>${brandBadge(p.b)}</td><td><span class="code">${p.code}</span> ${esc(p.title)}</td><td>${stBadge(p)}</td></tr>`).join("") : `<tr><td colspan="4"><div class="empty">Nenhuma pauta nesta semana.</div></td></tr>`}
          </tbody></table></div></div>` : ""}
        ${D.ALERTS.length ? `<div class="panel">${banner("alert", "Prioridade imediata", "P0 da auditoria de 10/11", `<a class="pill-light down" href="#alertas">${D.ALERTS.length} alertas</a>`)}
          <div class="panel-body">${D.ALERTS.filter(a => a.p === "P0").map(alertHtml).join("")}</div></div>` : ""}
      </div>
      <div class="grid g2">
        ${varejo.length && ini ? `<div class="panel">${banner("money", "Vendas por semana", varejo.map(c => c.name).join(" e "))}
          <div class="panel-body"><div class="legend">${varejo.map(c => `<span><i class="sw" style="background:var(${c.color})"></i>${esc(c.name)}</span>`).join("")}</div>
          <div class="chart" id="p-sales" data-label="Vendas por semana"></div><p class="src">Vendas informadas na tela Semana. Semana sem total aparece como lacuna.</p></div></div>` : ""}
        ${D.ROUTINE.length ? `<div class="panel">${banner("clock", "Rotina da agência", "Fluxo semanal definido pela diretoria")}
          <div class="panel-body"><div class="week" style="grid-template-columns:1fr">${D.ROUTINE.map(([d, t], i) => `<div class="day ${TODAY.getDay() === i + 1 ? "today" : ""}"><b>${d}${TODAY.getDay() === i + 1 ? " · hoje" : ""}</b><span>${t}</span></div>`).join("")}</div>
          <p class="notice info">Antes de publicar: edição, revisão farmacêutica ou agronômica, validação do cliente, arquivo final no Drive e confirmação do agendamento.</p></div></div>` : ""}
      </div>`;
    const sh = $("#p-sales", v);
    if (sh) {
      const sers = varejo.map(c => ({ c, s: AN.series(allWeeks(), "semana", ini, c.key, r => r.vendas, 6) }));
      if (sers.some(x => x.s.some(p => p.valor != null))) C.bars(sh, { cats: sers[0].s.map(p => dm(p.inicio)), series: sers.map(x => ({ name: x.c.name, color: x.c.color, values: x.s.map(p => p.valor) })), fmt: brlK, tipFmt: brl });
      else sh.parentElement.innerHTML = `<p class="src">Nenhuma semana com vendas totais informadas.</p>`;
    }
    bindOpen(v);
    $$(".client-card", v).forEach(el => { el.addEventListener("click", () => { location.hash = el.dataset.go; }); el.addEventListener("keydown", e => { if (e.key === "Enter") location.hash = el.dataset.go; }); });
  }

  /* painel de quem é cliente: só o que está sendo feito e o que espera a aprovação dele */
  function renderPainelCliente(v) {
    const ps = posts(), mon = monday(TODAY), sun = addDays(mon, 6);
    const week = ps.filter(p => { const d = toDate(p.date); return d >= mon && d <= sun; }).sort((a, b) => a.date.localeCompare(b.date));
    const wait = awaitingClient(ps).sort((a, b) => a.date.localeCompare(b.date));
    const first = (ME.nome || "").split(" ")[0];
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Área do cliente</div><h1>${first ? `Olá, ${esc(first)}` : "Olá"}</h1>
        <p>Aqui você acompanha o que a Nova7 está produzindo e aprova as peças antes de irem ao ar.</p></div>
        <div class="toolbar"><a class="btn primary" href="#calendario">${ico("cal")} Ver calendário</a></div></div>
      <div class="kpis k3">
        ${kpi("Aguardando sua aprovação", String(wait.length), wait.length ? "abra a pauta e aprove ou peça ajustes" : "nada pendente com você", "bell", wait.length ? "red" : "green")}
        ${kpi("Publicadas", `${ps.filter(p => p.status === "pub").length} de ${ps.length}`, "no plano de novembro e dezembro", "list", "green")}
        ${kpi("Nesta semana", String(week.length), `${dm(toIso(mon))} a ${dm(toIso(sun))}`, "cal")}
      </div>
      <div class="grid g4">${CLIENTS.map(c => clientCard(c, ps)).join("")}</div>
      <div class="grid g2">
        <div class="panel">${banner("bell", "Aguardando sua aprovação", `${wait.length} pauta(s)`)}<div class="panel-body"><div class="post-list">${wait.length ? wait.slice(0, 12).map(p => postRow(p, `publicar ${DOW[toDate(p.date).getDay()]} ${dm(p.date)}`)).join("") : `<div class="empty">Nenhuma pauta pendente.</div>`}</div></div></div>
        <div class="panel">${banner("cal", "Esta semana", `${week.length} pauta(s)`)}<div class="panel-body"><div class="post-list">${week.length ? week.map(p => postRow(p, `${DOW[toDate(p.date).getDay()]} ${dm(p.date)}`)).join("") : `<div class="empty">Nenhuma pauta nesta semana.</div>`}</div></div></div>
      </div>`;
    bindOpen(v);
    $$(".client-card", v).forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.go; }));
  }

  function clientCard(c, ps) {
    const mine = ps.filter(p => p.b === c.key), pub = mine.filter(p => p.status === "pub").length, late = mine.filter(p => p.late).length;
    const next = mine.filter(p => p.status !== "pub" && toDate(p.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
    const rows = [], na = txt => `<b class="na">${txt}</b>`;
    if (!IS_CLIENT && has(c, "varejo")) { const lw = latestWith(c, hasSales); rows.push(`<div class="mrow"><span>Vendas${lw ? " " + periodTxt(lw.inicio) : ""}</span>${lw && lw.vendas != null ? `<b>${brl(lw.vendas)}</b>` : na("sem dado")}</div>`); }
    if (!IS_CLIENT && has(c, "trafego")) { const lw = latestWith(c, hasAds); rows.push(`<div class="mrow"><span>Meta Ads · gasto</span>${lw && lw.ads.gasto != null ? `<b>${brl(lw.ads.gasto)}</b>` : na("sem dado")}</div>`); }
    if (!IS_CLIENT && has(c, "redes")) { const lw = latestWith(c, hasIg); rows.push(`<div class="mrow"><span>Views IG</span>${lw && lw.ig.views != null ? `<b>${int(lw.ig.views)}</b>` : na("sem dado")}</div>`); }
    if (has(c, "redes") || has(c, "criativos")) rows.push(`<div class="mrow"><span>${has(c, "redes") ? "Pautas" : "Peças"} atrasadas</span><b style="color:${late ? "var(--red)" : "inherit"}">${late}</b></div>`);
    const head = !IS_CLIENT && has(c, "redes") && mine.length ? (() => { const h = health(c, ps); return `<div class="health-row"><span class="health-num tone-${h.light.tone}">${h.score}</span><div><b>${h.light.name}</b><div class="src">mais fraca: ${h.weakest.name} (${Math.round(h.weakest.value)})</div></div></div>`; })() : "";
    return `<div class="panel client-card" tabindex="0" role="link" data-go="${c.id}">
      <div class="panel-body">
        <div style="display:flex;gap:10px;align-items:center"><span class="client-avatar" style="background:var(${c.color})">${esc(c.short[0])}</span><div style="min-width:0"><h3 style="font-size:14px">${esc(c.name)}</h3><div class="src">${esc(c.handle || c.segment)}</div></div></div>
        ${svcChips(c)}${head}
        ${rows.length ? `<div class="metric-box"><h4>${IS_CLIENT ? "Andamento" : "Resumo"}</h4>${rows.join("")}</div>` : ""}
        ${mine.length ? `<div><div class="mrow" style="padding:0 0 5px"><span>Plano Nov–Dez</span><b>${pub}/${mine.length}</b></div><div class="bar"><i style="width:${pub / mine.length * 100}%;background:var(${c.color})"></i></div></div>` : ""}
        ${mine.length ? `<p class="src"><b>Próxima:</b> ${next ? `${dm(next.date)} · ${esc(next.title)}` : "—"}</p>` : ""}
      </div></div>`;
  }

  /* ====================================================================
     INSIGHTS
     ==================================================================== */
  function renderInsights(v) {
    if (prefs.ins !== "M" && prefs.ins !== "F") { prefs.ins = "M"; savePrefs(); }     /* uma farmácia por vez, nunca as duas somadas */
    const f = prefs.ins; // M | F
    const keys = [f];
    const W = D.WEEKLY, L = 2;
    const sum = (m, i) => keys.reduce((a, b) => a + (W[b][m][i] ?? 0), 0);
    const ser = m => keys.map(b => ({ name: CL[b].name, short: CL[b].short, color: CL[b].color, values: W[b][m] }));
    const ratio = b => W[b].igViews.map((v2, i) => v2 ? +(W[b].igInt[i] / v2 * 1000).toFixed(2) : null);
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Farmácias · Baixo Guandu-ES · 14/08 a 14/11/2026</div><h1>Insights</h1>
        <p>Vendas vêm dos PDFs do sistema das lojas; redes, dos relatórios semanais e da Meta Business Suite. Visualizações, cliques e visitas não são vendas atribuídas. Campo em branco é falta de dado, não zero.</p></div>
        <div class="seg" id="ins-f" role="group" aria-label="Empresa">${[["M", "Minas Farma"], ["F", "Farma e Farma"]].map(([k2, n]) => `<button type="button" data-v="${k2}" aria-pressed="${f === k2}">${n}</button>`).join("")}</div></div>
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
  function sectorPanel(c) {
    if (!["saude", "agro", "agencia", "contabilidade", "executivo"].includes(c.setor)) return "";   /* varejo e outros: sem notas de setor */
    const sec = sectorOf(c.key);
    if (sec === "agencia") {
      return `<div class="panel">${banner("file", "Regras para o perfil da agência", "portfólio e cases")}
        <div class="panel-body"><ul class="plain">${PB.checks.agencia.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        <span class="col-title">Brasil</span>${PB.brasil.map(([a, b]) => `<div class="mrow" style="display:block"><b style="display:block;text-align:left">${a}</b>${esc(b)}</div>`).join("")}</div></div>`;
    }
    const s = PB.sectors[sec];
    return `<div class="panel">${banner("file", `Notas do setor · ${s.name}`, "o que costuma funcionar e o que evitar")}
      <div class="panel-body"><p>${esc(s.funnel)}</p>
        <div class="grid g2" style="gap:14px">
          <div><span class="col-title">Canais que mais pesam</span><ol class="plain num">${s.channels.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div>
          <div><span class="col-title">Formatos</span><ul class="plain">${s.formats.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
          <div><span class="col-title">Calendário sazonal</span><ul class="plain">${s.seasons.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
          <div><span class="col-title" style="color:var(--red)">Erros comuns</span><ul class="plain">${s.pitfalls.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>
        </div></div></div>`;
  }
  /* ---------- seções da página do cliente, uma por serviço ---------- */
  function planPanel(c, ps, showGoals) {
    const counts = Object.fromEntries(COLS.map(s => [s, ps.filter(p => p.status === s).length]));
    const late = ps.filter(p => p.late).sort((a, b) => a.date.localeCompare(b.date));
    const next = ps.filter(p => p.status !== "pub" && toDate(p.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const title = has(c, "redes") ? "Andamento do plano" : "Fila de peças";
    return `<div class="panel">${banner("list", title, `${ps.length} ${has(c, "redes") ? "pautas" : "peças"}`, CAN_WRITE || IS_CLIENT ? `<a class="pill-light" href="#calendario" data-brand="${c.key}">Abrir no Kanban</a>` : "")}
      <div class="panel-body">
        ${ps.length ? `<div class="bar" style="height:12px">${COLS.map((s, i) => counts[s] ? `<i title="${STATUS[s].name}: ${counts[s]}" style="width:${counts[s] / ps.length * 100}%;background:var(--st${Math.min(4, [5, 4, 3, 3, 2, 1][i])})"></i>` : "").join("")}</div>
        <div class="legend">${COLS.filter(s => counts[s]).map(s => `<span>${STATUS[s].name} <b class="tnum">${counts[s]}</b></span>`).join("")}</div>` : ""}
        <span class="col-title">Próximas</span>
        <div class="post-list">${next.length ? next.map(p => `<button type="button" class="post-row" data-open="${p.code}" style="background:none;text-align:left">${fmtBadge(p.format)}<span class="t">${esc(p.title)}<small>${p.code} · publicar ${DOW[toDate(p.date).getDay()]} ${dm(p.date)}</small></span>${stBadge(p)}</button>`).join("") : `<div class="empty">${ps.length ? "Nenhuma pauta futura." : `Nada no plano ainda.${CAN_WRITE ? ' Comece pelo quadro de ideias do <a href="#calendario">Calendário</a>.' : ""}`}</div>`}</div>
        ${late.length ? `<span class="col-title" style="color:var(--red)">Atrasadas (${late.length})</span><div class="post-list">${late.slice(0, 8).map(p => `<button type="button" class="post-row" data-open="${p.code}" style="background:none;text-align:left">${fmtBadge(p.format)}<span class="t">${esc(p.title)}<small>${p.code} · era para ${dm(p.date)}</small></span>${stBadge(p)}</button>`).join("")}</div>${late.length > 8 ? `<p class="src">e mais ${late.length - 8} no Kanban.</p>` : ""}` : ""}
      </div></div>`;
  }
  function redesSection(c, ps) {
    const W = D.WEEKLY[c.key], hl = health(c, posts()), igp = D.IG_POSTS[c.key] || [];
    const metrics = W ? `<div class="panel">${banner("eye", "Métricas da última janela", "02–08/11 comparado a 27/10–02/11")}
          <div class="panel-cols">
            <div><span class="col-title">Instagram</span>${[["Visualizações", "igViews"], ["Interações", "igInt"], ["Cliques no link", "igClicks"], ["Visitas ao perfil", "igVisits"], ["Novos seguidores", "igFollows"]].map(([n, m]) => `<div class="mrow"><span>${n}</span><b>${int(W[m][2])} ${delta(pct(W[m][1], W[m][2]))}</b></div>`).join("")}</div>
            <div><span class="col-title">Facebook</span>${[["Visualizações", "fbViews"], ["Interações", "fbInt"], ["Cliques no link", "fbClicks"], ["Visitas", "fbVisits"], ["Novos seguidores", "fbFollows"]].map(([n, m]) => `<div class="mrow"><span>${n}</span><b>${int(W[m][2])} ${delta(pct(W[m][1], W[m][2]))}</b></div>`).join("")}</div>
          </div></div>
      <div class="panel">${banner("ig", "Visualizações no Instagram por janela", "relatórios semanais da Nova7")}<div class="panel-body"><div class="chart" id="c-ig"></div></div></div>` : "";
    const healthPanel = ps.length ? `<div class="panel">${banner("target", "Nota de saúde do cliente", "0 a 100 · recalculada com o Kanban e os alertas", healthChip(hl))}
          <div class="panel-body">
            <div class="health-row big"><span class="health-num tone-${hl.light.tone}">${hl.score}</span><div><b>${hl.light.name}</b><div class="src">${hl.light.action}</div></div></div>
            ${hl.dims.map(d => `<div class="goal" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) 44px"><div class="n">${d.name}<small>peso ${d.weight}% · ${d.how}</small></div><div class="bar"><i style="width:${d.value ?? 0}%;background:${d.value == null ? "transparent" : d.value >= 80 ? "var(--green)" : d.value >= 60 ? "var(--amber)" : "var(--red)"}"></i></div><b class="tnum" style="text-align:right">${d.value == null ? "—" : Math.round(d.value)}</b></div>`).join("")}
            <p class="src">${hl.dueDone} de ${hl.due} pautas com data vencida estão publicadas. Dimensões sem dado ficam fora da conta. Método adaptado do <a href="${PB.source}" target="_blank" rel="noopener">Digital Marketing Pro</a>; detalhes em <a href="#playbook">Playbook</a>.</p>
          </div></div>` : `<div class="panel">${banner("target", "Nota de saúde do cliente", "precisa de pautas no plano")}<div class="panel-body"><p class="notice info">A nota de saúde mede ritmo de publicação, pipeline, resultados, engajamento e conformidade. Ela aparece quando houver pautas no calendário deste cliente.</p></div></div>`;
    const sec = sectorPanel(c);
    return `<div class="section-title"><h2>${SVC.SERVICES.redes.name}</h2><span>calendário, aprovação e resultados dos perfis</span></div>
      <div class="grid g2">${healthPanel}${sec}</div>
      ${metrics ? `<div class="grid g2">${metrics}</div>` : ""}
      <div class="grid g2">${planPanel(c, ps)}<div class="panel">${banner("target", "Metas", "publicações vêm do plano; as demais você define")}<div class="panel-body" id="c-goals"></div></div></div>
      ${igp.length || c.docs.length ? `<div class="grid g2">
        ${igp.length ? `<div class="panel">${banner("ig", "Publicações vistas no Instagram", "amostra da auditoria; data exata e alcance por post ainda não extraídos")}
          <div class="panel-body"><div class="post-list">${igp.map(([sc, f, t, code, seen]) => `<a class="post-row" href="${c.ig}${f === "Reels" ? "reel" : "p"}/${sc}/" target="_blank" rel="noopener">${fmtBadge(f === "Post" ? "Post" : f)}<span class="t">${esc(t)}<small>${code ? code + " · " : ""}visto ${seen}</small></span>${ico("ext").replace("<svg", '<svg width="14" height="14"')}</a>`).join("")}</div></div></div>` : ""}
        ${c.docs.length ? `<div class="panel">${banner("file", "Documentos", "Google Drive")}
          <div class="panel-body"><div class="doc-list">${c.docs.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}<span>${u.includes("spreadsheets") ? "planilha" : u.includes("document") ? "documento" : u.includes("folders") ? "pasta" : "arquivo"}</span></a>`).join("")}</div></div></div>` : ""}
      </div>` : ""}`;
  }
  function trafegoSection(c) {
    const rows = allWeeks().filter(r => r.marca === c.key && r.tipo === "semana" && r.inicio <= lastClosedIso() && hasAds(AN.norm(r))).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(-8);
    const head = `<div class="section-title"><h2>${SVC.SERVICES.trafego.name}</h2><span>Meta Ads · saturação em Baixo Guandu: frequência acima de 1,5</span></div>`;
    if (!rows.length) return head + noteSemana("Sem números de Meta Ads.");
    const last = rows[rows.length - 1], sig = clientAt(analyzeAt(last.inicio), c);
    const alerts = analyzeAt(last.inicio).signals.filter(s => s.marca === c.key && s.canal === "Meta Ads");
    return head + `<div class="grid">
      <div class="panel">${banner("target", "Gasto por semana", "R$ · Meta Ads")}<div class="panel-body"><div class="chart" id="c-ads"></div></div></div>
      <div class="panel">${banner("eye", "Semana a semana", "frequência, CPM e custo por resultado")}<div class="table-wrap"><table><thead><tr><th>Semana</th><th class="num">Gasto</th><th class="num">Alcance</th><th class="num">Freq.</th><th class="num">CPM</th><th class="num">Resultados</th><th class="num">Custo/result.</th></tr></thead><tbody>
      ${rows.slice().reverse().map(r => { const n = AN.norm(r), d = AN.derive(n); return `<tr><td>${periodTxt(r.inicio)}</td><td class="num">${n.ads.gasto == null ? "—" : brl(n.ads.gasto)}</td><td class="num">${n.ads.alcance == null ? "—" : int(n.ads.alcance)}</td><td class="num" style="color:${d.adsFreq != null && d.adsFreq > 1.5 ? "var(--red)" : "inherit"}">${d.adsFreq == null ? "—" : dec(d.adsFreq, 2)}</td><td class="num">${d.adsCpm == null ? "—" : brl(d.adsCpm)}</td><td class="num">${n.ads.resultados == null ? "—" : int(n.ads.resultados)}</td><td class="num">${d.adsCusto == null ? "—" : brl(d.adsCusto)}</td></tr>`; }).join("")}
      </tbody></table></div></div></div>
      ${alerts.length ? alerts.map(s => `<p class="notice"><b>${esc(s.classe)} · ${esc(s.titulo)}.</b> ${esc(s.texto)}</p>`).join("") : `<p class="src">Nenhum alerta de saturação ou de custo nos números informados${sig ? "" : ""}.</p>`}`;
  }
  function varejoSection(c) {
    const head = `<div class="section-title"><h2>${SVC.SERVICES.varejo.name}</h2><span>vendas informadas na tela Semana · comparação do mesmo dia da semana</span></div>`;
    const lw = latestWith(c, hasSales);
    if (!lw) return head + noteSemana("Sem números de vendas.");
    const a = analyzeAt(lw.inicio), cc = clientAt(a, c), prev = cc.prev;
    const row = (l, val) => `<tr><td>${l}</td><td class="num">${val}</td></tr>`;
    return head + `<div class="grid g2">
      <div class="panel">${banner("money", "Vendas por semana", "R$")}<div class="panel-body"><div class="chart" id="c-vendas"></div><p class="src">Semana sem total aparece como lacuna.</p></div></div>
      <div class="panel">${banner("cart", `Semana ${esc(periodTxt(lw.inicio))}`, `contra ${esc(periodTxt(a.prevPeriod.inicio))}`)}<div class="table-wrap"><table><tbody>
        ${row("Vendas", cc.row.vendas == null ? "sem dado" : brl(cc.row.vendas))}
        ${row("Período anterior", prev && prev.vendas != null ? brl(prev.vendas) : "sem dado")}
        ${row("Mesmos dias da semana", cc.mesmosDias ? `${delta(cc.mesmosDias.pct)} <small class="src">${cc.mesmosDias.dias.map(i => AN.DOW[i]).join(", ")}</small>` : "sem dado")}
        ${row("Compras", cc.row.compras == null ? "sem dado" : int(cc.row.compras))}
        ${row("Ticket médio", cc.d.ticket == null ? "sem dado" : brl(cc.d.ticket))}
        ${row("Cestas acima de R$ 100", cc.d.c100Compras == null ? "sem dado" : `${dec(cc.d.c100Compras, 1)}% das compras`)}
      </tbody></table></div></div></div>
      ${a.holidays.length ? `<p class="notice"><b>Calendário:</b> ${a.holidays.map(h => `${dm(h.date)} ${esc(h.name)}`).join(" · ")}. Confira antes de concluir queda.</p>` : ""}`;
  }
  function criativosSection(c, ps) {
    const head = `<div class="section-title"><h2>${SVC.SERVICES.criativos.name}</h2><span>fila de peças, etapas e aprovação</span></div>`;
    if (has(c, "redes")) return "";                                       /* com redes sociais a fila já é o plano do calendário */
    return head + `<div class="grid g2">${planPanel(c, ps)}
      <div class="panel">${banner("file", "Como funciona", "peças e aprovação")}<div class="panel-body"><ul class="plain"><li>Cada peça é uma pauta no <a href="#calendario">Calendário</a>, com etapas de produção e data de entrega.</li><li>A aprovação interna e a do cliente ficam registradas na peça.</li>${CAN_WRITE ? `<li>Crie uma peça pelo quadro de <b>Ideias</b> do calendário: <a href="#calendario" data-brand="${c.key}" data-ideas="1">nova ideia para ${esc(c.short)}</a>.</li>` : ""}</ul></div></div></div>`;
  }

  const AU = window.N7Authority, authMeta = c => { const g = store.get("goals", {}) || {}, v = g[`${c.key}-postsemana`]; return v > 0 ? Number(v) : AU.META_POSTS; };
  function autoridadeSection(c) {
    const head = `<div class="section-title"><h2>${SVC.SERVICES.autoridade.name}</h2><span>números informados na tela <a href="#autoridade">Autoridade</a> · canais nunca somados</span></div>`;
    const rows = store.get("authority", []), ini = AU.periodsWith(rows, c.key).filter(i => i <= lastClosedIso()).pop();
    if (!ini) return head + `<div class="panel"><div class="panel-body"><p class="src">Sem números de autoridade. Informe a semana na tela Autoridade (LinkedIn, Instagram e convites).</p></div></div>`;
    const a = AU.analyze({ rows, client: c, inicio: ini, metaPosts: authMeta(c) }), top = a.signals.filter(s => s.classe !== "INCONCLUSIVO").slice(0, 3);
    return head + `<div class="grid g2">
      <div class="panel">${banner("chart", "Alcance por semana", "LinkedIn e Instagram")}<div class="panel-body"><div class="chart" id="c-auth"></div></div></div>
      <div class="panel">${banner("bell", `Semana ${esc(periodTxt(ini))}`, "o que os números dizem")}<div class="panel-body">${top.length ? top.map(s => `<div class="sig"><div class="sig-h"><span class="badge ${s.classe === "CORRIGIR" ? "p0" : s.classe === "TESTAR" ? "p1" : "st-pub"}">${s.classe}</span><span class="badge">${esc(s.canal)}</span></div><b>${esc(s.titulo)}</b></div>`).join("") : `<p class="src">Nenhuma variação relevante.</p>`}</div></div></div>`;
  }
  function renderClient(c, v) {
    v = v || $("#view");
    const ps = posts().filter(p => p.b === c.key);
    const ig = igUrl(c);
    const kp = pickKpis(svcKpis(c, ps));
    const alerts = D.ALERTS.filter(a => a.b === c.key), findings = D.FINDINGS.filter(x => x.b === c.key);
    const wait = IS_CLIENT ? awaitingClient(ps) : [];
    v.innerHTML = `
      <div class="hero p-${SVC.ORDER.find(s => has(c, s)) || "redes"}"><span class="client-avatar" style="background:var(${c.color})">${esc(c.short[0])}</span>
        <div style="min-width:0"><div class="eyebrow" style="color:#b9a2ff">${IS_CLIENT ? "Sua empresa" : "Cliente · " + esc(SVC.label(c))}</div><h1>${esc(c.name)}</h1>${c.about ? `<p>${esc(c.about)}</p>` : ""}
          <div class="meta"><span>${esc(c.segment)}</span>${c.handle ? `<span>${esc(c.handle)}</span>` : ""}${c.postsProfile ? `<span>${int(c.postsProfile)} posts no perfil</span>` : ""}${c.club ? `<span>${esc(c.club)}</span>` : ""}</div>${svcChips(c)}</div>
        <div class="actions toolbar">${ig ? `<a class="btn" href="${esc(ig)}" target="_blank" rel="noopener">${ico("ig")} Instagram</a>` : ""}${!IS_CLIENT && c.docs[0] ? `<a class="btn" href="${esc(c.docs[0][1])}" target="_blank" rel="noopener">${ico("file")} Pasta no Drive</a>` : ""}</div></div>
      ${IS_CLIENT ? `<div class="kpis k3">${kpi("Aguardando sua aprovação", String(wait.length), wait.length ? "abra a pauta para aprovar ou pedir ajustes" : "nada pendente com você", "bell", wait.length ? "red" : "green")}${kpi("Publicadas", `${ps.filter(p => p.status === "pub").length} de ${ps.length}`, "no plano de novembro e dezembro", "list", "green")}${kpi("Atrasadas", String(ps.filter(p => p.late).length), "pautas com data vencida", "alert", "amber")}</div>
        ${wait.length ? `<div class="panel">${banner("bell", "Aguardando sua aprovação", `${wait.length} pauta(s)`)}<div class="panel-body"><div class="post-list">${wait.slice(0, 12).map(p => postRow(p, `publicar ${DOW[toDate(p.date).getDay()]} ${dm(p.date)}`)).join("")}</div></div></div>` : ""}
        ${planPanel(c, ps)}`
      : `<div class="kpis">${kp.join("")}</div>
      ${has(c, "redes") ? redesSection(c, ps) : ""}
      ${has(c, "criativos") ? criativosSection(c, ps) : ""}
      ${has(c, "trafego") ? trafegoSection(c) : ""}
      ${has(c, "varejo") ? varejoSection(c) : ""}
      ${has(c, "autoridade") ? autoridadeSection(c) : ""}
      ${alerts.length ? `<div class="section-title"><h2>Alertas de ${esc(c.name)}</h2><span>${alerts.length} itens</span></div><div class="grid" style="gap:10px">${alerts.map(alertHtml).join("")}</div>` : ""}
      ${findings.length ? `<div class="panel">${banner("target", "Achados dos insights", "evidência não é causalidade")}<div class="table-wrap"><table><thead><tr><th>Prioridade</th><th>Rede</th><th>Achado</th><th>Próxima validação</th></tr></thead><tbody>${findings.map(x => `<tr><td><span class="badge ${x.p === "ALTA" ? "alta" : "media"}">${x.p}</span></td><td>${x.net}</td><td><b>${esc(x.t)}</b><div class="src">${esc(x.e)}</div></td><td>${esc(x.n)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`}`;
    if (!IS_CLIENT) {
      const W = D.WEEKLY[c.key];
      if (W && $("#c-ig", v)) C.bars($("#c-ig"), { cats: D.WINDOWS, series: [{ name: "Visualizações", color: c.color, values: W.igViews }], fmt: k, tipFmt: int, height: 200 });
      const ah = $("#c-ads", v);
      if (ah) {
        const rows = allWeeks().filter(r => r.marca === c.key && r.tipo === "semana" && r.inicio <= lastClosedIso() && hasAds(AN.norm(r))).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(-8);
        C.bars(ah, { cats: rows.map(r => dm(r.inicio)), series: [{ name: "Gasto", color: c.color, values: rows.map(r => r.ads.gasto) }], fmt: brlK, tipFmt: brl, height: 200 });
      }
      const au = $("#c-auth", v);
      if (au) {
        const ini = AU.periodsWith(store.get("authority", []), c.key).filter(i => i <= lastClosedIso()).pop(), rs = store.get("authority", []);
        const s = ["li", "ig"].map(ch => AU.series(rs, c.key, ch, n => n.alcance, ini, 8));
        if (s.some(x => x.some(p => p.valor != null))) C.lines(au, { cats: s[0].map(p => dm(p.inicio)), series: [{ name: "LinkedIn", short: "LinkedIn", color: "--c7", values: s[0].map(p => p.valor) }, { name: "Instagram", short: "Instagram", color: "--c2", values: s[1].map(p => p.valor) }], fmt: k, tipFmt: int, height: 200 });
        else au.innerHTML = `<p class="src">Nenhum alcance informado.</p>`;
      }
      const vh = $("#c-vendas", v);
      if (vh) {
        const ini = (latestWith(c, hasSales) || {}).inicio, s = AN.series(allWeeks(), "semana", ini, c.key, r => r.vendas, 8);
        if (s.some(p => p.valor != null)) C.bars(vh, { cats: s.map(p => dm(p.inicio)), series: [{ name: "Vendas", color: c.color, values: s.map(p => p.valor) }], fmt: brlK, tipFmt: brl, height: 200 });
        else vh.innerHTML = `<p class="src">Nenhuma semana com total de vendas informado.</p>`;
      }
      if ($("#c-goals", v)) renderGoals(c, ps, D.WEEKLY[c.key]);
    }
    bindOpen(v);
    $$("[data-brand]", v).forEach(kb => kb.addEventListener("click", () => { prefs.kbrand = c.key; if (kb.dataset.ideas) prefs.kview = "ideias"; savePrefs(); }));
  }

  function renderGoals(c, ps, W) {
    const saved = store.get(GOAL_KEY, {});
    const pub = ps.filter(p => p.status === "pub").length;
    const defs = [{ id: "posts", name: "Publicações Nov–Dez", fixed: ps.length, cur: pub, f: int, src: "plano editorial" }];
    if (W) defs.push({ id: "sales", name: "Vendas semanais", unit: "R$", cur: W.sales[2], f: brl }, { id: "ig", name: "Visualizações IG por semana", unit: "views", cur: W.igViews[2], f: int }, { id: "int", name: "Interações IG por semana", unit: "interações", cur: W.igInt[2], f: int });
    else if (c.key !== "N" && c.key !== "C") defs.push({ id: "leads", name: "Contatos e pedidos por semana", unit: "contatos", cur: null, f: int });
    else if (c.key === "C") defs.push({ id: "leads", name: "Pedidos de avaliação técnica", unit: "contatos", cur: null, f: int }, { id: "visits", name: "Visitas técnicas realizadas", unit: "visitas", cur: null, f: int });
    else defs.push({ id: "cases", name: "Cases autorizados no portfólio", unit: "cases", cur: null, f: int }, { id: "leads", name: "Pedidos de orçamento", unit: "pedidos", cur: null, f: int });
    const host = $("#c-goals");
    host.innerHTML = defs.map(r => {
      const key = c.key + "-" + r.id, goal = r.fixed ?? saved[key] ?? null;
      const p = goal && r.cur != null ? Math.min(100, r.cur / goal * 100) : 0;
      return `<div class="goal"><div class="n">${r.name}<small>atual: ${r.cur == null ? "sem medição" : r.f(r.cur)}</small></div>
        <div><div class="v"><span>${goal ? p.toFixed(0) + "% da meta" : "—"}</span><span>${goal ? r.f(goal) : "meta a definir"}</span></div><div class="bar"><i style="width:${p}%;background:${p >= 100 ? "var(--green)" : `var(${c.color})`}"></i></div></div>
        ${r.fixed != null ? `<div><span class="lbl">Origem</span><span class="src">${r.src}</span></div>` : `<div><label class="lbl" for="g-${key}">Meta (${r.unit})</label><input type="number" min="0" step="any" id="g-${key}" data-k="${key}" value="${goal ?? ""}" placeholder="definir"${CAN_WRITE ? "" : " disabled"}></div>`}</div>`;
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
  /* de onde veio o calendário: lido ao vivo da Central editorial ou a cópia embutida */
  function planSourceNote() {
    const s = D.PLAN_SOURCE; if (!s) return "";
    if (s.source === "central") { const d = new Date(s.at); return `<span class="badge st-pub" title="O plano é lido da aba PRODUÇÃO CENTRAL da Central editorial">Central ao vivo · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</span>`; }
    return `<span class="badge p1" title="${esc(s.error || s.reason || "")}">cópia de 18/11 (Central não lida)</span>`;
  }
  let kWeek = monday(TODAY), kMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  function renderKanban(v) {
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Planejamento e produção · Nov–Dez 2026</div><h1>Calendário Kanban</h1>
        <p>Arraste os cartões para mudar o status ou a data de publicação. Clique num cartão para ver as etapas, registrar aprovações e editar. Na visão Ideias, guarde pautas ainda sem data e agende as aprovadas nos horários fixos do cliente. As mudanças feitas aqui ficam salvas na planilha-banco. ${planSourceNote()}</p></div>
        <div class="toolbar"><button type="button" class="btn sm" id="k-export">Copiar alterações</button><button type="button" class="btn sm" id="k-reset">Desfazer alterações</button></div></div>
      <div class="toolbar">
        <div class="seg" id="k-view" role="group" aria-label="Visualização">${[["status", "Por status"], ["semana", "Semana"], ["mes", "Mês"], ["ideias", "Ideias"]].map(([a, n]) => `<button type="button" data-v="${a}" aria-pressed="${prefs.kview === a}">${n}</button>`).join("")}</div>
        <div class="seg" id="k-brand" role="group" aria-label="Marca">${[["all", "Todas"], ...CLIENTS.map(c => [c.key, c.short])].map(([a, n]) => `<button type="button" data-v="${a}" aria-pressed="${prefs.kbrand === a}">${n}</button>`).join("")}</div>
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
  function approvalTag(p) {
    if (!["prod", "apr", "agd"].includes(p.status)) return "";
    const st = F.approvalState(p.code, p.b); if (!st.needs.length) return "";
    const falta = st.pending.map(k => F.KIND_NAME[k].toLowerCase()).join(" e ");
    return `<span class="badge ${st.complete ? "st-pub" : "st-apr"}" title="${st.complete ? "Aprovações completas" : "Falta a aprovação " + falta}">aprov. ${st.done.length}/${st.needs.length}</span>`;
  }
  function card(p) {
    const d = toDate(p.date);
    return `<button type="button" class="kcard" data-drag data-code="${p.code}" style="--dot:var(${CL[p.b].color})">
      <span class="kcard-top">${brandBadge(p.b)}${fmtBadge(p.format)}<span class="code">${p.code}</span></span>
      <strong>${esc(p.title)}</strong>
      <span class="kcard-foot"><span class="${p.late ? "late" : ""}">${ico("cal").replace("<svg", '<svg width="12" height="12"')} ${DOW[d.getDay()]} ${dm(p.date)}${p.time ? " " + p.time : ""}${p.late ? " · atrasada" : ""}</span>${approvalTag(p)}${scoreTag(p.code)}${p.edited ? `<span title="alterado neste navegador">editado</span>` : ""}</span></button>`;
  }
  /* horários fixos livres do cliente escolhido, para a semana e o mês */
  function takenFn() {
    const m = new Map();
    posts().forEach(p => { const k = p.b + "|" + p.date; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(p.format); });
    return (b, ds, fmt) => { const set = m.get(b + "|" + ds); return !!set && (fmt === "Qualquer" || set.has(fmt)); };
  }
  function freeInView(from, to) {
    if (prefs.kbrand === "all") return {};
    const start = from < TODAY ? TODAY : from; if (to < start) return {};
    const out = {};
    F.freeSlots({ brand: prefs.kbrand, from: start, to, taken: takenFn() })
      .filter(s => prefs.kfmt === "all" || s.format === "Qualquer" || s.format === prefs.kfmt)
      .forEach(s => { (out[s.date] = out[s.date] || []).push(s); });
    return out;
  }
  const slotBtn = (s, compact) => `<button type="button" class="${compact ? "mslot" : "kslot"}${s.holiday ? " holiday" : ""}" data-slot="${s.date}|${s.time}|${s.format}" title="${s.holiday ? "Data de atenção: " + s.holiday + ". " : ""}Horário livre: clique para agendar uma ideia aprovada">${compact ? "◌ " : "<span>◌</span> "}${s.time} ${s.format === "Qualquer" ? "livre" : s.format}${compact ? "" : " · horário livre"}</button>`;
  function bindSlots(board) { $$("[data-slot]", board).forEach(el => el.addEventListener("click", () => { const [d, t, f] = el.dataset.slot.split("|"); openSlot(prefs.kbrand, d, t, f); })); }

  function drawBoard() {
    const ps = filtered(), board = $("#k-board"), nav = $("#k-nav");
    if (prefs.kview === "ideias") return drawIdeas(board, nav);
    const late = ps.filter(p => p.late).length;
    $("#k-summary").innerHTML = `<span><b class="tnum">${ps.length}</b> pautas</span>${COLS.map(s => `<span>${STATUS[s].name} <b class="tnum">${ps.filter(p => p.status === s).length}</b></span>`).join("")}<span style="color:var(--red)">Atrasadas <b class="tnum">${late}</b></span>${["semana", "mes"].includes(prefs.kview) && prefs.kbrand === "all" ? `<span class="src">Escolha uma marca para ver os horários livres.</span>` : ""}`;
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
      const free = freeInView(days[0], days[6]);
      board.innerHTML = `<div class="kanban">${days.map(d => {
        const iso = toIso(d), items = ps.filter(p => p.date === iso), fs = free[iso] || [];
        return `<div class="kcol ${iso === TODAY_ISO ? "today" : ""}" data-date="${iso}"><div class="kcol-head"><span>${DOW[d.getDay()]} ${dm(iso)}${iso === TODAY_ISO ? " · hoje" : ""}</span><b>${items.length}</b></div><div class="kcards">${items.map(card).join("") || (fs.length ? "" : `<div class="kempty">Sem publicações</div>`)}${fs.map(x => slotBtn(x)).join("")}</div></div>`;
      }).join("")}</div>`;
    } else {
      const y = kMonth.getFullYear(), m = kMonth.getMonth();
      nav.innerHTML = `<button type="button" class="btn sm" data-m="-1" aria-label="Mês anterior">‹</button><button type="button" class="btn sm" data-m="0">Hoje</button><button type="button" class="btn sm" data-m="1" aria-label="Próximo mês">›</button><b style="font-size:12.5px;text-transform:capitalize">${MONTHS[m]} ${y}</b>`;
      $$("[data-m]", nav).forEach(b => b.onclick = () => { const n = +b.dataset.m; kMonth = n ? new Date(y, m + n, 1) : new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); drawBoard(); });
      const start = monday(new Date(y, m, 1)), cells = [];
      for (let i = 0; i < 42; i++) { const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m) break; cells.push(d); }
      const free = freeInView(cells[0], cells[cells.length - 1]);
      board.innerHTML = `<div class="month">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(d => `<div class="dow">${d}</div>`).join("")}${cells.map(d => {
        const iso = toIso(d), items = ps.filter(p => p.date === iso), out = d.getMonth() !== m, fs = free[iso] || [];
        return `<div class="mday ${out ? "out" + (items.length ? "" : " blank") : ""} ${iso === TODAY_ISO ? "today" : ""}" data-date="${iso}"><div class="d"><span>${DOW[d.getDay()]} ${d.getDate()}</span>${items.length ? `<span>${items.length}</span>` : ""}</div>${items.map(p => `<button type="button" class="mchip ${p.status === "pub" ? "pub" : ""}" data-drag data-code="${p.code}" style="--dot:var(${CL[p.b].color})" title="${esc(p.code + " · " + p.title + " · " + STATUS[p.status].name)}">${p.late ? "⚠ " : ""}${esc(p.title)}</button>`).join("")}${fs.map(x => slotBtn(x, true)).join("")}</div>`;
      }).join("")}</div>`;
    }
    bindDrag(board);
    bindOpen(board);
    bindSlots(board);
  }
  /* Arrastar com eventos de ponteiro: mouse arrasta direto; no toque,
     segurar ~0,45 s inicia o arraste (assim a rolagem continua livre). */
  let suppressClick = false, touchDragging = false;
  document.addEventListener("touchmove", e => { if (touchDragging) e.preventDefault(); }, { passive: false });
  document.addEventListener("click", e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
  function bindDrag(board) {
    if (!CAN_WRITE) return;
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
          const z = under && under.closest("[data-status],[data-date],[data-stage]");
          if (z !== zone) { zone && zone.classList.remove("over"); zone = z; zone && zone.classList.add("over"); }
          const kb = board.querySelector(".kanban");
          if (kb) { const r = kb.getBoundingClientRect(); if (ev.clientX > r.right - 40) kb.scrollLeft += 12; else if (ev.clientX < r.left + 40) kb.scrollLeft -= 12; }
        };
        const up = () => {
          const code = el.dataset.code || el.dataset.idea, isIdea = !!el.dataset.idea, z = zone, was = active;
          cleanup();
          if (!was) return;
          suppressClick = true; setTimeout(() => { suppressClick = false; }, 50);
          if (!z) return;
          if (isIdea !== !!z.dataset.stage) return;
          if (z.dataset.stage) return moveIdea(code, z.dataset.stage);
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
    const cur = posts().find(p => p.code === code);
    if (cur && patch.status && patch.status !== cur.status) {
      const g = F.gate(patch.status, F.approvalState(code, cur.b));
      if (!g.ok) { toast(`${code}: ${g.msg} Registre na pauta.`); if (!$("#drawer").open) openDrawer(code, { focus: "aprov" }); return false; }
    }
    const orig = plan().find(p => p.code === code);
    const o = Object.assign({}, overrides[code], patch);
    const origStatus = orig.status === "fin" ? "agd" : orig.status;
    if (o.status === origStatus) delete o.status;
    if (o.date === orig.date) delete o.date;
    if (Object.keys(o).length) overrides[code] = o; else delete overrides[code];
    store.set(KB_KEY, overrides);
    if (current === "calendario") drawBoard(); else route();
    renderNav(); markNav();
    if (msg) toast(msg);
    return true;
  }
  const markNav = () => $$("#nav .nav-item").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + current));

  /* ---------- gaveta de detalhe ---------- */
  let flowDirty = false;
  const fmtAt = iso => { const d = new Date(iso); return `${dm(toIso(d))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const refreshUnder = () => { if (current === "calendario") drawBoard(); else route(); renderNav(); markNav(); };
  const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const slotLabel = s => `${DOW[toDate(s.date).getDay()]} ${dm(s.date)} · ${s.time} · ${s.format === "Qualquer" ? "qualquer formato" : s.format}${s.holiday ? " · atenção: " + s.holiday : ""}`;
  const docFor = (b, format) => { const docs = CL[b].docs || [], want = format === "Reels" ? "Roteiros de Reels" : "Roteiros de carrosséis"; const d = docs.find(x => x[0] === want) || docs[0]; return d ? d[1] : ""; };
  function bindOpen(root) {
    $$("[data-open],[data-code]", root).forEach(el => el.addEventListener("click", () => openDrawer(el.dataset.open || el.dataset.code)));
  }
  /* quem não edita (leitura) vê a gaveta, mas não muda nada */
  function lockDrawer(dlg) {
    $$("input, select, textarea", dlg).forEach(el => { el.disabled = true; });
    $$(".drawer-body button.btn", dlg).forEach(b => { b.hidden = true; });
    const note = document.createElement("p"); note.className = "notice info"; note.textContent = "Seu acesso é só de leitura."; const body = $(".drawer-body", dlg); if (body) body.prepend(note);
  }
  function showDialog(dlg) { if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); } }

  function approvalSection(p) {
    const st = F.approvalState(p.code, p.b), flow = F.getFlow(), rec = st.rec, pol = F.POLICIES[st.policy];
    if (!st.needs.length) return `<div class="aprov" id="aprov"><span class="col-title">Aprovação</span><p class="src">Este cliente está sem etapa de aprovação. Para exigir aprovação, mude a política em Fluxo e horários.</p></div>`;
    const row = kind => {
      if (!st.needs.includes(kind)) return "";
      const a = rec[kind], role = kind === "internal" ? roleOf(p.b) : "quem aprova no cliente";
      if (a) return `<div class="aprov-row done"><i class="ok" aria-hidden="true">✓</i><div><b>${F.KIND_NAME[kind]}</b> <small>${role}</small><div class="src">Aprovada por ${esc(a.by)} em ${fmtAt(a.at)}</div></div><button type="button" class="btn sm" data-act="revoke" data-kind="${kind}">Reabrir</button></div>`;
      return `<div class="aprov-row"><i aria-hidden="true"></i><div><b>${F.KIND_NAME[kind]}</b> <small>${role}</small>
        <div class="aprov-act"><input type="text" id="ap-by-${kind}" aria-label="Nome de quem aprova (${F.KIND_NAME[kind].toLowerCase()})" placeholder="${kind === "internal" ? "Seu nome" : "Nome do aprovador no cliente"}" value="${kind === "internal" ? esc(flow.user) : ""}"><button type="button" class="btn sm primary" data-act="approve" data-kind="${kind}">Aprovar</button><button type="button" class="btn sm" data-act="changes" data-kind="${kind}">Pedir ajustes</button></div></div></div>`;
    };
    return `<div class="aprov" id="aprov"><div class="toolbar" style="justify-content:space-between"><span class="col-title">Aprovação · ${pol.name}</span><span class="badge ${st.complete ? "st-pub" : "st-apr"}">${st.complete ? "completa" : "pendente: " + st.pending.map(k => F.KIND_NAME[k].toLowerCase()).join(" e ")}</span></div>
      ${row("internal")}${row("client")}
      <ul class="thread" aria-label="Comentários">${rec.comments.map(c => `<li class="${c.change ? "change" : ""}"><b>${esc(c.by)}</b> <small>${F.KIND_NAME[c.kind].toLowerCase()} · ${fmtAt(c.at)}${c.change ? " · pediu ajustes" : ""}</small><p>${esc(c.text)}</p></li>`).join("") || `<li class="muted">Nenhum comentário ainda.</li>`}</ul>
      <div class="inline-add"><select id="ap-kind" aria-label="Quem comenta"><option value="internal">Interno</option><option value="client">Do cliente</option></select><input type="text" id="ap-comment" aria-label="Comentário" placeholder="Comentário, ou o motivo do pedido de ajustes" maxlength="400"><button type="button" class="btn sm" data-act="comment">Comentar</button></div>
      <details><summary>Histórico (${rec.history.length})</summary><ul class="thread">${rec.history.slice().reverse().map(h => `<li><small>${fmtAt(h.at)}</small> ${esc(h.text)}</li>`).join("") || `<li class="muted">Sem registros.</li>`}</ul></details>
      <p class="src">O registro é feito por quem usa o site. A aprovação direta pelo cliente, por link, precisa de um servidor.</p></div>`;
  }

  function openDrawer(code, opts = {}) {
    const p = posts().find(x => x.code === code); if (!p) return;
    const draft = opts.draft || {};
    const done = DONE_BY[p.status];
    const steps = Object.entries(p.steps);
    const dlg = $("#drawer");
    dlg.innerHTML = `<div class="drawer-head"><span class="client-avatar" style="background:var(${CL[p.b].color})">${CL[p.b].short[0]}</span><div><small style="color:var(--banner-muted)">${p.code} · ${esc(CL[p.b].name)} · ${p.format}</small><h2>${esc(p.title)}</h2></div><button type="button" class="x" id="d-close">Fechar</button></div>
      <div class="drawer-body">
        <div class="toolbar">${stBadge(p)}${fmtBadge(p.format)}${p.fromIdea ? `<span class="badge">criada no quadro de ideias</span>` : ""}${p.edited ? `<span class="badge">editado neste navegador</span>` : ""}</div>
        ${p.note ? `<p class="notice">${esc(p.note)}</p>` : ""}
        <div class="form-row">
          <div><label class="lbl" for="d-status">Status</label><select id="d-status">${COLS.map(s => `<option value="${s}" ${s === (draft.status || p.status) ? "selected" : ""}>${STATUS[s].name}</option>`).join("")}</select></div>
          <div><label class="lbl" for="d-date">Publicar em${p.time ? " · " + p.time : ""}</label><input type="date" id="d-date" value="${draft.date || p.date}"></div>
        </div>
        <div><span class="col-title">Etapas de produção</span>
          <ul class="steps" style="margin-top:10px">${steps.map(([k2, d], i) => { const isDone = i < done || p.status === "pub"; const isLate = !isDone && d && toDate(d) < TODAY; return `<li class="${isDone ? "done" : isLate ? "late" : ""}"><i></i><span>${STEP_NAMES[k2]}${isLate ? " · atrasada" : ""}</span><span class="tnum">${d ? DOW[toDate(d).getDay()] + " " + dm(d) : "não se aplica"}</span></li>`; }).join("")}
          <li class="${p.status === "pub" ? "done" : p.late ? "late" : ""}"><i></i><span><b>Publicar</b></span><span class="tnum"><b>${DOW[toDate(p.date).getDay()]} ${dm(p.date)}${p.time ? " " + p.time : ""}</b></span></li></ul></div>
        ${approvalSection(p)}
        ${IS_CLIENT ? "" : qualityForm(p)}
        ${IS_CLIENT ? "" : `<div class="doc-list">${p.doc ? `<a href="${p.doc}" target="_blank" rel="noopener">Abrir roteiro ${p.format === "Reels" ? "de Reels" : "de carrosséis"}<span>Google Docs</span></a>` : ""}<a href="${D.CENTRAL}" target="_blank" rel="noopener">Central editorial<span>planilha</span></a></div>`}
        <div class="toolbar"><button type="button" class="btn primary" id="d-save">Salvar</button>${p.edited ? `<button type="button" class="btn" id="d-revert">Voltar ao plano original</button>` : ""}${p.fromIdea ? `<button type="button" class="btn" id="d-remove">Remover pauta e devolver a ideia</button>` : ""}</div>
      </div>`;
    const close = () => dlg.close();
    $("#d-close").onclick = close;
    dlg.onclick = e => { if (e.target === dlg) close(); };
    const readQ = () => {
      const dims = {}; $$("[data-dim]", dlg).forEach(s => { if (s.value !== "") dims[s.dataset.dim] = Number(s.value); });
      const ck = {}; $$("[data-chk]", dlg).forEach(i => { if (i.checked) ck[i.dataset.chk] = true; });
      return { dims, checks: ck };
    };
    const persistQ = () => {
      if (!CAN_WRITE) return;
      const q = readQ();
      if (Object.keys(q.dims).length || Object.keys(q.checks).length) checks[p.code] = q; else delete checks[p.code];
      store.set(CHECK_KEY, checks);
    };
    const paintQ = () => { const q = readQ(); const tmp = checks[p.code]; checks[p.code] = q; $("#q-result").innerHTML = qualityResult(p.code); if (tmp) checks[p.code] = tmp; else delete checks[p.code]; };
    $$("[data-dim],[data-chk]", dlg).forEach(el => el.addEventListener("change", paintQ));

    /* aprovações: gravam na hora e redesenham a gaveta mantendo o que foi digitado */
    $$("[data-act]", dlg).forEach(b => b.addEventListener("click", () => {
      const kind = b.dataset.kind, act = b.dataset.act, flow = F.getFlow();
      const by = kind ? ($(`#ap-by-${kind}`, dlg)?.value || "").trim() : "", text = $("#ap-comment", dlg)?.value || "";
      let r;
      if (act === "approve") r = F.approve(p.code, kind, by);
      else if (act === "revoke") r = F.revoke(p.code, kind, flow.user);
      else if (act === "changes") r = F.requestChanges(p.code, kind, by, text);
      else r = F.comment(p.code, $("#ap-kind", dlg).value, flow.user, text);
      if (!r.ok) { toast(r.msg); return; }
      if (act === "approve" && kind === "internal" && by && by !== flow.user) { flow.user = by; F.saveFlow(flow); }
      persistQ();
      const keep = { status: $("#d-status").value, date: $("#d-date").value };
      if (CAN_WRITE && act === "changes" && ["apr", "agd"].includes(p.status)) { update(p.code, { status: "prod" }); keep.status = "prod"; }
      flowDirty = true;
      toast({ approve: "Aprovação registrada", revoke: "Aprovação reaberta", changes: CAN_WRITE ? "Ajustes pedidos; a pauta voltou para Em produção" : "Ajustes pedidos à equipe da Nova7", comment: "Comentário registrado" }[act]);
      openDrawer(p.code, { draft: keep, focus: "aprov" });
    }));

    $("#d-save").onclick = () => {
      persistQ();
      const date = $("#d-date").value || p.date;
      if (update(p.code, { status: $("#d-status").value, date }, `${p.code} salva`) === false) { $("#aprov")?.scrollIntoView({ block: "center" }); return; }
      close();
    };
    const rv = $("#d-revert"); if (rv) rv.onclick = () => { delete overrides[p.code]; store.set(KB_KEY, overrides); close(); refreshUnder(); toast(`${p.code} voltou ao plano original`); };
    const rm = $("#d-remove");
    if (rm) { let armed = false; rm.onclick = () => {
      if (!armed) { armed = true; rm.textContent = "Confirmar: remover pauta"; setTimeout(() => { armed = false; rm.textContent = "Remover pauta e devolver a ideia"; }, 4000); return; }
      F.removeCustom(p.code); delete overrides[p.code]; store.set(KB_KEY, overrides); close(); refreshUnder(); toast(`${p.code} removida; a ideia voltou para Aprovada`);
    }; }
    if (!CAN_WRITE) {
      ["#d-status", "#d-date"].forEach(sel => { const el = $(sel, dlg); if (el) el.disabled = true; });
      ["#d-save", "#d-revert", "#d-remove"].forEach(sel => { const el = $(sel, dlg); if (el) el.hidden = true; });
      $$("[data-dim],[data-chk]", dlg).forEach(el => { el.disabled = true; });
      if (IS_CLIENT) {
        const by = $("#ap-by-client", dlg); if (by) { by.value = ME.nome || ""; by.readOnly = true; }
        const kind = $("#ap-kind", dlg); if (kind) { kind.value = "client"; kind.disabled = true; }
        $$("[data-act]", dlg).forEach(b => { if (b.dataset.kind === "internal") b.hidden = true; });
      } else { $$("[data-act]", dlg).forEach(b => { b.hidden = true; }); $$("#aprov input, #aprov select", dlg).forEach(el => { el.disabled = true; }); }
    }
    showDialog(dlg);
    if (opts.focus) $("#" + opts.focus, dlg)?.scrollIntoView({ block: "start" });
  }

  /* ====================================================================
     IDEIAS E HORÁRIOS LIVRES
     ==================================================================== */
  const ideaCard = i => `<button type="button" class="kcard" data-drag data-idea="${i.id}" style="--dot:var(${CL[i.b].color})">
      <span class="kcard-top">${brandBadge(i.b)}${fmtBadge(i.format)}</span><strong>${esc(i.title)}</strong>
      ${i.note ? `<span class="idea-note">${esc(i.note)}</span>` : ""}
      <span class="kcard-foot"><span>${esc(i.src || "")}</span></span></button>`;
  function drawIdeas(board, nav) {
    nav.innerHTML = "";
    const q = ($("#k-q")?.value || "").trim().toLowerCase();
    const ideas = F.getIdeas().filter(i => CL[i.b] && (prefs.kbrand === "all" || i.b === prefs.kbrand) && (prefs.kfmt === "all" || i.format === prefs.kfmt) && (!q || i.title.toLowerCase().includes(q)));
    const promoted = ideas.filter(i => i.stage === "agendada"), def = prefs.kbrand !== "all" ? prefs.kbrand : "M";
    $("#k-summary").innerHTML = `<span><b class="tnum">${ideas.length - promoted.length}</b> ideias no quadro</span>${F.STAGES.map(([k2, n]) => `<span>${n} <b class="tnum">${ideas.filter(i => i.stage === k2).length}</b></span>`).join("")}<span>Viraram pauta <b class="tnum">${promoted.length}</b></span>`;
    board.innerHTML = `
      <form class="idea-form" id="i-form" autocomplete="off">
        <div><label class="lbl" for="i-brand">Cliente</label><select id="i-brand">${CLIENTS.map(c => `<option value="${c.key}" ${c.key === def ? "selected" : ""}>${esc(c.short)}</option>`).join("")}</select></div>
        <div><label class="lbl" for="i-format">Formato</label><select id="i-format">${F.FORMATS.map(f => `<option>${f}</option>`).join("")}</select></div>
        <div class="grow"${CAN_WRITE ? "" : " hidden"}><label class="lbl" for="i-title">Nova ideia</label><input type="text" id="i-title" placeholder="Ex.: 3 erros ao guardar medicamentos no verão" maxlength="140"></div>
        <div class="grow"><label class="lbl" for="i-note">Observação (opcional)</label><input type="text" id="i-note" placeholder="Por que vale a pena, restrições, quem revisa" maxlength="300"></div>
        <button type="submit" class="btn primary">Adicionar</button>
      </form>
      <div class="kanban">${F.STAGES.map(([k2, n, h]) => { const items = ideas.filter(i => i.stage === k2); return `<div class="kcol" data-stage="${k2}"><div class="kcol-head"><span>${n}<br><small>${h}</small></span><b>${items.length}</b></div><div class="kcards">${items.map(ideaCard).join("") || `<div class="kempty">${k2 === "nova" ? "Escreva uma ideia acima" : "Solte uma ideia aqui"}</div>`}</div></div>`; }).join("")}</div>
      ${promoted.length ? `<p class="src" style="margin-top:12px"><b>Já viraram pauta:</b> ${promoted.map(i => `<button type="button" class="linkbtn" data-open="${i.promoted}">${i.promoted}</button>`).join(" · ")}</p>` : ""}
      <p class="src" style="margin-top:8px">Arraste uma ideia entre as colunas. Só ideias <b>Aprovadas</b> podem ser agendadas; o horário vem dos horários fixos do cliente (veja em Fluxo e horários).</p>`;
    $("#i-form").onsubmit = e => {
      e.preventDefault();
      const r = F.addIdea({ b: $("#i-brand").value, format: $("#i-format").value, title: $("#i-title").value, note: $("#i-note").value });
      if (!r.ok) { toast(r.msg); $("#i-title").focus(); return; }
      toast("Ideia adicionada"); drawBoard(); $("#i-title")?.focus();
    };
    bindDrag(board); bindOpen(board);
    $$("[data-idea]", board).forEach(el => el.addEventListener("click", () => openIdea(el.dataset.idea)));
  }
  function moveIdea(id, stage) {
    const i = F.getIdeas().find(x => x.id === id); if (!i || i.stage === stage) return;
    F.updateIdea(id, { stage });
    toast(`Ideia movida para ${F.STAGES.find(s => s[0] === stage)[1]}`); drawBoard();
  }
  function scheduleIdea(id, pick) {
    const i = F.getIdeas().find(x => x.id === id);
    const r = F.promote(id, pick, docFor(i.b, i.format), TODAY_ISO);
    if (!r.ok) { toast(r.msg); return false; }
    toast(`${r.pauta.code} criada para ${slotLabel({ date: pick.date, time: pick.time, format: i.format })}`);
    renderNav(); markNav(); drawBoard(); return true;
  }
  function openIdea(id) {
    const i = F.getIdeas().find(x => x.id === id); if (!i) return;
    const dlg = $("#drawer"), flow = F.getFlow();
    const free = i.stage === "aprovada" ? F.freeSlots({ brand: i.b, format: i.format, from: addDays(TODAY, 1), count: 10, taken: takenFn(), flow }).sort((a, b) => !!a.holiday - !!b.holiday).slice(0, 6) : [];
    const hasSlots = (flow.slots[i.b] || []).some(s => s.format === "Qualquer" || s.format === i.format);
    const sched = i.stage !== "aprovada"
      ? `<p class="notice info">Aprove a ideia (etapa <b>Aprovada</b>) para escolher um horário de publicação.</p>`
      : !hasSlots ? `<p class="notice">${esc(CL[i.b].name)} não tem horário fixo para ${i.format}. Defina em <b>Fluxo e horários</b> e volte aqui.</p>`
        : `<div class="qbox"><span class="col-title">Agendar como pauta</span><label class="lbl" for="ie-slot">Próximos horários livres de ${esc(CL[i.b].short)} (${i.format})</label>
           <select id="ie-slot">${free.map(s => `<option value="${s.date}|${s.time}">${esc(slotLabel(s))}</option>`).join("")}</select>
           <div class="toolbar"><button type="button" class="btn primary" id="ie-go">Agendar como pauta</button></div>
           <p class="src">A pauta nasce em "A planejar", com as datas de roteiro, gravação, edição, aprovação e agendamento no padrão da Central.</p></div>`;
    dlg.innerHTML = `<div class="drawer-head"><span class="client-avatar" style="background:var(${CL[i.b].color})">${CL[i.b].short[0]}</span><div><small style="color:var(--banner-muted)">Ideia · ${esc(CL[i.b].name)}</small><h2>${esc(i.title)}</h2></div><button type="button" class="x" id="d-close">Fechar</button></div>
      <div class="drawer-body">
        <div class="form-row"><div><label class="lbl" for="ie-brand">Cliente</label><select id="ie-brand">${CLIENTS.map(c => `<option value="${c.key}" ${c.key === i.b ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
          <div><label class="lbl" for="ie-format">Formato</label><select id="ie-format">${F.FORMATS.map(f => `<option ${f === i.format ? "selected" : ""}>${f}</option>`).join("")}</select></div></div>
        <div><label class="lbl" for="ie-title">Título</label><input type="text" id="ie-title" value="${esc(i.title)}" maxlength="140" style="width:100%"></div>
        <div><label class="lbl" for="ie-note">Observação</label><textarea id="ie-note" rows="3" style="width:100%" maxlength="300">${esc(i.note || "")}</textarea></div>
        <div><label class="lbl" for="ie-stage">Etapa</label><select id="ie-stage">${F.STAGES.map(([k2, n]) => `<option value="${k2}" ${k2 === i.stage ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <p class="src">Origem: ${esc(i.src || "—")} · criada em ${dm(i.at)}</p>
        ${sched}
        <div class="toolbar"><button type="button" class="btn primary" id="ie-save">Salvar</button><button type="button" class="btn" id="ie-del">Excluir ideia</button></div>
      </div>`;
    const close = () => dlg.close();
    $("#d-close").onclick = close; dlg.onclick = e => { if (e.target === dlg) close(); };
    const patch = () => ({ b: $("#ie-brand").value, format: $("#ie-format").value, title: $("#ie-title").value, note: $("#ie-note").value, stage: $("#ie-stage").value });
    const commit = () => { const r = F.updateIdea(id, patch()); if (!r.ok && r.msg) toast(r.msg); return r.ok; };
    ["ie-brand", "ie-format", "ie-stage"].forEach(f => $("#" + f).addEventListener("change", () => { if (commit()) { drawBoard(); openIdea(id); } }));
    ["ie-title", "ie-note"].forEach(f => $("#" + f).addEventListener("change", commit));
    $("#ie-save").onclick = () => { if (commit()) { close(); drawBoard(); toast("Ideia salva"); } };
    let armed = false;
    $("#ie-del").onclick = e => {
      if (!armed) { armed = true; e.target.textContent = "Confirmar exclusão"; setTimeout(() => { armed = false; e.target.textContent = "Excluir ideia"; }, 4000); return; }
      F.removeIdea(id); close(); drawBoard(); toast("Ideia excluída");
    };
    const go = $("#ie-go");
    if (go) go.onclick = () => {
      if (!commit()) return;
      const [d, t] = $("#ie-slot").value.split("|"); if (!d) { toast("Não há horário livre à vista."); return; }
      if (scheduleIdea(id, { date: d, time: t })) close();
    };
    if (!CAN_WRITE) lockDrawer(dlg);
    showDialog(dlg);
  }
  function openSlot(brand, date, time, format) {
    const dlg = $("#drawer"), ideas = F.getIdeas().filter(i => i.b === brand && i.stage === "aprovada" && (format === "Qualquer" || i.format === format));
    dlg.innerHTML = `<div class="drawer-head"><span class="client-avatar" style="background:var(${CL[brand].color})">${CL[brand].short[0]}</span><div><small style="color:var(--banner-muted)">Horário livre · ${esc(CL[brand].name)}</small><h2>${esc(slotLabel({ date, time, format }))}</h2></div><button type="button" class="x" id="d-close">Fechar</button></div>
      <div class="drawer-body">
        ${ideas.length ? `<span class="col-title">Ideias aprovadas que cabem aqui</span><div class="post-list">${ideas.map(i => `<div class="post-row" style="grid-template-columns:78px 1fr auto">${fmtBadge(i.format)}<span class="t">${esc(i.title)}<small>${esc(i.src || "")}</small></span><button type="button" class="btn sm primary" data-pick="${i.id}">Agendar aqui</button></div>`).join("")}</div>`
        : `<p class="notice info">Não há ideia <b>aprovada</b> de ${esc(CL[brand].short)} para ${format === "Qualquer" ? "este horário" : format}. Aprove uma no quadro de ideias para agendá-la aqui.</p><div class="toolbar"><button type="button" class="btn primary" id="sl-ideas">Abrir quadro de ideias</button></div>`}
      </div>`;
    const close = () => dlg.close();
    $("#d-close").onclick = close; dlg.onclick = e => { if (e.target === dlg) close(); };
    $$("[data-pick]", dlg).forEach(b => b.addEventListener("click", () => { if (scheduleIdea(b.dataset.pick, { date, time })) close(); }));
    const go = $("#sl-ideas"); if (go) go.onclick = () => { prefs.kview = "ideias"; prefs.kbrand = brand; savePrefs(); close(); route(); };
    if (!CAN_WRITE) lockDrawer(dlg);
    showDialog(dlg);
  }

  /* ====================================================================
     FLUXO E HORÁRIOS
     ==================================================================== */
  function fluxoPanel(c, flow, taken) {
    const k2 = c.key, pol = flow.policy[k2], slots = flow.slots[k2] || [];
    const next = F.freeSlots({ brand: k2, from: addDays(TODAY, 1), count: 4, taken, flow });
    return `<div class="panel">${banner("sliders", esc(c.name), esc(c.segment))}
      <div class="panel-body">
        <div><label class="lbl" for="pol-${k2}">Aprovação antes de a peça ficar pronta</label>
          <select id="pol-${k2}" data-pol="${k2}">${Object.entries(F.POLICIES).map(([id, p2]) => `<option value="${id}" ${id === pol ? "selected" : ""}>${p2.name}</option>`).join("")}</select>
          <p class="src" style="margin-top:6px">${F.POLICIES[pol].text}${pol !== "none" ? ` Revisão interna: ${roleOf(k2)}.` : ""}</p></div>
        <div><span class="col-title">Horários fixos de publicação</span>
          <div class="slot-list">${slots.map((s, i) => `<div class="slot-row">
            <select id="s-${k2}-${i}-d" data-slot="${k2}|${i}|dow" aria-label="Dia da semana">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${d === s.dow ? "selected" : ""}>${WEEKDAYS[d]}</option>`).join("")}</select>
            <input type="time" id="s-${k2}-${i}-t" data-slot="${k2}|${i}|time" value="${s.time}" aria-label="Horário">
            <select id="s-${k2}-${i}-f" data-slot="${k2}|${i}|format" aria-label="Formato">${F.SLOT_FORMATS.map(f => `<option ${f === s.format ? "selected" : ""}>${f}</option>`).join("")}</select>
            <button type="button" class="btn sm" data-del="${k2}|${i}" aria-label="Remover horário">Remover</button></div>`).join("") || `<p class="src">Nenhum horário definido: as ideias deste cliente não terão onde ser agendadas.</p>`}</div>
          <div class="toolbar" style="margin-top:8px"><button type="button" class="btn sm" data-add="${k2}">Adicionar horário</button><button type="button" class="btn sm" data-reset="${k2}">Restaurar sugeridos</button></div></div>
        <div class="metric-box"><h4>Próximos horários livres</h4>${next.length ? next.map(s => `<div class="mrow"><span>${DOW[toDate(s.date).getDay()]} ${dm(s.date)} · ${s.time}${s.holiday ? " · " + s.holiday : ""}</span><b>${s.format}</b></div>`).join("") : `<p class="src">Nenhum horário livre à vista.</p>`}</div>
      </div></div>`;
  }
  function renderFluxo(v) {
    const flow = F.getFlow(), taken = takenFn();
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Operação</div><h1>Fluxo e horários</h1>
        <p>Defina, para cada cliente, quem precisa aprovar uma peça antes de ela ficar pronta e em quais dias e horários a agência publica. Os horários livres aparecem no calendário e servem para agendar as ideias aprovadas.</p></div></div>
      <div class="panel">${banner("target", "Quem está usando", "o nome entra nos registros de aprovação")}
        <div class="panel-body"><div class="form-row"><div><label class="lbl" for="f-user">Seu nome</label><input type="text" id="f-user" value="${esc(flow.user)}" placeholder="Ex.: Gustavo" maxlength="60"></div></div></div></div>
      <div class="grid g2">${CLIENTS.map(c => fluxoPanel(c, flow, taken)).join("")}</div>
      <p class="notice info">Os horários iniciais foram sugeridos pelos dias em que o plano Nov–Dez de cada cliente já publica; os horários do dia são palpites. Confirme com cada cliente. Tudo fica salvo neste navegador.</p>`;
    const redraw = () => renderFluxo(v);
    $("#f-user").addEventListener("change", e => { const f = F.getFlow(); f.user = e.target.value.trim(); F.saveFlow(f); toast("Nome salvo"); });
    $$("[data-pol]", v).forEach(sel => sel.addEventListener("change", () => { const f = F.getFlow(); f.policy[sel.dataset.pol] = sel.value; F.saveFlow(f); toast("Política salva"); redraw(); }));
    $$("[data-slot]", v).forEach(el => el.addEventListener("change", () => {
      const [k2, i, field] = el.dataset.slot.split("|"), f = F.getFlow(), s = (f.slots[k2] || [])[+i]; if (!s) return;
      if (field === "dow") s.dow = Number(el.value); else if (field === "time") { if (!el.value) return; s.time = el.value; } else s.format = el.value;
      F.saveFlow(f); toast("Horário salvo"); redraw();
    }));
    $$("[data-del]", v).forEach(b => b.addEventListener("click", () => { const [k2, i] = b.dataset.del.split("|"), f = F.getFlow(); f.slots[k2].splice(+i, 1); F.saveFlow(f); redraw(); }));
    $$("[data-add]", v).forEach(b => b.addEventListener("click", () => { const f = F.getFlow(); (f.slots[b.dataset.add] = f.slots[b.dataset.add] || []).push({ dow: 1, time: "12:00", format: "Qualquer" }); F.saveFlow(f); redraw(); }));
    $$("[data-reset]", v).forEach(b => b.addEventListener("click", () => { const f = F.getFlow(); f.slots[b.dataset.reset] = F.defaultSlots(b.dataset.reset); F.saveFlow(f); toast("Horários sugeridos restaurados"); redraw(); }));
    if (!IS_ADMIN) { $$("select, input, button.btn", v).forEach(el => { if (el.id !== "f-user") el.disabled = true; }); v.insertAdjacentHTML("afterbegin", `<p class="notice info">Só administradores mudam políticas e horários.</p>`); }
  }

  /* ---------- checagem pré-publicação ---------- */
  const verdictOf = s => PB.verdicts.find(v2 => s >= v2.min);
  const toneCls = t => t === "green" ? "st-pub" : t === "amber" ? "st-apr" : "late";
  function scoreTag(code) {
    const s = checkScore(code); if (s == null) return "";
    const list = PB.checks[sectorOf(brandOfCode(code))];
    const ok = list.every((_, i) => checks[code].checks && checks[code].checks[i]);
    return `<span class="badge ${toneCls(ok ? verdictOf(s).tone : "amber")}" title="Nota da checagem pré-publicação">nota ${s}${ok ? "" : " · conformidade pendente"}</span>`;
  }
  function qualityResult(code) {
    const p = plan().find(x => x.code === code), list = PB.checks[sectorOf(p.b)];
    const c = checks[code] || {}, s = checkScore(code);
    const done = list.filter((_, i) => c.checks && c.checks[i]).length;
    if (s == null) return `<span class="src">Avalie os ${PB.rubric.length} critérios para ver a nota. Conformidade: ${done} de ${list.length}.</span>`;
    const v2 = verdictOf(s), ok = done === list.length;
    return `<span class="health-num tone-${ok ? v2.tone : "amber"}" style="width:46px;height:46px;font-size:17px">${s}</span><div><b>${ok ? v2.name : "Conformidade pendente"}</b><div class="src">${ok ? "Checklist do setor completo." : `Faltam ${list.length - done} itens do checklist do setor antes de publicar.`} 85+ publicar · 70–84 ajustes · 50–69 revisão · abaixo de 50 refazer.</div></div>`;
  }
  function qualityForm(p) {
    const c = checks[p.code] || {}, list = PB.checks[sectorOf(p.b)];
    const critical = sectorOf(p.b) !== "agencia";
    return `<div class="qbox"><span class="col-title">Checagem pré-publicação</span>
      <p class="src">Rubrica de post social com 6 critérios. ${critical ? `Setor regulado: nível de aprovação <b>${sectorOf(p.b) === "saude" ? "crítico" : "alto"}</b>, com revisão técnica obrigatória.` : ""}</p>
      <div class="qgrid">${PB.rubric.map(r => `<label class="qrow" for="q-${r.id}"><span><b>${r.name}</b> <small>${r.weight}%</small><small class="hint">${r.hint}</small></span>
        <select id="q-${r.id}" data-dim="${r.id}"><option value="">—</option>${PB.levels.map(([v2, n]) => `<option value="${v2}" ${c.dims && String(c.dims[r.id]) === v2 ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>
      <span class="col-title">Conformidade · ${{ saude: "farmácia e saúde", agro: "agro", agencia: "agência", contabilidade: "contabilidade (CFC)", executivo: "marca pessoal do executivo" }[sectorOf(p.b)]}</span>
      <div class="qchecks">${list.map((t, i) => `<label class="check"><input type="checkbox" data-chk="${i}" ${c.checks && c.checks[i] ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
      <div class="health-row" id="q-result">${qualityResult(p.code)}</div></div>`;
  }

  /* ====================================================================
     PLAYBOOK
     ==================================================================== */
  function renderPlaybook(v) {
    const all = posts();
    const hs = CLIENTS.map(c => ({ c, h: health(c, all) }));
    v.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Método da agência</div><h1>Playbook</h1>
        <p>Regras de trabalho da Nova7: como medimos a saúde de cada cliente, como revisamos antes de publicar, quem aprova o quê, a cadência de relatórios e os formatos de cada rede. Adaptado do repositório aberto <a class="lnk" href="${PB.source}" target="_blank" rel="noopener" style="color:var(--violet-d);font-weight:600">Digital Marketing Pro</a> (licença MIT) e dos critérios já definidos no Drive.</p></div></div>

      <div class="panel">${banner("target", "Nota de saúde do cliente", "0 a 100, calculada toda vez que o Kanban ou os alertas mudam")}
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="num">Nota</th>${PB.health.map(h => `<th class="num">${h.name}<br><small style="text-transform:none;letter-spacing:0">${h.weight}%</small></th>`).join("")}<th>Mais fraca</th></tr></thead><tbody>
        ${hs.map(({ c, h }) => `<tr><td><a class="lnk" href="#${c.id}">${esc(c.name)}</a></td><td class="num">${healthChip(h)}</td>${h.dims.map(d => `<td class="num">${d.value == null ? "—" : Math.round(d.value)}</td>`).join("")}<td>${h.weakest.name}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="panel-cols">
          <div><span class="col-title">Como cada dimensão é calculada</span>${PB.health.map(h => `<div class="mrow" style="display:block"><b style="display:block;text-align:left">${h.name} · ${h.weight}%</b>${esc(h.how)}</div>`).join("")}</div>
          <div><span class="col-title">Semáforo</span>${PB.lights.map(l => `<div class="mrow" style="display:block"><span class="badge ${toneCls(l.tone)}">${l.name} · ${l.min === 0 ? "abaixo de 60" : l.min + "+"}</span><div style="margin-top:4px">${esc(l.action)}</div></div>`).join("")}
            <p class="notice info">Hoje as notas são baixas porque a Central marca poucas pautas como publicadas ou em produção. Ao atualizar os status no Kanban, a nota sobe na hora.</p></div>
        </div></div>

      <div class="grid g2">
        <div class="panel">${banner("list", "Checagem pré-publicação", "abre no detalhe de cada pauta do Kanban")}
          <div class="table-wrap"><table><thead><tr><th>Critério</th><th class="num">Peso</th><th>O que olhar</th></tr></thead><tbody>
          ${PB.rubric.map(r => `<tr><td><b>${r.name}</b></td><td class="num">${r.weight}%</td><td>${esc(r.hint)}</td></tr>`).join("")}
          </tbody></table></div>
          <div class="panel-body"><div class="toolbar">${PB.verdicts.map(x => `<span class="badge ${toneCls(x.tone)}">${x.min === 0 ? "abaixo de 50" : x.min + "+"} · ${x.name}</span>`).join("")}</div>
          <p class="src">Cada critério recebe Falha (0), Fraco (40), Bom (75) ou Excelente (100). A peça só fica "pronta" com o checklist de conformidade do setor completo.</p></div></div>
        <div class="panel">${banner("alert", "Quem aprova o quê", "nível de risco de cada ação")}
          <div class="table-wrap"><table><thead><tr><th>Nível</th><th>Aprovação</th><th>Na Nova7</th></tr></thead><tbody>
          ${PB.risk.map(r => `<tr><td><span class="badge ${r.tone}">${r.level}</span></td><td><b>${r.who}</b><div class="src">${esc(r.what)}</div></td><td>${esc(r.nova7)}</td></tr>`).join("")}
          </tbody></table></div></div>
      </div>

      <div class="grid g3">
        ${["saude", "agro", "contabilidade", "executivo", "agencia"].map(k2 => `<div class="panel">${banner("file", "Checklist · " + { saude: "Farmácia e saúde", agro: "Agro", agencia: "Perfil da agência", contabilidade: "Contabilidade (CFC)", executivo: "Marca pessoal do executivo" }[k2], { saude: "Minas Farma e Farma e Farma", agro: "Campo Forte", agencia: "Nova7 Produtora", contabilidade: "Clientes contadores", executivo: "Executivos e profissionais liberais" }[k2])}
          <div class="panel-body"><ul class="plain check">${PB.checks[k2].map(t => `<li>${esc(t)}</li>`).join("")}</ul></div></div>`).join("")}
      </div>

      <div class="panel">${banner("clock", "Cadência de revisão", "o que olhar em cada ritmo e quando agir")}
        <div class="table-wrap"><table><thead><tr><th>Quando</th><th>Para quem</th><th>O que revisar</th><th>Quando agir</th></tr></thead><tbody>
        ${PB.cadence.map(r => `<tr><td><b>${r.when}</b></td><td>${r.who}</td><td>${esc(r.what)}</td><td>${esc(r.rule)}</td></tr>`).join("")}
        </tbody></table></div></div>

      <div class="grid g2">
        <div class="panel">${banner("file", "Modelo de relatório mensal", "um documento de decisão, não um despejo de números")}
          <div class="panel-body"><ol class="steps-list">${PB.report.map(([t, d]) => `<li><b>${t}</b><span>${esc(d)}</span></li>`).join("")}</ol>
          <p class="notice">Comece pelo aprendizado, explique o porquê e seja honesto quando o resultado for abaixo do esperado.</p></div></div>
        <div class="panel">${banner("list", "Onboarding de cliente novo", "antes de propor qualquer ação")}
          <div class="panel-body"><ol class="steps-list">${PB.onboarding.map(([t, d]) => `<li><b>${t}</b><span>${esc(d)}</span></li>`).join("")}</ol></div></div>
      </div>

      <div class="panel">${banner("ig", "Formatos de Instagram e Facebook", "medidas, regras e o que o algoritmo valoriza")}
        <div class="table-wrap"><table><thead><tr><th>Rede</th><th>Formato</th><th>Medida</th><th>Regras</th><th>Sinais que pesam</th></tr></thead><tbody>
        ${PB.specs.map(s => `<tr><td>${s.net}</td><td><span class="badge fmt-${{ Carrossel: "carrossel", Reels: "reels", Post: "post", Stories: "post", "Reels e Stories": "reels" }[s.fmt]}">${s.fmt}</span></td><td class="tnum" style="white-space:nowrap">${s.size}</td><td>${esc(s.rules)}</td><td>${esc(s.signals)}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="panel-body"><p class="src">Horários "ideais" genéricos não entram aqui: use os horários com mais visualizações nos insights de cada cliente.</p></div></div>

      <div class="panel">${banner("target", "Notas para o Brasil", "privacidade, tom e canais")}
        <div class="panel-cols" style="grid-template-columns:repeat(3,minmax(0,1fr))">${PB.brasil.map(([a, b]) => `<div><span class="col-title">${a}</span><p>${esc(b)}</p></div>`).join("")}</div></div>`;
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
      <div class="kpis k3">${["P0", "P1", "P2"].map((p, i) => kpi(["Imediato", "Próximos 2 dias", "Fechamento semanal"][i], String(D.ALERTS.filter(a => a.p === p).length), CLIENTS.map(c => `${c.short} ${D.ALERTS.filter(a => a.p === p && a.b === c.key).length}`).join(" · "), "alert", ["red", "amber", ""][i])).join("")}</div>
      <div class="grid" style="gap:10px">${list.map(alertHtml).join("")}</div>`;
    $$("#a-f button", v).forEach(b => b.onclick = () => { aFilter = b.dataset.v; route(); });
  }

  /* ---------- toast ---------- */
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600); }

  /* ---------- inicialização ---------- */
  $("#tabbar").addEventListener("click", e => { if (e.target.closest("[data-more]")) $(".shell").classList.toggle("nav-open"); });
  $("#menu-btn").addEventListener("click", () => $(".shell").classList.toggle("nav-open"));
  $(".sidebar").addEventListener("click", e => { if (e.target.closest(".nav-item")) $(".shell").classList.remove("nav-open"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $(".shell").classList.remove("nav-open"); });
  addEventListener("scroll", () => $(".topbar").classList.toggle("scrolled", scrollY > 4), { passive: true });
  { const lw = window.N7Analysis.period("semana", window.N7Analysis.lastClosed("semana", new Date())); $("#stamp-week").textContent = `Última semana fechada: ${dm(lw.inicio)}–${dm(lw.fim)}/${lw.fim.slice(0, 4)}`; }
  addEventListener("hashchange", route);
  $("#drawer").addEventListener("close", () => { if (flowDirty) { flowDirty = false; refreshUnder(); } });
  let rt; const redraw = () => { clearTimeout(rt); rt = setTimeout(() => { if (current !== "calendario") { const y = scrollY; route(); scrollTo(0, y); } }, 160); };
  let lastW = innerWidth; addEventListener("resize", () => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; redraw(); } });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  route();
})();
