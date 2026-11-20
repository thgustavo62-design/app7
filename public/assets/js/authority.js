/* Painel de autoridade: análise semanal de marca pessoal ou profissional (funções puras, testadas em Node).
   Mede o que importa para autoridade, não para venda: consistência de publicação, engajamento qualificado (comentários, compartilhamentos e
   salvamentos por mil pessoas alcançadas), crescimento de seguidores, visitas ao perfil e, no fim, o convite (contato, reunião, menção).
   Mesmas regras da análise semanal: campo sem número é "sem dado", nunca zero; base pequena é INCONCLUSIVO; alcance de canais diferentes
   nunca é somado (as mesmas pessoas se repetem); cada sinal tem classe e confiança. */
(function (root) {
  const A = root.N7Analysis;
  const CANAIS = { li: "LinkedIn", ig: "Instagram" };
  const FIELDS = { impressoes: "Impressões", alcance: "Alcance", interacoes: "Interações", comentarios: "Comentários", compartilhamentos: "Compartilhamentos", salvamentos: "Salvamentos", visitas: "Visitas ao perfil", segNovos: "Seguidores novos", segTotal: "Seguidores (total)", posts: "Publicações" };
  const GERAL = { contatos: "Contatos que vieram do conteúdo", reunioes: "Reuniões ou propostas", mencoes: "Convites e menções" };
  const ORDER = { CORRIGIR: 0, TESTAR: 1, ESCALAR: 2, MANTER: 3, INCONCLUSIVO: 4 };
  const BASE_MIN = 500, BASE_ALTA = 2000, META_POSTS = 3;
  const n = v => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const pct = (cur, prev) => (cur == null || prev == null || !prev ? null : (cur / prev - 1) * 100);
  const { int, dec, pctTxt } = A.fmt;

  const norm = r => Object.assign({ obs: (r && r.obs) || "" }, Object.fromEntries(Object.keys(FIELDS).concat(Object.keys(GERAL)).map(k => [k, n(r && r[k])])));
  const hasData = r => !!r && Object.keys(FIELDS).concat(Object.keys(GERAL)).some(k => r[k] != null);

  /* derivados de um canal numa semana */
  function derive(c) {
    if (!c) return {};
    const q = [c.comentarios, c.compartilhamentos, c.salvamentos].filter(v => v != null);
    const engQual = q.length ? sum(q) : null;
    return {
      engQual, engQualMil: engQual != null && c.alcance ? engQual / c.alcance * 1000 : null,
      interRate: c.interacoes != null && c.impressoes ? c.interacoes / c.impressoes * 100 : null,
      cresc: c.segNovos != null && c.segTotal ? c.segNovos / Math.max(1, c.segTotal - c.segNovos) * 100 : null,
      visitasMil: c.visitas != null && c.alcance ? c.visitas / c.alcance * 1000 : null
    };
  }

  const U_has = g => Object.keys(GERAL).some(k => g[k] != null);

  function analyze({ rows = [], client, inicio, metaPosts = META_POSTS }) {
    const per = A.period("semana", inicio), prevInicio = A.prevStart("semana", inicio), prev2Inicio = A.prevStart("semana", prevInicio);
    const pick = (ini, canal) => { const r = rows.find(x => x.tipo === "semana" && x.marca === client.key && x.inicio === ini && x.canal === canal); return r ? norm(r) : null; };
    const canais = Object.keys(CANAIS).map(ch => {
      const row = pick(inicio, ch), prev = pick(prevInicio, ch), prev2 = pick(prev2Inicio, ch);
      const ativo = rows.some(x => x.marca === client.key && x.canal === ch && hasData(norm(x)));
      return { canal: ch, nome: CANAIS[ch], ativo, row, prev, prev2, d: derive(row), dp: derive(prev), cmp: Object.fromEntries(Object.keys(FIELDS).map(k => [k, { atual: row ? row[k] : null, anterior: prev ? prev[k] : null, pct: pct(row && row[k], prev && prev[k]) }])) };
    });
    const geral = { row: pick(inicio, "geral"), prev: pick(prevInicio, "geral"), prev2: pick(prev2Inicio, "geral") };
    const postsOf = key => { const v = canais.map(c => (c[key] ? c[key].posts : null)).filter(x => x != null); return v.length ? sum(v) : null; };
    const posts = { atual: postsOf("row"), anterior: postsOf("prev"), anterior2: postsOf("prev2"), meta: metaPosts };
    const visitas = (() => { const v = canais.map(c => (c.row ? c.row.visitas : null)).filter(x => x != null); return v.length ? sum(v) : null; })();

    const signals = [], missing = [];
    const add = (canal, titulo, texto, tom, classe, confianca) => signals.push({ marca: client.key, nome: client.name, canal, titulo, texto, tom, classe, confianca });
    const conf = base => (base >= BASE_ALTA ? "ALTA" : "MÉDIA");

    /* consistência de publicação (a base da autoridade) */
    if (posts.atual != null) {
      if (posts.atual >= metaPosts) add("Consistência", "Publicação em dia", `${int(posts.atual)} publicação(ões) na semana, meta de ${int(metaPosts)}.`, "up", "MANTER", "ALTA");
      else {
        const abaixo = 1 + (posts.anterior != null && posts.anterior < metaPosts ? 1 + (posts.anterior2 != null && posts.anterior2 < metaPosts ? 1 : 0) : 0);
        if (abaixo >= 2) add("Consistência", `Publicação abaixo da meta há ${abaixo} semanas`, `${int(posts.atual)} publicação(ões) contra meta de ${int(metaPosts)}. Autoridade depende de regularidade: sem ritmo, o alcance e o convite caem juntos.`, "down", "CORRIGIR", "ALTA");
        else add("Consistência", "Publicação abaixo da meta nesta semana", `${int(posts.atual)} publicação(ões) contra meta de ${int(metaPosts)}. Vale reservar os horários fixos da semana que vem agora.`, "down", "TESTAR", "MÉDIA");
      }
    } else if (canais.some(c => c.ativo)) missing.push("Publicações da semana (quantas peças foram ao ar)");

    canais.forEach(c => {
      if (!c.row) { if (c.ativo) missing.push(`${c.nome}: números da semana ${per.label}`); return; }
      if (!c.prev) { missing.push(`${c.nome}: semana anterior sem números, sem base de comparação`); return; }
      /* alcance */
      const ca = c.cmp.alcance;
      if (ca.pct != null) {
        const base = Math.max(ca.atual, ca.anterior), postsTxt = posts.atual != null && posts.anterior != null && posts.anterior ? ` Publicações: ${int(posts.anterior)} → ${int(posts.atual)}.` : "";
        if (Math.abs(ca.pct) >= 25 || ca.pct >= 30) {
          if (base < BASE_MIN) add(c.nome, `Alcance variou ${pctTxt(ca.pct)}, mas a base é pequena`, `${int(ca.anterior)} → ${int(ca.atual)} pessoas: pouco volume para concluir.`, "flat", "INCONCLUSIVO", "BAIXA");
          else if (ca.pct <= -25) add(c.nome, `Alcance caiu ${pctTxt(ca.pct)}`, `${int(ca.anterior)} → ${int(ca.atual)} pessoas alcançadas.${postsTxt} Testar gancho e formato diferentes antes de concluir que o público perdeu interesse.`, "down", "TESTAR", conf(base));
          else if (ca.pct >= 30) add(c.nome, `Alcance subiu ${pctTxt(ca.pct)}`, `${int(ca.anterior)} → ${int(ca.atual)} pessoas alcançadas.${postsTxt} Identifique qual peça puxou e repita o formato.`, "up", "ESCALAR", conf(base));
        }
      }
      /* engajamento qualificado por mil alcançadas */
      const e = c.d.engQualMil, ep = c.dp.engQualMil, pe = pct(e, ep);
      if (pe != null && c.row.alcance >= BASE_MIN && c.prev.alcance >= BASE_MIN && (Math.abs(pe) >= 30)) {
        const vol = Math.max(c.d.engQual || 0, c.dp.engQual || 0);
        if (vol < 10) add(c.nome, `Engajamento qualificado variou ${pctTxt(pe)}, base pequena`, `Menos de 10 comentários, compartilhamentos e salvamentos somados: pouco volume para concluir.`, "flat", "INCONCLUSIVO", "BAIXA");
        else if (pe >= 30) add(c.nome, "Mais gente comentando, compartilhando e salvando", `${dec(ep, 1)} → ${dec(e, 1)} comentários, compartilhamentos e salvamentos por mil alcançadas (${pctTxt(pe)}). É o sinal de conteúdo de valor, mais forte que curtida.`, "up", "ESCALAR", conf(Math.min(c.row.alcance, c.prev.alcance)));
        else add(c.nome, "Engajamento qualificado caiu", `${dec(ep, 1)} → ${dec(e, 1)} por mil alcançadas (${pctTxt(pe)}). O conteúdo está chegando, mas gerando menos conversa e menos salvamento.`, "down", "TESTAR", conf(Math.min(c.row.alcance, c.prev.alcance)));
      }
      /* audiência: cresce mas engaja menos */
      const sn = c.cmp.segNovos;
      if (sn.pct != null && sn.pct >= 50 && Math.max(sn.atual, sn.anterior) >= 20 && pe != null && pe <= -20)
        add(c.nome, "Mais seguidores, menos engajamento", `Seguidores novos ${int(sn.anterior)} → ${int(sn.atual)} enquanto o engajamento qualificado caiu ${pctTxt(pe)}. Confira se a audiência nova é o público certo (decisores) ou só curiosos.`, "down", "TESTAR", "MÉDIA");
    });

    /* o convite: visitas ao perfil que não viram contato */
    const g = geral.row;
    if (g && U_has(g)) {
      const zero3 = [g.contatos, geral.prev && geral.prev.contatos, geral.prev2 && geral.prev2.contatos].every(v => v === 0);   /* só afirma com as 3 semanas informadas */
      if (zero3 && visitas != null && visitas >= 50) add("Convites", "Visitas ao perfil sem nenhum contato há 3 semanas", `${int(visitas)} visitas ao perfil na semana e nenhum contato que tenha vindo do conteúdo nas últimas 3 semanas. Revisar bio, destaque e chamada para ação: o perfil está sendo visto, mas não convida.`, "down", "CORRIGIR", "MÉDIA");
      const conv = (g.reunioes || 0) + (g.mencoes || 0), convp = geral.prev ? (geral.prev.reunioes || 0) + (geral.prev.mencoes || 0) : null;
      if (conv >= 1 && convp != null && conv > convp) add("Convites", "Convites e reuniões vindos do conteúdo", `${int(conv)} reunião(ões), proposta(s) ou convite(s) na semana (antes: ${int(convp)}). É a medida de verdade da autoridade.`, "up", "ESCALAR", "ALTA");
    } else if (canais.some(c => c.ativo)) missing.push("Contatos, reuniões e convites da semana (aba Geral)");

    signals.sort((a, b) => ORDER[a.classe] - ORDER[b.classe]);
    return { period: per, prevPeriod: A.period("semana", prevInicio), canais, geral, posts, visitas, signals, missing, vazio: !canais.some(c => c.row) && !g };
  }

  /* últimas k semanas de um indicador (para gráficos); lacuna = null */
  function series(rows, marca, canal, pick, inicio, k = 8) {
    const out = []; let s = inicio;
    for (let i = 0; i < k; i++) { const r = rows.find(x => x.tipo === "semana" && x.marca === marca && x.inicio === s && x.canal === canal); const v = r ? pick(norm(r), derive(norm(r))) : null; out.unshift({ inicio: s, valor: v }); s = A.prevStart("semana", s); }
    return out;
  }
  const periodsWith = (rows, marca) => [...new Set(rows.filter(r => r.marca === marca && hasData(norm(r))).map(r => r.inicio))].sort();

  root.N7Authority = { CANAIS, FIELDS, GERAL, META_POSTS, BASE_MIN, norm, hasData, derive, analyze, series, periodsWith };
})(typeof window !== "undefined" ? window : globalThis);
