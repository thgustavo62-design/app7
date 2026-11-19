/* Central de Promoções: leitura do PDF "Analítico de vendas" (cupom a cupom) e da exportação de estoque (.xlsx).
   Funções puras (testadas em Node). A leitura do PDF em si (pdf.js) e do zip do .xlsx ficam em promo-files.js, só no navegador.
   Regras da rotina da agência: expressão ancorada à direita (descrição longa gruda no preço), conferir a taxa de leitura,
   descartar o dia da emissão quando o relatório foi tirado durante o expediente, tirar a TAXA DE ENTREGA das vendas de produto. */
(function (root) {
  const strip = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const brNum = s => { const n = Number(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  const pad = n => String(n).padStart(2, "0");
  const toIso = (d, m, y) => `${y}-${pad(m)}-${pad(d)}`;

  /* data hora | nº lanç. | usuário | barras | produto | preço un. | qtde | valor líquido | operação | empresa | cliente | caixa */
  const SALE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) +(\d+) +(\d+) +(\d+) +(.+?) +([\d.]*\d,\d{2}) +(-?\d+) +(-?[\d.]*\d,\d{2}) +(A VISTA|A PRAZO|[A-ZÇÃÕÉÍÚ./ ]+?) +(\d{9}) +(\d{8})(?: +(\d+))? *$/;
  const STARTS = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} +\d+ +\d+ +\d{6,}/;          /* parece linha de venda: serve de denominador da taxa de leitura */

  /* lines: texto do PDF, uma linha por item. Devolve { rows, stats, header } */
  function parseSalesLines(lines) {
    const rows = [], rejected = [], header = { periodo: null, emissao: null, paginas: null, empresa: "", cnpj: "" };
    let aposEmissao = 0;
    let candidates = 0;
    for (const raw of lines) {
      const line = String(raw).replace(/\s+/g, " ").trim();
      if (!line) continue;
      let m;
      if (!header.periodo && (m = line.match(/Periodo de: (\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/i))) header.periodo = { inicio: toIso(m[1], m[2], m[3]), fim: toIso(m[4], m[5], m[6]) };
      if (!header.emissao && (m = line.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) Pag\.: (\d+)\/(\d+)/))) { header.emissao = { data: toIso(m[1], m[2], m[3]), hora: `${m[4]}:${m[5]}` }; header.paginas = Number(m[7]); continue; }
      if (header.emissao && !header.cnpj && aposEmissao < 4) { aposEmissao++; if (/^\d{14}$/.test(line)) header.cnpj = line; else if (!header.empresa && /[A-Za-z]/.test(line) && !/^ANALITICO/i.test(line)) header.empresa = line; }
      if (!STARTS.test(line)) continue;
      candidates++;
      m = line.match(SALE);
      if (!m) { if (rejected.length < 20) rejected.push(line.slice(0, 160)); continue; }
      rows.push({ data: toIso(m[1], m[2], m[3]), hora: `${m[4]}:${m[5]}`, lanc: m[6], usu: m[7], barras: m[8], desc: m[9].trim(), preco: brNum(m[10]), qtd: Number(m[11]), valor: brNum(m[12]), oper: m[13].trim(), emp: m[14], cli: m[15], cx: m[16] || "" });
    }
    return { rows, header, stats: { candidatas: candidates, lidas: rows.length, rejeitadas: candidates - rows.length, taxa: candidates ? rows.length / candidates : null, exemplosRejeitados: rejected } };
  }

  const isTaxa = r => /^taxa de entrega/.test(strip(r.desc));
  /* linhas que não são produto de prateleira: taxa de entrega, "DIVERSOS" (venda sem cadastro) e códigos internos (cinco zeros à esquerda) */
  const isNaoProduto = r => isTaxa(r) || /^diversos/.test(strip(r.desc)) || /^0{5}/.test(r.barras);
  /* o dia da emissão fica de fora quando o relatório saiu antes do fim do expediente (o dia estaria cortado) */
  function partialDay(header, limit = "21:00") {
    const e = header && header.emissao, p = header && header.periodo;
    return e && p && p.fim === e.data && e.hora < limit ? e.data : null;
  }
  /* soma por produto e por dia: { barras: { desc, dias: { "AAAA-MM-DD": [qtd, valor] } } }. A taxa de entrega não é produto. */
  function aggregate(rows, { dropDay = null } = {}) {
    const out = {};
    rows.forEach(r => {
      if (isNaoProduto(r) || r.data === dropDay) return;
      const p = out[r.barras] || (out[r.barras] = { desc: r.desc, dias: {} });
      const d = p.dias[r.data] || (p.dias[r.data] = [0, 0]);
      d[0] += r.qtd; d[1] = Math.round((d[1] + r.valor) * 100) / 100;
    });
    return out;
  }
  /* primeiro e último dia que as linhas realmente cobrem (depois de descartar o dia parcial) */
  function coverage(rows, dropDay = null) {
    const ds = rows.filter(r => r.data !== dropDay).map(r => r.data).sort();
    return ds.length ? { inicio: ds[0], fim: ds[ds.length - 1] } : null;
  }

  /* ---------- exportação de estoque (.xlsx) ---------- */
  const COLS = {
    barras: ["barras", "codigo de barras", "cod barras", "ean"],
    desc: ["descricao", "produto", "descricao do produto"],
    estoque: ["estoque", "saldo", "qtde estoque"],
    fiscal: ["totalizador fiscal"],
    preco: ["preco de venda", "preco venda", "venda"],
    custo: ["ult prc entrada", "ult prc  entrada", "ultimo preco de entrada", "custo", "preco de custo"],
    calc: ["val cal totalizador"],
    promo: ["preco de promocao", "promocao"],
    aprox: ["valor aproximado"],
    entrada: ["ult entrada", "ultima entrada", "data ultima entrada"]
  };
  const colOf = (header, key) => { const hs = header.map(strip); for (const alias of COLS[key]) { const i = hs.indexOf(alias); if (i >= 0) return i; } return -1; };
  const cellNum = v => { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null; const s = String(v).trim(); if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); return brNum(s.replace(/[^\d.,-]/g, "")); };
  const serialToIso = n => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return d.toISOString().slice(0, 10); };
  const cellDate = v => {
    if (v == null || v === "") return "";
    if (typeof v === "number") return v > 20000 && v < 80000 ? serialToIso(v) : "";
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) return toIso(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if (/^\d+(\.\d+)?$/.test(s)) return cellDate(Number(s));
    return "";
  };
  const cellBarras = v => { if (v == null) return ""; if (typeof v === "number") return String(Math.round(v)); return String(v).replace(/\D/g, ""); };

  /* grid: matriz de linhas (primeira linha com o cabeçalho; procura o cabeçalho nas primeiras 15 linhas) */
  function parseStockGrid(grid) {
    let hi = -1;
    for (let i = 0; i < Math.min(15, grid.length); i++) { const h = (grid[i] || []).map(strip); if (h.includes("barras") || h.includes("codigo de barras")) { hi = i; break; } }
    if (hi < 0) return { items: [], erro: "Não achei o cabeçalho com a coluna Barras. Use a exportação de estoque do sistema." };
    const header = grid[hi], ix = Object.fromEntries(Object.keys(COLS).map(k => [k, colOf(header, k)]));
    const missing = ["barras", "desc", "estoque", "preco"].filter(k => ix[k] < 0);
    if (missing.length) return { items: [], erro: `Faltam colunas na exportação: ${missing.map(k => ({ barras: "Barras", desc: "Descrição", estoque: "Estoque", preco: "Preço de Venda" }[k])).join(", ")}.` };
    const items = [], seen = new Set(); let semCusto = 0, duplicados = 0, semBarras = 0;
    for (let i = hi + 1; i < grid.length; i++) {
      const r = grid[i] || [];
      if (!r.some(c => c != null && c !== "")) continue;
      const barras = cellBarras(r[ix.barras]);
      if (!barras || /^0+$/.test(barras)) { semBarras++; continue; }
      if (seen.has(barras)) { duplicados++; continue; }
      seen.add(barras);
      const custo = ix.custo >= 0 ? cellNum(r[ix.custo]) : null;
      if (!custo) semCusto++;
      items.push({ barras, desc: String(r[ix.desc] ?? "").trim(), estoque: cellNum(r[ix.estoque]) ?? 0, preco: cellNum(r[ix.preco]), custo: custo || null,
        promoSistema: ix.promo >= 0 ? cellNum(r[ix.promo]) : null, aprox: ix.aprox >= 0 ? cellNum(r[ix.aprox]) : null, ultEntrada: ix.entrada >= 0 ? cellDate(r[ix.entrada]) : "", fiscal: ix.fiscal >= 0 ? String(r[ix.fiscal] ?? "").trim() : "" });
    }
    return { items, stats: { linhas: items.length, semCusto, duplicados, semBarras, temCusto: ix.custo >= 0 }, erro: null };
  }

  root.N7PromoIngest = { parseSalesLines, partialDay, aggregate, coverage, parseStockGrid, brNum, strip, isTaxa, isNaoProduto };
})(typeof window !== "undefined" ? window : globalThis);
