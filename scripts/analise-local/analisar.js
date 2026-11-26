/* Roda os "agentes" de análise no processador deste computador, em paralelo (worker_threads), sem API de IA e sem gastar token.
   Uso: node analisar.js <snapshot.json> <pasta-de-saida> [--nucleos N] [--hoje AAAA-MM-DD]
   Cada tarefa é um agente independente: cérebro (os 21 agentes do site + sinapses), análise de cada semana fechada,
   calendário por cliente, ideias, qualidade dos dados. As regras são as MESMAS do site (os módulos de public/assets/js são reaproveitados). */
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');
const JS = path.join(__dirname, '..', '..', 'public', 'assets', 'js');

/* ---------- contexto dos agentes: monta a partir do snapshot o mesmo que o site monta no navegador ---------- */
function carregar(snap, hoje) {
  require(path.join(JS, 'store.js')); require(path.join(JS, 'workflow.js')); require(path.join(JS, 'analysis.js'));
  const B = require(path.join(JS, 'brain', 'index.mjs')).default, S = globalThis.N7Store, F = globalThis.N7Flow, A = globalThis.N7Analysis;
  S.reset(); S.hydrate(JSON.parse(JSON.stringify(snap.state)));
  const N7 = snap.N7, reg = snap.registry;
  const clients = reg.clients.filter(c => c.active).map(c => ({ key: c.key, id: c.id, name: c.name, services: c.services }));
  const CL = Object.fromEntries(clients.map(c => [c.key, c]));
  const over = S.get('overrides', {}) || {};
  const posts = N7.PLAN.concat(F.getCustom()).filter(p => CL[p.b]).map(p => {
    const o = over[p.code] || {}, status = o.status || (p.status === 'fin' ? 'agd' : p.status), date = o.date || p.date;
    return Object.assign({}, p, { status, date, edited: !!over[p.code], late: date < hoje && status !== 'pub' });
  });
  const ctx = {
    today: hoje, clients, posts, weeks: S.get('weeks', []), gens: S.get('weekGen', []), decisions: S.get('decisions', []), promo: {},
    owners: S.get('owners', {}), team: reg.team || [], authority: S.get('authority', []), goals: S.get('goals', {}), ideas: F.getIdeas(), slots: F.getFlow().slots, checks: S.get('checks', {}),
    needsClient: p => { const st = F.approvalState(p.code, p.b); return st.needs.includes('client') && !st.rec.client; }, planSource: N7.PLAN_SOURCE
  };
  return { B, A, F, S, ctx, clients, posts };
}

/* ---------- as tarefas (cada uma é um agente) ---------- */
const TAREFAS = {
  cerebro({ B, ctx }) {
    const r = B.run(ctx), cut = f => f && ({ agente: f.agente, marca: f.marca, titulo: f.titulo, nota: f.score, urgencia: f.urgencia, reincidente: !!f.reincidente, evidencia: (f.evidencia || f.evid || [])[0] || '', acao: f.acao || f.proximo || '' });
    return {
      decisao: cut(r.decision), tambem: r.also.map(cut), radar: r.radar.slice(0, 15).map(cut), ganhos: r.wins.slice(0, 5).map(cut),
      clientes: r.clientes.map(c => ({ chave: c.key, nome: c.name, saude: c.saude, nivel: c.nivel, achados: c.achados, fortes: c.fortes })),
      sinapses: r.sinapses.map(s => s.id || s.nome || s.titulo || s), total: r.total, escondidos: r.resolved, emRisco: r.risk, calmo: r.calm, fontes: r.sources,
      porAgente: Object.fromEntries(Object.entries(r.byAgent).map(([k, v]) => [k, v.length]))
    };
  },
  semana({ A, ctx, clients }, inicio) {
    const a = A.analyze({ weeks: ctx.weeks, gens: ctx.gens, tipo: 'semana', inicio, clients: clients.map(c => ({ key: c.key, name: c.name, services: c.services })) });
    return JSON.parse(JSON.stringify(a));
  },
  calendario({ posts, ctx, F }, key) {
    const ps = posts.filter(p => p.b === key), hoje = ctx.today, add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const porStatus = {}, porFormato = {}; ps.forEach(p => { porStatus[p.status] = (porStatus[p.status] || 0) + 1; porFormato[p.format] = (porFormato[p.format] || 0) + 1; });
    const prox14 = ps.filter(p => p.date > hoje && p.date <= add(hoje, 14)), atrasadas = ps.filter(p => p.late);
    const semSemana = {}; ps.filter(p => p.date >= hoje).forEach(p => { const d = new Date(p.date + 'T12:00:00Z'), seg = add(p.date, -((d.getUTCDay() + 6) % 7)); semSemana[seg] = (semSemana[seg] || 0) + 1; });
    const owners = ctx.owners || {}, semResp = ps.filter(p => p.status !== 'pub' && !Object.keys(owners[p.code] || {}).some(k => k !== 'v')).length;
    const aprovPend = ps.filter(p => p.status !== 'pub' && ctx.needsClient(p)).length;
    return { total: ps.length, porStatus, porFormato, atrasadas: atrasadas.map(p => ({ codigo: p.code, titulo: p.title, data: p.date, status: p.status })), proximos14dias: prox14.length, pautasPorSemanaFutura: semSemana, semResponsavel: semResp, aguardandoCliente: aprovPend, publicadas: porStatus.pub || 0 };
  },
  ideias({ ctx }) {
    const out = {}; (ctx.ideas || []).forEach(i => { const m = out[i.b] || (out[i.b] = { total: 0, porEtapa: {}, porFormato: {} }); m.total++; m.porEtapa[i.stage] = (m.porEtapa[i.stage] || 0) + 1; m.porFormato[i.format] = (m.porFormato[i.format] || 0) + 1; });
    return out;
  },
  dados({ A, ctx, clients }) {
    const ultima = A.lastClosed('semana', A.parse(ctx.today)), out = {};
    clients.forEach(c => {
      const rows = ctx.weeks.filter(r => r.marca === c.key && r.tipo === 'semana'), com = rows.filter(r => r.inicio <= ultima && A.hasData(A.norm(r))).map(r => r.inicio).sort();
      const ult = com[com.length - 1] || null, atraso = ult ? Math.round((new Date(ultima + 'T12:00:00Z') - new Date(ult + 'T12:00:00Z')) / 864e5) : null;
      out[c.key] = { nome: c.name, semanasComNumeros: com.length, ultimaComNumeros: ult, diasDeAtrasoParaUltimaSemanaFechada: atraso };
    });
    return { ultimaSemanaFechada: ultima, clientes: out, fontePlano: ctx.planSource || null, totalLinhasDeSemana: ctx.weeks.length };
  }
};

/* ---------- trabalhador ---------- */
if (!isMainThread) {
  let mem = null;
  parentPort.on('message', t => {
    const t0 = process.hrtime.bigint();
    try {
      if (!mem) mem = carregar(workerData.snap, workerData.hoje);
      const dados = TAREFAS[t.tipo](mem, t.arg);
      parentPort.postMessage({ id: t.id, ok: true, dados, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
    } catch (e) { parentPort.postMessage({ id: t.id, ok: false, erro: e.stack || String(e), ms: Number(process.hrtime.bigint() - t0) / 1e6 }); }
  });
  return;
}

/* ---------- principal ---------- */
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const [snapFile, outDir] = process.argv.slice(2);
if (!snapFile || !outDir || snapFile.startsWith('--')) { console.error('Uso: node analisar.js <snapshot.json> <saida> [--nucleos N] [--hoje AAAA-MM-DD]'); process.exit(2); }
const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
const hojeLocal = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const hoje = arg('--hoje') || hojeLocal;
const nuc = Math.max(1, Math.min(Number(arg('--nucleos')) || os.availableParallelism(), 32));

(async () => {
  const mem = carregar(snap, hoje), { A, clients } = mem;
  const ultima = A.lastClosed('semana', A.parse(hoje));
  const comNumeros = A.periodsWith(mem.ctx.weeks.filter(r => r.inicio <= ultima && A.hasData(A.norm(r))), 'semana').slice(-6);
  const fila = [{ nome: 'cerebro', tipo: 'cerebro' }, { nome: 'dados', tipo: 'dados' }, { nome: 'ideias', tipo: 'ideias' }]
    .concat(comNumeros.map(i => ({ nome: 'semana ' + i, tipo: 'semana', arg: i })))
    .concat(clients.map(c => ({ nome: 'calendario ' + c.key, tipo: 'calendario', arg: c.key })));
  fila.forEach((t, i) => { t.id = i; });

  const t0 = process.hrtime.bigint(), res = new Array(fila.length), usados = Math.min(nuc, fila.length);
  let prox = 0, feitas = 0;
  await new Promise((fim, falha) => {
    const ws = Array.from({ length: usados }, (_, n) => {
      const w = new Worker(__filename, { workerData: { snap, hoje } });
      const dar = () => { if (prox < fila.length) { const t = fila[prox++]; w.postMessage({ id: t.id, tipo: t.tipo, arg: t.arg }); } else w.terminate(); };
      w.on('message', m => { res[m.id] = Object.assign({ nome: fila[m.id].nome, trabalhador: n + 1 }, m); if (++feitas === fila.length) { ws.forEach(x => x.terminate()); fim(); } else dar(); });
      w.on('error', falha); dar(); return w;
    });
  });
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const somaMs = res.reduce((s, r) => s + r.ms, 0);
  const falhas = res.filter(r => !r.ok);
  const por = nome => res.filter(r => r.nome === nome || r.nome.startsWith(nome + ' '));
  const resultado = {
    geradoEm: new Date().toISOString(), hoje, fonte: snap.fonte, execucao: { nucleosUsados: usados, nucleosDisponiveis: os.availableParallelism(), tarefas: fila.length, tempoTotalMs: Math.round(totalMs), somaDasTarefasMs: Math.round(somaMs), falhas: falhas.length },
    cerebro: (por('cerebro')[0] || {}).dados, dados: (por('dados')[0] || {}).dados, ideias: (por('ideias')[0] || {}).dados,
    semanas: por('semana').map(r => ({ inicio: r.nome.slice(7), analise: r.dados })), calendario: Object.fromEntries(por('calendario').map(r => [r.nome.slice(11), r.dados])),
    clientes: Object.fromEntries(clients.map(c => [c.key, c.name])), tarefas: res.map(r => ({ nome: r.nome, ok: r.ok, ms: Math.round(r.ms), trabalhador: r.trabalhador, erro: r.erro }))
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'resultado.json'), JSON.stringify(resultado, null, 2));
  fs.writeFileSync(path.join(outDir, 'resumo.md'), '﻿' + require('./resumo').montar(resultado));
  console.log(`Pronto: ${fila.length} tarefas em ${usados} núcleo(s), ${(totalMs / 1000).toFixed(2)} s (soma das tarefas ${(somaMs / 1000).toFixed(2)} s)${falhas.length ? ', ' + falhas.length + ' FALHA(S): ' + falhas.map(f => f.nome).join(', ') : ''}.`);
  if (falhas.length) { falhas.forEach(f => console.error('--- ' + f.nome + '\n' + f.erro)); process.exit(1); }
})().catch(e => { console.error('FALHOU: ' + e.stack); process.exit(1); });
