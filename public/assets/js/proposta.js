/* Proposta comercial em PowerPoint, montada a partir da ficha do cliente novo (Comercial).
   O conteúdo sai de comercial.js (posicionamento e serviços recomendados). O que a ficha não tem vira lacuna avisada, nunca texto inventado:
   sem valor informado a proposta diz "a combinar" (não zera), e não promete resultado. */
(function (root) {
  const C = root.N7Comercial, SV = root.N7Services;
  const INK = "161615", MUTED = "5F5E5A", LINE = "D9D7D2", SOFT = "F4F3F0", ACC = "7C4DFF", FONT = "Arial";
  const BRL = v => C.BRL(v).replace(",00", "");
  const temMarcador = t => /\[[^\]]+\]/.test(String(t || ""));
  const hojeExt = d => (d || new Date()).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const defaultsDe = id => Object.fromEntries((C.PARAMS[id] || []).map(([k, , def]) => [k, def]));
  const txt = v => String(v == null ? "" : v).trim();

  /* o que entregamos, em linguagem de cliente (o contrato tem o texto jurídico) */
  function entregas(id) {
    const p = defaultsDe(id);
    switch (id) {
      case "redes": return [`${p.publicacoes} publicações por mês e ${p.stories} sequências de stories, num calendário que você aprova`, "Moderação básica de comentários e mensagens no horário comercial", "Relatório mensal de resultados"];
      case "trafego": return [`Até ${p.campanhas} campanhas ativas nas plataformas da Meta`, "Otimização contínua e acompanhamento do custo por resultado", `${p.reunioes} reunião mensal para olhar os números juntos`];
      case "criativos": return [`${p.pecas} peças por mês, nos formatos das redes sociais`, `Até ${p.revisoes} rodadas de ajuste por peça`];
      case "varejo": return ["Análise semanal de vendas, ticket e cestas, sempre comparando os mesmos dias da semana", `${p.relatorios} relatórios por mês com recomendações`, "Cada loja analisada separadamente"];
      case "promocoes": return ["Análise de estoque e giro de 60 e 90 dias", `${p.campanhas} campanhas de promoção por mês, com preço acima do piso de margem combinado`, "Briefing para a arte de cada campanha"];
      case "autoridade": return [`${p.posts} publicações e ${p.artigos} artigos ou análises por mês`, "Medição de regularidade, engajamento qualificado e convites gerados pelo conteúdo"];
      default: return [];
    }
  }

  /* conteúdo da proposta. o: { agencia, valores: {servico: reais/mês}, validadeDias, obs, hoje } */
  function model(f, o) {
    f = f || {}; o = o || {};
    const pos = C.posicionamento(f), ag = o.agencia || {};
    const escolhidos = (f.servicos || []).filter(s => SV.SERVICES[s]);
    const ids = escolhidos.length ? escolhidos : pos.servicos.filter(r => r.peso >= 2).map(r => r.servico).filter(s => SV.SERVICES[s]);
    const servicos = ids.map(id => {
      const r = pos.servicos.find(x => x.servico === id), v = Number((o.valores || {})[id]);
      return { id, nome: SV.SERVICES[id].name, motivo: r && r.motivos[0] ? r.motivos[0] : "serviço pedido por você", entregas: entregas(id), valor: v > 0 ? v : null };
    });
    const comValor = servicos.filter(s => s.valor != null);
    let total = null, origem = "";
    if (comValor.length) { total = comValor.reduce((t, s) => t + s.valor, 0); origem = comValor.length === servicos.length ? "soma" : "parcial"; }
    else if (C.valorOk(f)) { total = Number(f.valor_estimado); origem = "pacote"; }
    const ouvimos = [
      ["Objetivo", C.OBJETIVOS[f.objetivo]], ["O que o fez procurar a agência", f.dor], ["Quem quer atingir", f.publico], ["Por que escolher você", f.diferenciais],
      ["Concorrentes", f.concorrentes], ["Onde aparece hoje", f.canais], ["Como se apresenta hoje", pos.partida], ["Provas que já tem", (f.ficha || {}).prova_social], ["Prazo desejado", f.prazo]
    ].map(([rotulo, texto]) => ({ rotulo, texto: txt(texto) })).filter(x => x.texto);
    const regulado = pos.alertas.find(a => a.nivel === "regulado");
    const farmacia = /farm|drog/i.test(txt(f.segmento) + " " + txt(f.nome));          /* o Playbook de saúde nasceu de farmácia: canal "do farmacêutico" não serve para clínica */
    const canais = pos.canais.filter(c => !(f.setor === "saude" && !farmacia && /farmac/i.test(c)));
    const midia = servicos.some(s => s.id === "trafego") ? (Number(f.orcamento_midia) > 0 ? `Verba de mídia prevista: ${BRL(f.orcamento_midia)} por mês, paga diretamente às plataformas e fora dos valores acima.` : "A verba de mídia é paga diretamente às plataformas e não está nos valores acima; definimos o valor juntos.") : "";
    const faltando = [];
    if (!ouvimos.length) faltando.push("O que o cliente quer (objetivo, dor, público)");
    if (temMarcador(pos.proposta)) faltando.push("Público e diferencial, para a proposta de valor");
    if (!servicos.length) faltando.push("Serviços");
    if (total == null) faltando.push("Valores (a proposta vai dizer \"a combinar\")");
    else if (origem === "parcial") faltando.push("Valor de alguns serviços (a proposta vai dizer \"a combinar\" neles)");
    const dias = Math.max(1, Math.min(90, Math.round(Number(o.validadeDias) || 15)));
    const hoje = o.hoje ? new Date(o.hoje) : new Date(), ate = new Date(hoje.getTime() + dias * 86400000);
    return {
      cliente: txt(f.nome) || "Cliente", subtitulo: [txt(f.segmento) || "Marketing e posicionamento", txt(f.cidade)].filter(Boolean).join(" · "),
      data: hojeExt(hoje), validade: hojeExt(ate), dias,
      agencia: { nome: txt(ag.nome_fantasia) || txt(ag.razao_social) || "Nova7", email: txt(ag.email), telefone: txt(ag.telefone) },
      ouvimos, proposta: temMarcador(pos.proposta) ? "" : pos.proposta, tom: pos.tomPedido || pos.tomSetor, pilares: pos.pilares.slice(0, 4), canais: canais.slice(0, 4), territorio: pos.territorio,
      servicos, total, origem, midia, regulado: regulado ? "Por ser um setor com regras próprias de publicidade, a revisão técnica do responsável entra no prazo de cada peça. Combinamos juntos, no início, quem revisa e em quantos dias." : "", plano: pos.plano30, indicadores: pos.indicadores.map(i => ({ servico: SV.SERVICES[i.servico] ? SV.SERVICES[i.servico].short : i.servico, kpi: i.kpi })),
      obs: txt(o.obs), faltando
    };
  }

  function build(m, opts) {
    const PptxGenJS = (opts && opts.PptxGenJS) || root.PptxGenJS, pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE"; pres.title = `Proposta · ${m.cliente}`; pres.author = m.agencia.nome;
    let n = 0;
    const slide = (titulo, sub) => {
      const s = pres.addSlide(); n++; s.background = { color: "FFFFFF" };
      s.addText(titulo, { x: 0.6, y: 0.4, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0 });
      if (sub) s.addText(sub, { x: 0.6, y: 1.1, w: 12.1, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, margin: 0 });
      s.addText(`Proposta · ${m.cliente}`, { x: 0.6, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 });
      s.addText(String(n), { x: 12.1, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: "right", margin: 0 });
      return s;
    };
    const cell = (t, o) => ({ text: String(t), options: Object.assign({ fontFace: FONT, fontSize: 13, color: INK, valign: "middle" }, o) });
    const head = (t, o) => cell(t, Object.assign({ bold: true, color: "FFFFFF", fill: { color: INK } }, o));
    const bullets = arr => arr.map(t => ({ text: t, options: { bullet: true, breakLine: true } }));
    const bloco = (s, rotulo, linhas, x, y, w, h) => {
      s.addText(rotulo.toUpperCase(), { x, y, w, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: ACC, margin: 0 });
      s.addText(linhas, { x, y: y + 0.35, w, h: h - 0.35, fontFace: FONT, fontSize: 13, color: INK, margin: 0, valign: "top", paraSpaceAfter: 6 });
    };

    /* 1. capa */
    { const s = pres.addSlide(); n++; s.background = { color: INK };
      s.addText("Proposta comercial", { x: 0.8, y: 1.0, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 18, color: "D9D7D2", margin: 0 });
      s.addText(m.cliente, { x: 0.8, y: 1.7, w: 11.7, h: 1.4, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", margin: 0, valign: "top" });
      s.addText(m.subtitulo, { x: 0.8, y: 3.3, w: 11.7, h: 0.6, fontFace: FONT, fontSize: 22, color: "FFFFFF", margin: 0, valign: "top" });
      s.addText(`${m.data} · válida até ${m.validade}`, { x: 0.8, y: 5.6, w: 11.7, h: 0.4, fontFace: FONT, fontSize: 14, color: "C9B8FF", margin: 0 });
      s.addText(m.agencia.nome, { x: 0.8, y: 6.7, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, color: "A9A7A1", margin: 0 }); }

    /* 2. o que ouvimos */
    if (m.ouvimos.length) {
      const s = slide("O que ouvimos de você", "O ponto de partida: o que você nos contou sobre o negócio");
      s.addTable(m.ouvimos.slice(0, 8).map(x => [cell(x.rotulo, { bold: true, fill: { color: SOFT } }), cell(x.texto)]), { x: 0.6, y: 1.8, w: 12.1, colW: [3.4, 8.7], border: { type: "solid", pt: 0.5, color: LINE }, margin: [0.06, 0.1, 0.06, 0.1] });
    }

    /* 3. como vamos posicionar */
    if (m.proposta || m.pilares.length) {
      const s = slide("Como vamos posicionar o seu negócio", "Um rascunho de posicionamento para validarmos juntos na reunião");
      let y = 1.8;
      if (m.proposta) { s.addText(m.proposta, { x: 0.6, y, w: 12.1, h: 1.1, fontFace: FONT, fontSize: 18, bold: true, color: INK, margin: 0, valign: "top" }); y += 1.3; }
      bloco(s, "Tom de voz", [{ text: m.tom, options: {} }], 0.6, y, 5.9, 1.2);
      bloco(s, "Canais para priorizar", bullets(m.canais), 6.8, y, 5.9, 1.9);
      bloco(s, "Pilares de conteúdo", bullets(m.pilares), 0.6, y + 1.5, 5.9, 2.0);
      if (m.territorio.length) bloco(s, "Território", bullets(m.territorio), 6.8, y + 2.0, 5.9, 1.6);
    }

    /* 4. o que vamos entregar */
    if (m.servicos.length) {
      const s = slide("O que a " + m.agencia.nome + " vai entregar", "Cada serviço existe por um motivo ligado ao que você quer");
      const rows = [[head("Serviço"), head("Por que faz sentido"), head("O que entregamos")], ...m.servicos.slice(0, 6).map(sv => [cell(sv.nome, { bold: true }), cell(sv.motivo, { fontSize: 11, color: MUTED }), cell(sv.entregas.join("\n"), { fontSize: 11 })])];
      s.addTable(rows, { x: 0.6, y: 1.8, w: 12.1, colW: [2.6, 3.6, 5.9], border: { type: "solid", pt: 0.5, color: LINE }, margin: [0.06, 0.1, 0.06, 0.1] });
    }

    /* 5. primeiros 30 dias e medição */
    { const s = slide("Os primeiros 30 dias e como vamos medir", "Combinamos o que acompanhar; não prometemos resultado, medimos e ajustamos o plano");
      s.addText(bullets(m.plano), { x: 0.6, y: 1.8, w: 6.0, h: 4.6, fontFace: FONT, fontSize: 13, color: INK, margin: 0, valign: "top", paraSpaceAfter: 8 });
      bloco(s, "O que vamos medir", m.indicadores.length ? bullets(m.indicadores.map(i => `${i.servico}: ${i.kpi}`)) : [{ text: "Indicadores combinados na reunião de alinhamento.", options: {} }], 7.0, 1.8, 5.7, 3.6);
      if (m.regulado) s.addText(m.regulado, { x: 0.6, y: 6.1, w: 12.1, h: 0.8, fontFace: FONT, fontSize: 11, color: MUTED, margin: 0, valign: "top" }); }

    /* 6. investimento */
    { const s = slide("Investimento", `Valores mensais. Proposta válida por ${m.dias} dias, até ${m.validade}`);
      const rows = [[head("Serviço"), head("Valor mensal", { align: "right" })], ...m.servicos.map(sv => [cell(sv.nome), cell(sv.valor != null ? BRL(sv.valor) : "a combinar", { align: "right", color: sv.valor != null ? INK : MUTED })])];
      if (m.total != null) rows.push([cell(m.origem === "pacote" ? "Valor do pacote" : m.origem === "parcial" ? "Subtotal dos itens com valor" : "Total mensal", { bold: true, fill: { color: SOFT } }), cell(BRL(m.total), { bold: true, align: "right", fill: { color: SOFT } })]);
      else rows.push([cell("Total mensal", { bold: true, fill: { color: SOFT } }), cell("a combinar", { align: "right", color: MUTED, fill: { color: SOFT } })]);
      s.addTable(rows, { x: 0.6, y: 1.8, w: 8.0, colW: [5.4, 2.6], border: { type: "solid", pt: 0.5, color: LINE }, margin: [0.06, 0.1, 0.06, 0.1] });
      const notas = [m.midia, "Prazo, reajuste e forma de pagamento ficam no contrato.", m.obs].filter(Boolean);
      s.addText(bullets(notas), { x: 9.0, y: 1.8, w: 3.7, h: 4.6, fontFace: FONT, fontSize: 12, color: INK, margin: 0, valign: "top", paraSpaceAfter: 8 }); }

    /* 7. próximos passos */
    { const s = slide("Próximos passos", "Do sim ao primeiro mês no ar");
      s.addText(bullets(["Você valida o posicionamento e os serviços (ajustamos o que for preciso)", "Assinamos o contrato e combinamos acessos e quem aprova cada peça", "Primeira semana: diagnóstico dos perfis e dos concorrentes", "Primeira reunião de resultados ao fim do primeiro mês"]), { x: 0.6, y: 1.8, w: 12.1, h: 3.0, fontFace: FONT, fontSize: 18, color: INK, margin: 0, valign: "top", paraSpaceAfter: 12 });
      const contato = [m.agencia.nome, m.agencia.email, m.agencia.telefone].filter(Boolean).join(" · ");
      s.addText(contato, { x: 0.6, y: 5.6, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: ACC, margin: 0 }); }
    return pres;
  }

  const slugName = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("").replace(/[^A-Za-z0-9]/g, "");
  const fileName = (m, iso) => `Proposta_${slugName(m.cliente) || "Cliente"}_${iso || new Date().toISOString().slice(0, 10)}.pptx`;
  async function download(m) {
    const pres = build(m), name = fileName(m);
    const bytes = await (root.N7Report ? root.N7Report.pack(pres, root.JSZip) : pres.write({ outputType: "uint8array" }));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  }

  root.N7Proposta = { model, build, fileName, download, entregas };
})(typeof window !== "undefined" ? window : globalThis);
