/* Agentes de Contexto: Qualidade dos dados e Datas e feriados. */
import { A, F, has, plus, dm } from "../util.mjs";

export function dados(ctx) {
  const out = [], a = ctx.analysis, dow = A.parse(ctx.today).getDay(), early = dow >= 1 && dow <= 3;   /* segunda a quarta: hora de fechar a semana */
  const lastClosed = A.lastClosed("semana", A.parse(ctx.today));
  const analysisInicio = a ? a.period.inicio : null;
  ctx.clients.filter(c => has(c, "redes") || has(c, "trafego") || has(c, "varejo")).forEach(c => {
    const row = ctx.weeks.find(r => r.tipo === "semana" && r.inicio === lastClosed && r.marca === c.key);
    const any = row && A.hasData(A.norm(row));
    if (!any) out.push(F("dados", `dados-${c.key}-${lastClosed}`, { marca: c.key, nome: c.name, score: early ? 74 : 56, titulo: `${c.name}: sem números da semana ${A.period("semana", lastClosed).label}`,
      detalhe: "Sem os números fechados da semana, o cérebro não consegue avaliar vendas, mídia e redes deste cliente.", evidencia: ["Nenhuma linha com dados na aba Semanas para a última semana fechada"], acao: "Informar os números na tela Semana (ou aguardar a sincronização da Meta).", link: { route: "semana", brand: c.key } }));
  });
  if (a && analysisInicio && !(a.gen && a.gen.decisao)) out.push(F("dados", `dados-fechamento-${analysisInicio}`, { score: early ? 70 : 52, titulo: "Falta registrar a decisão da semana",
    detalhe: `A semana ${a.period.label} já tem análise, mas a decisão comercial e a resposta "estamos no melhor caminho?" estão em branco.`, evidencia: ["Duas perguntas de toda segunda-feira sem resposta"], acao: "Fechar a semana na tela Semana: uma decisão comercial, apenas uma.", link: { route: "semana" } }));
  if (ctx.planSource && ctx.planSource.source === "static") out.push(F("dados", "dados-central", { score: 50, titulo: "O calendário não está sendo lido da Central",
    detalhe: `O site está usando a cópia embutida${ctx.planSource.error ? " (" + ctx.planSource.error + ")" : ""}. Mudanças feitas na planilha não aparecem aqui.`, evidencia: [ctx.planSource.error || ctx.planSource.reason || "leitura ao vivo desligada"], acao: "Ver Configurações > Fontes de dados.", link: { route: "config/fontes" } }));
  return out;
}
export function calendario(ctx) {
  const out = [], { today } = ctx;
  for (let i = 0; i <= 10; i++) {
    const d = plus(today, i), name = A.HOLIDAYS[d]; if (!name) continue;
    const planned = ctx.posts.filter(p => p.date === d && p.status !== "pub");
    out.push(F("calendario", `cal-hol-${d}`, { score: i <= 3 ? 70 : i <= 7 ? 57 : 45, tags: ["feriado:" + i], titulo: `${name} ${i === 0 ? "é hoje" : i === 1 ? "é amanhã" : `em ${i} dias`} (${dm(d)})`,
      detalhe: planned.length ? `Há ${planned.length} pauta(s) marcada(s) para esse dia: ${planned.slice(0, 3).map(p => p.code).join(", ")}. Confirme horário e tom do conteúdo.` : "Nenhuma pauta nesse dia. Vale um conteúdo de data ou avisar o horário de funcionamento.",
      evidencia: [`Data atípica: ${name}`, "Comparações de venda perto dessa data pedem cuidado"], acao: "Conferir o conteúdo e o horário de funcionamento antes da data.", link: { route: "calendario" } }));
  }
  return out;
}