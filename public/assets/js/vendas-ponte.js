/* Ponte entre a análise profunda de vendas (publicada pelo computador da agência) e o cérebro: busca de tempos em tempos e entrega de forma síncrona
   aos agentes de Mercado (ctx.vendas[loja]). Cada loja é uma análise à parte. Sem análise publicada, os agentes de Mercado simplesmente não têm o que dizer. */
(function (root) {
  const TTL = 5 * 60e3, st = { at: 0, data: {}, loading: false };
  function ensure(onReady) {
    if (st.loading || Date.now() - st.at < TTL) return;
    st.loading = true;
    fetch("/api/leitura?acao=analise", { headers: { "X-N7": "1" } }).then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))).then(j => { st.data = j.lojas || {}; st.at = Date.now(); st.loading = false; if (onReady) onReady(); })
      .catch(() => { st.loading = false; st.at = Date.now() - TTL + 60e3; });
  }
  root.N7VendasBrain = { ensure, summaries: () => st.data, invalidate: () => { st.at = 0; }, _state: st };
})(window);
