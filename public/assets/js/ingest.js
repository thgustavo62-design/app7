/* Leitura de tabelas coladas: Meta Ads (Gerenciador de Anúncios) e Meta Business Suite (Instagram e Facebook).
   Aceita tabela com cabeçalho (CSV, ponto e vírgula ou tabulação, como sai do Excel e da tela), série diária
   (soma só os dias do período) e linhas soltas do tipo "Visualizações 119,6 mil". Funções puras, testadas em Node. */
(function (root) {
  const strip = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();

  /* "1.234,56", "1,234.56", "119,6 mil", "1,2 mi", "R$ 49.311,51", "-18,2%" -> número, ou null */
  function num(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().toLowerCase().replace(/^\+\s*/, "");
    if (!s || /^(-|—|n\/?d|sem dado)$/.test(s)) return null;
    const mult = /\b(mil|k)\b\s*$/.test(s) ? 1e3 : /\b(mi|mm|m)\b\s*$/.test(s) ? 1e6 : 1;
    s = s.replace(/\b(mil|mi|mm|k|m)\b\s*$/, "").replace(/r\$|brl|%|\s/g, "");
    if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    const neg = s.startsWith("-"); s = s.replace(/^-/, "");
    const d = s.lastIndexOf("."), c = s.lastIndexOf(",");
    if (d >= 0 && c >= 0) s = d > c ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");   /* o último separador é o decimal */
    else if (c >= 0) s = s.replace(/\./g, "").replace(",", ".");                                        /* só vírgula: decimal (pt-BR) */
    else if (d >= 0) s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;                     /* só ponto: milhar se agrupa de 3 */
    const n = Number(s);
    return isFinite(n) ? (neg ? -n : n) * mult : null;
  }

  /* separa em linhas e colunas, respeitando aspas */
  function table(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (!lines.length) return [];
    const sample = lines.slice(0, 5).join("\n");
    const count = ch => (sample.match(new RegExp(ch === "\t" ? "\t" : "\\" + ch, "g")) || []).length;
    const delim = count("\t") ? "\t" : count(";") > count(",") ? ";" : count(",") ? "," : null;
    if (!delim) return lines.map(l => [l.trim()]);
    return lines.map(l => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === delim && !q) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim()); return out;
    });
  }

  /* dicionários de cabeçalho (sem acento, minúsculos) */
  const DICT = {
    ads: {
      gasto: ["valor usado", "valor gasto", "amount spent", "gasto", "investimento", "custo total"],
      alcance: ["alcance", "reach"],
      impressoes: ["impressoes", "impressions"],
      resultados: ["resultados", "results", "conversas iniciadas", "leads"],
      _nome: ["nome da campanha", "campaign name", "campanha", "nome do conjunto de anuncios", "nome do anuncio"],
      _data: ["inicio dos relatorios", "dia", "data", "date", "day"]
    },
    social: {
      views: ["visualizacoes", "views", "impressoes", "impressions"],
      alcance: ["alcance", "visualizadores", "reach", "viewers"],
      interacoes: ["interacoes", "interacoes com o conteudo", "content interactions", "interactions", "engajamento"],
      cliques: ["cliques no link", "link clicks", "cliques"],
      visitas: ["visitas ao perfil", "visitas a pagina", "visitas", "profile visits", "page visits"],
      seguidores: ["novos seguidores", "seguidores", "follows", "followers", "seguidores novos"],
      _data: ["data", "date", "dia", "day"]
    }
  };
  const ADDITIVE = { ads: ["gasto", "impressoes", "resultados"], social: ["views", "interacoes", "cliques", "visitas", "seguidores"] };

  function fieldOf(header, kind) {
    const h = strip(header); if (!h) return null;
    const dict = DICT[kind];
    for (const f of Object.keys(dict)) if (dict[f].some(k => h === k)) return f;
    for (const f of Object.keys(dict)) if (dict[f].some(k => h.startsWith(k + " ") || h.includes(" " + k + " ") || h.endsWith(" " + k))) return f;   /* "Valor usado (BRL)" */
    return null;
  }
  /* datas: AAAA-MM-DD, DD/MM/AAAA, DD/MM */
  function dateOf(s, year) {
    const t = String(s || "").trim(); let m;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})$/))) return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

  /* Resultado: { mode, fields:{campo:número}, notes:[], columns:[{header,field}], used, ignored } */
  function parse(text, kind, { inicio, fim } = {}) {
    const rows = table(text), out = { mode: "vazio", fields: {}, notes: [], columns: [], used: 0, ignored: 0 };
    if (!rows.length) return out;
    const year = inicio ? Number(inicio.slice(0, 4)) : new Date().getFullYear();
    const head = rows[0].map(h => fieldOf(h, kind));
    const known = head.filter(Boolean).length;

    if (rows.length >= 2 && known >= 1 && rows[0].every(c => num(c) === null)) {   /* tabela com cabeçalho (cabeçalho não tem número) */
      out.columns = rows[0].map((h, i) => ({ header: h, field: head[i] }));
      const iData = head.indexOf("_data"), iNome = head.indexOf("_nome");
      let body = rows.slice(1).filter(r => r.some(c => c !== ""));
      const isTotal = r => /total/.test(strip(iNome >= 0 ? r[iNome] : r[0])) || (kind === "ads" && iNome >= 0 && r[iNome] === "");
      if (iData >= 0) {
        out.mode = "diario";
        const inside = body.filter(r => { const d = dateOf(r[iData], year); return d && (!inicio || d >= inicio) && (!fim || d <= fim); });
        out.ignored = body.length - inside.length; body = inside;
        if (!body.length) { out.notes.push("Nenhuma linha tem data dentro do período escolhido."); return out; }
      } else {
        const totals = body.filter(isTotal);
        if (totals.length && body.length > totals.length) { body = totals; out.notes.push("Usei a linha de total da exportação (o alcance do total não repete pessoas)."); }
        out.mode = "tabela";
      }
      out.used = body.length;
      head.forEach((f, i) => {
        if (!f || f.startsWith("_")) return;
        const vals = body.map(r => num(r[i])).filter(v => v !== null);
        if (!vals.length) return;
        if (ADDITIVE[kind].includes(f)) out.fields[f] = vals.reduce((a, b) => a + b, 0);
        else if (body.length === 1) out.fields[f] = vals[0];
        else if (iData >= 0) out.notes.push(`${rows[0][i]}: o alcance diário não se soma (repete pessoas). Digite o alcance do período.`);
        else { out.fields[f] = vals.reduce((a, b) => a + b, 0); out.notes.push(`${rows[0][i]}: somei as linhas; pode repetir pessoas entre campanhas.`); }
      });
      rows[0].forEach((h, i) => { if (!head[i] && h) out.notes.push(`Coluna ignorada: "${h}".`); });
      return out;
    }

    out.mode = "linhas";                                        /* "Visualizações 119,6 mil -18,2%" */
    rows.forEach(r => {
      const line = r.join(" ").trim(); if (!line) return;
      const m = line.match(/^(.*?)[\s:]+([+-]?\s*(?:R\$\s*)?\d[\d.,]*(?:\s*(?:mil|mi|mm|k)\b)?)/i);
      if (!m) { out.ignored++; return; }
      const f = fieldOf(m[1], kind), v = num(m[2]);
      if (f && !f.startsWith("_") && v !== null && !(f in out.fields)) { out.fields[f] = v; out.used++; } else out.ignored++;
    });
    if (!out.used) out.notes.push("Não reconheci nenhum campo. Cole a tabela com a linha de cabeçalho, ou linhas como \"Visualizações 119,6 mil\".");
    return out;
  }

  root.N7Ingest = { num, table, parse, fieldOf, dateOf, strip };
})(typeof window !== "undefined" ? window : globalThis);
