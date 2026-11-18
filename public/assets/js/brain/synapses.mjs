/* Sinapses: as conexões entre agentes. Roda depois dos agentes e da memória, ajusta notas, cria achados compostos
   (ex.: criativos desgastados) e devolve quais conexões dispararam. A descrição de cada uma está em catalog.mjs (SYNAPSES). */
import { A, F, clamp, rel } from "./util.mjs";
import { SYNAPSES } from "./catalog.mjs";

/* ---------- sinapses ---------- */
export function connect(open, ctx, allKeys) {
  const fired = [], by = (k, p) => open.filter(f => f.marca === k && (typeof p === "string" ? f.agente === p : p(f)));
  const fire = (id, marca, texto) => { let s = fired.find(x => x.id === id); if (!s) { const def = SYNAPSES.find(x => x.id === id); s = { id, nome: def.nome, de: def.de, para: def.para, casos: [] }; fired.push(s); } s.casos.push({ marca, nome: (ctx.clients.find(c => c.key === marca) || {}).name || "", texto }); };
  const add = (f, pts) => { f.score = clamp(f.score + pts); };
  const brands = ctx.clients.map(c => c.key);

  brands.forEach(k => {
    const apr = by(k, "aprovacao")[0], tight = by(k, f => (f.agente === "producao" && f.chave !== `prod-empty-${k}`) || f.agente === "pipeline");
    if (apr && tight.length) { tight.forEach(t => { rel(t, apr, "apr-prod", "A aprovação do cliente pendente pode ser a causa"); rel(apr, t, "apr-prod", "Esta peça também está apertada na produção"); });
      add(apr, 8); apr.evidencia.push("Também trava a produção do mesmo cliente"); fire("apr-prod", k, `${apr.titulo} + ${tight[0].titulo}`); }
  });

  const missingByBrand = new Set(allKeys.filter(c => /^dados-[A-Za-z0-9]+-\d{4}/.test(c)).map(c => c.split("-")[1]));
  brands.forEach(k => {
    if (!missingByBrand.has(k) || !ctx.analysis) return;
    const hit = by(k, f => ["vendas", "midia", "redes"].includes(f.agente) && f.kind === "acao");
    hit.forEach(f => { f.score = clamp(f.score * .85); f.evidencia.push(`Baseado na semana ${ctx.analysis.period.label}: a última semana fechada está sem números, confirme antes de agir`); });
    if (hit.length) fire("dados-confianca", k, `${hit.length} achado(s) com confiança menor`);
  });

  const hol = open.filter(f => f.agente === "calendario" && (f.tags[0] || "").startsWith("feriado:") && +f.tags[0].slice(8) <= 3)[0];
  if (hol) brands.forEach(k => { const hit = by(k, f => (f.agente === "producao" && f.chave !== `prod-empty-${k}`) || f.agente === "pipeline"); hit.forEach(f => { add(f, 6); f.evidencia.push(`Feriado em breve (${hol.titulo}): falta dia útil para recuperar`); rel(f, hol, "feriado-prazo", "Feriado perto do prazo"); }); if (hit.length) fire("feriado-prazo", k, `${hit.length} achado(s) apertados pelo feriado`); });

  const extra = [];
  brands.forEach(k => {
    const mid = by(k, f => f.agente === "midia" && f.kind === "acao" && f.tags.some(t => ["freq", "saturacao", "cpr_up"].includes(t)));
    const red = by(k, f => f.agente === "redes" && f.kind === "acao" && f.tags.some(t => ["views_down", "cliques_down", "interacao_down"].includes(t)));
    if (mid.length && red.length) {
      const src = mid.concat(red), top = Math.max.apply(null, src.map(f => f.score)), c = ctx.clients.find(x => x.key === k);
      const f = F("criativo", `crit-fadiga-${k}-${ctx.analysis ? ctx.analysis.period.inicio : "x"}`, { marca: k, nome: c.name, score: Math.min(92, top + 8),
        titulo: `${c.name}: criativos desgastados`, detalhe: "Sinais de anúncio cansado e de queda nas redes aparecem juntos: o público provavelmente já viu estas peças demais.",
        evidencia: src.map(x => x.titulo.replace(/^.*? · /, "")), acao: "Renovar 2 ou 3 criativos (formato e gancho novos), pausar o mais antigo e medir 7 dias antes de mexer na verba.", link: { route: "calendario", brand: k, ideas: true } });
      src.forEach(s => { s.score = clamp(s.score - 15); s.evidencia.push("Parte de: criativos desgastados"); rel(s, f, "midia-redes-criativo", "Junto com outro sinal, aponta criativo desgastado"); rel(f, s, "midia-redes-criativo", s.titulo); });
      extra.push(f); fire("midia-redes-criativo", k, `${mid.length + red.length} sinais viraram 1 achado de Criativos`);
    }
  });

  brands.forEach(k => {
    const prod = by(k, f => ["producao", "pipeline", "editorial"].includes(f.agente) && f.kind === "acao" && /^(prod-late|prod-empty|pipe|edit-cad)/.test(f.chave)), red = by(k, f => f.agente === "redes" && f.tags.includes("views_down"));
    if (prod.length && red.length) { prod.forEach(f => { add(f, 8); f.evidencia.push("Visualizações do cliente caíram na mesma época (indício, não prova)"); rel(f, red[0], "producao-redes", "Queda de alcance na mesma época"); }); fire("producao-redes", k, `${prod[0].titulo} + ${red[0].titulo.replace(/^.*? · /, "")}`); }
  });

  brands.forEach(k => {
    const v = by(k, f => f.agente === "vendas" && f.kind === "acao" && f.tags.includes("vendas_down")), m = by(k, f => f.agente === "midia" && f.kind === "acao" && f.classe === "CORRIGIR");
    if (v.length && m.length) { add(v[0], 6); v[0].evidencia.push("Anúncio do mesmo cliente também tem problema: investigar o anúncio primeiro"); rel(v[0], m[0], "vendas-midia", "Anúncio com problema no mesmo período"); rel(m[0], v[0], "vendas-midia", "Vendas caíram no mesmo período"); fire("vendas-midia", k, `${v[0].titulo.replace(/^.*? · /, "")} + ${m[0].titulo.replace(/^.*? · /, "")}`); }
  });

  const cap = open.find(f => f.agente === "capacidade"), late = open.filter(f => /^prod-late-/.test(f.chave));
  if (cap && late.length) { add(cap, 6); cap.evidencia.push(`Já há atraso acumulado: ${late.map(f => f.nome).join(", ")}`); late.forEach(f => rel(cap, f, "capacidade-atraso", "Atraso acumulado")); fire("capacidade-atraso", "", `Sobrecarga + ${late.length} cliente(s) com pauta atrasada`); }

  brands.forEach(k => {
    const empty = by(k, f => f.chave === `prod-empty-${k}`)[0], idea = by(k, f => f.chave === `edit-ideas-${k}`)[0];
    if (empty && idea) { empty.detalhe += " Há ideia aprovada esperando data: é só agendar."; empty.acao = "Agendar a ideia aprovada mais antiga nos horários fixos do cliente."; idea.score = clamp(idea.score - 15); idea.evidencia.push("Absorvido pelo aviso de calendário vazio"); rel(empty, idea, "ideias-vazio", idea.titulo); rel(idea, empty, "ideias-vazio", "Calendário vazio"); fire("ideias-vazio", k, "Calendário vazio com ideia aprovada parada"); }
  });

  open.forEach(f => { if (f.reincidente) fire("memoria", f.marca, f.titulo); });
  return { fired: fired.map(s => Object.assign(s, { qtd: s.casos.length })), extra };
}