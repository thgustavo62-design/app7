/* Aprovação de artes: uma aba por cliente com as artes que o agente criou (carrossel de preview, legenda, alertas), para aprovar, pedir ajuste ou descartar.
   Os cartões vêm de criacao-ui.js (N7Criacao.montarRascunhos em modo "aprovação"); aqui ficam as abas de cliente, os contadores e o filtro. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FILTROS = [["aprovar", "Para aprovar", r => r.status === "novo" || r.status === "ajustando", "Nenhuma arte esperando aprovação. Quando o agente criar uma, ela aparece aqui."], ["aprovadas", "Aprovadas", r => r.status === "aprovado", "Nenhuma arte aprovada ainda."], ["descartadas", "Descartadas", r => r.status === "descartado", "Nenhuma arte descartada."], ["todas", "Todas", () => true, "Nenhuma arte ainda."]];
  const memo = { filtro: "aprovar" };

  async function listar(marca) {
    const r = await fetch(`/api/drive?marca=${encodeURIComponent(marca)}&acao=rascunhos`, { headers: { "x-n7": "1" }, credentials: "same-origin" });
    if (!r.ok) throw new Error("Não consegui carregar as artes (" + r.status + ").");
    return (await r.json()).rascunhos || [];
  }

  function render(view, H, sub) {
    const clientes = H.clients();
    if (!clientes.length) { view.innerHTML = `<p class="notice">Nenhum cliente com redes sociais ou criativos ativos.</p>`; return; }
    const atual = clientes.find(c => c.id === sub || c.key === sub) || clientes[0];
    view.innerHTML = `<div class="head"><div><h2>Aprovação de artes</h2><p class="src">As artes criadas pelo agente entram aqui, separadas por cliente. Aprovar não publica: a pauta segue para a aprovação do cliente.</p></div></div>
      <div class="ar-abas" id="ar-clientes" role="tablist" aria-label="Cliente">${clientes.map(c => `<a class="btn" role="tab" href="#artes/${esc(c.id)}" aria-pressed="${c.id === atual.id}" data-marca="${esc(c.key)}">${esc(c.name)}<span class="ar-n" data-n="${esc(c.key)}">·</span></a>`).join("")}</div>
      <div class="ar-abas" id="ar-filtros" role="group" aria-label="Situação">${FILTROS.map(([id, nome]) => `<button type="button" class="btn" data-f="${id}" aria-pressed="${memo.filtro === id}">${nome}<span class="ar-n" data-nf="${id}">·</span></button>`).join("")}</div>
      <div id="ar-lista"><p class="src">Carregando…</p></div>`;
    const contar = async () => {
      try {
        const todos = await listar(atual.key);
        FILTROS.forEach(([id,, fn]) => { const el = view.querySelector(`[data-nf="${id}"]`); if (el) el.textContent = todos.filter(fn).length; });
      } catch (e) { /* os contadores ficam sem número */ }
      /* pendentes das outras abas (em segundo plano) */
      for (const c of clientes) { listar(c.key).then(rs => { const el = view.querySelector(`[data-n="${c.key}"]`); if (el) el.textContent = rs.filter(r => r.status === "novo" || r.status === "ajustando").length; }).catch(() => {}); }
    };
    const montar = () => {
      const f = FILTROS.find(x => x[0] === memo.filtro) || FILTROS[0];
      root.N7Criacao.montarRascunhos(view.querySelector("#ar-lista"), atual.key, { toast: H.toast }, { aprovacao: true, filtro: f[2], vazio: f[3], aoMudar: contar });
    };
    view.querySelectorAll("[data-f]").forEach(b => { b.onclick = () => { memo.filtro = b.dataset.f; view.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); montar(); }; });
    contar(); montar();
  }
  root.N7Artes = { render };
})(typeof window !== "undefined" ? window : globalThis);
