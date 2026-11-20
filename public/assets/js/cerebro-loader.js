/* Carregador da Central de Inteligência. O cérebro é feito de módulos nativos (assets/js/brain/ e assets/js/cerebro/) que só
   são baixados quando alguém abre a tela ou o Painel: o início do app fica leve. Este arquivo é o único "script comum" do cérebro. */
(function (root) {
  let seq = 0;
  const load = () => import("/assets/js/cerebro/index.mjs");
  const fail = (view, e) => { console.error(e); if (view && view.isConnected) view.innerHTML = `<div class="panel"><div class="panel-body"><p><b>Não foi possível abrir a Central de Inteligência.</b></p><p class="src">${String((e && e.message) || e).replace(/[<>&]/g, "")}</p></div></div>`; };
  root.N7Cerebro = {
    render(view, sub, H) {
      const me = ++seq;
      view.innerHTML = '<p class="src">Carregando a Central de Inteligência…</p>';
      load().then(m => (me === seq && view.isConnected ? m.render(view, sub, H) : null)).catch(e => fail(view, e));
    },
    /* cartão do Painel: aparece já com "Analisando…" e troca quando o módulo chega */
    /* achados e saúde de um cliente (visão 360°): placeholder que troca quando o módulo chega */
    client(H, key) {
      const id = "bc" + (++seq);
      load().then(m => setTimeout(() => { const el = document.getElementById(id); if (el) { el.innerHTML = m.clientPanel(H, key); m.wireToday(el, H); } }, 0)).catch(e => console.error(e));
      return `<div id="${id}"><p class="src">Analisando este cliente…</p></div>`;
    },
    mini(H) {
      const id = "bm" + (++seq);
      load().then(m => setTimeout(() => { const el = document.getElementById(id); if (el) { el.outerHTML = m.mini(H); const t = document.getElementById("today"); if (t) m.wireToday(t, H); } }, 0)).catch(e => console.error(e));
      return `<section class="today" id="${id}"><div class="today-h"><h2>O que resolver hoje</h2></div><p class="src">Analisando: lendo o que os agentes encontraram hoje…</p></section>`;
    }
  };
})(window);
