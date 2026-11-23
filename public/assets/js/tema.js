/* Tema claro/escuro. O padrão é o claro; a escolha fica guardada só neste aparelho.
   Carrega no <head>, antes do CSS, para a página já nascer no tema certo (sem piscar). */
(function () {
  var KEY = "nova7-tema", html = document.documentElement;
  function lido() { try { var v = localStorage.getItem(KEY); return v === "escuro" ? "escuro" : "claro"; } catch (e) { return "claro"; } }
  function aplicar(t) {
    html.setAttribute("data-theme", t === "escuro" ? "dark" : "light");
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "escuro" ? "#0b0c12" : "#f0eee7");
  }
  aplicar(lido());

  var SVG = 'viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var SOL = '<svg ' + SVG + '><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var LUA = '<svg ' + SVG + '><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function pintar(btn) {
    var escuro = html.getAttribute("data-theme") === "dark";
    btn.innerHTML = escuro ? SOL : LUA;
    btn.setAttribute("aria-label", escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro");
    btn.title = escuro ? "Tema claro" : "Tema escuro";
  }
  function montar() {
    var topo = document.querySelector(".topbar"); if (!topo || document.getElementById("tema-btn")) return;
    var btn = document.createElement("button"); btn.type = "button"; btn.id = "tema-btn"; btn.className = "tema-btn";
    pintar(btn);
    btn.onclick = function () {
      var novo = html.getAttribute("data-theme") === "dark" ? "claro" : "escuro";
      try { localStorage.setItem(KEY, novo); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
      aplicar(novo); pintar(btn);
    };
    var quem = document.getElementById("who"); topo.insertBefore(btn, quem || null);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
