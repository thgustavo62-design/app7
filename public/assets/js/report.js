/* Deck semanal em PowerPoint (6 a 8 slides), montado no navegador com PptxGenJS.
   Tabelas e gráficos são nativos (editáveis no PowerPoint). Slides sem conteúdo são omitidos; o que falta é dito, nunca zerado. */
(function (root) {
  const A = root.N7Analysis;
  const { brl, int, dec, pctTxt, short, dm } = A.fmt;
  const INK = "161615", MUTED = "5F5E5A", LINE = "D9D7D2", SOFT = "F4F3F0", RED = "EA010C";
  const DATA = { M: "C01020", F: "1A6BA4", C: "0C7A52", N: "77419A" };
  const CLASS_COLOR = { CORRIGIR: "C01020", TESTAR: "CE7016", ESCALAR: "0C7A52", MANTER: "0C7A52", INCONCLUSIVO: "5F5E5A" };
  const FONT = "Arial";
  const sem = v => (v == null ? "sem dado" : v);
  const pctOrNa = p => (p == null ? "sem base" : pctTxt(p));

  function headline(an) {
    const ph = an.clients.filter(c => c.farmacia), t = an.total;
    if (!t) return "Período com dados incompletos: veja o que faltou para fechar a análise.";
    const base = `As duas farmácias venderam ${brl(t.vendas)}`;
    const prev = ph.every(c => c.prev && c.prev.vendas != null) ? ph.reduce((s, c) => s + c.prev.vendas, 0) : null;
    if (prev != null) return `${base}, ${pctTxt((t.vendas / prev - 1) * 100)} sobre o período anterior.`;
    const md = ph.filter(c => c.mesmosDias && c.mesmosDias.pct != null);
    if (md.length) return `${base}. Nos mesmos dias da semana do período anterior: ${md.map(c => `${c.nome} ${pctTxt(c.mesmosDias.pct)}`).join(", ")}.`;
    return `${base}. Sem período anterior comparável registrado.`;
  }

  function build(an, opts = {}) {
    const PptxGenJS = opts.PptxGenJS || root.PptxGenJS;
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE";                                    /* 13,33 x 7,5 pol. */
    pres.title = `${an.period.tipo === "mes" ? "Mensal" : "Semanal"} Minas Farma e Farma e Farma · ${an.period.label}`;
    pres.author = "Nova7";
    const ph = an.clients.filter(c => c.farmacia);
    const tag = an.period.tipo === "mes" ? "Mensal" : "Semanal";
    let n = 0;
    const slide = (title, sub) => {
      const s = pres.addSlide(); n++;
      s.background = { color: "FFFFFF" };
      s.addText(title, { x: 0.6, y: 0.4, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0 });
      if (sub) s.addText(sub, { x: 0.6, y: 1.1, w: 12.1, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, margin: 0 });
      s.addText(`${tag} · ${an.period.label}`, { x: 0.6, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 });
      s.addText(String(n), { x: 12.1, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: "right", margin: 0 });
      return s;
    };
    const cell = (text, o = {}) => ({ text: String(text), options: Object.assign({ fontFace: FONT, fontSize: 12, color: INK, valign: "middle" }, o) });
    const head = (text, o = {}) => cell(text, Object.assign({ bold: true, color: "FFFFFF", fill: { color: INK } }, o));
    const bodyText = (s, lines, o) => s.addText(lines, Object.assign({ fontFace: FONT, fontSize: 14, color: INK, valign: "top", margin: 0, paraSpaceAfter: 8 }, o));
    const bullets = arr => arr.map(t => ({ text: t, options: { bullet: true, breakLine: true } }));

    /* 1. capa */
    {
      const s = pres.addSlide(); n++;
      s.background = { color: INK };
      s.addText(`${tag} · Minas Farma e Farma e Farma`, { x: 0.8, y: 1.0, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 18, color: "D9D7D2", margin: 0 });
      s.addText(an.period.label, { x: 0.8, y: 1.7, w: 11.7, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, valign: "top" });
      s.addText(headline(an), { x: 0.8, y: 3.4, w: 10.5, h: 1.6, fontFace: FONT, fontSize: 22, color: "FFFFFF", margin: 0, valign: "top" });
      const hol = an.holidays.filter(h => h.date >= an.period.inicio && h.date <= an.period.fim);
      if (hol.length) s.addText(`Atenção ao calendário: ${hol.map(h => `${dm(h.date)} ${h.name}`).join(" · ")}`, { x: 0.8, y: 5.4, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 14, color: "F5B7A8", margin: 0 });
      s.addText("Baixo Guandu-ES · Nova7", { x: 0.8, y: 6.7, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, color: "A9A7A1", margin: 0 });
    }

    /* 2. a semana em números, por filial */
    {
      const s = slide("A semana em números, por filial", `${an.period.label} contra ${an.prevPeriod.label}`);
      const row = (label, fn) => [cell(label, { bold: true }), ...ph.map(c => cell(fn(c), { align: "right" }))];
      const same = c => c.mesmosDias ? `${pctOrNa(c.mesmosDias.pct)} (${c.mesmosDias.dias.map(i => A.DOW[i]).join(", ")})` : "sem dado";
      const rows = [
        [head("Indicador"), ...ph.map(c => head(c.nome, { align: "right" }))],
        row("Vendas", c => c.row.vendas == null ? "sem dado" : brl(c.row.vendas)),
        row("Período anterior", c => c.prev && c.prev.vendas != null ? brl(c.prev.vendas) : "sem dado"),
        row("Variação direta", c => pctOrNa(c.cmp.vendas.pct)),
        row("Mesmos dias da semana", same),
        row("Compras (cupons)", c => c.row.compras == null ? "sem dado" : int(c.row.compras)),
        row("Ticket médio", c => c.d.ticket == null ? "sem dado" : brl(c.d.ticket)),
        row("Cestas acima de R$ 100", c => c.d.c100Compras == null ? "sem dado" : `${dec(c.d.c100Compras, 1)}% das compras`)
      ];
      s.addTable(rows, { x: 0.6, y: 1.7, w: 12.1, colW: [3.7, 4.2, 4.2], rowH: 0.5, border: { type: "solid", pt: 0.75, color: LINE } });
      const t = an.total;
      if (t) s.addText(`Total das duas lojas: ${brl(t.vendas)}${t.compras != null ? ` · ${int(t.compras)} compras · ticket ${brl(t.ticket)}` : ""}${t.shareMinas != null ? ` · Minas Farma ${dec(t.shareMinas, 1)}% das vendas` : ""}.`, { x: 0.6, y: 6.1, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: INK, margin: 0 });
      s.addText(`${an.gen && an.gen.promocao ? `Promoção do período: ${an.gen.promocao}. ` : ""}Comparação descritiva: não isola efeito de promoção, mídia ou calendário.`, { x: 0.6, y: 6.6, w: 12.1, h: 0.35, fontFace: FONT, fontSize: 12, color: MUTED, margin: 0 });
    }

    /* 3. dia a dia */
    const hasDays = an.period.tipo === "semana" && ph.some(c => c.row.dias.some(v => v != null));
    if (hasDays) {
      const hol = an.holidays.filter(h => h.date >= an.period.inicio && h.date <= an.period.fim);
      const s = slide("Dia a dia", hol.length ? "Feriado ou data atípica marcado com asterisco" : "Vendas por dia da semana");
      const cats = [...Array(7)].map((_, i) => { const d = A.iso(A.addDays(A.parse(an.period.inicio), i)); return `${A.DOW[i]} ${dm(d)}${A.HOLIDAYS[d] ? " *" : ""}`; });
      const data = ph.map(c => ({ name: c.nome, labels: cats, values: c.row.dias.map(v => (v == null ? null : v)) }));
      s.addChart(pres.charts.BAR, data, { x: 0.6, y: 1.6, w: 12.1, h: 4.4, barDir: "col", barGrouping: "clustered", chartColors: ph.map(c => DATA[c.marca]), showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 12, legendColor: INK, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12, catAxisLabelColor: INK, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11, valAxisLabelColor: MUTED, valAxisLabelFormatCode: "#,##0", valGridLine: { color: "E8E6E1", size: 0.5 }, catGridLine: { style: "none" }, showValue: false, dataLabelFontSize: 10 });
      const notes = [];
      if (hol.length) notes.push(`${hol.map(h => `${dm(h.date)} ${h.name}`).join(" · ")}: confira antes de concluir queda.`);
      const faltam = ph.filter(c => c.row.dias.some(v => v == null) && c.row.dias.some(v => v != null)).map(c => c.nome);
      if (faltam.length) notes.push(`Dias sem relatório em ${faltam.join(" e ")} ficam vazios no gráfico: falta de dado, não venda zero.`);
      if (notes.length) s.addText(notes.join(" "), { x: 0.6, y: 6.2, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 12, color: MUTED, margin: 0, valign: "top" });
    }

    /* 4. promoção e mídia paga */
    const adsClients = an.clients.filter(c => !c.vazio && Object.values(c.row.ads).some(v => v != null));
    const promo = an.gen && an.gen.promocao;
    if (adsClients.length) {
      const s = slide("Promoção e mídia paga", promo ? `Promoção do período: ${promo}` : "Promoção do período não informada");
      {
        const rows = [[head("Cliente"), ...["Gasto", "Alcance", "Impressões", "Resultados", "Frequência", "Custo por resultado"].map(t => head(t, { align: "right" }))],
          ...adsClients.map(c => [cell(c.nome, { bold: true }), cell(c.row.ads.gasto == null ? "sem dado" : brl(c.row.ads.gasto), { align: "right" }), cell(c.row.ads.alcance == null ? "sem dado" : int(c.row.ads.alcance), { align: "right" }), cell(c.row.ads.impressoes == null ? "sem dado" : int(c.row.ads.impressoes), { align: "right" }), cell(c.row.ads.resultados == null ? "sem dado" : int(c.row.ads.resultados), { align: "right" }), cell(c.d.adsFreq == null ? "sem dado" : dec(c.d.adsFreq, 2), { align: "right" }), cell(c.d.adsCusto == null ? "sem dado" : brl(c.d.adsCusto), { align: "right" })])];
        s.addTable(rows, { x: 0.6, y: 1.8, w: 12.1, colW: [2.8, 1.5, 1.6, 1.6, 1.5, 1.5, 1.6], rowH: 0.5, border: { type: "solid", pt: 0.75, color: LINE } });
        const sat = adsClients.filter(c => (c.d.adsFreq != null && c.d.adsFreq > 1.5) || (c.farmacia && c.row.ads.alcance != null && c.row.ads.alcance > A.POP)).map(c => c.nome);
        s.addText(sat.length ? `Saturação provável em ${sat.join(" e ")}: frequência acima de 1,5 ou alcance acima dos ${int(A.POP)} habitantes de Baixo Guandu. A verba passou a comprar repetição, não gente nova.` : `Sem sinal de saturação nos números informados (limite: frequência 1,5 e alcance de ${int(A.POP)} pessoas).`, { x: 0.6, y: 1.8 + 0.5 * (adsClients.length + 1) + 0.3, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 14, color: INK, margin: 0, valign: "top" });
      }
    }

    /* 5. Instagram e Facebook */
    const social = an.clients.filter(c => !c.vazio).flatMap(c => ["ig", "fb"].filter(ch => Object.values(c.row[ch]).some(v => v != null)).map(ch => ({ c, ch })));
    if (social.length) {
      const s = slide("Instagram e Facebook", "Visualizações, cliques e visitas não são vendas atribuídas");
      const fields = ["views", "interacoes", "cliques", "visitas", "seguidores"];
      const cellFor = (c, ch, f) => { const v = c.row[ch][f], p = c.cmp[ch][f].pct; return v == null ? "sem dado" : `${short(v)}${p == null ? "" : ` (${pctTxt(p)})`}`; };
      const rows = [[head("Perfil"), ...fields.map(f => head(A.SOCIAL_NAME[f], { align: "right" }))],
        ...social.map(({ c, ch }) => [cell(`${c.nome} · ${ch === "ig" ? "Instagram" : "Facebook"}`, { bold: true }), ...fields.map(f => cell(cellFor(c, ch, f), { align: "right" }))])];
      s.addTable(rows, { x: 0.6, y: 1.7, w: 12.1, colW: [3.1, 1.8, 1.8, 1.8, 1.8, 1.8], rowH: 0.48, border: { type: "solid", pt: 0.75, color: LINE } });
      const eff = an.eficiencia;
      if (eff.length) s.addText(`Interações por mil visualizações no Instagram: ${eff.map(e => `${e.nome} ${dec(e.porMil, 2)}`).join(" · ")}. É engajamento, não venda.`, { x: 0.6, y: 1.7 + 0.48 * (rows.length) + 0.3, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 13, color: INK, margin: 0, valign: "top" });
    }

    /* 6. o que funcionou e o que não funcionou */
    {
      const s = slide("O que funcionou e o que não funcionou", "Classificação e confiança de cada leitura");
      const sg = an.signals.slice(0, 6);
      if (sg.length) {
        const rows = [[head("Classe"), head("Onde"), head("Leitura"), head("Confiança")],
          ...sg.map(x => [cell(x.classe, { bold: true, color: CLASS_COLOR[x.classe] }), cell(`${x.nome} · ${x.canal}`), cell(x.titulo + ". " + x.texto, { fontSize: 11 }), cell(x.confianca)])];
        s.addTable(rows, { x: 0.6, y: 1.7, w: 12.1, colW: [1.5, 2.4, 6.9, 1.3], border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle", rowH: [0.4].concat(sg.map(() => 0.72)) });
        if (an.signals.length > sg.length) s.addText(`Mais ${an.signals.length - sg.length} leitura(s) menos prioritária(s) na tela Semana.`, { x: 0.6, y: 6.5, w: 12.1, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTED, margin: 0 });
      } else bodyText(s, "Nenhum sinal passou dos limites com os números informados. Com poucos dados isso não prova que está tudo bem.", { x: 0.6, y: 1.9, w: 12.1, h: 1 });
    }

    /* 7. o que não pôde ser respondido (e concorrência, se informada) */
    {
      const s = slide("O que não pôde ser respondido", "Falta de dado listada, nunca preenchida com zero");
      const gaps = an.missing.concat(["Margem, lift e margem incremental das promoções: exigem o PDF analítico por item e a exportação de estoque", "Campo de origem no cupom (Instagram, WhatsApp, balcão, indicação): sem ele nenhuma campanha é avaliada por venda"]);
      bodyText(s, bullets(gaps.slice(0, 9)), { x: 0.6, y: 1.7, w: 7.4, h: 5, fontSize: 13 });
      const conc = an.gen && an.gen.concorrencia;
      s.addText([{ text: "Concorrência", options: { bold: true, breakLine: true } }, { text: conc || "Não informada nesta semana.", options: {} }], { x: 8.4, y: 1.7, w: 4.3, h: 3, fontFace: FONT, fontSize: 13, color: INK, margin: 8, valign: "top", fill: { color: SOFT } });
    }

    /* 8. decisão da semana */
    {
      const s = slide("A decisão da semana", "As duas perguntas de toda segunda-feira");
      const g = an.gen || {};
      const rumo = g.rumo === "sim" ? "SIM" : g.rumo === "nao" ? "NÃO" : "ainda sem resposta";
      s.addText([{ text: "Se continuarmos fazendo exatamente o que fazemos hoje, estamos no melhor caminho possível?", options: { bold: true, breakLine: true } }, { text: rumo, options: { fontSize: 28, bold: true, color: g.rumo === "nao" ? CLASS_COLOR.CORRIGIR : g.rumo === "sim" ? CLASS_COLOR.MANTER : MUTED } }],
        { x: 0.6, y: 1.8, w: 12.1, h: 1.6, fontFace: FONT, fontSize: 16, color: INK, margin: 0, valign: "top" });
      s.addText([{ text: "Qual é a decisão comercial mais importante desta semana?", options: { bold: true, breakLine: true } }, { text: g.decisao || (an.suggestion ? `Sem decisão registrada. Ponto de partida pelos sinais: ${an.suggestion}` : "Sem decisão registrada."), options: { fontSize: 20 } }],
        { x: 0.6, y: 3.7, w: 12.1, h: 2.6, fontFace: FONT, fontSize: 16, color: INK, margin: 0, valign: "top" });
    }
    return pres;
  }

  const fileName = an => `${an.period.tipo === "mes" ? "Mensal" : "Semanal"}_MinasFarma_FarmaEFarma_${an.period.inicio}.pptx`;

  /* PptxGenJS grava entradas de pasta e sem compressão; refaz o zip sem elas (alguns serviços em nuvem recusam) */
  async function pack(pres, JSZip) {
    const raw = await pres.write({ outputType: "uint8array" });
    if (!JSZip) return raw;
    const src = await JSZip.loadAsync(raw), out = new JSZip();
    for (const n of Object.keys(src.files)) if (!src.files[n].dir) out.file(n, await src.files[n].async("uint8array"), { createFolders: false });
    return out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }
  async function download(an) {
    const pres = build(an), name = fileName(an);
    const bytes = await pack(pres, root.JSZip);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  }

  root.N7Report = { build, pack, download, fileName, headline };
})(typeof window !== "undefined" ? window : globalThis);
