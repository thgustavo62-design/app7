/* Subaba "Memória": o que voltou depois de tratado e o que de fato foi resolvido. */
export const title = { eyebrow: "Central de Inteligência", h1: "Memória do cérebro", lead: "Cada achado marcado como feito, adiado ou ignorado fica registrado. Se o problema continuar depois da data, ele volta como reincidente; se sumir, conta como resolvido." };

export function render(host, k) {
  const { r, esc, dm, row } = k, m = r.memoria;
  host.innerHTML = `<div class="grid g2">
    <div class="panel">${k.H.banner("alert", `Voltaram (${m.voltou.length})`, "tratados e o problema continua")}<div class="panel-body">${m.voltou.length ? `<ul class="brain-list">${m.voltou.map(row).join("")}</ul>` : `<p class="src">Nada voltou depois de marcado.</p>`}</div></div>
    <div class="panel">${k.H.banner("target", `Resolvidos (${m.resolveu.length})`, "feitos e que deixaram de aparecer")}<div class="panel-body">${m.resolveu.length ? `<ul class="plain">${m.resolveu.slice(0, 20).map(d => `<li>${esc(d.titulo)} <small class="src">(feito em ${dm(d.em)})</small></li>`).join("")}</ul>` : `<p class="src">Ainda não há itens marcados como feitos que tenham deixado de aparecer.</p>`}</div></div></div>`;
  k.wire(host);
}
