/* Central de Inteligência (motor): 14 agentes em 5 áreas + sinapses + memória + saúde por cliente + maestro.
   Sem API de IA: tudo por regras explícitas, com evidência. Funções puras: rodam no navegador e nos testes.

   Como o cérebro funciona, em 6 passos:
   1. Cada agente (agents/) lê uma parte dos dados e devolve "achados" (nota 0 a 100 = urgência x impacto x confiança).
   2. A memória (memory.mjs) compara com o que já foi decidido: o que voltou depois de "feito" sobe de nota (reincidente).
   3. As sinapses (synapses.mjs) ligam agentes entre si: causa conhecida reforça o efeito, dado velho baixa a confiança,
      dois sinais de desgaste viram um achado novo (criativos desgastados).
   4. A Gestão de contas (health.mjs) resume tudo por empresa (saúde 0 a 100) e avisa quando várias frentes pioram juntas.
   5. O maestro (aqui) escolhe a decisão do dia e até 2 "também hoje" (variando agente e cliente).
   6. O que for tratado some até a data escolhida; se o problema continuar, volta com a marca de reincidente. */
import { A, plus, urgencia } from "./util.mjs";
import { AREAS, AREA_ORDER, AGENTS, AGENT_ORDER, SYNAPSES, SERVICE_AGENTS, servicesOf } from "./catalog.mjs";
import { RUNNERS } from "./agents/index.mjs";
import { hidden, remember } from "./memory.mjs";
import { connect } from "./synapses.mjs";
import { health, clienteAgent, healthLevel } from "./health.mjs";

export function run(ctx) {
  ctx = Object.assign({ posts: [], weeks: [], gens: [], clients: [], decisions: [], ideas: [], slots: {}, checks: null, needsClient: () => false, planSource: null }, ctx);
  const lastClosed = A.lastClosed("semana", A.parse(ctx.today));
  const withData = A.periodsWith(ctx.weeks.filter(r => r.inicio <= lastClosed && A.hasData(A.norm(r))), "semana");
  const inicio = withData.length ? withData[withData.length - 1] : null;
  ctx.analysis = inicio ? A.analyze({ weeks: ctx.weeks, gens: ctx.gens, tipo: "semana", inicio, clients: ctx.clients.map(c => ({ key: c.key, name: c.name, services: c.services })) }) : null;

  const all = RUNNERS.flatMap(fn => fn(ctx));
  const allKeys = all.map(f => f.chave);
  all.forEach(f => remember(f, ctx));                                                              /* 2. memória */
  const open = all.filter(f => !hidden(f, ctx.decisions, ctx.today));
  const net = connect(open, ctx, allKeys);                                                         /* 3. sinapses */
  net.extra.forEach(f => { remember(f, ctx); if (!hidden(f, ctx.decisions, ctx.today)) open.push(f); });
  const clientes = health(open, ctx);                                                              /* 4. clientes */
  clienteAgent(clientes).forEach(f => { remember(f, ctx); if (!hidden(f, ctx.decisions, ctx.today)) open.push(f); });

  const order = f => AGENT_ORDER.indexOf(f.agente);                                                /* 5. maestro */
  const acoes = open.filter(f => f.kind === "acao").sort((x, y) => y.score - x.score || order(x) - order(y));
  const decision = acoes[0] || null;
  const also = [];
  acoes.slice(1).forEach(f => { if (also.length < 2 && f.score >= 55 && !also.some(x => x.agente === f.agente && x.marca === f.marca)) also.push(f); });
  const rest = acoes.filter(f => f !== decision && !also.includes(f));
  const byAgent = {}; AGENT_ORDER.forEach(id => { byAgent[id] = open.filter(f => f.agente === id).sort((x, y) => y.score - x.score); });
  const keys = new Set(all.map(f => f.chave));
  const memoria = {
    voltou: open.filter(f => f.reincidente).sort((a, b) => b.score - a.score),
    resolveu: (ctx.decisions || []).filter(d => d.status === "feita" && d.chave && !keys.has(d.chave) && d.ate && d.ate <= ctx.today).map(d => ({ chave: d.chave, titulo: d.titulo || d.chave, marca: d.marca || "", agente: d.agente || "", em: d.ate }))
  };
  return {
    today: ctx.today, decision: decision && Object.assign({ urgencia: urgencia(decision.score) }, decision), also: also.map(f => Object.assign({ urgencia: urgencia(f.score) }, f)), radar: rest, wins: open.filter(f => f.kind === "ganho").sort((x, y) => y.score - x.score),
    byAgent, clientes, sinapses: net.fired, memoria, resolved: all.length - all.filter(f => !hidden(f, ctx.decisions, ctx.today)).length, total: open.length, calm: !decision, risk: clientes.filter(h => h.nivel === "risco").length, analysisWeek: ctx.analysis ? ctx.analysis.period : null,
    sources: { calendario: ctx.planSource ? (ctx.planSource.source === "central" ? "Central ao vivo" : "cópia embutida") : "cópia embutida", semana: ctx.analysis ? ctx.analysis.period.label : "sem semana com números", clientes: ctx.clients.length }
  };
}

export { AREAS, AREA_ORDER, AGENTS, AGENT_ORDER, SYNAPSES, SERVICE_AGENTS, servicesOf, urgencia, hidden, plus, healthLevel };
export default { run, AREAS, AREA_ORDER, AGENTS, AGENT_ORDER, SYNAPSES, SERVICE_AGENTS, servicesOf, urgencia, hidden, plus, healthLevel };
