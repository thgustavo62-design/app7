/* Central de Promoções > Análise completa: mostra a análise profunda de vendas de uma loja (cupom a cupom), feita no computador da agência
   (PowerShell) com os relatórios conferidos ao centavo e publicada no site. Aqui só se desenha: nenhuma conta nova. Valores em centavos. */
(function (root) {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const R = c => (c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const P = (v, d = 0) => (v == null || !isFinite(v) ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%");
  const N = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
  const sgn = v => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%");
  const dm = iso => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
  const H2 = h => String(h).padStart(2, "0") + "h";
  const tab = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th${h[1] ? ` class="${h[1]}"` : ""}>${h[0]}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const bar = (v, max, cor) => `<span class="av-bar"><i style="width:${max ? Math.max(2, Math.round(v / max * 100)) : 0}%;${cor ? "background:" + cor : ""}"></i></span>`;
  const spark = serie => { if (!serie || serie.length < 2) return ""; const mx = Math.max(...serie, 1), w = 90, h = 22, pts = serie.map((v, i) => `${Math.round(i / (serie.length - 1) * w)},${Math.round(h - v / mx * (h - 2) - 1)}`).join(" "); return `<svg class="av-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${pts}"/></svg>`; };

  function foco(a) {
    const f = a.foco || {}, col = (tit, cls, l, linha) => `<div class="av-foco ${cls}"><h4>${tit}</h4>${l && l.length ? l.map(x => `<p><b>${esc(x.categoria)}</b><small>${linha(x)}</small></p>`).join("") : `<p class="src">nenhuma categoria agora</p>`}</div>`;
    return `<div class="av-focos">${col("Defender", "def", f.defender, x => `${P(x.share, 1)} das vendas · ${sgn(x.relativa)} vs a loja`)}${col("Acelerar", "ace", f.acelerar, x => `${P(x.share, 1)} das vendas · ${sgn(x.relativa)} vs a loja`)}${col("Reanimar", "rea", f.reanimar, x => `${P(x.share, 1)} das vendas · ${sgn(x.relativa)} vs a loja`)}${col("Ativar (margem alta)", "ati", f.ativar, x => `${P(x.share, 1)} das vendas · margem ${P(x.margem)}`)}</div><p class="src">${esc(f.nota || "")}</p>`;
  }
  function categorias(a) {
    const mo = a.momento; if (!mo) return "";
    const mk = {}; ((a.margem && a.margem.margemPorCategoria) || []).forEach(m => { mk[m.categoria] = m.margem; });
    return tab([["Categoria"], ["Últimas semanas", "num"], ["Participação", "num"], ["Variação", "num"], ["vs loja", "num"], ["Margem", "num"], ["Tendência"]], mo.categorias.map(c => `<tr><td>${esc(c.categoria)}</td><td class="num">${R(c.recentesCentavos)}</td><td class="num">${P(c.share, 1)}</td><td class="num">${sgn(c.variacao)}</td><td class="num"><b class="${c.relativaAoTotal > 0.05 ? "av-up" : c.relativaAoTotal < -0.05 ? "av-down" : ""}">${sgn(c.relativaAoTotal)}</b></td><td class="num">${mk[c.categoria] == null ? "—" : P(mk[c.categoria])}</td><td>${spark(c.serie)}</td></tr>`));
  }
  function mapa(a) {
    const m = a.mapaCalor; if (!m) return ""; let mx = 1; m.linhas.forEach(l => l.vendasCentavos.forEach(v => { if (v > mx) mx = v; }));
    return `<div class="table-wrap"><table class="av-hm"><thead><tr><th></th>${m.horas.map(h => `<th class="num">${H2(h)}</th>`).join("")}</tr></thead><tbody>${m.linhas.map(l => `<tr><th>${l.dia}</th>${l.vendasCentavos.map((v, i) => `<td class="num" title="${R(v)} · ${l.cupons[i]} cupons" style="background:rgba(124,77,255,${(v / mx * 0.85).toFixed(2)});color:${v / mx > 0.55 ? "#fff" : "inherit"}">${v ? Math.round(v / 100000) : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="src">Mapa de calor: vendas por dia da semana e hora, em R$ mil (passe o mouse para ver cupons).</p>`;
  }
  function horas(a) { const mx = Math.max(...a.horas.map(h => h.vendasCentavos), 1); return tab([["Hora"], ["Vendas", "num"], ["Cupons", "num"], ["Ticket", "num"], ["Parte", "num"], [""]], a.horas.map(h => `<tr><td>${H2(h.hora)}</td><td class="num">${R(h.vendasCentavos)}</td><td class="num">${N(h.cupons)}</td><td class="num">${R(h.ticketCentavos)}</td><td class="num">${P(h.parte, 1)}</td><td>${bar(h.vendasCentavos, mx)}</td></tr>`)); }
  /* análise de UMA semana (segunda a domingo), comparada com a anterior */
  function semanaDetalhe(w) {
    const v = x => (x == null || !isFinite(x) ? "" : ` <b class="${x > 0.02 ? "av-up" : x < -0.02 ? "av-down" : ""}">${sgn(x)}</b>`), vs = w.vsAnterior || {};
    const mx = Math.max(...w.porDia.map(d => d.vendasCentavos), 1);
    return `<div class="av-sem"><p><b>${dm(w.inicio)} a ${dm(w.fim)}</b> · ${w.completa ? "semana completa" : `parcial (${w.diasCobertos} dias)`} · <b>${R(w.vendasCentavos)}</b> · ${N(w.cupons)} cupons · ticket ${R(w.ticketCentavos)} · ${w.itensPorCupom.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} itens por cupom</p>
      ${w.vsAnterior ? `<p class="src">Contra a semana anterior: vendas${v(vs.vendas)} · cupons${v(vs.cupons)} · ticket${v(vs.ticket)} · itens por cupom${v(vs.itens)}</p>` : `<p class="src">Sem semana anterior completa para comparar.</p>`}
      <div class="grid g2"><div><h4>Dia a dia</h4>${tab([["Dia"], ["Vendas", "num"], ["Cupons", "num"], [""]], w.porDia.map(d => `<tr><td>${d.dia}</td><td class="num">${R(d.vendasCentavos)}</td><td class="num">${N(d.cupons)}</td><td>${bar(d.vendasCentavos, mx)}</td></tr>`))}</div>
      <div><h4>Horário</h4><p>Pico ${w.melhorJanela3h ? `${H2(w.melhorJanela3h.de)}–${H2(w.melhorJanela3h.ate)} (${P(w.melhorJanela3h.parte)})` : "—"} · vale ${w.piorJanela3h ? `${H2(w.piorJanela3h.de)}–${H2(w.piorJanela3h.ate)} (${P(w.piorJanela3h.parte)})` : "—"}</p><p class="src">Horas que mais venderam: ${w.topHoras.map(h => `${H2(h.hora)} (${R(h.vendasCentavos)})`).join(" · ")}</p>
        <h4>Cupom</h4><p class="src">${P(w.unitarios, 0)} com um item só · ${P(w.clientesParte, 0)} com cliente identificado · ${P(w.entregaParte, 0)} com entrega · ${N(w.c100n)} cestas acima de R$ 100${w.margem == null ? "" : " · margem estimada " + P(w.margem, 1)}</p></div></div>
      <div class="grid g2"><div><h4>Categorias da semana</h4>${tab([["Categoria"], ["Vendas", "num"], ["Parte", "num"]], w.categorias.map(c => `<tr><td>${esc(c.categoria)}</td><td class="num">${R(c.vendasCentavos)}</td><td class="num">${P(c.parte, 1)}</td></tr>`))}</div>
      <div><h4>Produtos que mais faturaram</h4>${tab([["Produto"], ["Qtde", "num"], ["Vendas", "num"]], w.topProdutos.map(p => `<tr><td>${esc(p.desc)}</td><td class="num">${N(p.qtd)}</td><td class="num">${R(p.vendasCentavos)}</td></tr>`))}</div></div>
      ${w.categoriasQueMexeram && w.categoriasQueMexeram.length ? `<h4>O que mexeu em relação à semana anterior</h4><p class="src">${w.categoriasQueMexeram.map(c => `${esc(c.categoria)} ${c.deltaPontos > 0 ? "+" : ""}${(c.deltaPontos * 100).toFixed(1).replace(".", ",")} pontos de participação`).join(" · ")}</p>` : ""}</div>`;
  }
  function semanasDetalhe(a) {
    const l = a.semanasDetalhe || []; if (!l.length) return "";
    const ultima = l.filter(w => w.completa).slice(-1)[0] || l[l.length - 1];
    return `<h4>Análise de uma semana</h4><p class="src">Escolha a semana: tudo abaixo (dias, horário, categorias, produtos) é só daquela semana.</p><select id="av-sem" class="av-sel" aria-label="Escolher a semana">${l.slice().reverse().map(w => `<option value="${w.inicio}"${w.inicio === ultima.inicio ? " selected" : ""}>${dm(w.inicio)} a ${dm(w.fim)}${w.completa ? "" : " (parcial)"} · ${R(w.vendasCentavos)}</option>`).join("")}</select><div id="av-sem-corpo">${semanaDetalhe(ultima)}</div>`;
  }
  function wire(host, a) { const sel = host.querySelector("#av-sem"); if (!sel) return; const l = a.semanasDetalhe || []; sel.onchange = () => { const w = l.find(x => x.inicio === sel.value); const c = host.querySelector("#av-sem-corpo"); if (w && c) c.innerHTML = semanaDetalhe(w); }; }

  function semanas(a) { const mx = Math.max(...a.semanas.map(w => w.vendasCentavos), 1); return tab([["Semana"], [""], ["Vendas", "num"], ["Cupons", "num"], ["Ticket", "num"], ["Cestas > R$ 100", "num"], [""]], a.semanas.map(w => `<tr><td>${dm(w.inicio)} a ${dm(w.fim)}</td><td>${w.completa ? "" : "<small>parcial</small>"}</td><td class="num">${R(w.vendasCentavos)}</td><td class="num">${N(w.cupons)}</td><td class="num">${R(w.ticketCentavos)}</td><td class="num">${N(w.c100n)}</td><td>${bar(w.vendasCentavos, mx, w.completa ? "" : "#94a3b8")}</td></tr>`)); }
  function cupom(a) {
    const fv = tab([["Faixa de valor"], ["Cupons", "num"], ["% cupons", "num"], ["% vendas", "num"]], a.faixasValor.map(f => `<tr><td>${esc(f.faixa)}</td><td class="num">${N(f.cupons)}</td><td class="num">${P(f.parteCupons, 1)}</td><td class="num">${P(f.parteVendas, 1)}</td></tr>`));
    const fi = tab([["Itens por cupom"], ["Cupons", "num"], ["% cupons", "num"], ["Ticket", "num"]], a.faixasItens.map(f => `<tr><td>${esc(f.faixa)}</td><td class="num">${N(f.cupons)}</td><td class="num">${P(f.parteCupons, 1)}</td><td class="num">${R(f.ticketCentavos)}</td></tr>`));
    const pg = tab([["Pagamento"], ["Cupons", "num"], ["Vendas", "num"], ["Ticket", "num"], ["% vendas", "num"]], a.pagamento.map(f => `<tr><td>${esc(f.forma)}</td><td class="num">${N(f.cupons)}</td><td class="num">${R(f.vendasCentavos)}</td><td class="num">${R(f.ticketCentavos)}</td><td class="num">${P(f.parteVendas, 1)}</td></tr>`));
    const dds = tab([["Dia da semana"], ["Média por dia", "num"], ["Ticket", "num"], ["% vendas", "num"]], a.diaSemana.map(d => `<tr><td>${d.dia}</td><td class="num">${R(d.mediaPorDiaCentavos)}</td><td class="num">${R(d.ticketCentavos)}</td><td class="num">${P(d.parte, 1)}</td></tr>`));
    const dm2 = tab([["Dia do mês"], ["Média por dia", "num"]], a.diaDoMes.map(d => `<tr><td>${d.dias}</td><td class="num">${R(d.mediaPorDiaCentavos)}</td></tr>`));
    return `<div class="grid g2">${fv}${fi}</div><div class="grid g2">${pg}${dds}</div>${dm2}`;
  }
  function clientes(a) {
    const c = a.clientes, e = a.entregas, v = a.convenio;
    return `<ul class="av-lista"><li><b>${P(c.parteCupons, 1)}</b> dos cupons têm cliente identificado (${N(c.clientesDistintos)} clientes, ${P(c.parteRecorrentes, 0)} voltaram em outro dia); ticket identificado ${R(c.ticketIdentificadoCentavos)} contra ${R(c.ticketBalcaoCentavos)} no balcão.</li>
      <li><b>${P(e.parteCupons, 1)}</b> dos cupons têm taxa de entrega: ticket ${R(e.ticketEntregaCentavos)} contra ${R(e.ticketBalcaoCentavos)} no balcão; taxa cobrada ${R(e.taxaCentavos)}.</li>
      <li><b>${P(v.parteCupons, 1)}</b> dos cupons são de convênio (empresa conveniada): ticket ${R(v.ticketCentavos)}.</li></ul>`;
  }
  function cesta(a) {
    const par = l => tab([["Produto A"], ["Produto B"], ["Juntos", "num"], ["Lift", "num"], ["Quem leva A leva B", "num"]], l.map(p => `<tr><td>${esc(p.descA)}</td><td>${esc(p.descB)}</td><td class="num">${N(p.juntos)}</td><td class="num">${p.lift.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}×</td><td class="num">${P(p.confiancaAB, 0)}</td></tr>`));
    const pux = tab([["Produto"], ["Cupons", "num"], ["Ticket com o produto", "num"], ["vs média", "num"]], a.puxadoresDeTicket.map(p => `<tr><td>${esc(p.desc)}</td><td class="num">${N(p.cupons)}</td><td class="num">${R(p.ticketComProdutoCentavos)}</td><td class="num">${p.ganhoSobreOGeral.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×</td></tr>`));
    return `<h4>Mais frequentes juntos</h4>${par(a.paresFrequentes)}<h4>Maior afinidade (lift)</h4>${par(a.pares)}<h4>Produtos que puxam o ticket</h4>${pux}<p class="src">Lift = quantas vezes mais o par aparece do que o acaso. Só entram produtos com 30 cupons ou mais e pares com 15 cupons ou mais.</p>`;
  }
  function produtos(a) {
    const t = (l, tit) => `<h4>${tit}</h4>` + tab([["Produto"], ["Qtde", "num"], ["Vendas", "num"], ["Cupons", "num"]], l.map(p => `<tr><td>${esc(p.desc)}</td><td class="num">${N(p.qtd)}</td><td class="num">${R(p.vendasCentavos)}</td><td class="num">${N(p.cupons)}</td></tr>`));
    return `<div class="grid g2"><div>${t(a.produtos.topValor, "Mais faturam")}</div><div>${t(a.produtos.topQtd, "Mais saem (unidades)")}</div></div>`;
  }
  function margem(a) {
    const m = a.margem; if (!m) return `<p class="notice info">Sem custo de estoque para estimar margem. Importe o estoque desta loja (com a coluna de custo).</p>`;
    return `<p><b>Margem estimada ${P(m.margem, 1)}</b> sobre ${P(m.cobertura, 0)} do valor vendido que tem custo no estoque · ${N(m.nAbaixoDoCusto)} produto(s) vendidos abaixo do custo atual.</p><p class="src">${esc(m.aviso || "")}</p>
      ${m.vendidosAbaixoDoCusto.length ? "<h4>Vendidos abaixo do custo</h4>" + tab([["Produto"], ["Qtde", "num"], ["Perda", "num"]], m.vendidosAbaixoDoCusto.map(p => `<tr><td>${esc(p.desc)}</td><td class="num">${N(p.qtd)}</td><td class="num">${R(p.perdaCentavos)}</td></tr>`)) : ""}`;
  }
  function oportunidades(a) { return (a.oportunidades || []).map(o => `<div class="av-op"><small>${esc(o.area)}</small><b>${esc(o.titulo)}</b><p>${esc(o.evidencia)}</p><p class="av-acao">${esc(o.acao)}</p></div>`).join("") || `<p class="src">Nenhuma oportunidade clara ainda.</p>`; }

  /* a: análise publicada de uma loja; H: ajudantes da tela (banner, kpi) */
  function html(a, H, opt) {
    const g = a.geral, sec = (icone, tit, sub, corpo) => `<div class="panel">${H.banner(icone, tit, sub)}<div class="panel-body">${corpo}</div></div>`;
    const lac = a.cobertura.lacunas ? ` · ${a.cobertura.lacunas} lacuna(s) entre relatórios` : "";
    return `<div class="av">
      <p class="notice info">Análise de <b>${N(a.cobertura.dias)} dias</b> (${dm(a.cobertura.inicio)} a ${dm(a.cobertura.fim)}${lac}) feita no computador da agência com relatórios conferidos ao centavo · atualizada em ${esc((a.publicadoEm || a.atualizadoEm || "").slice(0, 16).replace("T", " "))}. Quanto mais relatórios novos você solta em Importar, mais completa fica.</p>
      <div class="kpis">${H.kpi("Vendas", R(g.vendasCentavos), `${N(g.cupons)} cupons`, "money")}${H.kpi("Ticket médio", R(g.ticketMedioCentavos), `mediana ${R(g.ticketMedianaCentavos)} · 90% até ${R(g.ticketP90Centavos)}`, "cart")}${H.kpi("Itens por cupom", g.itensPorCupom.toLocaleString("pt-BR", { maximumFractionDigits: 2 }), `${N(g.cuponsPorDia)} cupons por dia`, "layers")}${H.kpi("Por dia", R(g.vendasPorDiaCentavos), `${N(g.diasComVenda)} dias com venda`, "clock")}</div>
      ${sec("target", "Onde focar o marketing", "categorias que sobem e caem, sempre comparadas com a loja", foco(a))}
      ${sec("bulb", "O que dá para fazer", "oportunidades com a evidência e a ação sugerida (hipóteses para testar, não promessas)", `<div class="av-ops">${oportunidades(a)}</div>`)}
      ${sec("layers", "Categorias", "últimas semanas completas contra as anteriores", categorias(a))}
      ${sec("clock", "Horários", `pico ${a.melhorJanela3h ? H2(a.melhorJanela3h.de) + "–" + H2(a.melhorJanela3h.ate) + " (" + P(a.melhorJanela3h.parte) + " das vendas)" : "—"} · vale ${a.piorJanela3h ? H2(a.piorJanela3h.de) + "–" + H2(a.piorJanela3h.ate) + " (" + P(a.piorJanela3h.parte) + ")" : "—"}`, mapa(a) + horas(a))}
      ${sec("cal", "Semana a semana", "segunda a domingo: o total de cada uma e a análise completa da semana que você escolher", semanas(a) + (opt && opt.semDetalhe ? "" : semanasDetalhe(a)))}
      ${sec("file", "Cada cupom: valor, itens, pagamento, dia", "como a loja vende", cupom(a))}
      ${sec("users", "Clientes, entrega e convênio", "quem compra e como", clientes(a))}
      ${sec("cart", "Cesta: o que se compra junto", "combos e produtos que puxam o ticket", cesta(a))}
      ${sec("tag", "Produtos", "o que mais fatura e o que mais sai", produtos(a))}
      ${sec("money", "Margem estimada", "com o custo atual do estoque", margem(a))}
    </div>`;
  }
  root.N7AnaliseVendas = { html, wire, semanaDetalhe };
})(typeof window !== "undefined" ? window : globalThis);
