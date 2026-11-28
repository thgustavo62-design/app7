/* Inteligência de vendas: uma página por farmácia com a última semana completa, só por PRODUTO e CATEGORIA (nunca cliente).
   Os números vêm da análise que o computador da agência publica (acao=analise → lojas[chave].inteligencia). Aqui só se mostra, nada é recalculado. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = c => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
  const pct = v => (v == null ? "—" : (v > 0 ? "+" : "") + Math.round(v * 100) + "%");
  const int = n => Number(n || 0).toLocaleString("pt-BR");
  const dm = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const H = h => String(h).padStart(2, "0") + "h";
  const tom = v => (v == null || Math.abs(v) < 0.02 ? "" : v > 0 ? "up" : "down");
  const TIPO = { defender: ["Defender", "down"], acelerar: ["Acelerar", "up"], produto: ["Produto", "down"], horario: ["Horário", ""], combo: ["Combo", ""] };

  const tabela = (cab, linhas, vazio) => linhas.length
    ? `<div class="table-wrap"><table><thead><tr>${cab.map(([n, num]) => `<th${num ? ' class="num"' : ""}>${esc(n)}</th>`).join("")}</tr></thead><tbody>${linhas.join("")}</tbody></table></div>`
    : `<p class="src">${esc(vazio)}</p>`;
  const celula = (v, num, tone) => `<td${num ? ' class="num"' : ""}>${tone ? `<span class="delta ${tone}">${v}</span>` : v}</td>`;
  const prod = p => `<td>${esc(p.desc)}<br><small class="src">${esc(p.categoria || "")}</small></td>`;

  const focoHtml = f => {
    const [rot, tone] = TIPO[f.tipo] || [f.tipo, ""];
    return `<article class="in-foco"><header><span class="in-tag ${tone}">${esc(rot)}</span>${f.rsEmJogoCentavos != null ? `<span class="in-rs" title="Diferença medida contra o esperado pelo ritmo da loja. Não é previsão.">${brl(f.rsEmJogoCentavos)} em jogo</span>` : ""}</header>
      <h4>${esc(f.titulo)}</h4><p>${esc(f.detalhe)}</p>
      <ul>${(f.evidencia || []).map(e => `<li>${esc(e)}</li>`).join("")}</ul><p class="in-acao"><b>Próximo passo:</b> ${esc(f.acao)}</p></article>`;
  };

  const maxAbs = l => Math.max(1, ...l.map(x => Math.max(x.vendasCentavos || 0, x.esperadoCentavos || 0)));
  const diasHtml = dias => { const mx = maxAbs(dias);
    return `<div class="in-dias" role="img" aria-label="Vendas por dia da semana contra o esperado">${dias.map(d => `<div class="in-dia"><div class="in-barras"><i class="r" style="height:${Math.round((d.vendasCentavos / mx) * 100)}%" title="${esc(brl(d.vendasCentavos))}"></i><i class="e" style="height:${Math.round((d.esperadoCentavos / mx) * 100)}%" title="Esperado ${esc(brl(d.esperadoCentavos))}"></i></div><b>${esc(d.dia)}</b><small>${dm(d.data)}</small><span class="${tom(d.var)}">${pct(d.var)}</span></div>`).join("")}</div>
      <p class="src">Barra cheia = vendas do dia; barra clara = média do mesmo dia da semana nas semanas anteriores.</p>`; };

  /* os dias já fechados da semana atual contra os mesmos dias das semanas anteriores */
  const andamentoHtml = e => {
    if (!e) return "";
    const tone = tom(e.total.var), linha = (p, cls) => `<tr>${prod({ desc: p.desc, categoria: p.categoria })}${celula(brl(p.vendeuCentavos), 1)}${celula(brl(p.difCentavos), 1, cls)}</tr>`;
    return `<div class="section-title"><h3>Semana em andamento</h3><span>${dm(e.semana.inicio)} a ${dm(e.semana.ate)} · ${e.semana.dias} dia(s) fechado(s)</span></div>
      <div class="in-andamento"><p><b>${brl(e.total.vendasCentavos)}</b> vendidos contra <b>${brl(e.total.esperadoCentavos)}</b> nos mesmos dias das ${e.base.n} semana(s) anteriores <span class="delta ${tone}">${pct(e.total.var)}</span></p>
      ${diasHtml(e.porDia)}</div>
      <div class="in-duas"><div><div class="section-title"><h3>Acima do ritmo</h3><span>nesta semana</span></div>${tabela([["Produto"], ["Vendeu", 1], ["R$ acima", 1]], e.acima.slice(0, 6).map(p => linha(p, "up")), "Nenhum produto firme acima do ritmo.")}</div>
      <div><div class="section-title"><h3>Abaixo do ritmo</h3><span>nesta semana</span></div>${tabela([["Produto"], ["Vendeu", 1], ["R$ abaixo", 1]], e.abaixo.slice(0, 6).map(p => linha(p, "down")), "Nenhum produto firme abaixo do ritmo.")}</div></div>
      <p class="src">${esc(e.nota)}</p>`;
  };

  function pagina(c, a, H_, opts) {
    const i = a && a.inteligencia;
    const topo0 = `<div class="head"><div><h2>Inteligência de vendas</h2><p class="src">O que está vendendo e o que não está, por produto e categoria, na última semana completa (segunda a domingo). Nenhum dado de cliente entra aqui. Vem da análise feita no computador da agência${a && a.publicadoEm ? `, publicada em ${esc(new Date(a.publicadoEm).toLocaleString("pt-BR"))}` : ""}.</p></div></div>`;
    const topo = opts && opts.semTopo ? "" : topo0;
    if (!a) return topo + `<div class="panel"><div class="panel-body"><p class="notice info">Ainda não há análise publicada de <b>${esc(c.name)}</b>. Ela é feita no computador da agência com os relatórios de vendas já conferidos. Envie os PDFs em <a href="#promocoes/importar">Promoções › Importar</a> e mantenha o agente ligado.</p></div></div>`;
    if (!i || !i.ok) return topo + `<div class="panel"><div class="panel-body"><p class="notice info">${esc((i && i.nota) || "A análise de " + c.name + " foi publicada antes da Inteligência de vendas existir. Ela aparece na próxima atualização do agente.")}</p></div></div>`;
    const t = i.total, m = i.movimento, kp = (rot, val, sub) => `<div class="kpi"><small>${esc(rot)}</small><strong>${val}</strong><em>${sub}</em></div>`;
    const conf = i.confianca === "alta" ? "" : `<p class="notice info">Confiança <b>${esc(i.confianca)}</b>: comparando com ${i.base.n} semana(s) anterior(es). Com 4 semanas anteriores a leitura fica firme; continue alimentando os relatórios.</p>`;
    const sc = i.qualidade && i.qualidade.semCategoriaEspecifica, avisoCat = sc > 0.4 ? `<p class="notice info"><b>${Math.round(sc * 100)}% das vendas da semana estão em "Outros" ou "Medicamentos (demais)"</b>, porque o relatório de vendas não traz a categoria do produto. Os focos de categoria usam só o restante. A leitura por produto não é afetada. Para melhorar, vamos cruzar com a categoria do estoque.</p>` : "";
    return topo + `<p class="src"><b>Semana de ${dm(i.semana.inicio)} a ${dm(i.semana.fim)}</b> comparada com ${i.base.n} semana(s) anterior(es).</p>${conf}${avisoCat}
      <div class="kpis k3">${kp("Vendas da semana", brl(t.semanaCentavos), `${pct(t.varAnterior)} contra a semana anterior`)}${kp("Média das anteriores", brl(t.baseMediaCentavos), `${pct(t.varBase)} a semana contra a média`)}${kp("Produtos vendidos", int(m.produtosVendidos), `ritmo da loja ${pct(m.tendenciaLoja)}`)}</div>
      ${andamentoHtml(i.andamento)}
      <div class="section-title"><h3>Foco da semana</h3><span>até 3, o que mudou antes do que é estrutural</span></div>
      <div class="in-focos">${(i.foco || []).length ? i.foco.map(focoHtml).join("") : `<p class="src">Nada fugiu do ritmo da loja o bastante para virar foco esta semana.</p>`}</div>
      <div class="section-title"><h3>O que mais vendeu</h3><span>em R$ na semana</span></div>
      ${tabela([["Produto"], ["Vendeu", 1], ["Qtd", 1], ["Contra o esperado", 1]], m.topValor.map(p => `<tr>${prod(p)}${celula(brl(p.semanaCentavos), 1)}${celula(int(p.qtd), 1)}${celula(pct(p.relativaALoja), 1, tom(p.relativaALoja))}</tr>`), "Sem vendas na semana.")}
      <div class="in-duas"><div><div class="section-title"><h3>Subiu</h3><span>acima do esperado</span></div>
        ${tabela([["Produto"], ["Vendeu", 1], ["R$ acima", 1]], m.subiram.map(p => `<tr>${prod(p)}${celula(brl(p.semanaCentavos), 1)}${celula(brl(p.difCentavos), 1, "up")}</tr>`), "Nenhum produto firme subiu o bastante.")}</div>
      <div><div class="section-title"><h3>Caiu</h3><span>abaixo do esperado</span></div>
        ${tabela([["Produto"], ["Vendeu", 1], ["R$ abaixo", 1]], m.cairam.map(p => `<tr>${prod(p)}${celula(brl(p.semanaCentavos), 1)}${celula(brl(p.difCentavos), 1, "down")}</tr>`), "Nenhum produto firme caiu o bastante.")}</div></div>
      <div class="in-duas"><div><div class="section-title"><h3>Novos na semana</h3><span>não vendiam antes</span></div>
        ${tabela([["Produto"], ["Vendeu", 1]], m.novos.map(p => `<tr>${prod(p)}${celula(brl(p.semanaCentavos), 1)}</tr>`), "Nenhum produto novo relevante.")}</div>
      <div><div class="section-title"><h3>Pararam de vender</h3><span>vendiam toda semana</span></div>
        ${tabela([["Produto"], ["Vendia por semana", 1]], m.pararam.map(p => `<tr>${prod(p)}${celula(brl(p.baseMediaCentavos), 1)}</tr>`), i.base.n >= 3 ? "Nenhum item firme parou." : "Precisa de 3 semanas anteriores para afirmar que um item parou.")}
        ${m.pararam.length ? `<p class="src">Pode ser falta de estoque, preço ou mudança de hábito. Confira o estoque antes de agir.</p>` : ""}</div></div>
      <div class="section-title"><h3>Categorias</h3><span>contra o ritmo da loja (${pct(m.tendenciaLoja)})</span></div>
      ${tabela([["Categoria"], ["Vendeu", 1], ["% das vendas", 1], ["Contra a loja", 1]], m.categorias.slice(0, 14).map(k => `<tr><td>${esc(k.categoria)}</td>${celula(brl(k.semanaCentavos), 1)}${celula(Math.round(k.share * 100) + "%", 1)}${celula(pct(k.relativaALoja), 1, tom(k.relativaALoja))}</tr>`), "Sem categorias.")}
      <div class="section-title"><h3>Dia a dia</h3><span>contra o mesmo dia da semana nas semanas anteriores</span></div>${diasHtml(i.dias)}
      <div class="in-duas"><div><div class="section-title"><h3>Horário</h3><span>pico e vale do expediente</span></div>${i.horario
        ? `<p><b>Pico:</b> ${H(i.horario.pico.de)} às ${H(i.horario.pico.ate)} (${Math.round(i.horario.pico.parte * 100)}% das vendas, ${brl(i.horario.pico.vendasCentavos)})<br><b>Vale:</b> ${H(i.horario.vale.de)} às ${H(i.horario.vale.ate)} (${Math.round(i.horario.vale.parte * 100)}%, ${brl(i.horario.vale.vendasCentavos)})</p>` : `<p class="src">Expediente curto demais para achar pico e vale.</p>`}</div>
      <div><div class="section-title"><h3>Compram junto</h3><span>mesmo cupom</span></div>${(i.cesta || []).length ? `<ul class="in-lista">${i.cesta.map(p => `<li>${esc(p.descA)} + ${esc(p.descB)} <small class="src">${int(p.juntos)} cupons</small></li>`).join("")}</ul>` : `<p class="src">Nenhum par se repetiu o bastante.</p>`}</div></div>
      <p class="src">${esc(i.nota)} “Em jogo” e “acima/abaixo” são diferenças medidas contra o esperado, não previsões.</p>`;
  }

  /* ---------- 2. DECIDIR: o plano de marketing da semana ---------- */
  const NIVEL = { liberado: ["Pode anunciar", "up"], cuidado: ["Com revisão farmacêutica", "warn"], nao: ["Não anunciar", "down"], verificar: ["Verificar categoria", "warn"] };
  const quandoTxt = it => (it.quando ? `${esc(it.formato)} · ${esc(it.quando.dia)} ${dm(it.quando.data)} às ${esc(it.quando.hora)}` : esc(it.formato || ""));
  const cartaoPlano = it => { const [rot, tone] = NIVEL[it.elegibilidade] || NIVEL.verificar;
    return `<article class="in-foco"><header><span class="in-tag ${tone}">${rot}</span>${it.difCentavos != null ? `<span class="in-rs" title="Diferença medida contra o esperado. Não é previsão.">${brl(Math.abs(it.difCentavos))}</span>` : ""}</header>
      <h4>${esc(it.titulo)}</h4><p>${esc(it.porque)}</p><ul>${(it.evidencia || []).map(e => `<li>${esc(e)}</li>`).join("")}</ul>${it.regra ? `<p class="in-regra">${esc(it.regra)}</p>` : ""}
      <p class="in-acao"><b>Sugestão:</b> ${quandoTxt(it)}${it.virarIdeia ? ` · <span class="in-ideia">vira ideia rascunho</span>` : ""}</p></article>`; };
  const grupo = (tit, sub, itens, vazio) => `<div class="section-title"><h3>${esc(tit)}</h3><span>${esc(sub)}</span></div>${itens.length ? `<div class="in-focos">${itens.map(cartaoPlano).join("")}</div>` : `<p class="src">${esc(vazio)}</p>`}`;
  function decidir(c, a) {
    const pl = a && a.plano;
    if (!a) return semAnalise(c);
    if (!pl || !pl.ok) return `<div class="panel"><div class="panel-body"><p class="notice info">${esc((pl && pl.nota) || "O plano de marketing de " + c.name + " aparece na próxima atualização do agente.")}</p></div></div>`;
    const q = pl.quando;
    return `<p class="src"><b>Plano de marketing da semana</b> · ${esc(pl.resumo)}</p><p class="notice info">${esc(pl.aviso)} Dia e hora são sugestões a partir das vendas (${esc(q.motivo)})</p>
      ${grupo("Anunciar", "produtos e categorias com tração real", pl.anunciar, "Nada com tração suficiente para anunciar esta semana.")}
      ${grupo("Defender", "o que está vendendo menos que o esperado", pl.defender, "Nada que precise de defesa esta semana.")}
      ${grupo("Combo e horário", "ações para vender mais por cupom e no vale do dia", [pl.combo, pl.horario].filter(Boolean), "Sem combo ou horário de vale claros.")}
      <div class="section-title"><h3>Já vende sozinho</h3><span>prioridade baixa de anúncio</span></div>
      ${tabela([["Produto"], ["Situação"]], (pl.naoPrecisa || []).map(p => `<tr>${prod({ desc: p.alvo, categoria: p.categoria })}<td>${esc(p.porque)}</td></tr>`), "Nenhum produto firme o bastante para dispensar anúncio.")}
      <div class="section-title"><h3>Mudou, mas não vira anúncio</h3><span>receita, fórmula infantil ou categoria não identificada</span></div>
      ${tabela([["Item"], ["Mudança", 1], ["Por quê"]], (pl.semAnuncio || []).map(x => `<tr><td>${esc(x.alvo)}<br><small class="src">${esc(x.categoria || "")}</small></td>${celula(brl(x.difCentavos), 1, x.difCentavos > 0 ? "up" : "down")}<td>${esc(x.motivo)}</td></tr>`), "Nada relevante fora das regras de publicidade.")}
      <p class="src">A demanda desses itens existe, mas o canal certo é conteúdo educativo sem citar marca ou o atendimento no balcão, sempre com o farmacêutico.</p>
      <div class="section-title"><h3>Dar saída</h3><span>estoque parado</span></div><p class="notice info">${esc(pl.promover.nota)}</p>`;
  }

  /* ---------- 3. CRIAR: as ideias rascunho que o plano gerou ---------- */
  const ETAPA = { nova: "Nova ideia", analise: "Em análise", aprovada: "Aprovada", agendada: "Agendada", descartada: "Descartada" };
  const doPlano = (Hh, c) => ((Hh && Hh.ideas && Hh.ideas()) || []).filter(i => i.b === c.key && /-plano-/.test(String(i.id))).sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));
  function criar(c, a, Hh) {
    const ideias = doPlano(Hh, c), pautas = ((Hh && Hh.custom && Hh.custom()) || []).filter(p => p.b === c.key);
    const lista = ideias.map(i => { const p = i.promoted && pautas.find(x => x.code === i.promoted);
      return `<article class="in-foco"><header><span class="in-tag ${i.stage === "aprovada" || i.stage === "agendada" ? "up" : i.stage === "descartada" ? "down" : ""}">${esc(ETAPA[i.stage] || i.stage)}</span><span class="in-rs">${esc(i.format)}</span></header><h4>${esc(i.title)}</h4><p>${String(i.note || "").split(" — ").map(esc).join("<br>")}</p>
        ${p ? `<p class="in-acao"><b>Pauta no calendário:</b> ${esc(p.code)} · ${dm(p.date)}${p.time ? " às " + esc(p.time) : ""}</p>` : `<p class="in-acao">Aprove no banco de ideias e escolha o horário para virar pauta no calendário.</p>`}</article>`; }).join("");
    return `<p class="src"><b>Rascunhos do plano</b> · o agente cria até 3 ideias por semana a partir da decisão do passo 2. Nada é publicado: você aprova ou descarta, e depois pede os ajustes pelo site.</p>
      <div class="in-acoes"><button type="button" class="btn primary" data-go="calendario" data-ideias="1">Abrir o banco de ideias</button> <button type="button" class="btn" data-go="artes">Aprovação de artes</button></div>
      ${lista ? `<div class="in-focos">${lista}</div>` : `<p class="notice info">Ainda não há ideias do plano para <b>${esc(c.name)}</b>. Elas aparecem aqui quando o agente analisar a loja e houver o que anunciar ou defender.</p>`}`;
  }

  /* ---------- 4. MEDIR: a peça do plano moveu a venda do que anunciou? ---------- */
  function medir(c, a, Hh) {
    const agendadas = doPlano(Hh, c).filter(i => i.promoted), pautas = ((Hh && Hh.custom && Hh.custom()) || []).filter(p => p.b === c.key);
    const linhas = agendadas.map(i => { const p = pautas.find(x => x.code === i.promoted); return `<tr><td>${esc(i.title)}</td><td>${p ? esc(p.code) + " · " + dm(p.date) : "—"}</td><td>${p && p.status === "pub" ? "Publicada: o resultado sai quando houver 7 dias de vendas depois" : "Aguardando publicação"}</td></tr>`; });
    return `<p class="src"><b>Medir</b> · compara as vendas do produto ou da categoria anunciada nos dias depois da peça com as mesmas semanas anteriores, e mostra se funcionou, ficou neutro ou não funcionou, com a confiança da conta.</p>
      <p class="notice info">Ainda não há peça do plano publicada com 7 dias de vendas depois. A medição aparece aqui assim que existir. É correlação com controle, não prova de causa.</p>
      ${linhas.length ? `<div class="table-wrap"><table><thead><tr><th>Peça</th><th>Pauta</th><th>Situação</th></tr></thead><tbody>${linhas.join("")}</tbody></table></div>` : `<p class="src">Nenhuma ideia do plano virou pauta ainda.</p>`}`;
  }

  const semAnalise = c => `<div class="panel"><div class="panel-body"><p class="notice info">Ainda não há análise publicada de <b>${esc(c.name)}</b>. Ela é feita no computador da agência com os relatórios de vendas já conferidos. Envie os PDFs em <a href="#promocoes/importar">Promoções › Importar</a> e mantenha o agente ligado.</p></div></div>`;

  async function carregar() {
    const r = await fetch("/api/leitura?acao=analise", { headers: { "x-n7": "1" }, credentials: "same-origin" });
    if (!r.ok) throw new Error("Não consegui carregar a análise (" + r.status + ").");
    return (await r.json()).lojas || {};
  }

  const PASSOS = [["ver", "1", "Ver", "o que aconteceu"], ["decidir", "2", "Decidir", "o que fazer"], ["criar", "3", "Criar", "rascunhos"], ["medir", "4", "Medir", "funcionou?"]];
  const memo = { passo: "ver" };
  function render(view, Hh, sub) {
    const clientes = Hh.clients();
    if (!clientes.length) { view.innerHTML = `<p class="notice">Nenhuma farmácia com a Central de Promoções ativa.</p>`; return; }
    const atual = clientes.find(c => c.id === sub || c.key === sub) || clientes[0]; let lojas = null;
    view.innerHTML = `<div class="head"><div><h2>Inteligência de vendas</h2><p class="src">Do número ao plano de marketing, em 4 passos: ver o que vendeu, decidir o que fazer, criar os rascunhos e medir se funcionou. Só produto e categoria: nenhum dado de cliente entra aqui.</p></div></div><div class="ar-abas" role="tablist" aria-label="Farmácia">${clientes.map(c => `<a class="btn" role="tab" href="#inteligencia/${esc(c.id)}" aria-pressed="${c.id === atual.id}">${esc(c.name)}</a>`).join("")}</div>
      <div class="in-passos" role="tablist" aria-label="Passo">${PASSOS.map(([id, n, nome, sub2]) => `<button type="button" class="btn" role="tab" data-passo="${id}" aria-pressed="${memo.passo === id}"><b>${n}</b> ${nome}<small>${sub2}</small></button>`).join("")}</div><div id="in-corpo"><p class="src">Carregando…</p></div>`;
    const corpo = () => view.querySelector("#in-corpo");
    const pinta = () => { const el = corpo(); if (!el || lojas == null) return; const a = lojas[atual.key] || null;
      el.innerHTML = memo.passo === "decidir" ? decidir(atual, a) : memo.passo === "criar" ? criar(atual, a, Hh) : memo.passo === "medir" ? medir(atual, a, Hh) : pagina(atual, a, Hh, { semTopo: true }); };
    view.querySelectorAll("[data-passo]").forEach(b => { b.onclick = () => { memo.passo = b.dataset.passo; view.querySelectorAll("[data-passo]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); pinta(); }; });
    view.onclick = e => { const g = e.target.closest && e.target.closest("[data-go]"); if (g && Hh.go) Hh.go(g.dataset.go, g.dataset.ideias ? atual.key : undefined, !!g.dataset.ideias); };
    carregar().then(l => { lojas = l; pinta(); }).catch(e => { const el = corpo(); if (el) el.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
  }

  root.N7Inteligencia = { render, pagina, decidir, criar, medir };
  if (typeof module !== "undefined" && module.exports) module.exports = root.N7Inteligencia;
})(typeof window !== "undefined" ? window : globalThis);
