/* Relatório mensal por cliente: o modelo (funções puras, testadas em Node) e o PowerPoint para enviar ao cliente.
   As seções seguem os serviços que a Nova7 presta ao cliente. O mês vem da linha de mês (busca da Meta pelo mês inteiro)
   ou da soma das semanas inteiras dentro do mês; o que falta aparece como "sem dado", nunca como zero. */
(function (root) {
  const A = root.N7Analysis, SV = root.N7Services;
  const { brl, int, dec, pctTxt, short, dm } = A.fmt;
  const COLOR_HEX = { "--c1": "2A78D6", "--c2": "EB6834", "--c3": "1BAF7A", "--c4": "C98A00", "--c5": "8B5CF6", "--c6": "D6336C", "--c7": "0E8FA3", "--c8": "5F6B7A" };
  const INK = "161615", MUTED = "5F5E5A", LINE = "D9D7D2", SOFT = "F4F3F0", FONT = "Arial";
  const pctOf = (cur, prev) => (cur == null || prev == null || !prev ? null : (cur / prev - 1) * 100);

  /* k: item de indicador. dir "up" = subir é bom; "down" = descer é bom (custo, frequência); null = neutro */
  const kpi = (label, cur, prev, fmt, { dir = "up", nota = "" } = {}) => ({ label, cur, prev, text: cur == null ? "sem dado" : fmt(cur), prevText: prev == null ? "sem dado" : fmt(prev), pct: pctOf(cur, prev), dir, nota });
  const tone = k => (k.pct == null || !k.dir || Math.abs(k.pct) < 0.5 ? "flat" : (k.pct >= 0) === (k.dir === "up") ? "good" : "bad");

  function model({ client, weeks, inicio, posts = [], today = new Date() }) {
    const pair = A.monthPair(weeks, inicio, client.key), per = A.period("mes", inicio), prevPer = A.period("mes", A.prevStart("mes", inicio));
    const { cur, prev, d, dp, temPrev } = pair, r = cur.row, pr = prev.row;
    const has = s => SV.has(client, s), avisos = [], sections = [];
    const partial = (path, nome) => { if (cur.origem[path] === "parcial") avisos.push(`${nome}: só parte das semanas do mês tinha este número informado, então o total do mês está incompleto.`); };
    const nota = path => (cur.origem[path] === "parcial" ? "parcial" : cur.origem[path] === "semanas" ? `soma de ${cur.semanas.length} semanas` : "");

    if (has("trafego")) {
      const k = [
        kpi("Investimento em anúncios", r.ads.gasto, pr.ads.gasto, brl, { dir: null, nota: nota("ads.gasto") }),
        kpi("Resultados (conversas iniciadas)", r.ads.resultados, pr.ads.resultados, int, { nota: nota("ads.resultados") }),
        kpi("Custo por resultado", d.adsCusto, dp.adsCusto, brl, { dir: "down" }),
        kpi("CPM (custo por mil impressões)", d.adsCpm, dp.adsCpm, brl, { dir: "down" }),
        kpi("Impressões", r.ads.impressoes, pr.ads.impressoes, int, { nota: nota("ads.impressoes") }),
        kpi("Alcance do mês", r.ads.alcance, pr.ads.alcance, int, { nota: r.ads.alcance == null ? "o alcance não se soma entre semanas" : "" }),
        kpi("Frequência", d.adsFreq, dp.adsFreq, v => dec(v, 2), { dir: "down", nota: d.adsFreq == null ? "precisa do alcance do mês" : "" })
      ];
      partial("ads.gasto", "Meta Ads");
      sections.push({ id: "trafego", nome: SV.SERVICES.trafego.name, kpis: k, vazio: !A.hasData(Object.assign(A.norm({}), { ads: r.ads })) });
    }
    if (has("redes")) {
      const k = [
        kpi("Instagram · visualizações", r.ig.views, pr.ig.views, int, { nota: nota("ig.views") }),
        kpi("Instagram · interações", r.ig.interacoes, pr.ig.interacoes, int, { nota: nota("ig.interacoes") }),
        kpi("Instagram · interações por mil views", d.igPorMil, dp.igPorMil, v => dec(v, 2)),
        kpi("Instagram · cliques no link", r.ig.cliques, pr.ig.cliques, int, { nota: nota("ig.cliques") }),
        kpi("Instagram · visitas ao perfil", r.ig.visitas, pr.ig.visitas, int, { nota: nota("ig.visitas") }),
        kpi("Instagram · novos seguidores", r.ig.seguidores, pr.ig.seguidores, int, { nota: nota("ig.seguidores") }),
        kpi("Facebook · visualizações", r.fb.views, pr.fb.views, int, { nota: nota("fb.views") }),
        kpi("Facebook · cliques no link", r.fb.cliques, pr.fb.cliques, int, { nota: nota("fb.cliques") })
      ];
      partial("ig.views", "Instagram");
      sections.push({ id: "redes", nome: SV.SERVICES.redes.name, kpis: k, vazio: !A.hasData(Object.assign(A.norm({}), { ig: r.ig, fb: r.fb })) });
    }
    if (has("varejo")) {
      const k = [
        kpi("Vendas", r.vendas, pr.vendas, brl, { nota: nota("vendas") }),
        kpi("Compras (cupons)", r.compras, pr.compras, int, { nota: nota("compras") }),
        kpi("Ticket médio", d.ticket, dp.ticket, brl),
        kpi("Cestas acima de R$ 100 (% das compras)", d.c100Compras, dp.c100Compras, v => dec(v, 1) + "%")
      ];
      partial("vendas", "Vendas");
      sections.push({ id: "varejo", nome: SV.SERVICES.varejo.name, kpis: k, vazio: r.vendas == null && r.compras == null });
    }
    /* entregas: pautas do calendário com data dentro do mês */
    if (has("redes") || has("criativos")) {
      const mine = posts.filter(p => p.b === client.key && p.date >= per.inicio && p.date <= per.fim);
      const inPrev = posts.filter(p => p.b === client.key && p.date >= prevPer.inicio && p.date <= prevPer.fim);
      const pub = mine.filter(p => p.status === "pub"), pubPrev = inPrev.filter(p => p.status === "pub");
      const reels = pub.filter(p => p.format === "Reels").length;
      const nome = has("redes") ? "Conteúdo publicado" : "Peças entregues";
      sections.push({
        id: "entregas", nome, vazio: !mine.length,
        kpis: [kpi(has("redes") ? "Publicações no mês" : "Peças publicadas no mês", pub.length, inPrev.length ? pubPrev.length : null, int), kpi("Planejadas para o mês", mine.length, inPrev.length ? inPrev.length : null, int),
          kpi("Reels publicados", reels, inPrev.length ? pubPrev.filter(p => p.format === "Reels").length : null, int), kpi("Carrosséis publicados", pub.filter(p => p.format === "Carrossel").length, inPrev.length ? pubPrev.filter(p => p.format === "Carrossel").length : null, int)],
        lista: pub.slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => ({ data: p.date, titulo: p.title, formato: p.format }))
      });
    }
    /* semana a semana dentro do mês (tráfego e varejo) */
    const porSemana = cur.esperadas.map(s => { const w = weeks.find(x => x.tipo === "semana" && x.marca === client.key && x.inicio === s); const n = w ? A.norm(w) : null; return { inicio: s, label: `${dm(s)}–${dm(A.period("semana", s).fim)}`, n, d: n ? A.derive(n) : null }; });
    if (cur.esperadas.length && cur.fonte !== "vazio") avisos.push(`O fechamento soma só semanas inteiras dentro do mês (${cur.esperadas.map(s => dm(s)).join(", ")}); a semana que começa num mês e termina no outro não entra.`);
    if (!temPrev) avisos.push(`Sem números de ${prevPer.label} para comparar.`);
    const ORDEM = { redes: 0, trafego: 1, varejo: 2, entregas: 3 };
    sections.sort((x, y) => ORDEM[x.id] - ORDEM[y.id]);
    const all = sections.filter(s => s.id !== "entregas").flatMap(s => s.kpis.map(k => Object.assign({ secao: s.nome }, k)));   /* contagens pequenas de pautas não viram destaque */
    const destaques = all.filter(k => k.pct != null && Math.abs(k.pct) >= 5 && k.cur != null && k.prev >= 20)         /* base pequena é inconclusiva */.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4)
      .map(k => ({ tone: tone(k), texto: `${k.label}: ${pctTxt(k.pct)} (${k.prevText} → ${k.text})` }));
    return { client: { key: client.key, name: client.name, color: client.color, services: client.services }, periodo: per, anterior: prevPer, fonte: cur.fonte, sections, porSemana, destaques, avisos, vazio: sections.every(s => s.vazio) };
  }

  /* ---------- PowerPoint para o cliente ---------- */
  function build(m, opts = {}) {
    const PptxGenJS = opts.PptxGenJS || root.PptxGenJS, obs = String(opts.obs || "").trim();
    const pres = new PptxGenJS(); pres.layout = "LAYOUT_WIDE"; pres.author = "Nova7"; pres.title = `Relatório de ${m.periodo.label} · ${m.client.name}`;
    const accent = COLOR_HEX[m.client.color] || "2A78D6";
    let n = 0;
    const slide = (title, sub) => {
      const s = pres.addSlide(); n++; s.background = { color: "FFFFFF" };
      s.addText(title, { x: 0.6, y: 0.4, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0 });
      if (sub) s.addText(sub, { x: 0.6, y: 1.1, w: 12.1, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, margin: 0 });
      s.addText(`${m.client.name} · ${m.periodo.label}`, { x: 0.6, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 });
      s.addText(String(n), { x: 12.1, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: "right", margin: 0 });
      return s;
    };
    const cell = (text, o = {}) => ({ text: String(text), options: Object.assign({ fontFace: FONT, fontSize: 12, color: INK, valign: "middle" }, o) });
    const head = (text, o = {}) => cell(text, Object.assign({ bold: true, color: "FFFFFF", fill: { color: INK } }, o));
    const border = { type: "solid", pt: 0.75, color: LINE };
    const deltaTxt = k => (k.pct == null ? "—" : Math.abs(k.pct) < 0.05 ? "0%" : pctTxt(k.pct));
    const mesNome = m.periodo.label.split(" de ")[0].replace(/^./, c => c.toUpperCase());
    const deltaColor = k => ({ good: "0C7A52", bad: "C01020", flat: MUTED })[tone(k)];
    const kpiTable = (s, kpis, y) => {
      const rows = [[head("Indicador"), head("Mês anterior", { align: "right" }), head(mesNome, { align: "right" }), head("Variação", { align: "right" })],
        ...kpis.map(k => [cell(k.label + (k.nota ? ` (${k.nota})` : "")), cell(k.prevText, { align: "right" }), cell(k.text, { align: "right", bold: true }), cell(deltaTxt(k), { align: "right", color: deltaColor(k) })])];
      s.addTable(rows, { x: 0.6, y, w: 12.1, colW: [5.6, 2.2, 2.2, 2.1], rowH: 0.38, border });
    };

    /* capa */
    {
      const s = pres.addSlide(); n++; s.background = { color: INK };
      s.addText("Relatório mensal", { x: 0.8, y: 1.1, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 18, color: "D9D7D2", margin: 0 });
      s.addText(m.client.name, { x: 0.8, y: 1.8, w: 11.7, h: 1.2, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, valign: "top" });
      s.addText(m.periodo.label, { x: 0.8, y: 3.2, w: 11.7, h: 0.7, fontFace: FONT, fontSize: 26, color: accent, margin: 0 });
      s.addText(SV.ORDER.filter(x => m.client.services.includes(x)).map(x => SV.SERVICES[x].name).join(" · "), { x: 0.8, y: 4.2, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 16, color: "D9D7D2", margin: 0 });
      s.addText("Nova7", { x: 0.8, y: 6.7, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, color: "A9A7A1", margin: 0 });
    }
    /* resumo */
    if (!m.vazio) {
      const s = slide("O mês em resumo", `${m.periodo.label} comparado a ${m.anterior.label}`);
      const ativos = m.sections.filter(x => !x.vazio), por = ativos.length > 3 ? 2 : 3;
      const main = ativos.map(x => ({ secao: x.nome, k: x.kpis.filter(k => k.cur != null).slice(0, por) })).filter(x => x.k.length);
      const rows = [[head("Serviço"), head("Indicador"), head("No mês", { align: "right" }), head("Variação", { align: "right" })], ...main.flatMap(x => x.k.map((k, i) => [cell(i ? "" : x.secao, { bold: true }), cell(k.label), cell(k.text, { align: "right", bold: true }), cell(deltaTxt(k), { align: "right", color: deltaColor(k) })]))];
      s.addTable(rows, { x: 0.6, y: 1.7, w: 12.1, colW: [3.2, 5.2, 1.9, 1.8], rowH: 0.38, border });
      if (m.destaques.length) s.addText(m.destaques.map(d => ({ text: d.texto, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.8 + 0.38 * rows.length + 0.2, w: 12.1, h: Math.max(0.8, 6.9 - (1.8 + 0.38 * rows.length + 0.2)), fontFace: FONT, fontSize: 13, color: INK, margin: 0, valign: "top", paraSpaceAfter: 6 });
    }
    /* uma lâmina por serviço com número */
    m.sections.filter(x => !x.vazio).forEach(sec => {
      const s = slide(sec.nome, `${m.periodo.label} comparado a ${m.anterior.label}`);
      const shown = sec.kpis.filter(k => k.cur != null || k.prev != null || (k.nota && sec.id === "trafego"));
      kpiTable(s, shown, 1.7);
      let y = 1.7 + 0.38 * (shown.length + 1) + 0.3;
      if (sec.id === "trafego") {
        const ws = m.porSemana.filter(w => w.n && w.n.ads.gasto != null);
        if (ws.length >= 2 && y <= 5.3) s.addChart(pres.charts.BAR, [{ name: "Investimento por semana", labels: ws.map(w => w.label), values: ws.map(w => w.n.ads.gasto) }], { x: 0.6, y, w: 12.1, h: Math.max(1.4, 6.9 - y), barDir: "col", chartColors: [accent], showLegend: false, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0", valAxisMinVal: 0, valGridLine: { color: "E8E6E1", size: 0.5 }, showTitle: false });
      }
      if (sec.id === "entregas" && sec.lista && sec.lista.length) {
        const rows = [[head("Data"), head("Peça"), head("Formato")], ...sec.lista.slice(0, Math.max(1, Math.floor((6.8 - y) / 0.34))).map(p => [cell(dm(p.data)), cell(p.titulo, { fontSize: 11 }), cell(p.formato)])];
        s.addTable(rows, { x: 0.6, y, w: 12.1, colW: [1.2, 9.0, 1.9], rowH: 0.32, border });
      }
    });
    /* próximos passos escritos por quem fez o relatório */
    if (obs) {
      const s = slide("Próximos passos", "O que a Nova7 sugere para o mês seguinte");
      s.addText(obs.split(/\n+/).map(t => ({ text: t.trim(), options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.8, w: 12.1, h: 4.6, fontFace: FONT, fontSize: 16, color: INK, margin: 0, valign: "top", paraSpaceAfter: 10 });
    }
    return pres;
  }
  const fileName = m => `Relatorio_${String(m.client.name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("").replace(/[^A-Za-z0-9]/g, "")}_${m.periodo.inicio.slice(0, 7)}.pptx`;
  async function download(m, opts) {
    const pres = build(m, opts), name = fileName(m);
    const bytes = await (root.N7Report ? root.N7Report.pack(pres, root.JSZip) : pres.write({ outputType: "uint8array" }));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  }
  root.N7Relatorio = { model, build, fileName, download, tone, COLOR_HEX };
})(typeof window !== "undefined" ? window : globalThis);
