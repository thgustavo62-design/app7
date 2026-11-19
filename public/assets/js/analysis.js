/* Análise da semana (ou do mês) a partir dos números digitados. Funções puras, testadas em Node.
   Regras vêm da rotina de segunda-feira da agência: dado ausente nunca vira zero; comparar o mesmo dia da
   semana; marcar feriado antes de concluir queda; classificar cada sinal e declarar a confiança;
   amostra pequena = INCONCLUSIVO; vendas e métricas de redes não são atribuídas umas às outras. */
(function (root) {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));

  const POP = 30674;                                         /* Baixo Guandu-ES */
  const NAMES = { M: "Minas Farma", F: "Farma e Farma", C: "Campo Forte", N: "Nova7 Produtora" };
  const PHARMA = ["M", "F"];
  const DEFAULT_CLIENTS = [{ key: "M", name: NAMES.M, services: ["redes", "trafego", "varejo"] }, { key: "F", name: NAMES.F, services: ["redes", "trafego", "varejo"] }, { key: "C", name: NAMES.C, services: ["redes"] }, { key: "N", name: NAMES.N, services: ["redes"] }];
  const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SOCIAL = ["views", "alcance", "interacoes", "cliques", "visitas", "seguidores"];
  const SOCIAL_NAME = { views: "Visualizações", alcance: "Alcance", interacoes: "Interações", cliques: "Cliques no link", visitas: "Visitas ao perfil", seguidores: "Novos seguidores" };
  const ADS = ["gasto", "alcance", "impressoes", "resultados"];
  const ADS_NAME = { gasto: "Gasto", alcance: "Alcance", impressoes: "Impressões", resultados: "Resultados" };

  /* datas que pedem cuidado antes de concluir queda (nacionais e as que a Central já cita) */
  const HOLIDAYS = {
    "2026-09-07": "Independência", "2026-10-12": "N. Sra. Aparecida", "2026-11-02": "Finados", "2026-11-15": "Proclamação da República", "2026-11-20": "Consciência Negra",
    "2026-12-24": "véspera de Natal", "2026-12-25": "Natal", "2026-12-31": "Réveillon", "2027-01-01": "Ano Novo",
    "2027-02-08": "Carnaval", "2027-02-09": "Carnaval", "2027-03-26": "Sexta-feira Santa", "2027-04-21": "Tiradentes", "2027-05-01": "Dia do Trabalho", "2027-05-27": "Corpus Christi",
    "2027-09-07": "Independência", "2027-10-12": "N. Sra. Aparecida", "2027-11-02": "Finados", "2027-11-15": "Proclamação da República", "2027-11-20": "Consciência Negra", "2027-12-24": "véspera de Natal", "2027-12-25": "Natal", "2027-12-31": "Réveillon"
  };

  /* ---------- números ---------- */
  const n = v => (v == null || v === "" || !isFinite(Number(v))) ? null : Number(v);
  const pct = (a, b) => (a == null || b == null || a === 0) ? null : (b / a - 1) * 100;
  const sum = list => list.reduce((a, b) => a + b, 0);
  const brl = v => v == null ? "sem dado" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const int = v => v == null ? "sem dado" : Math.round(v).toLocaleString("pt-BR");
  const dec = (v, d = 1) => v == null ? "sem dado" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pctTxt = p => p == null ? "sem base" : (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const short = v => v == null ? "sem dado" : v >= 1e6 ? dec(v / 1e6) + " mi" : v >= 1e4 ? dec(v / 1e3) + " mil" : int(v);
  const dm = s => { const d = parse(s); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

  /* ---------- períodos ---------- */
  function period(tipo, inicio) {
    const a = parse(inicio);
    if (tipo === "mes") { const fim = iso(new Date(a.getFullYear(), a.getMonth() + 1, 0)); return { tipo, inicio, fim, label: `${MONTHS[a.getMonth()]} de ${a.getFullYear()}` }; }
    const fim = iso(addDays(a, 6)), b = parse(fim);
    return { tipo, inicio, fim, label: a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MONTHS[b.getMonth()]} de ${b.getFullYear()}` : `${dm(inicio)} a ${dm(fim)}/${b.getFullYear()}` };
  }
  function prevStart(tipo, inicio) { const a = parse(inicio); return tipo === "mes" ? iso(new Date(a.getFullYear(), a.getMonth() - 1, 1)) : iso(addDays(a, -7)); }
  function nextStart(tipo, inicio) { const a = parse(inicio); return tipo === "mes" ? iso(new Date(a.getFullYear(), a.getMonth() + 1, 1)) : iso(addDays(a, 7)); }
  /* última semana fechada (segunda a domingo) ou último mês fechado, em relação a "today" */
  function lastClosed(tipo, today) {
    if (tipo === "mes") return iso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    return iso(addDays(mondayOf(today), -7));
  }
  function holidaysIn(inicio, fim) {
    const out = [];
    for (let d = parse(inicio); iso(d) <= fim; d = addDays(d, 1)) if (HOLIDAYS[iso(d)]) out.push({ date: iso(d), name: HOLIDAYS[iso(d)] });
    return out;
  }

  /* ---------- linhas e derivados ---------- */
  const group = (o, keys) => Object.fromEntries(keys.map(k => [k, n(o && o[k])]));
  function norm(row) {
    row = row || {};
    return {
      vendas: n(row.vendas), compras: n(row.compras), c100n: n(row.c100n), c100rs: n(row.c100rs),
      dias: Array.from({ length: 7 }, (_, i) => n(row.dias && row.dias[i])),
      ig: group(row.ig, SOCIAL), fb: group(row.fb, SOCIAL), ads: group(row.ads, ADS),
      janela: row.janela || "", fonte: row.fonte || "", obs: row.obs || ""
    };
  }
  const anyVal = o => Object.values(o).some(v => v != null);
  const hasData = r => r.vendas != null || r.compras != null || r.dias.some(v => v != null) || anyVal(r.ig) || anyVal(r.fb) || anyVal(r.ads);
  const per1000 = (a, b) => (a == null || !b) ? null : a / b * 1000;
  function derive(r) {
    const diasOk = r.dias.map((v, i) => v == null ? null : { i, v }).filter(Boolean);
    const best = diasOk.length ? diasOk.reduce((a, b) => b.v > a.v ? b : a) : null;
    return {
      ticket: (r.vendas != null && r.compras) ? r.vendas / r.compras : null,
      c100Compras: (r.c100n != null && r.compras) ? r.c100n / r.compras * 100 : null,
      c100Receita: (r.c100rs != null && r.vendas) ? r.c100rs / r.vendas * 100 : null,
      melhorDia: best, somaDias: diasOk.length === 7 ? sum(diasOk.map(x => x.v)) : null,
      igPorMil: per1000(r.ig.interacoes, r.ig.views), fbPorMil: per1000(r.fb.interacoes, r.fb.views),
      adsCpm: per1000(r.ads.gasto, r.ads.impressoes) == null ? null : r.ads.gasto / r.ads.impressoes * 1000,
      adsFreq: (r.ads.impressoes != null && r.ads.alcance) ? r.ads.impressoes / r.ads.alcance : null,
      adsCusto: (r.ads.gasto != null && r.ads.resultados) ? r.ads.gasto / r.ads.resultados : null
    };
  }
  const cmp = (a, b) => ({ atual: a, anterior: b, pct: pct(b, a), dif: (a != null && b != null) ? a - b : null });

  /* soma só os dias da semana presentes nos dois períodos (terça a domingo quando a segunda falta) */
  function sameWeekdays(cur, prev) {
    const idx = [];
    for (let i = 0; i < 7; i++) if (cur.dias[i] != null && prev && prev.dias[i] != null) idx.push(i);
    if (!idx.length) return null;
    const a = sum(idx.map(i => cur.dias[i])), b = sum(idx.map(i => prev.dias[i]));
    return { dias: idx, atual: a, anterior: b, pct: pct(b, a), completo: idx.length === 7, porDia: idx.map(i => ({ i, atual: cur.dias[i], anterior: prev.dias[i], pct: pct(prev.dias[i], cur.dias[i]) })) };
  }

  /* ---------- confiança ---------- */
  function confianca({ holidays, janelas, arredondado, base, temAnterior }) {
    if (!temAnterior) return "BAIXA";
    if (base != null && base < 20) return "INCONCLUSIVO";
    if (holidays.length || janelas || arredondado) return "MÉDIA";
    return "ALTA";
  }

  /* ---------- sinais ---------- */
  const ORDER = { CORRIGIR: 0, TESTAR: 1, ESCALAR: 2, MANTER: 3, INCONCLUSIVO: 4 };
  function buildSignals(clients, ctx) {
    const out = [];
    const add = (c, canal, titulo, texto, tom, classe, base, extra = {}) => {
      const conf = confianca({ holidays: ctx.holidays, janelas: !!(c.row.janela || (c.prev && c.prev.janela)), arredondado: /arredond/i.test(c.row.fonte + " " + (c.prev ? c.prev.fonte : "")), base, temAnterior: !!c.prev });
      const inconclusivo = conf === "INCONCLUSIVO";
      out.push(Object.assign({ marca: c.marca, nome: c.nome, canal, titulo, texto, tom, classe: inconclusivo ? "INCONCLUSIVO" : classe, confianca: inconclusivo ? "BAIXA" : conf }, extra));
    };
    clients.filter(c => !c.vazio).forEach(c => {
      const r = c.row, d = c.d;
      /* vendas */
      if (c.farmacia) {
        const ref = c.mesmosDias || (c.cmp.vendas && c.cmp.vendas.pct != null ? { pct: c.cmp.vendas.pct, atual: c.cmp.vendas.atual, anterior: c.cmp.vendas.anterior, dias: null } : null);
        if (ref && ref.pct != null) {
          const escopo = ref.dias && !ref.completo ? `nos mesmos ${ref.dias.length} dias da semana (${ref.dias.map(i => DOW[i]).join(", ")})` : "no período";
          const p = ref.pct, hol = ctx.holidays.length > 0;
          const classe = p >= 10 ? "MANTER" : p <= -10 ? (hol ? "INCONCLUSIVO" : "CORRIGIR") : "MANTER";
          add(c, "Vendas", p >= 10 ? `Vendas subiram ${pctTxt(p)}` : p <= -10 ? `Vendas caíram ${pctTxt(p)}` : "Vendas estáveis",
            `${brl(ref.atual)} contra ${brl(ref.anterior)} ${escopo}.${hol ? " Há feriado ou data atípica nos períodos: confira antes de concluir queda." : ""} Comparação descritiva: não isola efeito de campanha, mídia ou calendário.`,
            p >= 10 ? "up" : p <= -10 ? "down" : "flat", classe, r.compras);
        }
      }
      /* Instagram */
      const ig = c.cmp.ig;
      if (ig) {
        const cl = ig.cliques, vi = ig.visitas, vw = ig.views;
        if (cl.pct != null && cl.pct <= -20) {
          const base = Math.max(cl.atual ?? 0, cl.anterior ?? 0);
          add(c, "Instagram", vi.pct != null && vi.pct >= 10 ? "Mais visitas, menos cliques" : "Cliques no link caíram",
            `Cliques ${int(cl.anterior)} → ${int(cl.atual)} (${pctTxt(cl.pct)})${vi.pct != null ? `; visitas ao perfil ${pctTxt(vi.pct)}` : ""}. Testar Stories com CTA e links identificados antes de atribuir resultado ao conteúdo.`, "down", "TESTAR", base);
        }
        if (c.dp && d.igPorMil != null && c.dp.igPorMil != null) {
          const p = pct(c.dp.igPorMil, d.igPorMil);
          if (p != null && (p >= 50 || p <= -30)) add(c, "Instagram", p > 0 ? "Mais interação por visualização" : "Menos interação por visualização",
            `${dec(c.dp.igPorMil, 2)} → ${dec(d.igPorMil, 2)} interações a cada mil visualizações (${pctTxt(p)}). É engajamento, não venda.`, p > 0 ? "up" : "down", p > 0 ? "MANTER" : "TESTAR", Math.max(r.ig.interacoes ?? 0, c.prev ? (c.prev.ig.interacoes ?? 0) : 0));
        }
        if (vw.pct != null && vw.pct <= -25) add(c, "Instagram", "Menos visualizações no Instagram",
          `${short(vw.anterior)} → ${short(vw.atual)} (${pctTxt(vw.pct)}). Conferir volume de Stories e anúncios no período.`, "down", "TESTAR", Math.max(vw.atual ?? 0, vw.anterior ?? 0));
      }
      /* Facebook */
      const fb = c.cmp.fb;
      if (fb) {
        if (fb.views.pct != null && fb.views.pct <= -50) add(c, "Facebook", "O Facebook perdeu distribuição",
          `Visualizações ${short(fb.views.anterior)} → ${short(fb.views.atual)} (${pctTxt(fb.views.pct)}). Auditar anúncios ativos, formato das peças e botão de ação antes de mudar verba.`, "down", "CORRIGIR", Math.max(fb.views.atual ?? 0, fb.views.anterior ?? 0));
        else if (r.fb.cliques === 0 && (r.fb.views ?? 0) >= 1000) add(c, "Facebook", "Facebook sem nenhum clique",
          `${short(r.fb.views)} visualizações e 0 cliques no link. Verificar links, botão de ação e anúncios antes de investir mais.`, "down", "CORRIGIR", r.fb.views);
      }
      /* Meta Ads */
      if (anyVal(r.ads)) {
        const cp = c.prev, tem = !!cp;
        if (d.adsFreq != null && d.adsFreq > 1.5) add(c, "Meta Ads", "Frequência acima de 1,5",
          `Frequência ${dec(d.adsFreq, 2)}: a verba passou a comprar repetição, não gente nova. Rever público e orçamento.`, "warn", "CORRIGIR", r.ads.impressoes, { semAnterior: !tem });
        if (c.farmacia && r.ads.alcance != null && r.ads.alcance > POP) add(c, "Meta Ads", "Alcance acima da população da cidade",
          `${int(r.ads.alcance)} pessoas alcançadas para ${int(POP)} habitantes de Baixo Guandu: saturação provável.`, "warn", "CORRIGIR", r.ads.alcance);
        if (r.ads.gasto != null && r.ads.gasto > 0 && r.ads.resultados === 0) add(c, "Meta Ads", "Gasto sem resultado",
          `${brl(r.ads.gasto)} investidos e nenhum resultado registrado.`, "down", "CORRIGIR", r.ads.impressoes);
        const cc = c.cmp.adsCusto;
        if (cc && cc.pct != null && cc.pct >= 20) add(c, "Meta Ads", "Custo por resultado subiu",
          `${brl(cc.anterior)} → ${brl(cc.atual)} (${pctTxt(cc.pct)}).`, "down", "CORRIGIR", r.ads.resultados);
        else if (cc && cc.pct != null && cc.pct <= -20) add(c, "Meta Ads", "Custo por resultado caiu",
          `${brl(cc.anterior)} → ${brl(cc.atual)} (${pctTxt(cc.pct)}). Só escale se o resultado for venda ou conversa medida.`, "up", "ESCALAR", r.ads.resultados);
      }
    });
    return out.sort((a, b) => ORDER[a.classe] - ORDER[b.classe]);
  }

  /* ---------- análise completa ---------- */
  function analyze({ weeks = [], gens = [], tipo = "semana", inicio, clients: clientDefs }) {
    const per = period(tipo, inicio), prevInicio = prevStart(tipo, inicio), prevPer = period(tipo, prevInicio);
    const find = (list, ini, marca) => list.find(r => r.tipo === tipo && r.inicio === ini && (marca ? r.marca === marca : true));
    const holidays = holidaysIn(per.inicio, per.fim).concat(holidaysIn(prevPer.inicio, prevPer.fim));
    const clients = (clientDefs || DEFAULT_CLIENTS).map(def => {
      const marca = def.key, svc = def.services || [];
      const raw = find(weeks, inicio, marca), rawPrev = find(weeks, prevInicio, marca);
      const row = norm(raw), prev = rawPrev ? norm(rawPrev) : null, d = derive(row), dp = prev ? derive(prev) : null;
      const vazio = !hasData(row), temPrev = !!(prev && hasData(prev));
      const c = { marca, nome: def.name, svc, farmacia: svc.includes("varejo"), row, prev: temPrev ? prev : null, d, dp: temPrev ? dp : null, vazio, cmp: {}, missing: [] };
      c.cmp.vendas = cmp(row.vendas, temPrev ? prev.vendas : null);
      c.cmp.compras = cmp(row.compras, temPrev ? prev.compras : null);
      c.cmp.ticket = cmp(d.ticket, temPrev ? dp.ticket : null);
      c.cmp.ig = Object.fromEntries(SOCIAL.map(f => [f, cmp(row.ig[f], temPrev ? prev.ig[f] : null)]));
      c.cmp.fb = Object.fromEntries(SOCIAL.map(f => [f, cmp(row.fb[f], temPrev ? prev.fb[f] : null)]));
      c.cmp.igPorMil = cmp(d.igPorMil, temPrev ? dp.igPorMil : null);
      c.cmp.adsCusto = cmp(d.adsCusto, temPrev ? dp.adsCusto : null);
      c.mesmosDias = tipo === "semana" && temPrev ? sameWeekdays(row, prev) : null;
      if (vazio) c.missing.push("Nenhum número informado neste período");
      else {
        if (c.farmacia) { if (row.vendas == null) c.missing.push("Vendas do período (PDF analítico)"); if (tipo === "semana" && row.dias.some(v => v == null)) c.missing.push("Vendas de todos os 7 dias"); }
        if (svc.includes("redes")) { if (!anyVal(row.ig)) c.missing.push("Instagram"); if (!anyVal(row.fb)) c.missing.push("Facebook"); }
        if (svc.includes("trafego") && !anyVal(row.ads)) c.missing.push("Meta Ads (se houve anúncio na semana)");
        if (!temPrev) c.missing.push(`${tipo === "mes" ? "Mês" : "Semana"} anterior (${prevPer.label}): sem base de comparação`);
      }
      return c;
    });
    const ph = clients.filter(c => c.farmacia && c.row.vendas != null);
    const total = ph.length ? { vendas: sum(ph.map(c => c.row.vendas)), compras: ph.every(c => c.row.compras != null) ? sum(ph.map(c => c.row.compras)) : null } : null;
    if (total) { total.ticket = total.compras ? total.vendas / total.compras : null; const m = clients.find(c => c.marca === "M"); total.shareMinas = m && m.row.vendas != null ? m.row.vendas / total.vendas * 100 : null; }
    const gen = find(gens, inicio) || null;
    const signals = buildSignals(clients, { holidays, per });
    const missing = clients.flatMap(c => c.missing.map(m => `${c.nome}: ${m}`));
    const first = signals.find(s => s.classe === "CORRIGIR") || signals.find(s => s.classe === "TESTAR");
    return { period: per, prevPeriod: prevPer, holidays, clients, total, gen, signals, missing, suggestion: first ? `${first.nome} · ${first.canal}: ${first.titulo}. ${first.texto}` : null,
      eficiencia: clients.filter(c => c.farmacia && c.d.igPorMil != null).map(c => ({ marca: c.marca, nome: c.nome, porMil: c.d.igPorMil })) };
  }

  /* série para gráficos de evolução: últimos k períodos até "inicio" */
  function series(weeks, tipo, inicio, marca, pick, k = 8) {
    const out = []; let s = inicio;
    for (let i = 0; i < k; i++) { const row = weeks.find(r => r.tipo === tipo && r.inicio === s && r.marca === marca); out.unshift({ inicio: s, valor: row ? pick(norm(row), derive(norm(row))) : null }); s = prevStart(tipo, s); }
    return out;
  }
  /* ---------- fechamento do mês a partir das semanas ---------- */
  /* Campos que se somam entre semanas. Alcance não entra: pessoas se repetem de uma semana para a outra, então o
     alcance do mês só vale quando vem de uma linha de mês (a busca da Meta pelo mês inteiro). */
  const ADD = { vendas: ["vendas"], compras: ["compras"], c100n: ["c100n"], c100rs: ["c100rs"], ig: ["views", "interacoes", "cliques", "visitas", "seguidores"], fb: ["views", "interacoes", "cliques", "visitas", "seguidores"], ads: ["gasto", "impressoes", "resultados"] };
  const NOADD = { ig: ["alcance"], fb: ["alcance"], ads: ["alcance"] };
  function weeksInside(inicio) {            /* segundas-feiras cujas semanas cabem inteiras no mês */
    const per = period("mes", inicio), out = [];
    for (let d = mondayOf(parse(per.inicio)); iso(d) <= per.fim; d = addDays(d, 7)) if (iso(d) >= per.inicio && iso(addDays(d, 6)) <= per.fim) out.push(iso(d));
    return out;
  }
  /* devolve { row, origem, semanas, esperadas, fonte }: origem[campo] = "mes" | "semanas" | "parcial" (só parte das semanas tinha o dado) */
  function rollupMonth(weeks, inicio, marca) {
    const per = period("mes", inicio), esperadas = weeksInside(inicio);
    const own = weeks.find(r => r.tipo === "mes" && r.inicio === inicio && r.marca === marca);
    const mrow = own ? norm(own) : null;
    const wk = weeks.filter(r => r.tipo === "semana" && r.marca === marca && esperadas.includes(r.inicio)).map(r => ({ inicio: r.inicio, n: norm(r) }));
    const row = norm({}), origem = {};
    const take = (path, get, set, additive) => {
      const mv = mrow ? get(mrow) : null;
      if (mv != null) { set(mv); origem[path] = "mes"; return; }
      if (!additive) return;
      const vals = wk.map(w => get(w.n)).filter(v => v != null);
      if (!vals.length) return;
      set(sum(vals)); origem[path] = vals.length === esperadas.length ? "semanas" : "parcial";
    };
    ["vendas", "compras", "c100n", "c100rs"].forEach(f => take(f, r => r[f], v => { row[f] = v; }, true));
    ["ig", "fb", "ads"].forEach(g => {
      ADD[g].forEach(f => take(g + "." + f, r => r[g][f], v => { row[g][f] = v; }, true));
      NOADD[g].forEach(f => take(g + "." + f, r => r[g][f], v => { row[g][f] = v; }, false));
    });
    const vals = Object.values(origem), fonte = !vals.length ? "vazio" : vals.every(x => x === "mes") ? "mes" : vals.every(x => x === "semanas") ? "semanas" : "misto";
    if (mrow) { row.janela = mrow.janela; row.fonte = mrow.fonte; row.obs = mrow.obs; }
    return { row, origem, semanas: wk.map(w => w.inicio), esperadas, fonte, period: per };
  }
  /* mês e mês anterior lado a lado, com as derivadas de cada um */
  function monthPair(weeks, inicio, marca) {
    const cur = rollupMonth(weeks, inicio, marca), prev = rollupMonth(weeks, prevStart("mes", inicio), marca);
    return { cur, prev, d: derive(cur.row), dp: derive(prev.row), temPrev: hasData(prev.row) };
  }

  const periodsWith = (weeks, tipo) => [...new Set(weeks.filter(r => r.tipo === tipo).map(r => r.inicio))].sort();

  root.N7Analysis = { rollupMonth, monthPair, weeksInside, period, prevStart, nextStart, lastClosed, holidaysIn, norm, derive, sameWeekdays, analyze, series, periodsWith, hasData,
    fmt: { brl, int, dec, pctTxt, short, dm }, NAMES, DEFAULT_CLIENTS, SOCIAL, SOCIAL_NAME, ADS, ADS_NAME, PHARMA, DOW, POP, HOLIDAYS, mondayOf, parse, iso, addDays };
})(typeof window !== "undefined" ? window : globalThis);
