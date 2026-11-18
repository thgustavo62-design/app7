/* Inicialização: confere o login, carrega os dados dos clientes (só depois do login) e o estado
   salvo, liga a sincronização e então inicia o site (app.js). */
(function () {
  const $ = s => document.querySelector(s);
  const view = () => $("#view");
  const H = { "Content-Type": "application/json", "X-N7": "1" };
  const api = async (path, opts) => { const r = await fetch(path, opts); let b = null; try { b = await r.json(); } catch (e) { /* sem corpo */ } return { ok: r.ok, status: r.status, body: b }; };
  const loadScript = src => new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Falha ao carregar " + src)); document.head.appendChild(s); });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function message(title, text, extra) {
    document.body.classList.add("is-login");
    view().innerHTML = `<div class="login-card"><img src="assets/brand/nova7-simbolo.png" alt="" width="44" height="44"><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra || ""}</div>`;
    const retry = view().querySelector("[data-retry]"); if (retry) retry.onclick = () => location.reload();
  }

  function showLogin(cfg, note) {
    const dev = cfg && cfg.dev, id = cfg && cfg.clientId;
    message("Central Nova7", "Entre com a conta Google autorizada pela agência.",
      `<div id="g-btn" class="g-btn"></div>${dev ? `<button type="button" class="btn" id="dev-login">Entrar em modo de desenvolvimento</button>` : ""}<p class="login-err" id="login-err" role="alert">${esc(note || "")}</p>
       ${!id && !dev ? `<p class="login-err">O login ainda não foi configurado (falta GOOGLE_CLIENT_ID no servidor).</p>` : ""}`);
    const fail = t => { $("#login-err").textContent = t; };
    if (dev) $("#dev-login").onclick = async () => { const r = await api("/api/auth?action=dev", { method: "POST", headers: H }); r.ok ? location.reload() : fail((r.body && r.body.error) || "Não foi possível entrar."); };
    if (id) loadScript("https://accounts.google.com/gsi/client").then(() => {
      google.accounts.id.initialize({
        client_id: id,
        callback: async resp => { const r = await api("/api/auth?action=login", { method: "POST", headers: H, body: JSON.stringify({ credential: resp.credential }) }); r.ok ? location.reload() : fail((r.body && r.body.error) || "Não foi possível entrar."); }
      });
      google.accounts.id.renderButton($("#g-btn"), { theme: "outline", size: "large", text: "signin_with", locale: "pt-BR", width: 280 });
    }).catch(() => fail("Não foi possível carregar o login do Google. Verifique a conexão ou bloqueadores de conteúdo."));
  }

  function setSyncState(s) {
    const el = $("#sync"); if (!el) return;
    el.hidden = false; el.dataset.state = s;
    $("#sync-text").textContent = { saving: "Salvando…", saved: "Salvo na planilha", error: "Sem conexão: tentando de novo" }[s] || "";
  }

  async function start(user) {
    document.body.classList.remove("is-login");
    view().innerHTML = `<p class="src">Carregando os dados…</p>`;
    await loadScript("/api/data");                                   /* dados dos clientes: só com login */
    const st = await api("/api/state");
    if (st.status === 401) return showLogin(null, "Sua sessão terminou. Entre de novo.");
    if (!st.ok) return message("Não foi possível carregar", (st.body && st.body.error) || "Erro ao ler o banco de dados.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
    window.N7User = user;
    window.N7Registry = st.body.registry || { clients: [], users: [] };
    N7Store.hydrate(st.body.state);
    if (!N7Store.get("user", "")) N7Store.set("user", user.nome || "");
    const sync = N7Sync.createSync({
      store: N7Store, onState: setSyncState,
      onAuth: () => { location.reload(); },
      onFatal: msg => { const t = $("#toast"); if (t) { t.textContent = msg; t.hidden = false; } setTimeout(() => location.reload(), 2600); }
    });
    window.__n7pending = () => sync.pending() > 0;
    const who = $("#who");
    who.hidden = false;
    who.innerHTML = `<span title="${esc(user.email)}">${esc(user.nome || user.email)}</span><span class="role">${esc({ admin: "administrador", editor: "editor", leitura: "leitura" }[user.papel] || user.papel)}</span><button type="button" class="btn sm" id="logout">Sair</button>`;
    $("#logout").onclick = async () => { await api("/api/auth?action=logout", { method: "POST", headers: H }); location.reload(); };
    addEventListener("beforeunload", e => { if (window.__n7pending && window.__n7pending()) { e.preventDefault(); e.returnValue = ""; } });
    await loadScript("assets/js/app.js");
  }

  (async function boot() {
    try {
      const me = await api("/api/auth?action=me");
      if (me.status === 401) return showLogin(me.body && me.body.login);
      if (!me.ok) return message("Não foi possível entrar", (me.body && me.body.error) || "Erro no servidor.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
      await start(me.body.user);
    } catch (e) {
      message("Sem conexão", "Não consegui falar com o servidor. Verifique a internet e tente de novo.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
    }
  })();
})();
