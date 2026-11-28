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

  function pagina(c, a, H_) {
    const i = a && a.inteligencia;
    const topo = `<div class="head"><div><h2>Inteligência de vendas</h2><p class="src">O que está vendendo e o que não está, por produto e categoria, na última semana completa (segunda a domingo). Nenhum dado de cliente entra aqui. Vem da análise feita no computador da agência${a && a.publicadoEm ? `, publicada em ${esc(new Date(a.publicadoEm).toLocaleString("pt-BR"))}` : ""}.</p></div></div>`;
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

  async function carregar() {
    const r = await fetch("/api/leitura?acao=analise", { headers: { "x-n7": "1" }, credentials: "same-origin" });
    if (!r.ok) throw new Error("Não consegui carregar a análise (" + r.status + ").");
    return (await r.json()).lojas || {};
  }

  function render(view, Hh, sub) {
    const clientes = Hh.clients();
    if (!clientes.length) { view.innerHTML = `<p class="notice">Nenhuma farmácia com a Central de Promoções ativa.</p>`; return; }
    const atual = clientes.find(c => c.id === sub || c.key === sub) || clientes[0];
    view.innerHTML = `<div class="ar-abas" role="tablist" aria-label="Farmácia">${clientes.map(c => `<a class="btn" role="tab" href="#inteligencia/${esc(c.id)}" aria-pressed="${c.id === atual.id}">${esc(c.name)}</a>`).join("")}</div><div id="in-corpo"><p class="src">Carregando…</p></div>`;
    carregar().then(lojas => { const el = view.querySelector("#in-corpo"); if (el) el.innerHTML = pagina(atual, lojas[atual.key] || null, Hh); })
      .catch(e => { const el = view.querySelector("#in-corpo"); if (el) el.innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
  }

  root.N7Inteligencia = { render, pagina };
  if (typeof module !== "undefined" && module.exports) module.exports = root.N7Inteligencia;
})(typeof window !== "undefined" ? window : globalThis);
