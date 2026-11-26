/* Ícones das empresas. Cada arquivo fica em assets/clientes/ com o endereço da empresa no nome
   (por exemplo minas-farma.png). Empresa sem arquivo aqui usa a inicial numa bolinha colorida.
   Para pôr o ícone de uma empresa nova: copie um PNG quadrado para assets/clientes/ e acrescente a linha abaixo
   (e o caminho em SHELL no sw.js). */
(function (root) {
  var MAPA = {
    "minas-farma": "assets/clientes/minas-farma.png",
    "farma-e-farma": "assets/clientes/farma-e-farma.png",
    "campo-forte": "assets/clientes/campo-forte.png",
    "nova7": "assets/clientes/nova7.png",
    "junior-lopes-contador": "assets/clientes/junior-lopes-contador.png",
    "altus-contabilidade": "assets/clientes/altus-contabilidade.png"
  };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  /* c: { id, color, short }; estilo: CSS extra opcional (tamanho) */
  function avatar(c, estilo) {
    var src = c && MAPA[c.id], ex = estilo ? esc(estilo) : "";
    if (src) return '<span class="client-avatar has-logo"' + (ex ? ' style="' + ex + '"' : "") + '><img src="' + src + '" alt="" width="64" height="64" loading="lazy"></span>';
    return '<span class="client-avatar" style="background:var(' + esc(c && c.color) + ');' + ex + '">' + esc(String((c && c.short) || "?")[0]) + "</span>";
  }
  /* no menu lateral: logo pequena, ou a bolinha de cor quando não há arquivo */
  function marca(c) {
    var src = c && MAPA[c.id];
    return src ? '<img class="nav-logo" src="' + src + '" alt="" width="22" height="22">' : '<i class="nav-dot" style="background:var(' + esc(c && c.color) + ')"></i>';
  }
  root.N7Logos = { MAPA: MAPA, avatar: avatar, marca: marca };
})(typeof window !== "undefined" ? window : globalThis);
