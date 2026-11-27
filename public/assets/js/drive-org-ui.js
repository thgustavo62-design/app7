/* Painel "Organizar o Drive (agente)", dentro do Preview de Feed. O agente só PROPÕE; você marca o que aprova e ele só RENOMEIA (nunca apaga). Cada aplicação vira um log que dá para desfazer. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const post = async (body) => { const r = await fetch("/api/drive", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify(body) }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não foi possível concluir."); return j; };
  const get = async (q) => { const r = await fetch("/api/drive?" + q, { headers: { "X-N7": "1" } }), j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não foi possível ler o Drive."); return j; };
  const TIPO = { pasta: "Pasta", legenda: "Legenda", arte: "Arte" };
  const AVISO = { "sem-pauta": "Sem pauta", "sem-arte": "Sem arte", "sem-legenda": "Sem legenda", duplicada: "Duplicada", solto: "Arquivo solto", conflito: "Conflito" };

  function montar(host, marca, H) {
    host.innerHTML = `<p class="src">O agente lê a pasta de postagens e <b>propõe</b> renomear o que está fora do padrão. Você aprova; ele só renomeia, nunca apaga, e dá para desfazer.</p>
      <div class="toolbar"><button type="button" class="btn primary" id="do-analisar">Analisar o Drive</button> <button type="button" class="btn" id="do-logs">Aplicações anteriores</button></div><div id="do-out"></div>`;
    const out = host.querySelector("#do-out");
    const toast = m => { if (H && H.toast) H.toast(m); };
    host.querySelector("#do-analisar").onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = "Lendo o Drive…"; out.innerHTML = "";
      try { desenhar(out, await get(`marca=${encodeURIComponent(marca)}&acao=propor`), marca, toast); } catch (e) { out.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
      b.disabled = false; b.textContent = "Analisar o Drive";
    };
    host.querySelector("#do-logs").onclick = async () => {
      try {
        const j = await get(`marca=${encodeURIComponent(marca)}&acao=logs`);
        out.innerHTML = j.logs.length ? `<ul class="plain">${j.logs.map(l => `<li>${esc(l.em.slice(0, 16).replace("T", " "))} · ${esc(l.por)} · ${l.renomeados} renomeado(s) ${l.desfeitoEm ? "· <small>desfeito</small>" : `<button type="button" class="btn sm" data-desfazer="${esc(l.log)}">Desfazer</button>`}</li>`).join("")}</ul>` : `<p class="src">Nenhuma aplicação ainda.</p>`;
        out.querySelectorAll("[data-desfazer]").forEach(x => { x.onclick = async () => { x.disabled = true; try { const r = await post({ acao: "desfazer", marca, log: x.dataset.desfazer }); toast(`${r.desfeitas} nome(s) voltaram${r.puladas.length ? `, ${r.puladas.length} pulado(s) por terem mudado depois` : ""}.`); if (H && H.recarregar) H.recarregar(); x.textContent = "Desfeito"; } catch (e) { toast(e.message); x.disabled = false; } }; });
      } catch (e) { out.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
    };
  }

  function desenhar(out, plano, marca, toast) {
    const a = plano.acoes, av = plano.avisos;
    out.innerHTML = `<p><b>${plano.resumo.pastas}</b> pasta(s) lida(s) · <b>${a.length}</b> proposta(s) · <b>${av.length}</b> aviso(s).</p>
      ${a.length ? `<ul class="do-lista">${a.map(x => `<li><label><input type="checkbox" data-id="${esc(x.id)}"${x.confirmar ? "" : " checked"}> <b>${TIPO[x.alvoTipo] || "Item"}</b>: <span class="do-de">${esc(x.de)}</span> → <span class="do-para">${esc(x.para)}</span></label><small>${esc(x.motivo)}${x.confirmar ? " <b>(confirme: não vem marcada)</b>" : ""}</small></li>`).join("")}</ul>
        <button type="button" class="btn primary" id="do-aplicar">Aplicar as selecionadas</button>` : `<p class="notice info">Nada para renomear: as pastas já seguem o padrão.</p>`}
      ${av.length ? `<details><summary>${av.length} aviso(s) que o agente não resolve sozinho</summary><ul class="plain">${av.map(x => `<li><b>${AVISO[x.tipo] || x.tipo}:</b> ${esc(x.nome)} <small>${esc(x.texto)}</small></li>`).join("")}</ul></details>` : ""}<div id="do-res"></div>`;
    const ap = out.querySelector("#do-aplicar"); if (!ap) return;
    ap.onclick = async () => {
      const ids = [...out.querySelectorAll("input[data-id]:checked")].map(x => x.dataset.id); if (!ids.length) return toast("Marque ao menos uma mudança.");
      if (!confirm(`Renomear ${ids.length} item(ns) no Google Drive? Dá para desfazer depois.`)) return;
      ap.disabled = true; ap.textContent = "Aplicando…";
      try { const r = await post({ acao: "aplicar", marca, ids }); out.querySelector("#do-res").innerHTML = `<p class="notice ${r.falhas ? "" : "info"}"><b>${r.ok} renomeado(s)</b>${r.falhas ? `, ${r.falhas} falhou(aram): ${esc(r.feitos.filter(f => !f.ok).map(f => f.erro).filter((v, i, l) => l.indexOf(v) === i).join(" | "))}` : ""}. Guardei o log para desfazer.</p>`; toast(`${r.ok} item(ns) renomeado(s) no Drive.`); }
      catch (e) { out.querySelector("#do-res").innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
      ap.disabled = false; ap.textContent = "Aplicar as selecionadas";
    };
  }
  root.N7DriveOrg = { montar };
})(typeof window !== "undefined" ? window : globalThis);
