/* Central de Inteligência: agentes por função + maestro. Sem API de IA: tudo por regras explícitas, com evidência.
   Cada agente lê uma parte dos dados e devolve "achados" com nota de 0 a 100 (urgência x impacto x confiança).
   O maestro junta, tira o que já foi resolvido, e escolhe a decisão do dia. Funções puras: rodam no navegador e nos testes. */
(function (root) {
  const A = root.N7Analysis;
  const DAY = 86400000;
  const toD = iso => new Date(iso + "T00:00:00");
  const diff = (a, b) => Math.round((toD(a) - toD(b)) / DAY);
  const plus = (iso, n) => A.iso(A.addDays(A.parse(iso), n));
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
  const NOT_STARTED = ["prop", "plan"];
  const has = (c, s) => !!(c.services || []).includes(s);
  const CLASS_BASE = { CORRIGIR: 70, TESTAR: 50, ESCALAR: 45, MANTER: 20, INCONCLUSIVO: 15 };
  const CONF = { ALTA: 1, "MÉDIA": .85, BAIXA: .6 };

  /* o que cada agente faz, em linguagem simples (mostrado na tela "Como o cérebro pensa") */
  const AGENTS = {
    producao: { id: "producao", name: "Produção", icon: "list", does: "Vigia o calendário: pautas atrasadas, pautas que vencem em até 2 dias sem ter começado e clientes sem pauta nos próximos 7 dias.", rules: ["Atrasada: nota sobe com os dias de atraso e a quantidade", "Vence em até 1 dia e nem começou: nota 90", "Cliente de redes sem pauta nos próximos 7 dias: nota 62"] },
    aprovacao: { id: "aprovacao", name: "Aprovações", icon: "bell", does: "Procura peças que vão ao ar em até 3 dias e ainda esperam a aprovação do cliente.", rules: ["Publica em até 3 dias sem aprovação do cliente: nota 72", "Publica hoje ou amanhã: nota 86"] },
    midia: { id: "midia", name: "Mídia paga", icon: "target", does: "Lê os anúncios da última semana com números: frequência, saturação, gasto sem resultado e custo por resultado.", rules: ["Frequência acima de 1,5 ou alcance maior que a cidade: corrigir", "Gasto sem nenhum resultado: corrigir", "Custo por resultado 20% maior ou menor que a semana anterior"] },
    redes: { id: "redes", name: "Redes sociais", icon: "ig", does: "Lê Instagram e Facebook: cliques no link, interação por mil visualizações e queda de distribuição.", rules: ["Cliques no link caindo 20% ou mais: testar", "Facebook com queda forte ou zero cliques: corrigir", "Visualizações caindo 25% ou mais: testar"] },
    vendas: { id: "vendas", name: "Vendas", icon: "money", does: "Compara as vendas da semana com a anterior nos mesmos dias, avisando feriado antes de concluir queda.", rules: ["Variação de 10% ou mais, nos mesmos dias da semana", "Com feriado no período, a queda vira 'inconclusiva'"] },
    dados: { id: "dados", name: "Qualidade dos dados", icon: "file", does: "Avisa o que falta para a análise ser confiável: semana sem números, decisão da semana em branco e calendário fora da Central.", rules: ["Cliente com serviço e sem número na última semana", "Semana com dados e sem decisão registrada", "Calendário usando a cópia em vez da Central"] },
    calendario: { id: "calendario", name: "Datas e feriados", icon: "cal", does: "Olha os próximos 10 dias atrás de feriado ou data atípica que mude o conteúdo e o horário das publicações.", rules: ["Feriado em até 3 dias: nota 70", "Feriado em até 7 dias: nota 57"] }
  };
  const AGENT_ORDER = ["aprovacao", "producao", "midia", "vendas", "redes", "dados", "calendario"];

  const F = (agente, chave, o) => Object.assign({ agente, chave, marca: "", nome: "", kind: "acao", score: 0, titulo: "", detalhe: "", evidencia: [], acao: "", link: null }, o, { score: clamp(o.score) });
  const urgencia = s => (s >= 80 ? "Hoje" : s >= 60 ? "Esta semana" : "Acompanhar");

  /* ---------- agentes ---------- */
  function producao(ctx) {
    const out = [], { today, posts } = ctx;
    ctx.clients.filter(c => has(c, "redes") || has(c, "criativos")).forEach(c => {
      const mine = posts.filter(p => p.b === c.key);
      const late = mine.filter(p => p.status !== "pub" && p.date < today).sort((a, b) => a.date.localeCompare(b.date));
      if (late.length) {
        const oldest = late[0], days = diff(today, oldest.date);
        out.push(F("producao", `prod-late-${c.key}`, { marca: c.key, nome: c.name, score: 52 + Math.min(26, days * 1.6) + Math.min(10, late.length),
          titulo: `${c.name}: ${late.length} pauta${late.length > 1 ? "s" : ""} atrasada${late.length > 1 ? "s" : ""}`, detalhe: `A mais antiga é ${oldest.code} (${oldest.title}), que era para ${oldest.date.split("-").reverse().slice(0, 2).join("/")}, ${days} dia${days > 1 ? "s" : ""} atrás.`,
          evidencia: [`${late.length} pauta(s) com data vencida e fora de "Publicado"`, `Atraso máximo: ${days} dia(s)`], acao: "Reprogramar ou publicar as mais antigas e atualizar o status no Calendário.", link: { route: "calendario", brand: c.key } }));
      }
      const soon = mine.filter(p => NOT_STARTED.includes(p.status) && p.date >= today && p.date <= plus(today, 2)).sort((a, b) => a.date.localeCompare(b.date));
      if (soon.length) {
        const d = diff(soon[0].date, today);
        out.push(F("producao", `prod-due-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 90 : 78,
          titulo: `${c.name}: ${soon.length} pauta${soon.length > 1 ? "s" : ""} vence${soon.length > 1 ? "m" : ""} em até 2 dias sem ter começado`, detalhe: `${soon[0].code} (${soon[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : "em 2 dias"} e ainda está em "${soon[0].status === "prop" ? "Proposta" : "A planejar"}".`,
          evidencia: [`Status ainda sem produção: ${soon.map(p => p.code).join(", ")}`], acao: "Decidir hoje: produzir às pressas, trocar por outra pauta ou mover a data.", link: { route: "calendario", brand: c.key } }));
      }
      if (has(c, "redes") && mine.length && !mine.some(p => p.date >= today && p.date <= plus(today, 7))) {
        out.push(F("producao", `prod-empty-${c.key}`, { marca: c.key, nome: c.name, score: 62, titulo: `${c.name}: nenhuma pauta nos próximos 7 dias`,
          detalhe: "O perfil fica sem publicar se nada for planejado agora. Constância pesa mais que uma peça perfeita.", evidencia: ["Calendário vazio entre hoje e os próximos 7 dias"], acao: "Puxar uma ideia aprovada do quadro de ideias ou criar pautas para a semana.", link: { route: "calendario", brand: c.key, ideas: true } }));
      }
    });
    return out;
  }

  function aprovacao(ctx) {
    const out = [], { today, posts } = ctx;
    ctx.clients.forEach(c => {
      const wait = posts.filter(p => p.b === c.key && p.status !== "pub" && p.date >= today && p.date <= plus(today, 3) && ctx.needsClient(p)).sort((a, b) => a.date.localeCompare(b.date));
      if (!wait.length) return;
      const d = diff(wait[0].date, today);
      out.push(F("aprovacao", `apr-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 86 : 72,
        titulo: `${c.name}: ${wait.length} peça${wait.length > 1 ? "s" : ""} esperando a aprovação do cliente`, detalhe: `${wait[0].code} (${wait[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`}.`,
        evidencia: [`Política do cliente exige aprovação dele: ${wait.map(p => p.code).join(", ")}`, `Primeira publicação em ${d} dia(s)`], acao: "Cobrar a aprovação com o cliente hoje; sem ela a peça não pode ficar pronta.", link: { route: "calendario", brand: c.key } }));
    });
    return out;
  }

  /* achados de Vendas, Mídia e Redes vêm da análise semanal (mesmas regras da tela Semana) */
  function fromAnalysis(ctx) {
    const out = [], a = ctx.analysis; if (!a) return out;
    const AG = { Vendas: "vendas", "Meta Ads": "midia", Instagram: "redes", Facebook: "redes" };
    a.signals.forEach(s => {
      const agente = AG[s.canal]; if (!agente) return;
      const win = (s.classe === "ESCALAR" || s.classe === "MANTER") && s.tom === "up";
      const base = (CLASS_BASE[s.classe] || 15) * (CONF[s.confianca] || .6) + (s.canal === "Vendas" ? 10 : s.canal === "Meta Ads" ? 8 : 0);
      out.push(F(agente, `sig-${a.period.inicio}-${s.marca}-${slug(s.canal)}-${slug(s.titulo)}`, { marca: s.marca, nome: s.nome, kind: win ? "ganho" : "acao", score: win ? Math.min(base, 35) : base,
        titulo: `${s.nome} · ${s.canal}: ${s.titulo}`, detalhe: s.texto, evidencia: [`Classificação: ${s.classe}`, `Confiança: ${s.confianca}`, `Semana ${a.period.label}`],
        acao: s.classe === "CORRIGIR" ? "Corrigir antes de gastar ou publicar mais." : s.classe === "TESTAR" ? "Montar um teste curto e medir antes de decidir." : s.classe === "ESCALAR" ? "Pode crescer: aumente aos poucos e acompanhe." : s.classe === "INCONCLUSIVO" ? "Base pequena ou feriado: espere mais dados antes de concluir." : "Manter como está.",
        link: { route: "semana", brand: s.marca } }));
    });
    return out;
  }

  function dados(ctx) {
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

  function calendario(ctx) {
    const out = [], { today } = ctx;
    for (let i = 0; i <= 10; i++) {
      const d = plus(today, i), name = A.HOLIDAYS[d]; if (!name) continue;
      const planned = ctx.posts.filter(p => p.date === d && p.status !== "pub");
      out.push(F("calendario", `cal-hol-${d}`, { score: i <= 3 ? 70 : i <= 7 ? 57 : 45, titulo: `${name} ${i === 0 ? "é hoje" : i === 1 ? "é amanhã" : `em ${i} dias`} (${d.split("-").reverse().slice(0, 2).join("/")})`,
        detalhe: planned.length ? `Há ${planned.length} pauta(s) marcada(s) para esse dia: ${planned.slice(0, 3).map(p => p.code).join(", ")}. Confirme horário e tom do conteúdo.` : "Nenhuma pauta nesse dia. Vale um conteúdo de data ou avisar o horário de funcionamento.",
        evidencia: [`Data atípica: ${name}`, "Comparações de venda perto dessa data pedem cuidado"], acao: "Conferir o conteúdo e o horário de funcionamento antes da data.", link: { route: "calendario" } }));
    }
    return out;
  }

  /* o que já foi tratado some até a data "ate" (feita: hoje; adiada: 2 dias; ignorada: 14 dias) */
  const hidden = (f, decisions, today) => (decisions || []).some(d => d.chave === f.chave && d.ate && d.ate >= today);

  function run(ctx) {
    ctx = Object.assign({ posts: [], weeks: [], gens: [], clients: [], decisions: [], needsClient: () => false, planSource: null }, ctx);
    const lastClosed = A.lastClosed("semana", A.parse(ctx.today));
    const withData = A.periodsWith(ctx.weeks.filter(r => r.inicio <= lastClosed && A.hasData(A.norm(r))), "semana");
    const inicio = withData.length ? withData[withData.length - 1] : null;
    ctx.analysis = inicio ? A.analyze({ weeks: ctx.weeks, gens: ctx.gens, tipo: "semana", inicio, clients: ctx.clients.map(c => ({ key: c.key, name: c.name, services: c.services })) }) : null;
    const all = [].concat(aprovacao(ctx), producao(ctx), fromAnalysis(ctx), dados(ctx), calendario(ctx));
    const open = all.filter(f => !hidden(f, ctx.decisions, ctx.today));
    const order = f => AGENT_ORDER.indexOf(f.agente);
    const acoes = open.filter(f => f.kind === "acao").sort((x, y) => y.score - x.score || order(x) - order(y));
    const decision = acoes[0] || null;
    const also = [];                                                  /* "também hoje": variedade de cliente e de agente */
    acoes.slice(1).forEach(f => { if (also.length < 2 && f.score >= 55 && !also.some(x => x.agente === f.agente && x.marca === f.marca)) also.push(f); });
    const rest = acoes.filter(f => f !== decision && !also.includes(f));
    const byAgent = {}; AGENT_ORDER.forEach(id => { byAgent[id] = open.filter(f => f.agente === id).sort((x, y) => y.score - x.score); });
    return {
      today: ctx.today, decision: decision && Object.assign({ urgencia: urgencia(decision.score) }, decision), also: also.map(f => Object.assign({ urgencia: urgencia(f.score) }, f)), radar: rest, wins: open.filter(f => f.kind === "ganho").sort((x, y) => y.score - x.score),
      byAgent, resolved: all.length - open.length, total: open.length, calm: !decision, analysisWeek: ctx.analysis ? ctx.analysis.period : null,
      sources: { calendario: ctx.planSource ? (ctx.planSource.source === "central" ? "Central ao vivo" : "cópia embutida") : "cópia embutida", semana: ctx.analysis ? ctx.analysis.period.label : "sem semana com números", clientes: ctx.clients.length }
    };
  }
  root.N7Brain = { run, AGENTS, AGENT_ORDER, urgencia, hidden, plus };
})(typeof window !== "undefined" ? window : globalThis);
