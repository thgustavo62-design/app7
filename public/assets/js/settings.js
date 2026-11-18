/* Configurações (só administradores): cadastro de clientes com os serviços que a Nova7 presta a cada um
   e cadastro de usuários (equipe da Nova7 e usuários dos clientes) com as empresas que cada um pode ver.
   Grava direto em /api/mutate (cada salvamento é explícito) e recarrega o cadastro. */
(function (root) {
  const SVC = root.N7Services;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ROLE_TXT = { admin: "Administrador: tudo, inclusive configurações", editor: "Editor: cria e edita, não muda configurações", leitura: "Leitura: só acompanha" };
  const ui = { edit: null, filter: "all" };          /* edit: null | { kind: "client"|"user", key } */
  let C = null;                                      /* contexto vindo do app.js */

  async function mutate(op) {
    const r = await fetch("/api/mutate", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify({ ops: [op] }) });
    const b = await r.json().catch(() => ({}));
    if (r.status === 409) { await C.reload(); throw new Error("Outra pessoa mudou isto ao mesmo tempo. Recarreguei o cadastro; tente de novo."); }
    if (r.status === 401) { location.reload(); throw new Error("Sua sessão terminou."); }
    if (!r.ok) throw new Error(b.error || "Não foi possível salvar.");
    return b;
  }
  const strip = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  function newKey(name, taken) {
    const words = strip(name).toUpperCase().split(/[^A-Z0-9]+/).filter(w => w && !["E", "DE", "DA", "DO", "DAS", "DOS"].includes(w));
    let base = words.map(w => w[0]).join("").slice(0, 3);
    if (base.length < 2) base = (words[0] || "CLI").slice(0, 3);
    if (!/^[A-Z]/.test(base)) base = "C" + base;
    let k = base, n = 2;
    while (taken.includes(k)) k = base.slice(0, 3) + n++;
    return k.slice(0, 4);
  }
  const svcChip = s => `<span class="svc-chip" style="--svc:var(${SVC.SERVICES[s].color})">${SVC.SERVICES[s].short}</span>`;
  const nameOfKey = k => { const c = C.REG.clients.find(x => x.key === k); return c ? c.name : k; };

  /* ---------- clientes ---------- */
  function clientsTab(v) {
    const list = C.REG.clients.slice().sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    const ed = ui.edit && ui.edit.kind === "client" ? ui.edit : null;
    const cur = ed && ed.key ? list.find(c => c.key === ed.key) : null;
    const f = cur || { name: "", short: "", handle: "", segment: "", setor: "outro", color: SVC.COLORS[list.length % SVC.COLORS.length], services: ["redes"], active: true, id: "" };
    v.querySelector("#cfg-body").innerHTML = `
      <div class="panel">${C.banner("list", "Clientes e serviços", `${list.filter(c => c.active).length} ativos · o painel de cada cliente segue os serviços marcados`, ed ? "" : `<button type="button" class="btn sm primary" id="c-new">Novo cliente</button>`)}
        <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviços</th><th>Setor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${list.map(c => `<tr class="${c.active ? "" : "inactive"}"><td><span class="client-avatar" style="background:var(${c.color});width:26px;height:26px;font-size:12px;display:inline-grid;vertical-align:middle;margin-right:8px">${C.esc(c.short[0])}</span><b>${C.esc(c.name)}</b><div class="src">${C.esc(c.handle || c.segment)} · #${C.esc(c.id)} · chave ${C.esc(c.key)}</div></td>
          <td><span class="svc-chips" style="margin:0">${SVC.ORDER.filter(s => (c.services || []).includes(s)).map(svcChip).join("")}</span></td><td>${C.esc(SVC.SECTORS[c.setor] || c.setor)}</td><td>${c.active ? `<span class="badge st-pub">ativo</span>` : `<span class="badge">desativado</span>`}</td>
          <td style="text-align:right"><button type="button" class="btn sm" data-edit-client="${C.esc(c.key)}">Editar</button></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`}
        </tbody></table></div></div>
      ${ed ? `<div class="panel">${C.banner("file", cur ? `Editar ${C.esc(cur.name)}` : "Novo cliente", "o painel muda conforme os serviços")}
        <form class="panel-body cfg-form" id="c-form" autocomplete="off" novalidate>
          <div class="form-row"><div><label class="lbl" for="cf-name">Nome da empresa</label><input type="text" id="cf-name" maxlength="80" value="${C.esc(f.name)}" required></div>
            <div><label class="lbl" for="cf-short">Nome curto</label><input type="text" id="cf-short" maxlength="20" value="${C.esc(f.short)}" required></div></div>
          <div class="form-row"><div><label class="lbl" for="cf-handle">Perfil no Instagram</label><input type="text" id="cf-handle" maxlength="60" placeholder="@empresa" value="${C.esc(f.handle)}"></div>
            <div><label class="lbl" for="cf-segment">Segmento e cidade</label><input type="text" id="cf-segment" maxlength="80" placeholder="Ex.: Padaria · Baixo Guandu-ES" value="${C.esc(f.segment)}"></div></div>
          <div class="form-row"><div><label class="lbl" for="cf-setor">Setor</label><select id="cf-setor">${Object.entries(SVC.SECTORS).map(([k, n]) => `<option value="${k}" ${k === f.setor ? "selected" : ""}>${n}</option>`).join("")}</select><small class="src">Saúde e agro usam checklist de conformidade nas peças.</small></div>
            <div><label class="lbl" for="cf-id">Endereço no site</label><input type="text" id="cf-id" maxlength="40" value="${C.esc(f.id)}" ${cur ? "readonly" : ""} placeholder="gerado a partir do nome"></div></div>
          <div><span class="lbl">Serviços prestados</span><div class="svc-pick">${SVC.ORDER.map(s => `<label style="--svc:var(${SVC.SERVICES[s].color})"><input type="checkbox" name="svc" value="${s}" ${(f.services || []).includes(s) ? "checked" : ""}><span><b>${SVC.SERVICES[s].name}</b><small>${SVC.SERVICES[s].desc}</small></span></label>`).join("")}</div></div>
          <div><span class="lbl">Cor</span><div class="color-pick" role="radiogroup" aria-label="Cor">${SVC.COLORS.map((k, i) => `<label><input type="radio" name="cor" value="${k}" ${k === f.color ? "checked" : ""} aria-label="Cor ${i + 1}"><span style="background:var(${k})"></span></label>`).join("")}</div></div>
          ${cur ? `<label class="check"><input type="checkbox" id="cf-active" ${f.active ? "checked" : ""}> Cliente ativo (desmarque para tirá-lo do site, sem apagar o histórico)</label>` : ""}
          <p class="login-err" id="c-err" role="alert" style="display:none"></p>
          <div class="cfg-actions"><button type="submit" class="btn primary">Salvar cliente</button><button type="button" class="btn" id="c-cancel">Cancelar</button></div>
        </form></div>` : ""}`;
    const go = (kind, key) => { ui.edit = { kind, key }; render(v, v.dataset.sub, C); };
    const nb = $("#c-new", v); if (nb) nb.onclick = () => go("client", null);
    $$("[data-edit-client]", v).forEach(b => { b.onclick = () => go("client", b.dataset.editClient); });
    if (!ed) return;
    $("#c-cancel", v).onclick = () => { ui.edit = null; render(v, v.dataset.sub, C); };
    const nm = $("#cf-name", v), idEl = $("#cf-id", v);
    if (!cur) nm.addEventListener("input", () => { if (!idEl.dataset.touched) idEl.value = slug(nm.value); if (!$("#cf-short", v).dataset.touched) $("#cf-short", v).value = nm.value.split(/\s+/)[0] || ""; });
    idEl.addEventListener("input", () => { idEl.dataset.touched = "1"; }); $("#cf-short", v).addEventListener("input", e => { e.target.dataset.touched = "1"; });
    $("#c-form", v).onsubmit = async e => {
      e.preventDefault();
      const err = $("#c-err", v), btn = e.target.querySelector("button[type=submit]");
      const op = {
        t: "client", chave: cur ? cur.key : newKey(nm.value, C.REG.clients.map(c => c.key)), id: (idEl.value || slug(nm.value)).trim(), nome: nm.value.trim(), curto: $("#cf-short", v).value.trim(),
        perfil: $("#cf-handle", v).value.trim(), segmento: $("#cf-segment", v).value.trim(), setor: $("#cf-setor", v).value, servicos: $$('input[name="svc"]:checked', v).map(i => i.value),
        cor: ($('input[name="cor"]:checked', v) || {}).value, ativo: cur ? ($("#cf-active", v).checked ? "sim" : "nao") : "sim", v: cur ? cur.v : undefined
      };
      err.style.display = "none"; btn.disabled = true;
      try { await mutate(op); ui.edit = null; await C.reload(); C.toast(cur ? "Cliente salvo" : `Cliente criado: ${op.nome}`); }
      catch (x) { err.textContent = x.message; err.style.display = "block"; btn.disabled = false; }
    };
  }

  /* ---------- usuários ---------- */
  function usersTab(v) {
    const all = C.REG.users || [], clients = C.REG.clients.filter(c => c.active);
    const list = all.filter(u => ui.filter === "all" || (ui.filter === "equipe" ? u.tipo === "equipe" : u.tipo === "cliente" ? u.empresas.includes(ui.filter) : !u.empresas.length || u.empresas.includes(ui.filter))).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
    const ed = ui.edit && ui.edit.kind === "user" ? ui.edit : null;
    const cur = ed && ed.key ? all.find(u => u.email === ed.key) : null;
    const f = cur || { nome: "", email: "", tipo: "equipe", papel: "editor", empresas: [], ativo: true };
    const empresasTxt = u => u.tipo === "equipe" && !u.empresas.length ? `<span class="badge">todas as empresas</span>` : u.empresas.map(k => `<span class="badge brand" style="--dot:var(${(C.REG.clients.find(c => c.key === k) || { color: "--c8" }).color})">${C.esc(nameOfKey(k))}</span>`).join(" ");
    v.querySelector("#cfg-body").innerHTML = `
      <div class="panel">${C.banner("list", "Usuários", `${all.filter(u => u.ativo).length} ativos · quem entra no site e o que vê`, ed ? "" : `<button type="button" class="btn sm primary" id="u-new">Novo usuário</button>`)}
        <div class="panel-body" style="padding-bottom:0"><div class="toolbar"><label class="lbl" for="u-filter" style="margin:0">Mostrar</label><select id="u-filter"><option value="all">Todos os usuários</option><option value="equipe" ${ui.filter === "equipe" ? "selected" : ""}>Só equipe da Nova7</option>${clients.map(c => `<option value="${C.esc(c.key)}" ${ui.filter === c.key ? "selected" : ""}>Quem acessa ${C.esc(c.name)}</option>`).join("")}</select></div></div>
        <div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Tipo</th><th>Acesso</th><th>Empresas</th><th>Situação</th><th></th></tr></thead><tbody>
        ${list.map(u => `<tr class="${u.ativo ? "" : "inactive"}"><td><b>${C.esc(u.nome)}</b><div class="src">${C.esc(u.email)}</div></td><td>${u.tipo === "cliente" ? "Cliente" : "Equipe Nova7"}</td>
          <td>${u.tipo === "cliente" ? "Aprova e acompanha" : C.esc({ admin: "Administrador", editor: "Editor", leitura: "Leitura" }[u.papel] || u.papel)}</td><td>${empresasTxt(u)}</td><td>${u.ativo ? `<span class="badge st-pub">ativo</span>` : `<span class="badge">desativado</span>`}</td>
          <td style="text-align:right"><button type="button" class="btn sm" data-edit-user="${C.esc(u.email)}">Editar</button></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">Nenhum usuário neste filtro.</div></td></tr>`}
        </tbody></table></div></div>
      ${ed ? `<div class="panel">${C.banner("file", cur ? `Editar ${C.esc(cur.nome)}` : "Novo usuário", "o acesso vale no próximo login ou ao recarregar a página")}
        <form class="panel-body cfg-form" id="u-form" autocomplete="off" novalidate>
          <div class="form-row"><div><label class="lbl" for="uf-name">Nome</label><input type="text" id="uf-name" maxlength="80" value="${C.esc(f.nome)}" required></div>
            <div><label class="lbl" for="uf-email">E-mail da conta Google</label><input type="email" id="uf-email" maxlength="120" value="${C.esc(f.email)}" ${cur ? "readonly" : ""} required></div></div>
          <div><span class="lbl">Tipo de usuário</span><div class="svc-pick" role="radiogroup" aria-label="Tipo">
            <label style="--svc:var(--c1)"><input type="radio" name="tipo" value="equipe" ${f.tipo === "equipe" ? "checked" : ""}><span><b>Equipe da Nova7</b><small>Trabalha no sistema. Vê todas as empresas ou só as marcadas.</small></span></label>
            <label style="--svc:var(--c3)"><input type="radio" name="tipo" value="cliente" ${f.tipo === "cliente" ? "checked" : ""}><span><b>Usuário do cliente</b><small>Vê só a própria empresa: o que está sendo feito, e aprova ou pede ajustes nas pautas.</small></span></label></div></div>
          <div id="uf-papel-box"><label class="lbl" for="uf-papel">Nível de acesso (equipe)</label><select id="uf-papel">${Object.entries(ROLE_TXT).map(([k, n]) => `<option value="${k}" ${k === f.papel ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div><span class="lbl" id="uf-emp-label">Empresas</span><div class="check-grid">${clients.map(c => `<label class="check"><input type="checkbox" name="emp" value="${C.esc(c.key)}" ${f.empresas.includes(c.key) ? "checked" : ""}> ${C.esc(c.name)}</label>`).join("")}</div>
            <p class="src" id="uf-emp-hint"></p></div>
          ${cur ? `<label class="check"><input type="checkbox" id="uf-active" ${f.ativo ? "checked" : ""}> Usuário ativo (desmarque para bloquear o acesso)</label>` : ""}
          <p class="login-err" id="u-err" role="alert" style="display:none"></p>
          <div class="cfg-actions"><button type="submit" class="btn primary">Salvar usuário</button><button type="button" class="btn" id="u-cancel">Cancelar</button>${cur ? `<button type="button" class="btn" id="u-del" style="margin-left:auto">Remover usuário</button>` : ""}</div>
        </form></div>` : ""}`;
    const go = key => { ui.edit = { kind: "user", key }; render(v, v.dataset.sub, C); };
    $("#u-filter", v).onchange = e => { ui.filter = e.target.value; render(v, v.dataset.sub, C); };
    const nb = $("#u-new", v); if (nb) nb.onclick = () => go(null);
    $$("[data-edit-user]", v).forEach(b => { b.onclick = () => go(b.dataset.editUser); });
    if (!ed) return;
    $("#u-cancel", v).onclick = () => { ui.edit = null; render(v, v.dataset.sub, C); };
    const tipoNow = () => ($('input[name="tipo"]:checked', v) || {}).value;
    const sync = () => {
      const cli = tipoNow() === "cliente";
      $("#uf-papel-box", v).hidden = cli;
      $("#uf-emp-label", v).textContent = cli ? "Empresas deste usuário (obrigatório)" : "Empresas que a pessoa vê";
      $("#uf-emp-hint", v).textContent = cli ? "O usuário cliente só enxerga as empresas marcadas." : "Deixe todas desmarcadas para acesso a todas as empresas.";
    };
    $$('input[name="tipo"]', v).forEach(r => r.addEventListener("change", sync)); sync();
    const base = () => ({ t: "user", email: ($("#uf-email", v).value || "").trim().toLowerCase(), nome: $("#uf-name", v).value.trim(), tipo: tipoNow(), papel: $("#uf-papel", v).value, empresas: $$('input[name="emp"]:checked', v).map(i => i.value) });
    const fail = x => { const err = $("#u-err", v); err.textContent = x.message; err.style.display = "block"; $$("button", $("#u-form", v)).forEach(b => { b.disabled = false; }); };
    $("#u-form", v).onsubmit = async e => {
      e.preventDefault(); $("#u-err", v).style.display = "none"; $$("button", e.target).forEach(b => { b.disabled = true; });
      try { await mutate(Object.assign(base(), { op: "upsert", ativo: cur ? ($("#uf-active", v).checked ? "sim" : "nao") : "sim" })); ui.edit = null; await C.reload(); C.toast(cur ? "Usuário salvo" : "Usuário cadastrado"); }
      catch (x) { fail(x); }
    };
    const del = $("#u-del", v);
    if (del) { let armed = false; del.onclick = async () => {
      if (!armed) { armed = true; del.textContent = "Confirmar: remover"; setTimeout(() => { armed = false; del.textContent = "Remover usuário"; }, 4000); return; }
      try { await mutate({ t: "user", op: "delete", email: cur.email }); ui.edit = null; await C.reload(); C.toast("Usuário removido"); } catch (x) { fail(x); }
    }; }
  }

  function render(view, sub, ctx) {
    C = ctx;
    const tab = sub === "clientes" ? "clientes" : "usuarios";
    view.dataset.sub = tab;
    if (ui.edit && ((ui.edit.kind === "client") !== (tab === "clientes"))) ui.edit = null;
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Sistema · só administradores</div><h1>Configurações</h1>
        <p>Cadastre os clientes com os serviços que a Nova7 presta a cada um (o painel muda conforme o serviço) e dê acesso à equipe e aos usuários dos clientes.</p></div></div>
      <nav class="subtabs" aria-label="Configurações"><a href="#config/usuarios" ${tab === "usuarios" ? 'aria-current="page"' : ""}>Usuários</a><a href="#config/clientes" ${tab === "clientes" ? 'aria-current="page"' : ""}>Clientes e serviços</a></nav>
      <div id="cfg-body" class="view" style="gap:16px"></div>`;
    if (tab === "clientes") clientsTab(view); else usersTab(view);
  }

  root.N7Settings = { render, _slug: slug, _newKey: newKey };
})(typeof window !== "undefined" ? window : globalThis);
