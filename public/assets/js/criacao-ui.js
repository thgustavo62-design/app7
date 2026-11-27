/* Painéis do Preview de Feed para o agente criativo: (1) referências do cliente (perfis da V4, estilo, o que evitar, exemplos que funcionaram) e
   (2) rascunhos que a IA fez, para revisar, aprovar ou descartar. Também o botão de sincronizar os posts com o Drive. Nada aqui publica nada. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const api = async (path, body) => { const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify(body) } : { headers: { "X-N7": "1" } }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não foi possível concluir."); return j; };
  const dm = iso => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
  const BADGE = { novo: "Para revisar", aprovado: "Aprovado", descartado: "Descartado" };

  function montarReferencias(host, marca, H) {
    host.innerHTML = `<p class="src">O agente criativo escreve seguindo estas referências. Coloque os perfis da <b>V4</b> (e de outras marcas) que você admira e o que cada um tem de bom para copiar o <i>estilo</i>, nunca o texto.</p><p class="src">Carregando…</p>`;
    api(`/api/drive?marca=${encodeURIComponent(marca)}&acao=referencias`).then(({ referencias: r }) => {
      host.innerHTML = `<label class="lbl">Perfis de referência (um por linha: @perfil — o que observar)</label><textarea id="cr-v4" rows="4" placeholder="@v4company — capas com título grande e número&#10;@outra.marca — legendas curtas com pergunta no fim">${esc((r.v4 || []).map(x => `@${x.handle}${x.notas ? " — " + x.notas : ""}`).join("\n"))}</textarea>
        <label class="lbl">Estilo da casa</label><textarea id="cr-estilo" rows="3" placeholder="direto, acolhedor, frases curtas, sem gíria">${esc(r.estilo || "")}</textarea>
        <label class="lbl">O que evitar</label><textarea id="cr-evitar" rows="2" placeholder="prometer resultado, citar preço sem conferir">${esc(r.evitar || "")}</textarea>
        <label class="lbl">Legendas que já funcionaram (separe por uma linha em branco)</label><textarea id="cr-ex" rows="4">${esc((r.exemplos || []).join("\n\n"))}</textarea>
        <button type="button" class="btn primary" id="cr-salvar">Salvar referências</button>`;
      host.querySelector("#cr-salvar").onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        const v4 = host.querySelector("#cr-v4").value.split("\n").map(l => { const m = l.match(/^\s*@?([A-Za-z0-9._]+)\s*(?:[—–-]+\s*(.*))?$/); return m ? { handle: m[1], notas: m[2] || "" } : null; }).filter(Boolean);
        try { await api("/api/drive", { acao: "referencias", marca, v4, estilo: host.querySelector("#cr-estilo").value, evitar: host.querySelector("#cr-evitar").value, exemplos: host.querySelector("#cr-ex").value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) }); H.toast("Referências salvas."); } catch (e) { H.toast(e.message); }
        b.disabled = false;
      };
    }).catch(e => { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
  }

  function cartao(r) {
    const lista = (t, l) => (l && l.length ? `<p><b>${t}</b></p><ol class="plain">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : "");
    return `<details class="cr-r"><summary><b>${esc(r.codigo)}</b> · ${esc(r.titulo)} · ${dm(r.data)} <span class="badge">${BADGE[r.status] || r.status}</span>${r.alertas && r.alertas.length ? ` <span class="badge p1">${r.alertas.length} alerta(s)</span>` : ""}</summary>
      ${r.alertas && r.alertas.length ? `<div class="notice">${r.alertas.map(esc).join("<br>")}</div>` : ""}
      <p><b>Legenda</b></p><p class="cr-leg">${esc(r.legenda).replace(/\n/g, "<br>")}</p>${r.hashtags && r.hashtags.length ? `<p class="src">${esc(r.hashtags.join(" "))}</p>` : ""}
      ${lista("Slides", r.slides)}${lista("Roteiro", r.roteiro)}${r.briefArte ? `<p><b>Brief da arte</b></p><p>${esc(r.briefArte)}</p>` : ""}
      <div class="toolbar">${r.canvaUrl ? `<a class="btn" href="${esc(r.canvaUrl)}" target="_blank" rel="noopener">Abrir no Canva</a>` : ""}<button type="button" class="btn" data-copiar="${esc(r.codigo)}">Copiar legenda</button>
        ${r.status === "novo" ? `<button type="button" class="btn primary" data-dec="aprovado" data-cod="${esc(r.codigo)}">Aprovar rascunho</button><button type="button" class="btn" data-dec="descartado" data-cod="${esc(r.codigo)}">Descartar</button>` : ""}</div>
      <p class="src">Gerado em ${esc((r.geradoEm || "").slice(0, 16).replace("T", " "))}${r.modelo ? " · " + esc(r.modelo) : ""}. Aprovar o rascunho não publica: a peça ainda passa pela aprovação do cliente.</p></details>`;
  }
  function montarRascunhos(host, marca, H) {
    const carregar = () => api(`/api/drive?marca=${encodeURIComponent(marca)}&acao=rascunhos`).then(({ rascunhos }) => {
      host.innerHTML = `<div class="toolbar"><button type="button" class="btn" id="cr-sync">Sincronizar posts com o Drive</button></div><p class="src">Pauta com arte <b>e</b> legenda completas no Drive vai para Aprovação (nunca para Pronto ou Publicado).</p>${rascunhos.length ? rascunhos.map(cartao).join("") : `<p class="src">Nenhum rascunho ainda. Com o agente criativo ligado, ele cria rascunhos das pautas dos próximos dias que ainda não têm material.</p>`}`;
      host.querySelector("#cr-sync").onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true; try { const r = await api("/api/drive", { acao: "sincronizar" }); H.toast(r.movidas.length ? `${r.movidas.length} pauta(s) foram para Aprovação.` : "Nada a adiantar agora."); } catch (e) { H.toast(e.message); } b.disabled = false; };
      host.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = () => { const r = rascunhos.find(x => x.codigo === b.dataset.copiar); if (r && navigator.clipboard) navigator.clipboard.writeText(r.legenda).then(() => H.toast("Legenda copiada.")); }; });
      host.querySelectorAll("[data-dec]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await api("/api/drive", { acao: "decidir", codigo: b.dataset.cod, status: b.dataset.dec }); H.toast(b.dataset.dec === "aprovado" ? "Rascunho aprovado." : "Rascunho descartado."); if (root.N7CriacaoBrain) root.N7CriacaoBrain.invalidate(); carregar(); } catch (e) { H.toast(e.message); b.disabled = false; } }; });
    }).catch(e => { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
    host.innerHTML = `<p class="src">Carregando…</p>`; carregar();
  }
  root.N7Criacao = { montarReferencias, montarRascunhos };
})(typeof window !== "undefined" ? window : globalThis);
