/* Carrega bibliotecas pesadas só quando alguém precisa delas (o PowerPoint tem ~450 KB e quase ninguém o usa na abertura). */
(function (root) {
  const once = {};
  const script = src => once[src] || (once[src] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = () => res(true);
    s.onerror = () => { delete once[src]; rej(new Error("Não consegui carregar " + src)); };
    document.head.appendChild(s);
  }));
  root.N7Lazy = { script, pptx: () => (root.PptxGenJS ? Promise.resolve(true) : script("assets/vendor/pptxgen.bundle.js")) };
})(typeof window !== "undefined" ? window : globalThis);
