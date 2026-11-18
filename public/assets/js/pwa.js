/* PWA: registra o service worker, oferece "Instalar app" (Android/computador) ou a dica de "Adicionar à Tela de Início" (iPhone),
   avisa quando há versão nova e mostra o estado da conexão. */
(function () {
  const $ = s => document.querySelector(s);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const toast = (msg, action) => {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg + " "; t.hidden = false;
    if (action) { const b = document.createElement("button"); b.type = "button"; b.className = "toast-act"; b.textContent = action.label; b.onclick = action.run; t.appendChild(b); }
    else setTimeout(() => { t.hidden = true; }, 5200);
  };

  /* instalar */
  let prompt = null;
  const btn = () => $("#install-btn");
  function refreshInstall() {
    const b = btn(); if (!b) return;
    b.hidden = standalone() || !(prompt || ios);
  }
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; refreshInstall(); });
  addEventListener("appinstalled", () => { prompt = null; refreshInstall(); toast("App instalado. Procure o ícone Nova7 na tela inicial."); });
  document.addEventListener("click", async e => {
    if (!e.target.closest("#install-btn")) return;
    if (prompt) { prompt.prompt(); try { await prompt.userChoice; } catch (err) { /* ignora */ } prompt = null; refreshInstall(); }
    else if (ios) toast("No iPhone: toque em Compartilhar e depois em Adicionar à Tela de Início.");
  });
  matchMedia("(display-mode: standalone)").addEventListener("change", refreshInstall);
  document.addEventListener("DOMContentLoaded", refreshInstall); refreshInstall();
  if (standalone()) document.documentElement.classList.add("is-standalone");

  /* conexão */
  const net = () => document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  addEventListener("offline", () => { net(); toast("Sem internet. As alterações ficam na fila enquanto o app estiver aberto e seguem quando a conexão voltar."); });
  addEventListener("online", () => { net(); toast("Conexão de volta."); });
  net();

  /* service worker + aviso de versão nova */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then(reg => {
        const ask = w => toast("Há uma versão nova do app.", { label: "Atualizar", run: () => { w.postMessage("skip-waiting"); } });
        if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) ask(w); });
        });
        setInterval(() => reg.update().catch(() => { /* sem internet */ }), 30 * 60e3);
      }).catch(() => { /* sem service worker o site funciona igual */ });
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; location.reload(); });
    });
  }
})();
