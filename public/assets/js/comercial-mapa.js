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

  /* chamado antes de redesenhar a tela: solta os mapas antigos */
  function destruirTodos() { while (vivos.length) { const m = vivos.pop(); try { m.remove(); } catch (e) { /* já solto */ } } }

  root.N7ComercialMapa = { ensure, buscar, seletor, visao, destruirTodos, valido, pinHtml };
})(typeof window !== "undefined" ? window : globalThis);
