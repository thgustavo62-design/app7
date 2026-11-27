/* Agentes de Criação: Postagens (calendário x Drive), Drive (organização das pastas) e Criativo (rascunhos da IA).
   Leem ctx.criacao: { drive: { empresa: { ligado, posts: [{ codigo, data, titulo, midias, temLegenda }] } }, rascunhos: [...], criativoLigado }.
   Cada empresa é lida à parte. O que é rascunho nunca vira publicação: passa pela aprovação, como qualquer peça. */
import { F, clamp } from "../util.mjs";

const dias = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
const empresas = ctx => ctx.clients.filter(c => ctx.criacao && ctx.criacao.drive && ctx.criacao.drive[c.key] && ctx.criacao.drive[c.key].ligado).map(c => ({ c, d: ctx.criacao.drive[c.key] }));
const link = c => ({ route: "feed", brand: c.key });

export function postagens(ctx) {
  return empresas(ctx).flatMap(({ c, d }) => {
    const out = [], tem = new Set(d.posts.filter(p => p.midias > 0).map(p => p.codigo)), pronto = new Set(d.posts.filter(p => p.midias > 0 && p.temLegenda).map(p => p.codigo));
    const minhas = ctx.posts.filter(p => p.b === c.key && p.status !== "pub");
    const sem = minhas.filter(p => p.date >= ctx.today && dias(ctx.today, p.date) <= 7 && !tem.has(p.code)).sort((a, b) => a.date.localeCompare(b.date));
    if (sem.length) { const prox = dias(ctx.today, sem[0].date); out.push(F("postagens", `post-sem-material-${c.key}`, { marca: c.key, nome: c.name, score: clamp(44 + (prox <= 1 ? 30 : prox <= 3 ? 18 : 6) + Math.min(14, sem.length * 2)), tags: ["posts"], titulo: `${c.name}: ${sem.length} pauta(s) dos próximos 7 dias sem material no Drive`, detalhe: `A mais próxima é ${dm(sem[0].date)}.`, evidencia: sem.slice(0, 5).map(p => `${p.code} · ${dm(p.date)} · ${p.title}`), acao: "Produzir o material. O agente Criativo (ChatGPT e Canva) gera rascunho de legenda e arte quando está ligado.", link: link(c) })); }
    const adiantar = minhas.filter(p => ["prop", "plan", "prod"].includes(p.status) && pronto.has(p.code));
    if (adiantar.length) out.push(F("postagens", `post-pronto-${c.key}`, { marca: c.key, nome: c.name, score: clamp(40 + Math.min(20, adiantar.length * 4)), tags: ["posts"], titulo: `${c.name}: ${adiantar.length} pauta(s) com arte e legenda prontas no Drive, ainda marcadas como em produção`, detalhe: "O material está completo no Drive: o próximo passo é a aprovação.", evidencia: adiantar.slice(0, 5).map(p => `${p.code} · ${p.title}`), acao: "O agente de posts passa essas pautas para Aprovação sozinho a cada 30 minutos; confira com o cliente.", link: link(c) }));
    return out;
  });
}

export function drive(ctx) {
  return empresas(ctx).flatMap(({ c, d }) => {
    const out = [], fora = d.posts.filter(p => !p.codigo), codigos = new Set(ctx.posts.filter(p => p.b === c.key).map(p => p.code)), semPauta = d.posts.filter(p => p.codigo && !codigos.has(p.codigo)), semLeg = d.posts.filter(p => p.midias > 0 && !p.temLegenda);
    if (fora.length || semPauta.length) out.push(F("drive", `drive-padrao-${c.key}`, { marca: c.key, nome: c.name, score: clamp(36 + Math.min(22, (fora.length + semPauta.length) * 3)), tags: ["drive"], titulo: `${c.name}: ${fora.length + semPauta.length} pasta(s) do Drive fora do padrão ou sem pauta`, detalhe: `${fora.length} sem o padrão AAAA-MM-DD__CÓDIGO__Titulo e ${semPauta.length} com código que não existe no calendário.`, evidencia: [...fora, ...semPauta].slice(0, 5).map(p => p.titulo || p.codigo), acao: "Abra o Preview de Feed > Organizar o Drive: o agente propõe os nomes e você aprova (ele só renomeia).", link: link(c) }));
    if (semLeg.length) out.push(F("drive", `drive-legenda-${c.key}`, { marca: c.key, nome: c.name, score: clamp(34 + Math.min(18, semLeg.length * 4)), tags: ["drive"], titulo: `${c.name}: ${semLeg.length} pasta(s) com arte e sem legenda`, detalhe: "Sem o documento de legenda a pauta não chega a ficar pronta.", evidencia: semLeg.slice(0, 5).map(p => p.titulo || p.codigo), acao: "Escrever a legenda (o agente Criativo pode rascunhar).", link: link(c) }));
    return out;
  });
}

export function agenteCriativo(ctx) {
  const cr = ctx.criacao || {}, ras = (cr.rascunhos || []).filter(r => r.status === "novo"), out = [];
  ctx.clients.forEach(c => {
    const meus = ras.filter(r => r.marca === c.key);
    if (meus.length) out.push(F("criacao", `cria-rascunhos-${c.key}`, { marca: c.key, nome: c.name, score: clamp(48 + Math.min(20, meus.length * 5)), tags: ["rascunho"], titulo: `${c.name}: ${meus.length} rascunho(s) do agente criativo esperando a sua revisão`, detalhe: "A IA escreveu e montou o design; nada foi publicado.", evidencia: meus.slice(0, 5).map(r => `${r.codigo} · ${r.titulo}${r.alertas && r.alertas.length ? ` (${r.alertas.length} alerta(s))` : ""}`), acao: "Revisar a legenda e o brief, ajustar no Canva, aprovar ou descartar no Preview de Feed.", link: link(c) }));
  });
  if (cr.criativoLigado === false && cr.drive) { const falta = ctx.clients.filter(c => cr.drive[c.key] && ctx.posts.some(p => p.b === c.key && p.status !== "pub" && p.date >= ctx.today && dias(ctx.today, p.date) <= 7 && !(cr.drive[c.key].posts || []).some(x => x.codigo === p.code && x.midias > 0))); if (falta.length) out.push(F("criacao", "cria-desligado", { score: 30, tags: ["rascunho"], titulo: "O agente criativo está desligado e há pautas sem material", detalhe: `${falta.length} cliente(s) com pauta dos próximos 7 dias sem arte.`, evidencia: [], acao: "No computador da agência, rode Agente.ps1 -ConfigurarCriativo com a chave da OpenAI (e do Canva).", link: null })); }
  return out;
}
