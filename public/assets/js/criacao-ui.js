/* Painéis do Preview de Feed para o agente criativo: (1) referências do cliente (perfis da V4, estilo, o que evitar, exemplos que funcionaram) e
   (2) rascunhos que a IA fez, para revisar, aprovar ou descartar. Também o botão de sincronizar os posts com o Drive. Nada aqui publica nada. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const api = async (path, body) => { const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify(body) } : { headers: { "X-N7": "1" } }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não foi possível concluir."); return j; };
  const dm = iso => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
  const BADGE = { novo: "Para revisar", aprovado: "Aprovado", descartado: "Descartado", ajustando: "Ajuste pedido" };

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

  /* preview do post como aparece no Instagram: carrossel com as artes (miniaturas lidas do Drive) e a legenda */
  function previa(r) {
    if (!r.previews || !r.previews.length) return r.imagens && r.imagens.length ? `<p class="src">Preview: as artes aparecem aqui assim que o agente enviar as miniaturas (até 1 hora).</p>` : "";
    const n = r.previews.length, empresa = String(r.pastaArtes || "").split("/")[0] || r.marca || "", perfil = esc(empresa);
    return `<div class="cr-ig"><div class="cr-ig-top"><span class="cr-ig-av">${esc(empresa.slice(0, 1))}</span><b>${perfil}</b><span class="src">${esc(r.formato || "")}</span></div>
      <div class="cr-ig-trilho" tabindex="0" aria-label="Artes do post">${r.previews.map((p, i) => `<a class="cr-ig-img" href="/api/drive?acao=arte&codigo=${encodeURIComponent(r.codigo)}&n=${i + 1}" target="_blank" rel="noopener"><img loading="lazy" alt="Arte ${i + 1} de ${n} do rascunho ${esc(r.codigo)}" src="/api/drive?acao=arte&codigo=${encodeURIComponent(r.codigo)}&n=${i + 1}"><span class="cr-ig-n">${i + 1}/${n}</span></a>`).join("")}</div>
      <p class="cr-ig-leg"><b>${perfil}</b> ${esc((r.legenda || "").slice(0, 180))}${(r.legenda || "").length > 180 ? "… <span class='src'>mais</span>" : ""}</p>
      <p class="src cr-ig-aviso">Se a arte não carregar, o app do Google Drive no computador da agência ainda está enviando (alguns minutos).</p></div>`;
  }
  /* checklist do portão de qualidade: o que o agente conferiu antes de mandar para aprovação */
  function qualidadeHtml(r) {
    const q = r.qualidade; if (!q) return "";
    const ok = (b, t) => `<li class="${b ? "ok" : "falha"}">${b ? "✔" : "✖"} ${esc(t)}</li>`, sl = q.slides || [], aprov = sl.filter(x => x.aprovada).length, corr = sl.filter(x => x.aprovada && x.tentativas > 0).length;
    const linhaTxt = q.linha === "club" ? "Linha CLUBE: logo e padrão do clube" : q.linha === "farmacia" ? "Linha FARMÁCIA: logo da farmácia, sem elementos do clube" : "";
    return `<div class="cr-q ${q.passou ? "passou" : "revisar"}"><b>${q.passou ? "Passou nas regras" : "Revisar: não passou em todas as regras"}</b>${q.motivo ? ` <span class="src">(${esc(q.motivo)})</span>` : ""}<ul>${linhaTxt ? ok(true, linhaTxt) : ""}${q.regras ? ok(true, q.regras + " regra(s) da agência aplicadas") : ""}${ok(q.completas, q.completas ? "Carrossel/post completo" : "Faltam imagens")}${sl.length ? ok(aprov === sl.length, `Textos e logo conferidos: ${aprov} de ${sl.length} imagem(ns)${corr ? ` (${corr} corrigida(s) sozinha(s))` : ""}`) : ok(false, "Arte não conferida pelo ChatGPT")}${sl.filter(x => !x.aprovada && x.problemas.length).map(x => `<li class="falha">Imagem ${x.n}: ${esc(x.problemas.slice(0, 2).join("; "))}</li>`).join("")}</ul></div>`;
  }
  function cartao(r, aberto) {
    const lista = (t, l) => (l && l.length ? `<p><b>${t}</b></p><ol class="plain">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : "");
    return `<details class="cr-r"${aberto ? " open" : ""}><summary><b>${esc(r.codigo)}</b> · ${esc(r.titulo)} · ${dm(r.data)} <span class="badge">${BADGE[r.status] || r.status}</span>${r.versao > 1 ? ` <span class="badge">v${r.versao}</span>` : ""}${r.qualidade ? (r.qualidade.passou ? ` <span class="badge" style="background:#1a9b4b;color:#fff">passou nas regras</span>` : ` <span class="badge p1">revisar</span>`) : (r.alertas && r.alertas.length ? ` <span class="badge p1">${r.alertas.length} alerta(s)</span>` : "")}</summary>
      ${qualidadeHtml(r)}${r.alertas && r.alertas.length ? `<details class="cr-alertas"><summary>${r.alertas.length} alerta(s) para revisar</summary><div class="notice">${r.alertas.map(esc).join("<br>")}</div></details>` : ""}
      ${previa(r)}
      <p><b>Legenda</b></p><p class="cr-leg">${esc(r.legenda).replace(/\n/g, "<br>")}</p>${r.hashtags && r.hashtags.length ? `<p class="src">${esc(r.hashtags.join(" "))}</p>` : ""}
      ${lista("Slides", r.slides)}${lista("Roteiro", r.roteiro)}${r.briefArte ? `<p><b>Brief da arte</b></p><p>${esc(r.briefArte)}</p>` : ""}
      <div class="toolbar">${r.canvaUrl ? `<a class="btn" href="${esc(r.canvaUrl)}" target="_blank" rel="noopener">Abrir no Canva</a>` : ""}<button type="button" class="btn" data-copiar="${esc(r.codigo)}">Copiar legenda</button>
        ${r.status === "novo" ? `<button type="button" class="btn primary" data-dec="aprovado" data-cod="${esc(r.codigo)}">Aprovar rascunho</button><button type="button" class="btn" data-dec="descartado" data-cod="${esc(r.codigo)}">Descartar</button>` : ""}</div>
      <p>${r.pastaArtes && !(r.drive && r.drive.link) ? `<span class="src">No Drive: pasta <b>ARTES / ${esc(r.pastaArtes.split("/").join(" / "))}</b> (artes, miniaturas e LEGENDA.txt).</span>` : r.drive && r.drive.link ? `<a class="btn" href="${esc(r.drive.link)}" target="_blank" rel="noopener">Abrir a pasta no Drive</a> <span class="src">${(r.drive.artes || []).length} arte(s) e a legenda estão lá.${r.drive.avisoDoc ? " " + esc(r.drive.avisoDoc) : ""}</span>` : `<button type="button" class="btn" data-exp="${esc(r.codigo)}" data-marca="${esc(r.marca)}">Enviar a legenda para o Drive</button> <span class="src">As artes seguem sozinhas quando o agente estiver ligado.</span>`}</p>
      ${r.status !== "descartado" ? `<label class="lbl">Pedir ajuste ao agente (ele refaz texto e arte e atualiza o Drive)</label><textarea rows="2" data-ajtxt="${esc(r.codigo)}" placeholder="ex.: mais curto, tom mais direto, trocar o título por uma pergunta" ${r.status === "ajustando" ? "disabled" : ""}>${r.status === "ajustando" && r.ajuste ? esc(r.ajuste.instrucao) : ""}</textarea><button type="button" class="btn" data-aj="${esc(r.codigo)}" ${r.status === "ajustando" ? "disabled" : ""}>${r.status === "ajustando" ? "Ajuste na fila do agente…" : "Pedir ajuste"}</button>` : ""}
      <p class="src">Gerado em${esc((r.geradoEm || "").slice(0, 16).replace("T", " "))}${r.modelo ? " · " + esc(r.modelo) : ""}. Aprovar o rascunho não publica: a pauta segue para a aprovação do cliente (até lá o agente não a adianta).</p></details>`;
  }
  function montarRascunhos(host, marca, H, opts) {
    opts = opts || {};
    const perm = host => api(`/api/drive?marca=${encodeURIComponent(marca)}&acao=permissao`).then(p => { const el = host.querySelector("#cr-perm"); if (!el) return; el.className = p.podeCriar ? "src" : "notice"; el.innerHTML = p.podeCriar ? `Drive: a conta ${esc(p.conta)} pode criar arquivos na pasta${p.driveCompartilhado ? "" : " (Meu Drive: legendas funcionam; imagens podem exigir Drive compartilhado)"}.` : `Drive: ${esc(p.erro || "a conta " + (p.conta || "") + " ainda não é Editora da pasta")}. Compartilhe a pasta de postagens com ${esc(p.conta || "a conta de serviço")} como Editor.`; }).catch(() => {});
    const carregar = () => api(`/api/drive?marca=${encodeURIComponent(marca)}&acao=rascunhos`).then(({ rascunhos }) => {
      const lista = opts.filtro ? rascunhos.filter(opts.filtro) : rascunhos;
      host.innerHTML = opts.aprovacao ? (lista.length ? `<div class="cr-grade">${lista.map(r => cartao(r, true)).join("")}</div>` : `<p class="src">${esc(opts.vazio || "Nada aqui.")}</p>`) : `<p class="src" id="cr-perm">Conferindo a permissão do Drive…</p><div class="toolbar"><button type="button" class="btn" id="cr-sync">Sincronizar posts com o Drive</button></div><p class="src">Pauta com arte <b>e</b> legenda completas no Drive vai para Aprovação (nunca para Pronto ou Publicado).</p>${rascunhos.length ? rascunhos.map(r => cartao(r)).join("") : `<p class="src">Nenhum rascunho ainda. Com o agente criativo ligado, ele cria rascunhos das pautas dos próximos dias que ainda não têm material.</p>`}`;
      const sync = host.querySelector("#cr-sync"); if (sync) sync.onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true; try { const r = await api("/api/drive", { acao: "sincronizar" }); H.toast(r.movidas.length ? `${r.movidas.length} pauta(s) foram para Aprovação.` : "Nada a adiantar agora."); } catch (e) { H.toast(e.message); } b.disabled = false; };
      if (!opts.aprovacao) perm(host);
      host.querySelectorAll(".cr-ig-img img").forEach(im => im.addEventListener("error", () => { im.parentNode.classList.add("falhou"); im.remove(); }));
      host.querySelectorAll("[data-exp]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await api("/api/drive", { acao: "exportar", marca: b.dataset.marca, codigo: b.dataset.exp }); H.toast("Legenda enviada para a pasta do post no Drive."); carregar(); } catch (e) { H.toast(e.message); b.disabled = false; } }; });
      host.querySelectorAll("[data-aj]").forEach(b => { b.onclick = async () => { const t = host.querySelector('[data-ajtxt="' + b.dataset.aj + '"]'); if (!t || t.value.trim().length < 4) { H.toast("Escreva o que ajustar."); return; } b.disabled = true; try { await api("/api/drive", { acao: "ajustar", codigo: b.dataset.aj, instrucao: t.value.trim() }); H.toast("Pedido enviado: o agente refaz em até 1 minuto."); carregar(); } catch (e) { H.toast(e.message); b.disabled = false; } }; });
      host.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = () => { const r = rascunhos.find(x => x.codigo === b.dataset.copiar); if (r && navigator.clipboard) navigator.clipboard.writeText(r.legenda).then(() => H.toast("Legenda copiada.")); }; });
      host.querySelectorAll("[data-dec]").forEach(b => { b.onclick = async () => { b.disabled = true; try { const rr = await api("/api/drive", { acao: "decidir", codigo: b.dataset.cod, status: b.dataset.dec }); H.toast(b.dataset.dec === "aprovado" ? (rr.movidas && rr.movidas.length ? "Rascunho aprovado: a pauta foi para Aprovação do cliente." : "Rascunho aprovado.") : "Rascunho descartado."); if (root.N7CriacaoBrain) root.N7CriacaoBrain.invalidate(); if (opts.aoMudar) opts.aoMudar(); carregar(); } catch (e) { H.toast(e.message); b.disabled = false; } }; });
    }).catch(e => { host.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
    host.innerHTML = `<p class="src">Carregando…</p>`; carregar();
  }
  root.N7Criacao = { montarReferencias, montarRascunhos };
})(typeof window !== "undefined" ? window : globalThis);
