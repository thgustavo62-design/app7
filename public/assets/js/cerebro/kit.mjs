/* Kit comum das telas do cérebro: roda o motor uma vez por tela e entrega os pedaços de HTML que todas as subabas usam
   (cartões de achado, botões de ação, marcação "feito/adiar/ignorar"). Cada subaba recebe este kit e só monta a sua parte. */
import B from "../brain/index.mjs";

const A = globalThis.N7Analysis;
const DOW = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
export const dateTxt = iso => { const d = A.parse(iso); return `${DOW[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const tone = s => (s >= 80 ? "p0" : s >= 60 ? "p1" : "");
export const LEVEL = { ok: ["Em ordem", "st-pub"], atencao: ["Atenção", "p1"], risco: ["Em risco", "p0"] };
const MODULES = { calendario: "Calendário Kanban", aprovacao: "Aprovações", fluxo: "Fluxo e horários", saude: "Nota de saúde do perfil", ads: "Anúncios (Meta Ads)", semana: "Análise semanal", pecas: "Fila de peças", vendas: "Vendas por dia" };
export const moduleName = id => MODULES[id] || id;

export function makeKit(H, rerender) {
  const esc = H.esc, input = H.input(), r = B.run(input);
  const svc = globalThis.N7Services || { SERVICES: {}, ORDER: [] };
  const agentName = id => (B.AGENTS[id] || {}).name || id;

  function mark(f, status) {
    const days = { feita: 0, adiada: 2, ignorada: 14 }[status], list = JSON.parse(JSON.stringify(H.store.get("decisions", [])));
    const entry = { chave: f.chave, agente: f.agente, marca: f.marca || "", titulo: f.titulo.slice(0, 200), status, ate: B.plus(H.today, days), nota: "" };
    const i = list.findIndex(x => x.chave === f.chave);
    if (i >= 0) list[i] = Object.assign({}, entry, { v: list[i].v }); else list.push(entry);
    H.store.set("decisions", list);
    H.toast({ feita: "Marcado como feito. Volta amanhã se ainda for um problema.", adiada: "Adiado por 2 dias.", ignorada: "Ignorado por 14 dias." }[status]);
  }
  const goBtn = f => f.link ? `<button type="button" class="btn sm" data-go="${esc(f.link.route)}" data-brand="${esc(f.link.brand || "")}" ${f.link.ideas ? 'data-ideas="1"' : ""} ${f.link.lista ? `data-lista="${esc(f.link.lista)}"` : ""} ${f.link.tipo ? `data-tipo="${esc(f.link.tipo)}"` : ""} ${f.link.dia ? `data-dia="${esc(f.link.dia)}"` : ""}>Abrir</button>` : "";
  const acts = f => `${goBtn(f)}${H.canWrite ? `<button type="button" class="btn sm" data-mark="feita" data-key="${esc(f.chave)}">Feito</button><button type="button" class="btn sm" data-mark="adiada" data-key="${esc(f.chave)}">Adiar 2 dias</button><button type="button" class="btn sm" data-mark="ignorada" data-key="${esc(f.chave)}">Ignorar</button>` : ""}`;
  const flag = f => (f.reincidente ? `<span class="badge p0" title="Marcado como tratado e o problema continua">reincidente</span>` : "");
  const links = f => (f.rel && f.rel.length ? `<p class="src"><b>Ligado a:</b> ${f.rel.slice(0, 3).map(x => esc(agentName(x.agente) + ": " + x.titulo.replace(/^.*? · /, ""))).join(" · ")}</p>` : "");
  const smallCard = f => `<article class="brain-card"><div class="brain-tags"><span class="badge ${tone(f.score)}">${esc(f.urgencia || "")}${f.urgencia ? " · " : ""}${f.score}</span><span class="badge">${esc(agentName(f.agente))}</span>${flag(f)}</div><h3>${esc(f.titulo)}</h3><p>${esc(f.detalhe)}</p><div class="toolbar">${acts(f)}</div></article>`;
  const row = f => `<li class="brain-row"><div class="brain-row-h"><span class="badge ${tone(f.score)}">${f.score}</span><b>${esc(f.titulo)}</b>${flag(f)}</div><p>${esc(f.detalhe)}</p><p class="src"><b>Ação:</b> ${esc(f.acao)}</p>${links(f)}<div class="toolbar">${acts(f)}</div></li>`;
  const everyFinding = () => [r.decision, ...r.also, ...r.radar, ...r.memoria.voltou].filter(Boolean).concat(Object.values(r.byAgent).flat());

  /* liga os botões de uma área da tela: marcar achado e abrir a tela relacionada */
  function wire(root) {
    root.querySelectorAll("[data-mark]").forEach(b => b.addEventListener("click", () => { const f = everyFinding().find(x => x.chave === b.dataset.key); if (f) { mark(f, b.dataset.mark); rerender(); } }));
    root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => H.go(b.dataset.go, b.dataset.brand, !!b.dataset.ideas, { lista: b.dataset.lista, tipo: b.dataset.tipo, dia: b.dataset.dia })));
  }
  return { H, B, A, r, input, esc, agentName, services: svc, tone, flag, links, goBtn, acts, row, smallCard, wire, mark, rerender, LEVEL, dm, dateTxt, moduleName };
}
