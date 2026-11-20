/* Ponte entre a Central de Promoções e o cérebro: busca a base de cada farmácia uma vez (e de tempos em tempos), faz o resumo
   (promo.js) e guarda só números e poucos itens. O cérebro lê isso de forma síncrona; quando a carga termina, a tela se atualiza.
   Cada loja é resumida à parte e nunca se mistura com a outra. */
(function (root) {
  const TTL = 5 * 60e3;
  const st = { at: 0, data: {}, loading: false };
  const get = path => fetch(path, { headers: { "X-N7": "1" } }).then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))));
  function ensure(onReady) {
    if (st.loading || Date.now() - st.at < TTL || !root.N7Promo) return;
    st.loading = true;
    get("/api/promo").then(async r => {
      const out = {};
      for (const l of r.lojas) {
        try {
          const d = await get("/api/promo?loja=" + encodeURIComponent(l.key));
          out[l.key] = root.N7Promo.brainSummary(l.key, l.name, d, root.N7Promo.analyze({ items: d.items, params: { coberturaInicio: d.cobertura && d.cobertura.inicio, coberturaIntervalos: d.intervalos } }));
        } catch (e) { /* esta loja fica sem resumo; as outras seguem */ }
      }
      st.data = out; st.at = Date.now(); st.loading = false;
      if (onReady) onReady();
    }).catch(() => { st.loading = false; st.at = Date.now() - TTL + 60e3; });         /* sem acesso ou sem rede: tenta de novo em 1 minuto */
  }
  root.N7PromoBrain = { ensure, summaries: () => st.data, invalidate: () => { st.at = 0; }, _state: st };
})(window);
