/* Central de Inteligência v2: 14 agentes em 5 áreas + sinapses (conexões entre agentes) + memória + saúde por cliente + maestro.
   Sem API de IA: tudo por regras explícitas, com evidência. Funções puras: rodam no navegador e nos testes.

   Como o cérebro funciona, em 6 passos:
   1. Cada agente lê uma parte dos dados e devolve "achados" (nota 0 a 100 = urgência x impacto x confiança).
   2. A memória compara com o que já foi decidido: o que voltou depois de "feito" sobe de nota (reincidente).
   3. As sinapses ligam agentes entre si: uma causa conhecida reforça o efeito, dados velhos baixam a confiança,
      dois sinais de desgaste viram um achado novo (criativos desgastados).
   4. O agente Cliente resume tudo por empresa (saúde 0 a 100) e avisa quando várias frentes pioram juntas.
   5. O maestro escolhe a decisão do dia e até 2 "também hoje" (variando agente e cliente).
   6. O que for tratado some até a data escolhida; se o problema continuar, volta com a marca de reincidente. */
(function (root) {
  const A = root.N7Analysis;
  const DAY = 86400000;
  const toD = iso => new Date(iso + "T00:00:00");
  const diff = (a, b) => Math.round((toD(a) - toD(b)) / DAY);
  const plus = (iso, n) => A.iso(A.addDays(A.parse(iso), n));
  const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
  const NOT_STARTED = ["prop", "plan"];
  const has = (c, s) => !!(c.services || []).includes(s);
  const CLASS_BASE = { CORRIGIR: 70, TESTAR: 50, ESCALAR: 45, MANTER: 20, INCONCLUSIVO: 15 };
  const CONF = { ALTA: 1, "MÉDIA": .85, BAIXA: .6 };
  const STATUS_NAME = { prop: "Proposta", plan: "A planejar", prod: "Em produção", apr: "Aprovação", agd: "Pronto / agendado", pub: "Publicado" };
  const STEPS = ["roteiro", "gravar", "editar", "aprovar", "agendar"];
  const STEP_NAME = { roteiro: "o roteiro", gravar: "a gravação", editar: "a edição / design", aprovar: "a aprovação", agendar: "o agendamento" };
  const DONE = { prop: 0, plan: 0, prod: 2, apr: 3, agd: 5, pub: 5 };   /* quantas etapas já foram feitas em cada status */
  const MEMORY_DAYS = { feita: 0, adiada: 2, ignorada: 14 };

  /* ---------- as 5 áreas e os 14 agentes ---------- */
  const AREAS = {
    operacao: { id: "operacao", name: "Operação", does: "Prazos, fila de trabalho e aprovações" },
    conteudo: { id: "conteudo", name: "Conteúdo", does: "Ritmo editorial, qualidade e criativos" },
    resultado: { id: "resultado", name: "Resultado", does: "Vendas, anúncios e redes sociais" },
    estrategia: { id: "estrategia", name: "Estratégia", does: "Visão por cliente e oportunidades" },
    contexto: { id: "contexto", name: "Contexto", does: "Datas, feriados e qualidade dos dados" }
  };
  const AREA_ORDER = ["operacao", "conteudo", "resultado", "estrategia", "contexto"];

  const AGENTS = {
    producao: { id: "producao", area: "operacao", name: "Produção", icon: "list", does: "Vigia o calendário: pautas atrasadas, pautas que vencem em até 2 dias sem ter começado e clientes sem pauta nos próximos 7 dias.", rules: ["Atrasada: nota sobe com os dias de atraso e a quantidade", "Vence em até 1 dia e nem começou: nota 90", "Cliente de redes sem pauta nos próximos 7 dias: nota 62"] },
    pipeline: { id: "pipeline", area: "operacao", name: "Etapas da produção", icon: "layers", does: "Confere os prazos de cada etapa (roteiro, gravação, edição, aprovação, agendamento) contra o status da pauta, antes de ela atrasar.", rules: ["Etapa com prazo vencido e status que ainda não avançou: nota 48 a 80 (sobe quanto mais perto da publicação)", "Prazo de etapa caindo em feriado nos próximos 5 dias: nota 50"] },
    capacidade: { id: "capacidade", area: "operacao", name: "Capacidade da equipe", icon: "users", does: "Soma as etapas que vencem em cada dia dos próximos 7 e avisa quando a equipe vai ser pedida demais num dia só.", rules: ["3 ou mais gravações no mesmo dia, 4 ou mais edições ou 7 etapas no total: nota 55 a 80", "Dia com feriado pesa mais"] },
    aprovacao: { id: "aprovacao", area: "operacao", name: "Aprovações", icon: "bell", does: "Procura peças que vão ao ar em até 3 dias e ainda esperam a aprovação do cliente.", rules: ["Publica em até 3 dias sem aprovação do cliente: nota 72", "Publica hoje ou amanhã: nota 86"] },
    editorial: { id: "editorial", area: "conteudo", name: "Ritmo editorial", icon: "cal", does: "Compara o que está planejado com os horários fixos combinados, olha a variedade de formatos e as ideias aprovadas paradas.", rules: ["Menos da metade dos horários fixos da semana preenchidos: nota 54", "4 ou mais pautas em 14 dias, todas do mesmo formato: nota 40", "Ideias aprovadas há mais de 7 dias sem data: nota 46 a 56", "Duas pautas do mesmo formato no mesmo dia: nota 44"] },
    qualidade: { id: "qualidade", area: "conteudo", name: "Qualidade", icon: "shield", does: "Procura peças prontas para ir ao ar em até 2 dias sem a checagem de qualidade feita.", rules: ["Peça em aprovação ou agendada, publica em até 2 dias, sem checagem: nota 58", "Publica hoje ou amanhã: nota 66"] },
    criativo: { id: "criativo", area: "conteudo", name: "Criativos", icon: "spark", does: "Nasce da conversa entre Mídia e Redes: quando frequência alta, custo subindo e queda de cliques ou visualizações aparecem juntos, as peças estão desgastadas.", rules: ["Dois ou mais sinais de desgaste no mesmo cliente: nota do mais forte + 8", "Os achados de origem perdem 15 pontos para não aparecerem em duplicidade"] },
    midia: { id: "midia", area: "resultado", name: "Mídia paga", icon: "target", does: "Lê os anúncios da última semana com números: frequência, saturação, gasto sem resultado e custo por resultado.", rules: ["Frequência acima de 1,5 ou alcance maior que a cidade: corrigir", "Gasto sem nenhum resultado: corrigir", "Custo por resultado 20% maior ou menor que a semana anterior"] },
    redes: { id: "redes", area: "resultado", name: "Redes sociais", icon: "ig", does: "Lê Instagram e Facebook: cliques no link, interação por mil visualizações e queda de distribuição.", rules: ["Cliques no link caindo 20% ou mais: testar", "Facebook com queda forte ou zero cliques: corrigir", "Visualizações caindo 25% ou mais: testar"] },
    vendas: { id: "vendas", area: "resultado", name: "Vendas", icon: "money", does: "Compara as vendas da semana com a anterior nos mesmos dias, avisando feriado antes de concluir queda.", rules: ["Variação de 10% ou mais, nos mesmos dias da semana", "Com feriado no período, a queda vira 'inconclusiva'"] },
    cliente: { id: "cliente", area: "estrategia", name: "Gestão de contas", icon: "home", does: "Junta tudo o que os outros agentes disseram sobre cada cliente numa nota de saúde de 0 a 100 e avisa quando várias frentes pioram juntas.", rules: ["Cada achado aberto tira pontos da saúde, conforme a nota dele", "3 ou mais achados com nota 60+ ou saúde abaixo de 60: nota 60 a 78", "Saúde: 80+ em ordem, 60 a 79 atenção, abaixo de 60 em risco"] },
    oportunidades: { id: "oportunidades", area: "estrategia", name: "Oportunidades", icon: "bulb", does: "Procura onde o resultado está bom e dá para propor mais: orgânico forte em cliente sem tráfego pago.", rules: ["Instagram ou Facebook subindo (classe manter) em cliente sem o serviço de tráfego pago: nota 44"] },
    dados: { id: "dados", area: "contexto", name: "Qualidade dos dados", icon: "file", does: "Avisa o que falta para a análise ser confiável: semana sem números, decisão da semana em branco e calendário fora da Central.", rules: ["Cliente com serviço e sem número na última semana", "Semana com dados e sem decisão registrada", "Calendário usando a cópia em vez da Central"] },
    calendario: { id: "calendario", area: "contexto", name: "Datas e feriados", icon: "clock", does: "Olha os próximos 10 dias atrás de feriado ou data atípica que mude o conteúdo e o horário das publicações.", rules: ["Feriado em até 3 dias: nota 70", "Feriado em até 7 dias: nota 57"] }
  };
  const AGENT_ORDER = ["aprovacao", "producao", "pipeline", "capacidade", "midia", "criativo", "vendas", "redes", "qualidade", "editorial", "cliente", "oportunidades", "dados", "calendario"];

  /* ---------- as sinapses: quem fala com quem ---------- */
  const SYNAPSES = [
    { id: "apr-prod", nome: "Aprovação trava a produção", de: ["aprovacao"], para: ["producao", "pipeline"], texto: "Cliente com peça esperando aprovação e pauta apertada ao mesmo tempo: a causa mais provável é a aprovação. O achado de aprovação ganha 8 pontos." },
    { id: "dados-confianca", nome: "Dado velho, confiança menor", de: ["dados"], para: ["vendas", "midia", "redes"], texto: "Se a última semana fechada está sem números, as conclusões vêm de uma semana mais antiga. Os achados desse cliente perdem 15% da nota e avisam disso." },
    { id: "feriado-prazo", nome: "Feriado aperta o prazo", de: ["calendario"], para: ["producao", "pipeline"], texto: "Feriado em até 3 dias e pauta apertada do mesmo cliente: sobem 6 pontos, porque falta dia útil para recuperar." },
    { id: "midia-redes-criativo", nome: "Anúncio cansado + redes em queda = criativo desgastado", de: ["midia", "redes"], para: ["criativo"], texto: "Frequência alta ou custo subindo junto com queda de cliques ou visualizações vira um achado novo de Criativos, e os dois originais perdem 15 pontos." },
    { id: "producao-redes", nome: "Falta de publicação e queda de alcance", de: ["producao", "pipeline", "editorial"], para: ["redes"], texto: "Cliente com atraso ou sem pauta e visualizações em queda na mesma época: o achado de produção ganha 8 pontos. É um indício, não uma prova." },
    { id: "vendas-midia", nome: "Vendas caindo com anúncio com problema", de: ["vendas"], para: ["midia"], texto: "Queda de vendas e problema nos anúncios do mesmo cliente: investigue o anúncio antes da loja. O achado de vendas ganha 6 pontos." },
    { id: "capacidade-atraso", nome: "Sobrecarga com atraso acumulado", de: ["producao"], para: ["capacidade"], texto: "Dia sobrecarregado numa semana que já tem pauta atrasada: o achado de capacidade ganha 6 pontos." },
    { id: "ideias-vazio", nome: "Calendário vazio, ideias paradas", de: ["editorial"], para: ["producao"], texto: "Cliente sem pauta na semana e com ideia aprovada esperando data: a ação passa a ser agendar a ideia, e o aviso de ideias parada é absorvido." },
    { id: "memoria", nome: "Memória: o que voltou", de: ["memoria"], para: ["todos"], texto: "Se foi marcado como feito (ou adiado, ou ignorado) e o problema continua, o achado volta com a marca de reincidente e ganha de 4 a 10 pontos." }
  ];

  const F = (agente, chave, o) => Object.assign({ agente, chave, marca: "", nome: "", kind: "acao", score: 0, titulo: "", detalhe: "", evidencia: [], acao: "", link: null, rel: [], tags: [], reincidente: false }, o, { score: clamp(o.score) });
  const urgencia = s => (s >= 80 ? "Hoje" : s >= 60 ? "Esta semana" : "Acompanhar");
  const rel = (f, other, sinapse, texto) => { f.rel.push({ chave: other.chave, agente: other.agente, titulo: other.titulo, sinapse, texto }); };

  /* ---------- agentes ---------- */
  function producao(ctx) {
    const out = [], { today, posts } = ctx;
    ctx.clients.filter(c => has(c, "redes") || has(c, "criativos")).forEach(c => {
      const mine = posts.filter(p => p.b === c.key);
      const late = mine.filter(p => p.status !== "pub" && p.date < today).sort((a, b) => a.date.localeCompare(b.date));
      if (late.length) {
        const oldest = late[0], days = diff(today, oldest.date);
        out.push(F("producao", `prod-late-${c.key}`, { marca: c.key, nome: c.name, score: 52 + Math.min(26, days * 1.6) + Math.min(10, late.length),
          titulo: `${c.name}: ${late.length} pauta${late.length > 1 ? "s" : ""} atrasada${late.length > 1 ? "s" : ""}`, detalhe: `A mais antiga é ${oldest.code} (${oldest.title}), que era para ${dm(oldest.date)}, ${days} dia${days > 1 ? "s" : ""} atrás.`,
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

  /* etapas com prazo vencido e status que ainda não avançou, em pautas que ainda não atrasaram de vez */
  function pipeline(ctx) {
    const out = [], { today, posts } = ctx;
    ctx.clients.filter(c => has(c, "redes") || has(c, "criativos")).forEach(c => {
      const items = [];
      posts.filter(p => p.b === c.key && p.status !== "pub" && p.date >= today && p.steps).forEach(p => {
        if (NOT_STARTED.includes(p.status) && p.date <= plus(today, 2)) return;            /* esse caso é da Produção */
        const done = DONE[p.status] || 0;
        const late = STEPS.map((s, i) => ({ s, i, at: p.steps[s] })).filter(x => x.i >= done && x.at && x.at < today);
        if (late.length) items.push({ p, step: late[0], n: late.length });
      });
      if (items.length) {
        items.sort((a, b) => a.p.date.localeCompare(b.p.date));
        const w = items[0], dPub = diff(w.p.date, today), days = diff(today, w.step.at);
        out.push(F("pipeline", `pipe-${c.key}`, { marca: c.key, nome: c.name, score: 48 + (dPub <= 3 ? 22 : dPub <= 7 ? 12 : 4) + Math.min(10, items.length * 2.5),
          titulo: `${c.name}: etapa atrasada em ${items.length} pauta${items.length > 1 ? "s" : ""}`,
          detalhe: `${w.p.code} (${w.p.title}): ${STEP_NAME[w.step.s]} era para ${dm(w.step.at)} (${days} dia${days > 1 ? "s" : ""} atrás) e a pauta está em "${STATUS_NAME[w.p.status] || w.p.status}". Publica em ${dm(w.p.date)}.`,
          evidencia: [`Pautas com etapa vencida: ${items.map(x => x.p.code).join(", ")}`, `A mais próxima de publicar fica a ${dPub} dia(s)`], acao: "Cobrar a etapa com quem é responsável ou mover a data de publicação antes de a pauta atrasar de vez.", link: { route: "calendario", brand: c.key } }));
      }
      const hol = [];
      posts.filter(p => p.b === c.key && p.status !== "pub" && p.steps).forEach(p => {
        const done = DONE[p.status] || 0;
        STEPS.forEach((s, i) => { const at = p.steps[s]; if (i >= done && at && at >= today && at <= plus(today, 5) && A.HOLIDAYS[at]) hol.push({ p, s, at, name: A.HOLIDAYS[at] }); });
      });
      if (hol.length) out.push(F("pipeline", `pipe-hol-${c.key}`, { marca: c.key, nome: c.name, score: 50, titulo: `${c.name}: prazo de etapa cai em feriado`,
        detalhe: `${hol[0].p.code}: ${STEP_NAME[hol[0].s]} vence em ${dm(hol[0].at)} (${hol[0].name}). ${hol.length > 1 ? `Mais ${hol.length - 1} etapa(s) no mesmo caso.` : ""}`.trim(), evidencia: [`Feriado em ${dm(hol[0].at)}: ${hol[0].name}`], acao: "Antecipar a etapa para antes do feriado ou combinar o novo prazo.", link: { route: "calendario", brand: c.key } }));
    });
    return out;
  }

  function capacidade(ctx) {
    const { today, posts } = ctx, days = [];
    for (let i = 0; i < 7; i++) {
      const d = plus(today, i), g = [], e = [], t = [];
      posts.filter(p => p.status !== "pub" && p.steps && new Set(Object.values(p.steps)).size > 1).forEach(p => {
        const done = DONE[p.status] || 0;
        STEPS.forEach((s, k) => { if (k >= done && p.steps[s] === d) { t.push(p); if (s === "gravar") g.push(p); if (s === "editar") e.push(p); } });
      });
      if (g.length >= 3 || e.length >= 4 || t.length >= 7) days.push({ d, g, e, t, hol: A.HOLIDAYS[d] || "" });
    }
    if (!days.length) return [];
    const worst = days.slice().sort((a, b) => b.t.length - a.t.length)[0];
    const brands = [...new Set(worst.t.map(p => (ctx.clients.find(c => c.key === p.b) || {}).name || p.b))];
    return [F("capacidade", `cap-${worst.d}`, { score: 55 + Math.min(20, (worst.t.length - 6) * 4) + (worst.hol ? 5 : 0),
      titulo: `Equipe sobrecarregada em ${dm(worst.d)}: ${worst.t.length} etapas no mesmo dia`,
      detalhe: `${worst.g.length} gravação(ões), ${worst.e.length} edição(ões) e outras etapas vencem em ${dm(worst.d)}${worst.hol ? ` (${worst.hol})` : ""}. Clientes envolvidos: ${brands.join(", ")}.`,
      evidencia: [`Dia mais pesado: ${dm(worst.d)} com ${worst.t.length} etapas`, days.length > 1 ? `Outros dias pesados: ${days.filter(x => x !== worst).map(x => dm(x.d)).join(", ")}` : "Só este dia passa do limite"], acao: "Redistribuir: antecipar gravações em lote, mover prazos para dias mais leves ou combinar a entrega com o cliente.", link: { route: "calendario" } })];
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

  function editorial(ctx) {
    const out = [], { today, posts } = ctx, slots = ctx.slots || {}, ideas = ctx.ideas || [];
    ctx.clients.filter(c => has(c, "redes")).forEach(c => {
      const mine = posts.filter(p => p.b === c.key), mySlots = slots[c.key] || [];
      const next7 = mine.filter(p => p.date >= today && p.date <= plus(today, 6));
      if (mySlots.length && next7.length > 0 && next7.length < Math.ceil(mySlots.length / 2)) out.push(F("editorial", `edit-cad-${c.key}`, { marca: c.key, nome: c.name, score: 54,
        titulo: `${c.name}: ritmo abaixo do combinado (${next7.length} de ${mySlots.length} horários fixos)`, detalhe: `Os horários fixos da semana são ${mySlots.length}, mas só ${next7.length} pauta(s) caem nos próximos 7 dias.`,
        evidencia: [`${mySlots.length} horários fixos combinados`, `${next7.length} pauta(s) nos próximos 7 dias`], acao: "Preencher os horários vagos com pautas ou ideias aprovadas.", link: { route: "calendario", brand: c.key, ideas: true } }));
      const n14 = mine.filter(p => p.date >= today && p.date <= plus(today, 13));
      if (n14.length >= 4 && new Set(n14.map(p => p.format)).size === 1) out.push(F("editorial", `edit-mix-${c.key}`, { marca: c.key, nome: c.name, score: 40,
        titulo: `${c.name}: só ${n14[0].format} nos próximos 14 dias`, detalhe: `Todas as ${n14.length} pautas das próximas duas semanas são ${n14[0].format}. Variar formato ajuda a testar o que o público prefere.`,
        evidencia: [`${n14.length} pautas, um único formato`], acao: "Trocar ao menos uma pauta por outro formato (Reels, carrossel).", link: { route: "calendario", brand: c.key } }));
      const old = ideas.filter(i => i.b === c.key && i.stage === "aprovada" && i.at && i.at <= plus(today, -7)).sort((a, b) => a.at.localeCompare(b.at));
      if (old.length) out.push(F("editorial", `edit-ideas-${c.key}`, { marca: c.key, nome: c.name, score: 46 + Math.min(10, old.length * 3), tags: ["ideias"],
        titulo: `${c.name}: ${old.length} ideia${old.length > 1 ? "s" : ""} aprovada${old.length > 1 ? "s" : ""} parada${old.length > 1 ? "s" : ""} há mais de 7 dias`, detalhe: `A mais antiga é "${old[0].title}", aprovada em ${dm(old[0].at)}, ainda sem data de publicação.`,
        evidencia: [`${old.length} ideia(s) com etapa "aprovada" e sem pauta`], acao: "Agendar nos horários fixos do cliente ou descartar para o quadro não acumular.", link: { route: "calendario", brand: c.key, ideas: true } }));
      const byDay = {}; mine.filter(p => p.date >= today && p.date <= plus(today, 13)).forEach(p => { (byDay[p.date + "|" + p.format] = byDay[p.date + "|" + p.format] || []).push(p); });
      const dup = Object.entries(byDay).filter(([, l]) => l.length >= 2).sort()[0];
      if (dup) out.push(F("editorial", `edit-dup-${c.key}`, { marca: c.key, nome: c.name, score: 44, titulo: `${c.name}: duas pautas de ${dup[1][0].format} no mesmo dia`,
        detalhe: `${dup[1].map(p => p.code).join(" e ")} caem em ${dm(dup[1][0].date)}. Publicar duas do mesmo formato juntas divide o alcance.`, evidencia: [`Dia ${dm(dup[1][0].date)}`], acao: "Mover uma das duas para outro horário fixo.", link: { route: "calendario", brand: c.key } }));
    });
    return out;
  }

  function qualidade(ctx) {
    const out = [], { today, posts } = ctx; if (!ctx.checks) return out;
    ctx.clients.forEach(c => {
      const miss = posts.filter(p => p.b === c.key && ["apr", "agd"].includes(p.status) && p.date >= today && p.date <= plus(today, 2) && !ctx.checks[p.code]).sort((a, b) => a.date.localeCompare(b.date));
      if (!miss.length) return;
      const d = diff(miss[0].date, today);
      out.push(F("qualidade", `qual-${c.key}`, { marca: c.key, nome: c.name, score: d <= 1 ? 66 : 58, titulo: `${c.name}: ${miss.length} peça${miss.length > 1 ? "s" : ""} pronta${miss.length > 1 ? "s" : ""} sem checagem de qualidade`,
        detalhe: `${miss[0].code} (${miss[0].title}) publica ${d === 0 ? "hoje" : d === 1 ? "amanhã" : "em 2 dias"} e ainda não passou pela checagem.`, evidencia: [`Sem checagem: ${miss.map(p => p.code).join(", ")}`], acao: "Rodar a checagem de qualidade da peça antes de agendar.", link: { route: "calendario", brand: c.key } }));
    });
    return out;
  }

  /* achados de Vendas, Mídia e Redes vêm da análise semanal (mesmas regras da tela Semana) */
  const TAGS = [[/frequ/i, "freq"], [/acima da popula/i, "saturacao"], [/custo por resultado subiu/i, "cpr_up"], [/menos visualiza/i, "views_down"], [/perdeu distribui/i, "views_down"], [/cliques no link caíram|mais visitas, menos cliques/i, "cliques_down"], [/menos intera/i, "interacao_down"]];
  function fromAnalysis(ctx) {
    const out = [], a = ctx.analysis; if (!a) return out;
    const AG = { Vendas: "vendas", "Meta Ads": "midia", Instagram: "redes", Facebook: "redes" };
    a.signals.forEach(s => {
      const agente = AG[s.canal]; if (!agente) return;
      const win = (s.classe === "ESCALAR" || s.classe === "MANTER") && s.tom === "up";
      const base = (CLASS_BASE[s.classe] || 15) * (CONF[s.confianca] || .6) + (s.canal === "Vendas" ? 10 : s.canal === "Meta Ads" ? 8 : 0);
      const tags = TAGS.filter(([re]) => re.test(s.titulo)).map(t => t[1]); if (agente === "vendas" && s.tom === "down") tags.push("vendas_down");
      out.push(F(agente, `sig-${a.period.inicio}-${s.marca}-${slug(s.canal)}-${slug(s.titulo)}`, { marca: s.marca, nome: s.nome, kind: win ? "ganho" : "acao", score: win ? Math.min(base, 35) : base, tags, canal: s.canal, tom: s.tom, classe: s.classe,
        titulo: `${s.nome} · ${s.canal}: ${s.titulo}`, detalhe: s.texto, evidencia: [`Classificação: ${s.classe}`, `Confiança: ${s.confianca}`, `Semana ${a.period.label}`],
        acao: s.classe === "CORRIGIR" ? "Corrigir antes de gastar ou publicar mais." : s.classe === "TESTAR" ? "Montar um teste curto e medir antes de decidir." : s.classe === "ESCALAR" ? "Pode crescer: aumente aos poucos e acompanhe." : s.classe === "INCONCLUSIVO" ? "Base pequena ou feriado: espere mais dados antes de concluir." : "Manter como está.",
        link: { route: "semana", brand: s.marca } }));
    });
    return out;
  }

  function oportunidades(ctx) {
    const out = [], a = ctx.analysis; if (!a) return out;
    ctx.clients.filter(c => has(c, "redes") && !has(c, "trafego")).forEach(c => {
      const up = a.signals.find(s => s.marca === c.key && (s.canal === "Instagram" || s.canal === "Facebook") && s.tom === "up" && s.classe === "MANTER");
      if (up) out.push(F("oportunidades", `opp-trafego-${c.key}-${a.period.inicio}`, { marca: c.key, nome: c.name, score: 44, titulo: `${c.name}: orgânico forte, vale propor tráfego pago`,
        detalhe: `${up.canal}: ${up.titulo}. O cliente ainda não contrata tráfego pago; um teste pequeno pode ampliar o que já funciona.`, evidencia: [`Sinal positivo em ${up.canal} na semana ${a.period.label}`, "Cliente sem o serviço de tráfego pago"], acao: "Levar uma proposta de teste curto, com verba pequena e meta clara, na próxima conversa.", link: { route: "semana", brand: c.key } }));
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
      out.push(F("calendario", `cal-hol-${d}`, { score: i <= 3 ? 70 : i <= 7 ? 57 : 45, tags: ["feriado:" + i], titulo: `${name} ${i === 0 ? "é hoje" : i === 1 ? "é amanhã" : `em ${i} dias`} (${dm(d)})`,
        detalhe: planned.length ? `Há ${planned.length} pauta(s) marcada(s) para esse dia: ${planned.slice(0, 3).map(p => p.code).join(", ")}. Confirme horário e tom do conteúdo.` : "Nenhuma pauta nesse dia. Vale um conteúdo de data ou avisar o horário de funcionamento.",
        evidencia: [`Data atípica: ${name}`, "Comparações de venda perto dessa data pedem cuidado"], acao: "Conferir o conteúdo e o horário de funcionamento antes da data.", link: { route: "calendario" } }));
    }
    return out;
  }

  /* ---------- memória ---------- */
  const hidden = (f, decisions, today) => (decisions || []).some(d => d.chave === f.chave && d.ate && d.ate >= today);
  const STATUS_VERB = { feita: "marcado como feito", adiada: "adiado", ignorada: "ignorado" };
  const BOOST = { feita: 10, adiada: 6, ignorada: 4 };
  function remember(f, ctx) {
    const d = (ctx.decisions || []).find(x => x.chave === f.chave); if (!d || !d.ate || d.ate >= ctx.today || !(d.status in MEMORY_DAYS)) return false;
    const at = plus(d.ate, -MEMORY_DAYS[d.status]);
    f.reincidente = true; f.score = clamp(f.score + BOOST[d.status]);
    f.evidencia.push(`Reincidente: ${STATUS_VERB[d.status]} em ${dm(at)} e o problema continua`);
    return true;
  }

  /* ---------- sinapses ---------- */
  function connect(open, ctx, allKeys) {
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

  /* ---------- saúde por cliente ---------- */
  const healthLevel = s => (s >= 80 ? "ok" : s >= 60 ? "atencao" : "risco");
  function health(open, ctx) {
    return ctx.clients.map(c => {
      const list = open.filter(f => f.marca === c.key && f.kind === "acao" && f.agente !== "cliente").sort((a, b) => b.score - a.score);
      const penalty = list.reduce((s, f) => s + Math.max(0, f.score - 35) * .35, 0), saude = clamp(100 - 80 * (1 - Math.exp(-penalty / 55)));   /* queda suave: muitos achados pioram, mas a nota não zera */
      const wins = open.filter(f => f.marca === c.key && f.kind === "ganho").length;
      return { key: c.key, id: c.id || "", name: c.name, saude, nivel: healthLevel(saude), achados: list.length, fortes: list.filter(f => f.score >= 60).length, agentes: [...new Set(list.map(f => f.agente))], top: list.slice(0, 3), ganhos: wins };
    });
  }
  function clienteAgent(clientes) {
    return clientes.filter(h => h.fortes >= 3 || (h.saude < 60 && h.achados >= 2)).map(h => F("cliente", `cli-risco-${h.key}`, { marca: h.key, nome: h.name, score: Math.min(78, 60 + Math.max(0, (60 - h.saude) / 2) + (h.fortes - 2) * 3),
      titulo: `${h.name}: várias frentes pedindo atenção ao mesmo tempo`, detalhe: `Saúde ${h.saude}/100 com ${h.achados} achado(s) abertos em ${h.agentes.length} agente(s): ${h.agentes.map(a => AGENTS[a].name).join(", ")}.`,
      evidencia: h.top.map(f => `${AGENTS[f.agente].name}: ${f.titulo.replace(/^.*?: /, "")} (nota ${f.score})`), acao: "Conversar com o cliente e definir uma prioridade só para a semana; resolver o de maior nota primeiro.", link: { route: h.id || "painel" } }));
  }

  /* ---------- maestro ---------- */
  function run(ctx) {
    ctx = Object.assign({ posts: [], weeks: [], gens: [], clients: [], decisions: [], ideas: [], slots: {}, checks: null, needsClient: () => false, planSource: null }, ctx);
    const lastClosed = A.lastClosed("semana", A.parse(ctx.today));
    const withData = A.periodsWith(ctx.weeks.filter(r => r.inicio <= lastClosed && A.hasData(A.norm(r))), "semana");
    const inicio = withData.length ? withData[withData.length - 1] : null;
    ctx.analysis = inicio ? A.analyze({ weeks: ctx.weeks, gens: ctx.gens, tipo: "semana", inicio, clients: ctx.clients.map(c => ({ key: c.key, name: c.name, services: c.services })) }) : null;

    const all = [].concat(aprovacao(ctx), producao(ctx), pipeline(ctx), capacidade(ctx), editorial(ctx), qualidade(ctx), fromAnalysis(ctx), oportunidades(ctx), dados(ctx), calendario(ctx));
    const allKeys = all.map(f => f.chave);
    all.forEach(f => remember(f, ctx));                                                              /* 2. memória */
    const open = all.filter(f => !hidden(f, ctx.decisions, ctx.today));
    const net = connect(open, ctx, allKeys);                                                         /* 3. sinapses */
    net.extra.forEach(f => { remember(f, ctx); if (!hidden(f, ctx.decisions, ctx.today)) open.push(f); });
    let clientes = health(open, ctx);                                                                /* 4. clientes */
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
    const risk = clientes.filter(h => h.nivel === "risco").length;
    return {
      today: ctx.today, decision: decision && Object.assign({ urgencia: urgencia(decision.score) }, decision), also: also.map(f => Object.assign({ urgencia: urgencia(f.score) }, f)), radar: rest, wins: open.filter(f => f.kind === "ganho").sort((x, y) => y.score - x.score),
      byAgent, clientes, sinapses: net.fired, memoria, resolved: all.length - all.filter(f => !hidden(f, ctx.decisions, ctx.today)).length, total: open.length, calm: !decision, risk, analysisWeek: ctx.analysis ? ctx.analysis.period : null,
      sources: { calendario: ctx.planSource ? (ctx.planSource.source === "central" ? "Central ao vivo" : "cópia embutida") : "cópia embutida", semana: ctx.analysis ? ctx.analysis.period.label : "sem semana com números", clientes: ctx.clients.length }
    };
  }
  root.N7Brain = { run, AGENTS, AGENT_ORDER, AREAS, AREA_ORDER, SYNAPSES, urgencia, hidden, plus, healthLevel };
})(typeof window !== "undefined" ? window : globalThis);
