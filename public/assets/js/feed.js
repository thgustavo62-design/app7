/* Preview de Feed: o perfil de cada cliente num celular, para planejar a ordem dos posts e o cliente ver como vai ficar antes de publicar.
   Junta as pautas do calendário (planejadas) com as artes que estão no Google Drive (lidas pelo servidor em /api/feed).
   As funções puras (montar, ordenar, mover, statusDe...) valem no navegador e nos testes; a tela vem depois. */
(function (root) {
  const RANK = { prop: 0, plan: 0, prod: 1, apr: 2, agd: 3, pub: 4 };
  const GRUPOS = { todos: "Todos", andamento: "Em andamento", pronto: "Prontos", publicado: "Publicados" };
  const grupoDe = st => (st === "pub" ? "publicado" : st === "agd" ? "pronto" : "andamento");
  const JANELA_FUTURA = 60, JANELA_PUBLICADO = 30;     /* dias: o que entra no preview mesmo sem arte */
  const dias = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  const miniOk = u => /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(String(u || ""));

  /* o status final do post: o da pauta, mas arte pronta no Drive vale ao menos "pronto" */
  function statusDe(pauta, drive) {
    let st = pauta ? pauta.status : "agd";
    if (drive && drive.origem === "producao") { if (RANK[st] < 1) st = "prod"; }
    else if (drive && RANK[st] < 3) st = "agd";
    return st;
  }
  const item = (pauta, d) => {
    const midias = d ? d.midias : [];
    return {
      id: pauta ? pauta.code : "d:" + d.id, codigo: pauta ? pauta.code : d.codigo || "", marca: pauta ? pauta.b : "", titulo: pauta ? pauta.title : d.titulo,
      formato: pauta ? pauta.format : (midias.length > 1 ? "Carrossel" : midias[0] && midias[0].tipo === "video" ? "Reels" : "Post"),
      data: pauta ? pauta.date : d.data, status: statusDe(pauta, d), atrasada: !!(pauta && pauta.late), midias, legendaId: d ? d.legendaId : "", pastaId: d ? d.id : "", temPauta: !!pauta, temArte: midias.length > 0
    };
  };
  /* pautas do cliente + posts do Drive -> lista de posts do feed (sem ordem). Pauta e pasta se ligam pelo código (C-M15). */
  function montar({ pautas = [], drive = [], hoje }) {
    const porCodigo = new Map(); drive.forEach(d => { if (d.codigo && !porCodigo.has(d.codigo)) porCodigo.set(d.codigo, d); });
    const usados = new Set(), out = [];
    pautas.forEach(p => {
      const d = porCodigo.get(p.code); if (d) usados.add(d.id);
      const it = item(p, d), fut = dias(hoje, it.data);
      if (it.status === "pub" && !it.temArte && fut < -JANELA_PUBLICADO) return;     /* publicado antigo e sem arte: não enche o feed */
      if (it.status !== "pub" && !it.temArte && fut > JANELA_FUTURA) return;           /* planejado muito longe */
      out.push(it);
    });
    drive.filter(d => !usados.has(d.id)).forEach(d => { if (d.midias.length || d.legendaId) out.push(item(null, d)); });
    return out;
  }
  /* planejados e em andamento no topo (como o Instagram mostra o mais novo primeiro); publicados por data. A ordem salva só vale para o que ainda não foi publicado. */
  function ordenar(itens, ordem = []) {
    const porData = (a, b) => (b.data || "").localeCompare(a.data || "") || a.id.localeCompare(b.id);
    const pub = itens.filter(i => i.status === "pub").sort(porData), vivos = itens.filter(i => i.status !== "pub");
    const pos = new Map(ordem.map((id, n) => [id, n])), semOrdem = vivos.filter(i => !pos.has(i.id)).sort(porData);
    const comOrdem = vivos.filter(i => pos.has(i.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
    return semOrdem.concat(comOrdem, pub);
  }
  /* move o post "id" para a posição do post "alvo" (só entre os não publicados); devolve a nova ordem (lista de ids) */
  function mover(lista, id, alvo) {
    const ids = lista.filter(i => i.status !== "pub").map(i => i.id), de = ids.indexOf(id), para = ids.indexOf(alvo);
    if (de < 0 || para < 0 || de === para) return ids;
    ids.splice(para, 0, ids.splice(de, 1)[0]); return ids;
  }
  const passo = (lista, id, delta) => { const ids = lista.filter(i => i.status !== "pub").map(i => i.id), n = ids.indexOf(id); return n < 0 || !ids[n + delta] ? ids : mover(lista, id, ids[n + delta]); };
  const filtrar = (lista, grupo, aba) => lista.filter(i => (grupo === "todos" || grupoDe(i.status) === grupo) && (aba !== "reels" || i.formato === "Reels"));
  const contar = lista => ({ todos: lista.length, andamento: lista.filter(i => grupoDe(i.status) === "andamento").length, pronto: lista.filter(i => i.status === "agd").length, publicado: lista.filter(i => i.status === "pub").length });

  const api = { RANK, GRUPOS, grupoDe, statusDe, montar, ordenar, mover, passo, filtrar, contar, miniOk, dias };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.N7Feed = Object.assign(root.N7Feed || {}, api);

  /* ---------------------------------------------------------------- tela ---------------------------------------------------------------- */
  if (typeof document === "undefined") return;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const diaTxt = iso => { const d = new Date(iso + "T12:00:00"); return isNaN(d) ? "" : `${DOW[d.getDay()]}, ${d.getDate()} ${MES[d.getMonth()]}`; };
  const SV = {
    grade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    reels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M9 3l3 6M15 3l3 6"/><path d="M10 13l5 3-5 3z" fill="currentColor"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    carrossel: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 3h11a2 2 0 012 2v11h-2V5H8z"/><rect x="3" y="7" width="14" height="14" rx="2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
    dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cora: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z"/></svg>',
    bolha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    aviao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 3L3 10l7 3 3 7z"/></svg>',
    marca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>'
  };
  let H = null;                                              /* ajudantes do app.js */
  const ui = { marca: "", grupo: "todos", aba: "grade", cliente: false, sel: "" };
  const dados = {};                                          /* marca -> resposta de /api/feed */
  const legendas = {};                                       /* id do documento -> { legenda, hora } */
  let view = null, ordemLocal = {}, carregando = {};

  const marcas = () => H.clients().filter(c => (c.services || []).some(s => s === "redes" || s === "criativos"));
  const cliente = m => H.clients().find(c => c.key === m) || { key: m, name: m, short: m, color: "--c1", id: m };
  const modoCliente = () => ui.cliente || H.isClient;
  const itens = m => {
    const d = dados[m] || { drive: { posts: [] }, ordem: [] }, pautas = H.pautas(m);
    return ordenar(montar({ pautas, drive: (d.drive && d.drive.posts) || [], hoje: H.today }), ordemLocal[m] || d.ordem || []);
  };
  const nomeStatus = st => (H.status[st] || {}).name || st;

  async function chamar(url, opts) {
    const r = await fetch(url, opts); const b = await r.json().catch(() => ({}));
    if (r.status === 401) { location.reload(); throw new Error("Sua sessão terminou."); }
    if (!r.ok) throw new Error(b.error || "Não foi possível falar com o servidor.");
    return b;
  }
  async function carregar(m, force) {
    if (carregando[m]) return; carregando[m] = true;
    try { dados[m] = await chamar("/api/feed?marca=" + encodeURIComponent(m) + (force ? "&atualizar=1" : "")); ordemLocal[m] = null; }
    catch (e) { dados[m] = { perfil: {}, ordem: [], pastas: [], podeEditar: false, drive: { ligado: false, posts: [], erro: e.message, conta: "" } }; }
    carregando[m] = false; if (view && ui.marca === m) desenhar();
  }

  /* ---------- peças da tela ---------- */
  const arte = (it, c) => `<span class="fd-art" style="--cor:var(${esc(c.color)})"><small>${modoCliente() ? esc(it.formato) : esc(it.codigo || it.formato)}</small><b>${esc(it.titulo)}</b></span>`;
  const capa = (it, c) => { const m = it.midias[0]; return m && miniOk(m.thumb) ? `<img src="${esc(m.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : arte(it, c); };
  const selo = it => { if (modoCliente()) return it.status === "pub" ? "" : `<span class="fd-tag">Em breve</span>`; return `<span class="fd-tag st-${it.status}">${it.atrasada ? "Atrasado · " : ""}${esc(nomeStatus(it.status))}</span>`; };
  const icone = it => (it.formato === "Carrossel" || it.midias.length > 1 ? `<span class="fd-ico" title="Carrossel">${SV.carrossel}</span>` : it.formato === "Reels" ? `<span class="fd-ico" title="Reels">${SV.play}</span>` : "");
  const celula = (it, c, pode) => `<button type="button" class="fd-cell${it.status === "pub" ? " pub" : ""}${ui.sel === it.id ? " on" : ""}" data-id="${esc(it.id)}"${pode && it.status !== "pub" ? ' draggable="true"' : ""} aria-label="${esc(it.titulo)}, ${esc(it.formato)}, ${esc(nomeStatus(it.status))}">${capa(it, c)}${icone(it)}${selo(it)}</button>`;

  function celular(m, lista, d, c) {
    const p = d.perfil || {}, pode = d.podeEditar && !modoCliente(), vis = filtrar(lista, ui.grupo, ui.aba === "reels" ? "reels" : "grade");
    const hl = (p.destaques || []).map(x => `<span class="fd-hl"><i style="--cor:${esc(x.cor || "")}">${esc(x.nome[0].toUpperCase())}</i><small>${esc(x.nome)}</small></span>`).join("");
    return `<div class="fd-phone"><div class="fd-screen" id="fd-screen">
      <div class="fd-top"><b>${esc(p.handle || c.short || c.name)}</b><span aria-hidden="true">•••</span></div>
      <div class="fd-prof"><span class="fd-av">${window.N7Logos ? window.N7Logos.avatar(c, "width:100%;height:100%") : ""}</span>
        <div class="fd-stats"><span><b>${lista.length}</b>posts</span><span><b>${esc(p.seguidores || "—")}</b>seguidores</span><span><b>${esc(p.seguindo || "—")}</b>seguindo</span></div></div>
      <div class="fd-name">${esc(p.nome || c.name)}</div>
      ${p.bio ? `<div class="fd-bio">${esc(p.bio)}</div>` : ""}${p.link ? `<div class="fd-lnk">${esc(p.link)}</div>` : ""}
      <div class="fd-btns"><span>Seguindo</span><span>Mensagem</span></div>
      ${hl ? `<div class="fd-hls">${hl}</div>` : ""}
      <div class="fd-tabs" role="tablist"><button type="button" role="tab" data-aba="grade" aria-label="Grade" aria-selected="${ui.aba === "grade"}" class="${ui.aba === "grade" ? "on" : ""}">${SV.grade}</button><button type="button" role="tab" data-aba="reels" aria-label="Reels" aria-selected="${ui.aba === "reels"}" class="${ui.aba === "reels" ? "on" : ""}">${SV.reels}</button><button type="button" role="tab" disabled aria-label="Marcações">${SV.tag}</button></div>
      <div class="fd-grid" id="fd-grid">${vis.map(it => celula(it, c, pode)).join("") || `<div class="fd-vazio">Nada neste filtro.</div>`}</div>
    </div></div>`;
  }
  const campo = (id, rot, v, ph = "", max = 80) => `<div><label class="lbl" for="${id}">${rot}</label><input type="text" id="${id}" value="${esc(v)}" placeholder="${esc(ph)}" maxlength="${max}"></div>`;
  function lateral(m, lista, d) {
    const n = contar(lista), pode = d.podeEditar && !H.isClient, p = d.perfil || {}, dr = d.drive || {};
    const chips = Object.keys(GRUPOS).map(g => `<button type="button" class="fd-chip${ui.grupo === g ? " on" : ""}" data-grupo="${g}">${GRUPOS[g]} <b>${n[g]}</b></button>`).join("");
    const aviso = dr.ligado ? `<p class="src">${dr.posts.length} pasta(s) de post lida(s) do Drive.${pode ? ` <button type="button" class="btn" id="fd-atualizar">Atualizar agora</button>` : ""}</p>`
      : (pode ? `<div class="notice"><b>Artes do Drive ainda não aparecem.</b> ${esc(dr.erro || "")}<ol class="plain"><li>No Google Cloud, ative a <b>Google Drive API</b>.</li><li>Compartilhe a pasta de postagens com <b>${esc(dr.conta || "a conta de serviço")}</b> (Leitor).</li><li>Volte aqui e toque em Atualizar.</li></ol><button type="button" class="btn" id="fd-atualizar">Atualizar</button></div>`
        : `<p class="src">As artes aparecem aqui assim que ficam prontas. Por enquanto você vê os posts planejados.</p>`);
    const pasta = pode ? `<details class="fd-det"><summary>Pasta do Drive</summary>${campo("fd-pasta", "Pasta com as postagens (link do Drive)", d.pastas && d.pastas[0] ? "https://drive.google.com/drive/folders/" + d.pastas[0].id : "", "cole o link da pasta", 200)}<p class="src">Cada post é uma pasta <code>AAAA-MM-DD__CÓDIGO__Titulo</code> com as artes em ordem (01_, 02_...) e o documento da legenda.</p></details>` : "";
    const perfil = pode ? `<details class="fd-det"><summary>Perfil mostrado no celular</summary><div class="fd-form">
      ${campo("fd-handle", "Usuário (sem @)", p.handle, "minasfarmabg", 40)}${campo("fd-nome", "Nome", p.nome, "", 60)}${campo("fd-bio", "Bio", p.bio, "", 300)}${campo("fd-link", "Link", p.link, "", 120)}
      ${campo("fd-segs", "Seguidores", p.seguidores, "12,4 mil", 12)}${campo("fd-seguindo", "Seguindo", p.seguindo, "310", 12)}
      ${campo("fd-dest", "Destaques (separe por vírgula)", (p.destaques || []).map(x => x.nome).join(", "), "Promoções, Clube, Dicas", 160)}</div>
      <button type="button" class="btn primary" id="fd-salvar-perfil">Salvar perfil</button></details>` : "";
    const organizar = pode ? `<details class="fd-det"><summary>Organizar o Drive (agente)</summary><div id="fd-org"></div></details><details class="fd-det"><summary>Referências do agente criativo (V4)</summary><div id="fd-ref"></div></details><details class="fd-det"><summary>Rascunhos e posts (agente criativo)</summary><div id="fd-ras"></div></details>` : "";
    return `<aside class="fd-side">
      <div class="panel"><div class="panel-body"><span class="col-title">Mostrar</span><div class="fd-chips">${chips}</div>
        ${H.isClient ? "" : `<label class="fd-sw"><input type="checkbox" id="fd-cli"${ui.cliente ? " checked" : ""}> <span>Visão do cliente <small>(sem códigos nem etapas internas)</small></span></label>`}
        ${pode ? `<p class="src">Arraste os posts que ainda não foram publicados para mudar a ordem, ou abra um post e use as setas. A ordem fica só no preview: não muda as datas do calendário.</p>` : ""}</div></div>
      <div class="panel"><div class="panel-body">${aviso}${pasta}${perfil}${organizar}</div></div></aside>`;
  }

  function desenhar() {
    if (!view) return; const m = ui.marca, c = cliente(m), d = dados[m];
    const lista = d ? itens(m) : [];
    const tabs = marcas().length > 1 ? `<div class="fd-marcas" role="tablist">${marcas().map(x => `<button type="button" role="tab" data-marca="${esc(x.key)}" aria-selected="${x.key === m}" class="${x.key === m ? "on" : ""}">${window.N7Logos ? window.N7Logos.marca(x) : ""}<span>${esc(x.short || x.name)}</span></button>`).join("")}</div>` : "";
    const y = $("#fd-screen", view) ? $("#fd-screen", view).scrollTop : 0;
    view.innerHTML = `${H.banner("ig", "Preview de Feed", `como o perfil de ${esc(c.name)} vai ficar`)}${tabs}
      ${d ? `<div class="fd-wrap">${celular(m, lista, d, c)}${lateral(m, lista, d)}</div>` : `<div class="panel"><div class="panel-body"><p class="src">Carregando o feed…</p></div></div>`}`;
    if (d) { const s = $("#fd-screen", view); if (s) s.scrollTop = y; ligar(m, lista, d); }
  }

  /* ---------- post aberto ---------- */
  function abrir(m, id, slide = 0) {
    const lista = itens(m), it = lista.find(x => x.id === id); if (!it) return;
    const c = cliente(m), d = dados[m] || {}, pode = d.podeEditar && !modoCliente(), p = d.perfil || {}, ant = $(".fd-ov"); if (ant) ant.remove();
    const mid = it.midias, atual = mid[slide] || null, leg = legendas[it.legendaId];
    const vivos = lista.filter(x => x.status !== "pub"), pos = vivos.findIndex(x => x.id === id);
    const quando = diaTxt(it.data) + (leg && leg.hora ? " · " + leg.hora : "");
    const ov = document.createElement("div"); ov.className = "fd-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", it.titulo);
    ov.innerHTML = `<div class="fd-card"><button type="button" class="fd-x" data-fecha aria-label="Fechar">${SV.x}</button>
      <div class="fd-midia">${atual && miniOk(atual.thumb) ? `<img src="${esc(atual.thumb)}" alt="${esc(it.titulo)}" referrerpolicy="no-referrer">` : arte(it, c)}
        ${atual && atual.tipo === "video" ? `<a class="fd-play" href="https://drive.google.com/file/d/${esc(atual.id)}/view" target="_blank" rel="noopener" aria-label="Abrir o vídeo no Drive">${SV.play}</a>` : ""}
        ${mid.length > 1 ? `<button type="button" class="fd-nav e" data-slide="${slide - 1}" aria-label="Anterior"${slide === 0 ? " hidden" : ""}>${SV.esq}</button><button type="button" class="fd-nav d" data-slide="${slide + 1}" aria-label="Próxima"${slide === mid.length - 1 ? " hidden" : ""}>${SV.dir}</button>
        <div class="fd-dots">${mid.map((_, i) => `<i class="${i === slide ? "on" : ""}"></i>`).join("")}</div>` : ""}</div>
      <div class="fd-info">
        <div class="fd-acoes"><span>${SV.cora}</span><span>${SV.bolha}</span><span>${SV.aviao}</span><span class="r">${SV.marca}</span></div>
        <div class="fd-leg"><b>${esc(p.handle || c.short)}</b> <span id="fd-leg-txt">${it.legendaId ? (leg ? esc(leg.legenda || "Sem legenda no documento.") : "Carregando a legenda…") : "<i>Legenda ainda não escrita.</i>"}</span></div>
        <p class="fd-meta">${it.status === "pub" ? "Publicado" : "Publicação prevista"} · ${esc(quando)}${modoCliente() ? ` · ${esc(it.formato)}` : ` · ${esc(it.formato)}${it.status === "pub" ? "" : " · " + esc(nomeStatus(it.status))}${it.codigo ? " · " + esc(it.codigo) : ""}`}</p>
        <div class="fd-botoes">${!modoCliente() && it.temPauta ? `<button type="button" class="btn" data-pauta="${esc(it.codigo)}">Abrir pauta</button>` : ""}${it.pastaId && !H.isClient ? `<a class="btn" href="https://drive.google.com/drive/folders/${esc(it.pastaId)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ""}
          ${pode && it.status !== "pub" ? `<button type="button" class="btn" data-passo="-1"${pos <= 0 ? " disabled" : ""}>◀ Antes</button><button type="button" class="btn" data-passo="1"${pos < 0 || pos >= vivos.length - 1 ? " disabled" : ""}>Depois ▶</button>` : ""}</div></div></div>`;
    document.body.appendChild(ov); ui.sel = id;
    const fecha = () => { ov.remove(); document.removeEventListener("keydown", tecla); ui.sel = ""; const b = view && $(`.fd-cell[data-id="${CSS.escape(id)}"]`, view); if (b) { b.classList.remove("on"); b.focus(); } };
    const tecla = e => { if (e.key === "Escape") fecha(); else if (e.key === "ArrowLeft" && slide > 0) abrir(m, id, slide - 1); else if (e.key === "ArrowRight" && slide < mid.length - 1) abrir(m, id, slide + 1); };
    document.addEventListener("keydown", tecla);
    ov.addEventListener("click", e => {
      const t = e.target.closest("button,a,.fd-ov"); if (!t) return;
      if (t === ov || t.hasAttribute("data-fecha")) return fecha();
      if (t.dataset.slide != null) return abrir(m, id, +t.dataset.slide);
      if (t.dataset.pauta) { fecha(); return H.openPauta(t.dataset.pauta); }
      if (t.dataset.passo) { const nova = passo(lista, id, +t.dataset.passo); guardarOrdem(m, nova).then(() => abrir(m, id, slide)); }
    });
    const bt = $(".fd-x", ov); if (bt) bt.focus();
    if (it.legendaId && !leg) chamar(`/api/feed?marca=${encodeURIComponent(m)}&legenda=${encodeURIComponent(it.legendaId)}`).then(r => { legendas[it.legendaId] = r; if (document.body.contains(ov) && ui.sel === id) abrir(m, id, slide); }).catch(() => { const t = $("#fd-leg-txt", ov); if (t) t.textContent = "Não foi possível ler a legenda."; });
  }

  async function guardarOrdem(m, ids) {
    ordemLocal[m] = ids; desenhar();
    try { await chamar("/api/feed", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify({ marca: m, ordem: ids }) }); if (dados[m]) dados[m].ordem = ids; }
    catch (e) { H.toast(e.message); }
  }
  async function guardar(m, corpo, ok) {
    try { const r = await chamar("/api/feed", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify(Object.assign({ marca: m }, corpo)) }); Object.assign(dados[m], { perfil: r.perfil, pastas: r.pastas, ordem: r.ordem }); H.toast(ok); await carregar(m, true); desenhar(); }
    catch (e) { H.toast(e.message); }
  }

  function ligar(m, lista, d) {
    const pode = d.podeEditar && !modoCliente();
    $$("[data-marca]", view).forEach(b => b.onclick = () => { ui.marca = b.dataset.marca; ui.sel = ""; if (!dados[ui.marca]) carregar(ui.marca); desenhar(); });
    $$("[data-grupo]", view).forEach(b => b.onclick = () => { ui.grupo = b.dataset.grupo; desenhar(); });
    $$("[data-aba]", view).forEach(b => b.onclick = () => { ui.aba = b.dataset.aba; desenhar(); });
    const cli = $("#fd-cli", view); if (cli) cli.onchange = () => { ui.cliente = cli.checked; desenhar(); };
    const at = $("#fd-atualizar", view); if (at) at.onclick = async () => { at.disabled = true; await carregar(m, true); };
    const grade = $("#fd-grid", view); if (!grade) return;
    grade.onclick = e => { const b = e.target.closest(".fd-cell"); if (b) abrir(m, b.dataset.id); };
    if (pode) {                                              /* arrastar e soltar: só posts que ainda não foram publicados */
      let arrasta = ""; 
      grade.ondragstart = e => { const b = e.target.closest(".fd-cell[draggable]"); if (!b) return; arrasta = b.dataset.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", arrasta); } catch (x) { /* sem dados */ } b.classList.add("arrastando"); };
      grade.ondragend = () => { arrasta = ""; $$(".arrastando,.alvo", grade).forEach(x => x.classList.remove("arrastando", "alvo")); };
      grade.ondragover = e => { const b = e.target.closest(".fd-cell[draggable]"); if (!arrasta || !b) return; e.preventDefault(); $$(".alvo", grade).forEach(x => x.classList.remove("alvo")); b.classList.add("alvo"); };
      grade.ondrop = e => { const b = e.target.closest(".fd-cell[draggable]"); if (!arrasta || !b) return; e.preventDefault(); const nova = mover(lista, arrasta, b.dataset.id); arrasta = ""; guardarOrdem(m, nova); };
    }
    const org = $("#fd-org", view); if (org && root.N7DriveOrg) root.N7DriveOrg.montar(org, m, Object.assign({}, H, { recarregar: () => carregar(m, true) }));
    const ref = $("#fd-ref", view), ras = $("#fd-ras", view), cr = root.N7Criacao; if (ref && cr) ref.closest("details").addEventListener("toggle", ev => { if (ev.target.open && !ref.dataset.ok) { ref.dataset.ok = "1"; cr.montarReferencias(ref, m, H); } }); if (ras && cr) ras.closest("details").addEventListener("toggle", ev => { if (ev.target.open) cr.montarRascunhos(ras, m, H); });
    const sp = $("#fd-salvar-perfil", view);
    if (sp) sp.onclick = () => {
      const v = id => ($("#" + id, view).value || "").trim();
      const destaques = v("fd-dest").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8).map((nome, i) => ({ nome, cor: "" }));
      guardar(m, { perfil: { handle: v("fd-handle"), nome: v("fd-nome"), bio: v("fd-bio"), link: v("fd-link"), seguidores: v("fd-segs"), seguindo: v("fd-seguindo"), destaques } }, "Perfil salvo");
    };
    const pf = $("#fd-pasta", view);
    if (pf) pf.onchange = () => { if (!pf.value.trim()) return guardar(m, { pastas: [] }, "Voltou para a pasta padrão"); guardar(m, { pastas: [{ id: pf.value, status: "pronto" }] }, "Pasta salva"); };
  }

  function render(v, ctx) {
    H = ctx; view = v; const l = marcas();
    if (!l.length) { v.innerHTML = `<div class="panel"><div class="panel-body"><p class="src">Nenhum cliente com redes sociais.</p></div></div>`; return; }
    if (!l.some(c => c.key === ui.marca)) ui.marca = l[0].key;
    if (!dados[ui.marca]) carregar(ui.marca);
    desenhar();
  }
  root.N7Feed.render = render;
})(typeof window !== "undefined" ? window : globalThis);
