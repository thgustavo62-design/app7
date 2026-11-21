/* Subaba "Memória": o que voltou depois de tratado e o que de fato foi resolvido. */
export const title = { eyebrow: "Central de Inteligência", h1: "Memória do cérebro", lead: "Cada achado marcado como feito, adiado ou ignorado fica registrado. Se o problema continuar depois da data, ele volta como reincidente; se sumir, conta como resolvido." };

export function render(host, k) {
  const { r, esc, dm, row } = k, m = r.memoria;
  const tarefas = (k.H.store.get("decisions", []) || []).filter(d => d.status === "atribuida").sort((a, b) => a.ate.localeCompare(b.ate)), nome = e => ((k.H.team || []).find(u => u.email === e) || { nome: e }).nome;
  const abertos = new Set([...(r.radar || []), r.decision, ...(r.also || [])].filter(Boolean).map(f => f.chave));
  const tarefasHtml = `<div class="panel">${k.H.banner("list", `Tarefas atribuídas (${tarefas.length})`, "quem cuida de cada achado e até quando")}<div class="panel-body">${tarefas.length ? `<ul class="plain">${tarefas.map(d => { const aberto = abertos.has(d.chave), venc = d.ate < r.today; return `<li><b>${esc(d.titulo)}</b> <small class="src">com ${esc(nome(d.responsavel))} · prazo ${dm(d.ate)} · ${aberto ? (venc ? "<b style=\"color:var(--red)\">vencida, ainda aberta</b>" : "em andamento") : "resolvida (o achado sumiu)"}</small></li>`; }).join("")}</ul>` : `<p class="src">Nenhuma tarefa atribuída. Em qualquer achado, use "Atribuir a…" para passar para alguém da equipe, com prazo de 3 dias.</p>`}</div></div>`;
  host.innerHTML = `${tarefasHtml}<div class="grid g2">
    <div class="panel">${k.H.banner("alert", `Voltaram (${m.voltou.length})`, "tratados e o problema continua")}<div class="panel-body">${m.voltou.length ? `<ul class="brain-list">${m.voltou.map(row).join("")}</ul>` : `<p class="src">Nada voltou depois de marcado.</p>`}</div></div>
    <div class="panel">${k.H.banner("target", `Resolvidos (${m.resolveu.length})`, "feitos e que deixaram de aparecer")}<div class="panel-body">${m.resolveu.length ? `<ul class="plain">${m.resolveu.slice(0, 20).map(d => `<li>${esc(d.titulo)} <small class="src">(feito em ${dm(d.em)})</small></li>`).join("")}</ul>` : `<p class="src">Ainda não há itens marcados como feitos que tenham deixado de aparecer.</p>`}</div></div></div>`;
  k.wire(host);
}
