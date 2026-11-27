/* Ponte do cérebro com a Criação: lê, a cada 5 minutos, o que há no Drive de cada cliente (pastas de post), os rascunhos do agente criativo e se ele está ligado.
   Entrega de forma síncrona aos agentes de Criação (ctx.criacao). Cada cliente é lido à parte. */
(function (root) {
  const TTL = 5 * 60e3, st = { at: 0, data: { drive: {}, rascunhos: [], criativoLigado: null }, loading: false };
  const get = p => fetch(p, { headers: { "X-N7": "1" } }).then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))));
  function ensure(clientes, onReady) {
    if (st.loading || Date.now() - st.at < TTL || !clientes || !clientes.length) return;
    st.loading = true;
    (async () => {
      const drive = {}, rasc = [];
      for (const k of clientes) {
        try { const j = await get("/api/feed?marca=" + encodeURIComponent(k)); drive[k] = { ligado: !!(j.drive && j.drive.ligado), posts: ((j.drive && j.drive.posts) || []).map(p => ({ codigo: p.codigo || "", data: p.data || "", titulo: p.titulo || p.pasta || "", midias: (p.midias || []).length, temLegenda: !!p.legendaId })) }; } catch (e) { drive[k] = { ligado: false, posts: [] }; }
        try { rasc.push(...((await get("/api/drive?marca=" + encodeURIComponent(k) + "&acao=rascunhos")).rascunhos || [])); } catch (e) { /* sem rascunhos: só equipe que edita lê */ }
      }
      let ligado = null; try { ligado = !!(await get("/api/leitura?acao=estado")).criativo; } catch (e) { /* sem estado */ }
      st.data = { drive, rascunhos: rasc, criativoLigado: ligado }; st.at = Date.now(); st.loading = false; if (onReady) onReady();
    })().catch(() => { st.loading = false; st.at = Date.now() - TTL + 60e3; });
  }
  root.N7CriacaoBrain = { ensure, data: () => st.data, invalidate: () => { st.at = 0; } };
})(window);
