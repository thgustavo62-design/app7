/* Mapa do Comercial: ponto do comércio na ficha e visão de todas as fichas.
   Leaflet (BSD-2, copiado em assets/vendor/leaflet) com os mapas do OpenStreetMap. A biblioteca só é carregada quando uma tela pede um mapa.
   A busca de endereço usa o Nominatim do OpenStreetMap e só roda quando a pessoa clica em "Localizar no mapa". */
(function (root) {
  const BASE = "/assets/vendor/leaflet/";
  const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const BRASIL = [-14.2, -51.9];
  let carregando = null;
  const vivos = [];

  function ensure() {
    if (root.L && root.L.map) return Promise.resolve(root.L);
    if (carregando) return carregando;
    carregando = new Promise((ok, falha) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = BASE + "leaflet.css"; document.head.appendChild(css);
      const js = document.createElement("script"); js.src = BASE + "leaflet.js";
      js.onload = () => ok(root.L);
      js.onerror = () => { carregando = null; falha(new Error("Não consegui carregar o mapa.")); };
      document.head.appendChild(js);
    });
    return carregando;
  }

  const valido = (lat, lng) => lat !== "" && lat != null && lng !== "" && lng != null && isFinite(Number(lat)) && isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

  /* endereço -> pontos possíveis (até 5), só no Brasil */
  async function buscar(q) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=" + encodeURIComponent(q);
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("A busca de endereço não respondeu.");
    const l = await r.json();
    return (Array.isArray(l) ? l : []).map(x => ({ lat: Number(x.lat), lng: Number(x.lon), nome: String(x.display_name || "") })).filter(x => valido(x.lat, x.lng));
  }

  const pinHtml = cor => `<span class="mp-pin" style="--pin:${cor || "#7c4dff"}"></span>`;
  const pinIcon = (L, cor) => L.divIcon({ className: "mp-pin-wrap", html: pinHtml(cor), iconSize: [28, 36], iconAnchor: [14, 34], popupAnchor: [0, -30] });

  function criar(L, el, centro, zoom) {
    const map = L.map(el, { scrollWheelZoom: false, worldCopyJump: false }).setView(centro, zoom);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR }).addTo(map);
    vivos.push(map);
    setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* mapa já removido */ } }, 60);
    return map;
  }

  /* mapa da ficha: um ponto que se marca clicando ou arrastando, com círculo do raio de atendimento.
     estado: { lat, lng, raio } (raio em km); opcoes: { leitura }; onChange(lat, lng) é chamado ao mover o ponto. */
  function seletor(el, estado, opcoes, onChange) {
    const L = root.L, leitura = !!(opcoes && opcoes.leitura);
    const tem = valido(estado.lat, estado.lng);
    const map = criar(L, el, tem ? [Number(estado.lat), Number(estado.lng)] : BRASIL, tem ? 16 : 4);
    let pino = null, circulo = null, raio = Number(estado.raio) || 0;
    const desenhaRaio = () => {
      if (circulo) { map.removeLayer(circulo); circulo = null; }
      if (pino && raio > 0) { circulo = L.circle(pino.getLatLng(), { radius: raio * 1000, color: "#7c4dff", weight: 1.5, fillOpacity: 0.08 }).addTo(map); }
    };
    function ponto(lat, lng, zoom) {
      lat = Number(lat); lng = Number(lng);
      if (!pino) {
        pino = L.marker([lat, lng], { icon: pinIcon(L), draggable: !leitura, keyboard: !leitura }).addTo(map);
        pino.on("dragend", () => { const p = pino.getLatLng(); desenhaRaio(); onChange && onChange(p.lat, p.lng); });
      } else pino.setLatLng([lat, lng]);
      if (zoom) map.setView([lat, lng], zoom);
      desenhaRaio();
    }
    if (tem) ponto(estado.lat, estado.lng);
    if (!leitura) map.on("click", e => { ponto(e.latlng.lat, e.latlng.lng); onChange && onChange(e.latlng.lat, e.latlng.lng); });
    return {
      definir(lat, lng, zoom) { ponto(lat, lng, zoom || 17); onChange && onChange(Number(lat), Number(lng)); },
      raio(km) { raio = Number(km) > 0 ? Number(km) : 0; desenhaRaio(); if (circulo && raio > 0) { try { map.fitBounds(circulo.getBounds(), { maxZoom: 16 }); } catch (e) { /* sem limites ainda */ } } },
      limpar() { if (pino) { map.removeLayer(pino); pino = null; } desenhaRaio(); },
      temPonto: () => !!pino,
      mapa: map
    };
  }

  /* mapa com todas as fichas que têm ponto. pontos: [{ id, lat, lng, cor, html }]; abrir(id) é chamado pelo botão do balão */
  function visao(el, pontos, abrir) {
    const L = root.L, pts = (pontos || []).filter(p => valido(p.lat, p.lng));
    const map = criar(L, el, pts.length ? [Number(pts[0].lat), Number(pts[0].lng)] : BRASIL, pts.length ? 13 : 4);
    const marcadores = {};
    pts.forEach(p => { const m = L.marker([Number(p.lat), Number(p.lng)], { icon: pinIcon(L, p.cor) }).addTo(map).bindPopup(p.html); marcadores[p.id] = m; });
    map.on("popupopen", e => { const b = e.popup.getElement() && e.popup.getElement().querySelector("[data-pin-abrir]"); if (b) b.onclick = () => abrir && abrir(b.dataset.pinAbrir); });
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts.map(p => [Number(p.lat), Number(p.lng)])), { padding: [40, 40], maxZoom: 15 });
    return { foco(id) { const m = marcadores[id]; if (m) { map.setView(m.getLatLng(), Math.max(map.getZoom(), 15)); m.openPopup(); } }, mapa: map };
  }

  /* ---- bloco "Onde fica", igual na ficha e no cadastro de clientes ---- */
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const coordTxt = f => (f && valido(f.lat, f.lng) ? `Ponto marcado: ${Number(f.lat).toFixed(5)}, ${Number(f.lng).toFixed(5)}. Arraste o pino para ajustar.` : "Sem ponto marcado. Busque o endereço ou clique no mapa para marcar o local.");
  /* f: { endereco, bairro, lat, lng, raio_km }; ro: somente leitura */
  function campos(f, ro) {
    f = f || {}; const ponto = valido(f.lat, f.lng), raio = f.raio_km == null || f.raio_km === "" ? "" : String(f.raio_km).replace(".", ",");
    return `<div class="fgrid"><label class="fld"><span>Endereço (rua e número)</span><input type="text" name="endereco" value="${esc(f.endereco)}" maxlength="160" autocomplete="off"></label>
      <label class="fld"><span>Bairro</span><input type="text" name="bairro" value="${esc(f.bairro)}" maxlength="80" autocomplete="off"></label>
      <label class="fld"><span>Raio de atendimento (km)</span><input type="text" name="raio_km" value="${esc(raio)}" inputmode="decimal" autocomplete="off"></label></div>
      <input type="hidden" name="lat" value="${ponto ? esc(f.lat) : ""}"><input type="hidden" name="lng" value="${ponto ? esc(f.lng) : ""}">
      <div class="toolbar">${ro ? "" : `<button type="button" class="btn sm" id="mp-buscar">Localizar no mapa</button><button type="button" class="btn sm" id="mp-limpar">Remover ponto</button>`}<span class="src" id="mp-msg"></span></div>
      <div class="mp-res" id="mp-res"></div><div class="mp-box" id="mp-box" role="application" aria-label="Mapa com o ponto do comércio"></div><p class="src" id="mp-coord">${coordTxt(f)}</p>`;
  }
  /* liga o bloco acima: busca de endereço, pino por clique ou arraste e círculo do raio. onMudou() avisa quando o ponto muda. */
  function ligar(view, form, opcoes) {
    const o = opcoes || {}, box = view.querySelector("#mp-box"); if (!box) return;
    const q = s => view.querySelector(s), msg = t => { const m = q("#mp-msg"); if (m) m.textContent = t || ""; };
    const el = n => form.elements[n], lat = el("lat"), lng = el("lng"), coordEl = q("#mp-coord");
    const raioNum = () => Number(String(el("raio_km").value).replace(",", ".")) || 0;
    let ctrl = null;
    const gravaPonto = (la, ln) => { lat.value = la.toFixed(6); lng.value = ln.toFixed(6); coordEl.textContent = coordTxt({ lat: la, lng: ln }); o.onMudou && o.onMudou(); };
    ensure().then(() => { if (!document.body.contains(box)) return; ctrl = seletor(box, { lat: lat.value, lng: lng.value, raio: raioNum() }, { leitura: !!o.leitura }, gravaPonto); })
      .catch(e => msg(e.message + " O restante do cadastro continua funcionando."));
    el("raio_km").addEventListener("input", () => ctrl && ctrl.raio(raioNum()));
    const bus = q("#mp-buscar");
    if (bus) bus.onclick = async () => {
      const cidade = el("cidade") ? el("cidade").value : "", rua = el("endereco").value;
      if (!rua.trim() && !cidade.trim()) return msg("Preencha o endereço (com a cidade) para buscar.");
      msg("Buscando…"); const res = q("#mp-res"); res.innerHTML = "";
      try {
        await ensure(); const l = await buscar([rua, el("bairro").value, cidade].map(x => x.trim()).filter(Boolean).join(", "));
        if (!l.length) return msg("Não achei esse endereço. Tente só a rua e a cidade, ou clique no mapa.");
        if (l.length === 1) { msg("Endereço encontrado. Arraste o pino se precisar ajustar."); return ctrl && ctrl.definir(l[0].lat, l[0].lng); }
        msg("Escolha o endereço certo:");
        res.innerHTML = l.map((x, i) => `<button type="button" data-i="${i}">${esc(x.nome)}</button>`).join("");
        res.querySelectorAll("button").forEach(b => { b.onclick = () => { const x = l[Number(b.dataset.i)]; res.innerHTML = ""; msg("Ponto marcado. Arraste o pino se precisar ajustar."); if (ctrl) ctrl.definir(x.lat, x.lng); }; });
      } catch (e) { msg("Não consegui buscar o endereço agora. Clique no mapa para marcar o ponto."); }
    };
    const lim = q("#mp-limpar"); if (lim) lim.onclick = () => { if (ctrl) ctrl.limpar(); lat.value = ""; lng.value = ""; coordEl.textContent = coordTxt({}); msg("Ponto removido."); o.onMudou && o.onMudou(); };
  }

  /* chamado antes de redesenhar a tela: solta os mapas antigos */
  function destruirTodos() { while (vivos.length) { const m = vivos.pop(); try { m.remove(); } catch (e) { /* já solto */ } } }

  root.N7ComercialMapa = { ensure, buscar, seletor, visao, destruirTodos, valido, pinHtml, campos, ligar, coordTxt };
})(typeof window !== "undefined" ? window : globalThis);
