/* Inicialização: confere o login, carrega os dados dos clientes (só depois do login) e o estado
   salvo, liga a sincronização e então inicia o site (app.js).
   Também desenha a tela de entrada (e-mail e senha, ou Google) e a de criar a senha no primeiro acesso. */
(function () {
  const $ = s => document.querySelector(s);
  const view = () => $("#view");
  const H = { "Content-Type": "application/json", "X-N7": "1" };
  const api = async (path, opts) => { const r = await fetch(path, opts); let b = null; try { b = await r.json(); } catch (e) { /* sem corpo */ } return { ok: r.ok, status: r.status, body: b }; };
  const post = (action, data) => api("/api/auth?action=" + action, { method: "POST", headers: H, body: JSON.stringify(data || {}) });
  const loadScript = src => new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => fail(new Error("Falha ao carregar " + src)); document.head.appendChild(s); });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } } };

  /* ---------- tela de entrada ---------- */
  const brandPanel = () => `
    <aside class="auth-brand" aria-hidden="false">
      <div class="auth-brand-top"><img src="assets/brand/nova7-simbolo.png" alt="" width="40" height="40"><b>NOVA7</b></div>
      <div class="auth-hero">
        <h1>Tudo da agência,<br>num só lugar.</h1>
        <p>Calendário, aprovações, resultados e metas de cada cliente, com o painel certo para cada serviço.</p>
        <ul class="auth-points">
          <li><i></i>Calendário Kanban com aprovação do cliente</li>
          <li><i></i>Resultados da semana e PowerPoint pronto</li>
          <li><i></i>Um painel para cada serviço prestado</li>
        </ul>
      </div>
      <small>Nova7 · Baixo Guandu-ES</small>
      <i class="auth-orb o1"></i><i class="auth-orb o2"></i>
    </aside>`;
  const authShell = inner => { document.body.classList.add("is-login"); document.title = "Entrar · Central Nova7"; view().innerHTML = `<div class="auth">${brandPanel()}<main class="auth-panel">${inner}</main></div>`; };
  const eyeBtn = id => `<button type="button" class="pw-eye" data-eye="${id}" aria-label="Mostrar senha" aria-pressed="false">Mostrar</button>`;
  function wireEyes() {
    document.querySelectorAll("[data-eye]").forEach(b => b.addEventListener("click", () => {
      const inp = document.getElementById(b.dataset.eye), show = inp.type === "password";
      inp.type = show ? "text" : "password"; b.textContent = show ? "Ocultar" : "Mostrar"; b.setAttribute("aria-pressed", String(show)); b.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    }));
  }

  function message(title, text, extra) {
    document.body.classList.add("is-login");
    view().innerHTML = `<div class="login-card"><img src="assets/brand/nova7-simbolo.png" alt="" width="44" height="44"><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra || ""}</div>`;
    const retry = view().querySelector("[data-retry]"); if (retry) retry.onclick = () => location.reload();
  }

  function showLogin(cfg, note) {
    const dev = cfg && cfg.dev, id = cfg && cfg.clientId, pass = !cfg || cfg.password !== false;
    authShell(`
      <div class="auth-form">
        <img class="auth-logo-m" src="assets/brand/nova7-simbolo.png" alt="" width="36" height="36">
        <h2>Entrar na Central</h2>
        <p class="auth-sub">Use o e-mail cadastrado pela Nova7. No primeiro acesso você entra com a senha padrão e cria a sua em seguida.</p>
        ${pass ? `<form id="login-form" novalidate>
          <label class="auth-field"><span>E-mail</span><input type="email" id="lg-email" autocomplete="username" inputmode="email" placeholder="voce@empresa.com" required></label>
          <label class="auth-field"><span>Senha</span><div class="pw"><input type="password" id="lg-pass" autocomplete="current-password" placeholder="Sua senha" required>${eyeBtn("lg-pass")}</div></label>
          <button type="submit" class="auth-btn" id="lg-go">Entrar</button>
        </form>` : ""}
        <p class="login-err" id="login-err" role="alert">${esc(note || "")}</p>
        ${id ? `<div class="auth-or"><span>ou</span></div><div id="g-btn" class="g-btn"></div>` : ""}
        ${dev ? `<button type="button" class="auth-btn ghost" id="dev-login">Entrar em modo de desenvolvimento</button>` : ""}
        ${!id && !dev && !pass ? `<p class="login-err">O login ainda não foi configurado.</p>` : ""}
      </div>`);
    const fail = t => { const e = $("#login-err"); if (e) e.textContent = t; };
    wireEyes();
    const em = $("#lg-email"); if (em) { em.value = store.get("n7_email"); (em.value ? $("#lg-pass") : em).focus(); }
    const form = $("#login-form");
    if (form) form.addEventListener("submit", async e => {
      e.preventDefault(); fail("");
      const email = $("#lg-email").value.trim(), senha = $("#lg-pass").value;
      if (!email || !senha) return fail("Informe o e-mail e a senha.");
      const btn = $("#lg-go"); btn.disabled = true; btn.textContent = "Entrando…";
      const r = await post("password", { email, senha }).catch(() => null);
      if (!r) { btn.disabled = false; btn.textContent = "Entrar"; return fail("Sem conexão. Verifique a internet e tente de novo."); }
      if (r.ok) { store.set("n7_email", email); return r.body.user && r.body.user.trocar ? showChangePassword(r.body.user) : location.reload(); }
      btn.disabled = false; btn.textContent = "Entrar"; $("#lg-pass").value = ""; $("#lg-pass").focus();
      fail((r.body && r.body.error) || "Não foi possível entrar.");
    });
    if (dev) $("#dev-login").onclick = async () => { const r = await post("dev"); r.ok ? location.reload() : fail((r.body && r.body.error) || "Não foi possível entrar."); };
    if (id) loadScript("https://accounts.google.com/gsi/client").then(() => {
      google.accounts.id.initialize({
        client_id: id,
        callback: async resp => { const r = await post("login", { credential: resp.credential }); r.ok ? location.reload() : fail((r.body && r.body.error) || "Não foi possível entrar."); }
      });
      google.accounts.id.renderButton($("#g-btn"), { theme: "outline", size: "large", text: "signin_with", locale: "pt-BR", width: Math.max(220, Math.min(340, innerWidth - 72)) });
    }).catch(() => fail("Não foi possível carregar o login do Google. Use e-mail e senha, ou verifique a conexão."));
  }

  async function relogin(note) { const me = await api("/api/auth?action=me").catch(() => null); showLogin(me && me.body && me.body.login, note); }

  /* primeiro acesso: criar a própria senha */
  function showChangePassword(user) {
    authShell(`
      <div class="auth-form">
        <img class="auth-logo-m" src="assets/brand/nova7-simbolo.png" alt="" width="36" height="36">
        <h2>Crie a sua senha</h2>
        <p class="auth-sub">${user && user.nome ? `Olá, ${esc(user.nome.split(" ")[0])}. ` : ""}Este é o seu primeiro acesso. Escolha uma senha só sua: a senha padrão deixa de valer.</p>
        <form id="pw-form" novalidate>
          <label class="auth-field"><span>Nova senha</span><div class="pw"><input type="password" id="pw-new" autocomplete="new-password" placeholder="Pelo menos 8 caracteres" required>${eyeBtn("pw-new")}</div></label>
          <label class="auth-field"><span>Repita a nova senha</span><div class="pw"><input type="password" id="pw-new2" autocomplete="new-password" placeholder="Repita a senha" required></div></label>
          <p class="auth-hint">Use 8 ou mais caracteres, com letras e números.</p>
          <button type="submit" class="auth-btn" id="pw-go">Salvar e entrar</button>
        </form>
        <p class="login-err" id="login-err" role="alert"></p>
        <button type="button" class="auth-link" id="pw-out">Sair</button>
      </div>`);
    wireEyes();
    const fail = t => { $("#login-err").textContent = t; };
    $("#pw-new").focus();
    $("#pw-out").onclick = async () => { await post("logout"); location.reload(); };
    $("#pw-form").addEventListener("submit", async e => {
      e.preventDefault(); fail("");
      const a = $("#pw-new").value, b = $("#pw-new2").value;
      if (a !== b) return fail("As duas senhas não são iguais.");
      const btn = $("#pw-go"); btn.disabled = true; btn.textContent = "Salvando…";
      const r = await post("setpassword", { nova: a }).catch(() => null);
      if (r && r.ok) return location.reload();
      btn.disabled = false; btn.textContent = "Salvar e entrar";
      if (r && r.status === 401) return relogin("Sua sessão terminou. Entre de novo.");
      fail(r ? (r.body && r.body.error) || "Não foi possível salvar a senha." : "Sem conexão. Tente de novo.");
    });
  }

  function setSyncState(s, n) {
    const el = $("#sync"); if (!el) return;
    el.hidden = false; el.dataset.state = s;
    const q = n > 0 ? `${n} alteraç${n === 1 ? "ão" : "ões"}` : "";
    $("#sync-text").textContent = { saving: q ? `Salvando ${q}…` : "Salvando…", saved: "Salvo na planilha", error: q ? `${q} não enviada${n === 1 ? "" : "s"}: sem conexão, tentando de novo` : "Sem conexão: tentando de novo" }[s] || "";
    el.title = s === "error" ? "As alterações estão guardadas neste aparelho e serão enviadas quando a conexão voltar, mesmo que você feche o app." : "";
  }

  async function start(user) {
    document.body.classList.remove("is-login");
    view().innerHTML = `<p class="src">Carregando os dados…</p>`;
    await loadScript("/api/data");                                   /* dados dos clientes: só com login */
    const st = await api("/api/state");
    if (st.status === 401) return relogin("Sua sessão terminou. Entre de novo.");
    if (st.status === 403 && st.body && st.body.error === "trocar_senha") return showChangePassword(user);
    if (!st.ok) return message("Não foi possível carregar", (st.body && st.body.error) || "Erro ao ler o banco de dados.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
    window.N7User = user;
    window.N7Registry = st.body.registry || { clients: [], users: [] };
    N7Store.hydrate(st.body.state);
    if (!N7Store.get("user", "")) N7Store.set("user", user.nome || "");
    const sync = N7Sync.createSync({
      store: N7Store, onState: setSyncState, persist: N7Outbox.forUser(user.email),
      onAuth: () => { location.reload(); },
      onFatal: msg => { const t = $("#toast"); if (t) { t.textContent = msg; t.hidden = false; } setTimeout(() => location.reload(), 2600); }
    });
    window.__n7pending = () => sync.pending() > 0;
    /* alterações que ficaram guardadas no aparelho (conexão caiu e o app foi fechado): envia antes de abrir a tela e recarrega o estado */
    const box = N7Outbox.forUser(user.email), saved = await box.load();
    if (saved) {
      view().innerHTML = `<p class="src">Enviando ${saved.ops.length} alteração(ões) feita(s) sem conexão…</p>`;
      await sync.restore(saved.ops);
      if (sync.pending() === 0) { const again = await api("/api/state"); if (again.ok) N7Store.hydrate(again.body.state); const t = $("#toast"); if (t) { t.textContent = `${saved.ops.length} alteração(ões) feita(s) sem conexão foram enviadas.`; t.hidden = false; setTimeout(() => { t.hidden = true; }, 4000); } }
    }
    const who = $("#who");
    who.hidden = false;
    /* avatar com as iniciais, numa cor fixa para cada pessoa (sai do e-mail), e nome com a função embaixo */
    const nome = String(user.nome || user.email || "").trim(), partes = nome.split(/[\s@._-]+/).filter(Boolean), ini = ((partes[0] || "?")[0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
    const cor = 1 + [...String(user.email || nome)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 8, 0), papel = { admin: "administrador", editor: "editor", leitura: "leitura", cliente: "cliente" }[user.papel] || user.papel;
    who.innerHTML = `<span class="who-av" style="--av:var(--c${cor})" aria-hidden="true">${esc(ini)}</span><span class="who-nm" title="${esc(user.email)}"><b>${esc(nome.split(/\s+/)[0] || nome)}</b><small>${esc(papel)}</small></span><button type="button" class="btn sm" id="logout">Sair</button>`;
    $("#logout").onclick = async () => { await post("logout"); location.reload(); };
    addEventListener("beforeunload", e => { if (window.__n7pending && window.__n7pending()) { e.preventDefault(); e.returnValue = ""; } });
    await loadScript("assets/js/app.js");
  }

  (async function boot() {
    try {
      const me = await api("/api/auth?action=me");
      if (me.status === 401) return showLogin(me.body && me.body.login);
      if (!me.ok) return message("Não foi possível entrar", (me.body && me.body.error) || "Erro no servidor.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
      if (me.body.user.trocar) return showChangePassword(me.body.user);
      await start(me.body.user);
    } catch (e) {
      message("Sem conexão", "Não consegui falar com o servidor. Verifique a internet e tente de novo.", `<button type="button" class="btn" data-retry>Tentar de novo</button>`);
    }
  })();
})();
