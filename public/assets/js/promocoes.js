/* Tela "Central de Promoções" (só as lojas com o serviço Promoções e preços).
   Abas: visão geral da loja, candidatos à promoção, montar campanha, campanhas salvas e importação (estoque em .xlsx e analítico de vendas em PDF).
   Os arquivos são lidos no navegador; o que sobe para a planilha é só a base já resumida por produto e por dia.
   Os cálculos estão em promo.js (funções puras, testadas). */
(function (root) {
  const A = root.N7Analysis, P = root.N7Promo, I = root.N7PromoIngest, F = root.N7PromoFiles, S = root.N7Store;
  const { brl, int, dec, dm } = A.fmt;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TABS = [["visao", "Visão geral"], ["candidatos", "Candidatos"], ["campanha", "Montar campanha"], ["campanhas", "Campanhas"], ["importar", "Importar"]];
  const LISTAS = [["queima", "Queima", "Estoque parado ou encalhado com preço que respeita o piso"], ["atrair", "Atrair", "Isca e giro: itens que puxam cliente"], ["margem", "Margem", "Proteger: vendem bem com boa margem"], ["ruptura", "Ruptura", "Vendem bem e o estoque acaba em poucos dias"], ["semCusto", "Sem custo", "Sem custo não existe piso"], ["semDescontoReal", "Sem desconto real", "O piso fica igual ou acima do preço atual"]];
  const ui = Object.assign({ loja: "", regra: "padrao", lista: "queima", cat: "all", q: "", limit: 50, ord: "", compare: false }, (() => { try { return S.get("promoui", {}) || {}; } catch (e) { return {}; } })());
  const cache = {};                                  /* loja -> { data, a } */
  let H = null, lojas = [], podeEditar = false, pend = { estoque: null, vendas: [] };
  const saveUi = () => { try { S.set("promoui", { loja: ui.loja, regra: ui.regra, lista: ui.lista }); } catch (e) { /* sem armazenamento */ } };
  const cartAll = () => { try { return S.get("promocart", {}) || {}; } catch (e) { return {}; } };
  const cartOf = loja => Object.assign({ camp: { id: "", v: "", nome: "", tipo: "Corta Preço", regra: "corta", inicio: "", fim: "", status: "rascunho" }, linhas: [] }, cartAll()[loja] || {});
  const saveCart = (loja, c) => { try { const o = Object.assign({}, cartAll()); o[loja] = c; S.set("promocart", o); } catch (e) { /* sem armazenamento */ } };
  const regra = () => P.REGRAS[ui.regra] || P.REGRAS.padrao;
  const meses = m => (m === Infinity ? "sem giro" : dec(m, 1));
  const pct = v => (v == null ? "—" : dec(v * 100, 1) + "%");
  const tend = t => (t == null ? "—" : t >= 1.2 ? `<span style="color:var(--green)">▲ ${dec(t, 2)}×</span>` : t <= 0.8 ? `<span style="color:var(--red)">▼ ${dec(t, 2)}×</span>` : `${dec(t, 2)}×`);
  const api = async (path, body) => {
    const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify(body) } : { headers: { "X-N7": "1" } });
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) { location.reload(); throw new Error("Sua sessão terminou."); }
    if (!r.ok) throw new Error(b.error || "Não foi possível concluir.");
    return b;
  };
  const bust = k => { delete cache[k]; if (root.N7PromoBrain) root.N7PromoBrain.invalidate(); };   /* dados mudaram: o cérebro também relê */
  const clientOf = k => lojas.find(l => l.key === k) || { name: k, color: "--c1" };

  async function loadLoja(k, force) {
    if (cache[k] && !force) return cache[k];
    const data = await api("/api/promo?loja=" + encodeURIComponent(k));
    podeEditar = data.podeEditar;
    const a = P.analyze({ items: data.items, params: { coberturaInicio: data.cobertura && data.cobertura.inicio, coberturaIntervalos: data.intervalos } });
    return (cache[k] = { data, a });
  }

  /* ---------- visão geral ---------- */
  async function overview(v, c) {
    const { a, data } = c, r = a.resumo, k = H.kpi;
    if (!r) return `<div class="panel">${H.banner("tag", "Sem dados ainda", "importe o estoque e as vendas desta loja")}<div class="panel-body"><p class="notice">Ainda não há vendas importadas para ${esc(clientOf(ui.loja).name)}. Vá em <a href="#promocoes/importar">Importar</a>: exportação de estoque (.xlsx) e analítico de vendas (PDF).</p></div></div>`;
    const cob = r.cobertura, so = data.items.filter(i => !i.estoqueConhecido).length;
    const papeis = Object.entries(P.PAPEL).map(([id, nome]) => [nome, r.porPapel[id] || 0]).filter(x => x[1]);
    const top = a.items.filter(i => i.v90 > 0).sort((x, y) => y.v90 - x.v90).slice(0, 10);
    const outra = lojas.find(l => l.key !== ui.loja), oc = ui.compare && outra && cache[outra.key];
    const trans = oc && oc.a.resumo ? P.cruzarLojas(a, oc.a) : [];
    return `
      ${a.avisos.map(t => `<p class="notice"><b>Atenção:</b> ${esc(t)}</p>`).join("")}
      ${so ? `<p class="notice info">${so} produto(s) aparecem só nas vendas (sem estoque importado): estão fora das listas de promoção até o estoque ser importado.</p>` : ""}
      <div class="kpis">
        ${k("Itens com estoque", int(r.comEstoque), `${int(r.semEstoque)} sem estoque · ${int(r.itens)} no total`, "list")}
        ${k("Dinheiro em estoque (custo)", brl(r.capitalCusto), `a preço de venda: ${brl(r.capitalVenda)}`, "money", "green")}
        ${k("Parado em 90 dias", brl(r.capitalParado), `${int(r.parados)} itens sem nenhuma venda`, "alert", "red")}
        ${k("Encalhado (6 meses ou mais)", brl(r.capitalQueima), `${int(r.queima)} itens`, "clock", "amber")}
      </div>
      <div class="kpis">
        ${k("Vendas 60 dias", brl(r.v60), `90 dias: ${brl(r.v90)}`, "chart")}
        ${k("Margem média (ponderada)", pct(r.margemMedia), "só itens com custo e venda", "target")}
        ${k("Risco de ruptura", int(r.ruptura), "classe A ou B com estoque para até 15 dias", "bell", r.ruptura ? "red" : "green")}
        ${k("Sem custo", int(r.semCusto), `de ${int(r.comEstoque)} itens com estoque`, "file", r.semCusto ? "amber" : "green")}
      </div>
      <div class="grid g2">
        <div class="panel">${H.banner("chart", "Quem é cada produto", "papel pelas regras do playbook (isca, giro, margem, estoque)")}
          <div class="table-wrap"><table><thead><tr><th>Papel</th><th class="num">Itens</th></tr></thead><tbody>${papeis.map(([n, q]) => `<tr><td>${esc(n)}</td><td class="num">${int(q)}</td></tr>`).join("")}</tbody></table></div>
          <div class="panel-body"><p class="src">Curva ABC pela receita de 90 dias: A ${int(r.abcA)} itens · B ${int(r.abcB)} · C ${int(r.abcC)}. Histórico coberto: ${dm(cob.inicio)} a ${dm(cob.fim)} (${cob.dias} dias).</p></div></div>
        <div class="panel">${H.banner("money", "Os 10 que mais faturam em 90 dias", "ficam de fora de queima; são a base do caixa")}
          <div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Receita 90d</th><th class="num">Estoque</th></tr></thead><tbody>${top.map(i => `<tr><td>${esc(i.desc)}</td><td class="num">${brl(i.v90)}</td><td class="num">${int(i.estoque)}</td></tr>`).join("")}</tbody></table></div></div>
      </div>
      ${lojas.length > 1 ? `<div class="toolbar"><button type="button" class="btn sm" id="pm-cmp">${ui.compare ? "Esconder a comparação entre lojas" : "Comparar com a outra loja"}</button><span class="src">As análises ficam separadas por loja. A comparação (produto parado numa e girando na outra) só aparece quando você pede.</span></div>` : ""}
      ${trans.length ? `<div class="panel">${H.banner("cart", "Transferência entre lojas", `parado aqui e girando na outra loja (${esc(oc ? outra.name : "")})`)}
        <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Sai de</th><th class="num">Estoque parado</th><th class="num">Vendas 90d na outra</th><th class="num">Dinheiro parado</th></tr></thead><tbody>${trans.slice(0, 15).map(t => { const deNome = t.de === "a" ? clientOf(ui.loja).name : outra.name; return `<tr><td>${esc(t.desc)}</td><td>${esc(deNome)}</td><td class="num">${int(t.estoqueDe)}</td><td class="num">${int(t.giroPara)}</td><td class="num">${t.capital == null ? "—" : brl(t.capital)}</td></tr>`; }).join("")}</tbody></table></div></div>` : ""}`;
  }

  /* ---------- candidatos ---------- */
  function candidatesView(c) {
    const a = c.a; if (!a.resumo) return `<p class="notice">Importe estoque e vendas para ver os candidatos. <a href="#promocoes/importar">Importar</a></p>`;
    const cand = P.candidatos(a, regra()), lista = cand[ui.lista] || [];
    const cats = ["all"].concat(P.CATS);
    let rows = lista.filter(i => (ui.cat === "all" || i.cat === ui.cat) && (!ui.q || (i.desc + " " + i.barras).toLowerCase().includes(ui.q.toLowerCase())));
    const cart = cartOf(ui.loja), has = new Set(cart.linhas.map(l => l.b));
    const total = rows.length; rows = rows.slice(0, ui.limit);
    const th = (t, cls = "") => `<th class="${cls}">${t}</th>`;
    return `
      <div class="toolbar"><div class="seg" id="pm-listas" role="group" aria-label="Lista">${LISTAS.map(([id, n, d]) => `<button type="button" data-v="${id}" aria-pressed="${ui.lista === id}" title="${esc(d)}">${n} <i class="tab-n">${(cand[id] || []).length}</i></button>`).join("")}</div>
        <select id="pm-cat" aria-label="Categoria">${cats.map(x => `<option value="${esc(x)}" ${ui.cat === x ? "selected" : ""}>${x === "all" ? "Todas as categorias" : esc(x)}</option>`).join("")}</select>
        <input type="search" id="pm-q" placeholder="Buscar produto ou código" value="${esc(ui.q)}" aria-label="Buscar"></div>
      <p class="src">${esc(LISTAS.find(l => l[0] === ui.lista)[2])}. Regra de preço: <b>${esc(regra().nome)}</b>, margem mínima ${pct(regra().margemMin)} sobre a venda. Categoria é sugerida pelo nome do produto.</p>
      <div class="panel"><div class="table-wrap"><table class="pm-table"><thead><tr>${th("Produto")}${th("Estoque", "num")}${th("Vendas 60d", "num")}${th("Vendas 90d", "num")}${th("Meses de estoque", "num")}${th("Tendência", "num")}${th("Custo", "num")}${th("Preço atual", "num")}${th("Margem atual", "num")}${th("Sugerido", "num")}${th("Desconto", "num")}${th("Margem", "num")}${th("")}</tr></thead><tbody>
        ${rows.map(i => { const s = i.sug; return `<tr><td><b>${esc(i.desc)}</b><div class="src">${esc(i.cat)} · ${esc(P.PAPEL[i.papel] || "")} · ${i.abc !== "-" ? "ABC " + i.abc + " · " : ""}${esc(i.barras)}</div></td>
          <td class="num">${int(i.estoque)}</td><td class="num">${int(i.q60)}</td><td class="num">${int(i.q90)}</td><td class="num">${meses(i.mesesEstoque)}</td><td class="num">${tend(i.tendencia)}</td>
          <td class="num">${i.custo ? brl(i.custo) : `<span class="na">sem custo</span>`}</td><td class="num">${i.preco ? brl(i.preco) : "—"}</td><td class="num">${pct(i.margem)}</td>
          <td class="num">${s.ok ? `<b>${brl(s.por)}</b>` : `<span class="na" title="${esc(s.motivo)}">—</span>`}</td><td class="num">${s.ok ? pct(s.desconto) : "—"}</td><td class="num">${s.ok ? pct(s.margem) : "—"}</td>
          <td style="text-align:right">${s.ok ? (has.has(i.barras) ? `<span class="badge st-pub">na campanha</span>` : `<button type="button" class="btn sm" data-add="${esc(i.barras)}">Adicionar</button>`) : `<small class="src">${esc(s.motivo.split(":")[0])}</small>`}</td></tr>`; }).join("") || `<tr><td colspan="13"><div class="empty">Nenhum item nesta lista com estes filtros.</div></td></tr>`}
      </tbody></table></div></div>
      ${total > rows.length ? `<div class="toolbar"><button type="button" class="btn" id="pm-more">Mostrar mais (${int(total - rows.length)} restantes)</button></div>` : `<p class="src">${int(total)} item(ns).</p>`}`;
  }

  /* ---------- montar campanha ---------- */
  function campaignView(c) {
    const a = c.a, cart = cartOf(ui.loja), camp = cart.camp, rg = P.REGRAS[camp.regra] || P.REGRAS.padrao;
    const by = new Map(a.items.map(i => [i.barras, i]));
    const linhas = cart.linhas.map(l => ({ l, item: by.get(l.b) })).filter(x => x.item);
    const dias = camp.inicio && camp.fim && camp.fim >= camp.inicio ? Math.round((P.day(camp.fim) - P.day(camp.inicio)) + 1) : 7;
    const tot = P.campaignTotals(linhas.map(x => ({ item: x.item, por: x.l.por })), rg, dias);
    const bf = P.briefing(camp, linhas.map(x => ({ item: x.item, por: x.l.por })), rg);
    const prob = new Map(bf.problemas.map(p => [p.item.barras, p.motivos]));
    return `
      <div class="grid g2" style="align-items:start">
        <div class="panel">${H.banner("tag", "Campanha", camp.id ? "editando uma campanha salva" : "nova campanha")}
          <div class="panel-body cfg-form">
            <div class="form-row"><div><label class="lbl" for="pc-nome">Nome</label><input type="text" id="pc-nome" maxlength="80" value="${esc(camp.nome)}" placeholder="Ex.: Atacadão do Bebê · 19 e 20/11"></div>
              <div><label class="lbl" for="pc-tipo">Tipo de campanha</label><select id="pc-tipo">${P.CAMPANHAS.map(t => `<option ${t.tipo === camp.tipo ? "selected" : ""}>${esc(t.tipo)}</option>`).join("")}</select></div></div>
            <div class="form-row"><div><label class="lbl" for="pc-inicio">Início</label><input type="date" id="pc-inicio" value="${esc(camp.inicio)}"></div><div><label class="lbl" for="pc-fim">Fim</label><input type="date" id="pc-fim" value="${esc(camp.fim)}"></div></div>
            <div class="form-row"><div><label class="lbl" for="pc-regra">Regra de preço (margem mínima)</label><select id="pc-regra">${Object.values(P.REGRAS).map(x => `<option value="${x.id}" ${x.id === camp.regra ? "selected" : ""}>${esc(x.nome)} · ${pct(x.margemMin)}</option>`).join("")}</select></div>
              <div><label class="lbl" for="pc-status">Situação</label><select id="pc-status">${["rascunho", "aprovada", "publicada", "encerrada"].map(x => `<option ${x === camp.status ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
          </div></div>
        <div class="panel">${H.banner("money", "Cesta da campanha", `${tot.itens} item(ns) · base de ${dias} dia(s)`)}
          <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));padding:14px">
            ${H.kpi("Margem da cesta", pct(tot.margemBase), "no giro atual de 60 dias", "target", tot.margemBase != null && tot.margemBase < rg.margemMin ? "red" : "green")}
            ${H.kpi("Lucro na base", brl(tot.lucroBase), `receita ${brl(tot.receitaBase)} · ${dec(tot.unidadesBase, 0)} un.`, "money")}
          </div>
          <div class="panel-body"><p class="src">Base = giro de 60 dias × dias da campanha, sem efeito da promoção: não é previsão de vendas, é o que a cesta renderia no ritmo de hoje. ${tot.semCusto ? `<b>${tot.semCusto} item(ns) sem custo ficam fora da conta.</b>` : ""}</p>
          ${tot.abaixoDoPiso ? `<p class="notice"><b>${tot.abaixoDoPiso} item(ns) abaixo do piso de ${pct(rg.margemMin)}.</b> Corrija antes de aprovar.</p>` : ""}</div></div>
      </div>
      <div class="panel">${H.banner("list", "Itens", "ajuste o preço POR; o piso e a terminação ,90 são conferidos")}
        <div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Giro 60d/dia</th><th class="num">Custo</th><th class="num">DE</th><th class="num">Piso</th><th class="num">POR</th><th class="num">Margem</th><th></th></tr></thead><tbody>
        ${linhas.map(({ l, item }) => { const piso = item.custo > 0 ? item.custo / (1 - rg.margemMin) : null, m = item.custo > 0 ? (l.por - item.custo) / l.por : null, pr = prob.get(item.barras); return `<tr><td><b>${esc(item.desc)}</b><div class="src">${esc(item.cat)} · ${esc(item.barras)}</div>${pr ? `<div class="src" style="color:var(--red)">${esc(pr.join(" · "))}</div>` : ""}</td>
          <td class="num">${int(item.estoque)}</td><td class="num">${dec(item.rate60, 2)}</td><td class="num">${item.custo ? brl(item.custo) : `<span class="na">sem custo</span>`}</td><td class="num">${brl(item.preco)}</td><td class="num">${piso ? brl(piso) : "—"}</td>
          <td class="num"><input type="number" step="0.1" min="0" value="${l.por}" data-por="${esc(item.barras)}" style="width:92px" aria-label="Preço POR de ${esc(item.desc)}"></td><td class="num">${pct(m)}</td>
          <td style="text-align:right"><button type="button" class="btn sm" data-rm="${esc(item.barras)}">Tirar</button></td></tr>`; }).join("") || `<tr><td colspan="9"><div class="empty">A cesta está vazia. Escolha itens na aba <a href="#promocoes/candidatos">Candidatos</a>.</div></td></tr>`}
        </tbody></table></div></div>
      ${cart.linhas.length > linhas.length ? `<p class="notice">${cart.linhas.length - linhas.length} item(ns) da cesta não estão mais na base desta loja e foram ignorados.</p>` : ""}
      <div class="toolbar">
        ${podeEditar ? `<button type="button" class="btn primary" id="pc-save">${camp.id ? "Salvar alterações" : "Salvar campanha"}</button>` : `<span class="src">Seu acesso é só de leitura.</span>`}
        <button type="button" class="btn" id="pc-copy"${bf.ok.length ? "" : " disabled"}>Copiar briefing (${bf.ok.length})</button>
        <button type="button" class="btn" id="pc-csv"${bf.ok.length ? "" : " disabled"}>Baixar CSV</button>
        <button type="button" class="btn" id="pc-new">Nova campanha</button>
        <button type="button" class="btn" id="pc-clear"${cart.linhas.length ? "" : " disabled"}>Esvaziar cesta</button>
      </div>
      <p class="src">O briefing leva só itens com estoque, acima do piso e com preço terminando em ,90 (colunas: Produto, Apresentação, DE, POR, Campanha, Frase, Selo, Início, Fim). ${bf.problemas.length ? `<b>${bf.problemas.length} item(ns) ficam de fora até serem corrigidos.</b>` : ""} Cole no WhatsApp do designer ou abra o CSV na planilha.</p>`;
  }

  /* ---------- campanhas salvas ---------- */
  function savedView(c) {
    const list = c.data.campanhas;
    return `<div class="panel">${H.banner("file", "Campanhas desta loja", `${list.length} salva(s)`)}
      <div class="table-wrap"><table><thead><tr><th>Campanha</th><th>Tipo</th><th>Período</th><th class="num">Itens</th><th class="num">Margem</th><th>Situação</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr><td><b>${esc(x.nome)}</b><div class="src">por ${esc(x.criadoPor)} · ${esc((x.criadoEm || "").slice(0, 10).split("-").reverse().join("/"))}</div></td><td>${esc(x.tipo)}</td><td>${x.inicio ? dm(x.inicio) : "—"}${x.fim ? " a " + dm(x.fim) : ""}</td><td class="num">${x.itens.length}</td><td class="num">${x.totais && x.totais.margemBase != null ? pct(x.totais.margemBase) : "—"}</td><td><span class="badge ${x.status === "aprovada" || x.status === "publicada" ? "st-pub" : ""}">${esc(x.status)}</span></td>
        <td style="text-align:right"><button type="button" class="btn sm" data-open="${esc(x.id)}">Abrir</button>${podeEditar ? ` <button type="button" class="btn sm" data-del="${esc(x.id)}">Apagar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">Nenhuma campanha salva.</div></td></tr>`}
      </tbody></table></div></div>`;
  }

  /* ---------- importar ---------- */
  function importView(c) {
    const d = c.data, imp = d.importacoes;
    return `
      ${!podeEditar ? `<p class="notice info">Seu acesso é só de leitura: você vê as importações, mas não importa.</p>` : ""}
      <div class="grid g2" style="align-items:start">
        <div class="panel">${H.banner("file", "1. Estoque (.xlsx)", "exportação de estoque do sistema da farmácia")}
          <div class="panel-body">
            <p class="src">Cabeçalho esperado: Barras, Descrição, Estoque, Preço de Venda, Últ. Prc. Entrada (custo), Preço de Promoção, Valor Aproximado, Últ. Entrada. Procure pelo cabeçalho, não pelo nome do arquivo. ${d.estoqueEm ? `Último estoque desta loja: <b>${esc(d.estoqueEm.split("-").reverse().join("/"))}</b>.` : "Esta loja ainda não tem estoque importado."}</p>
            <input type="file" id="im-est" accept=".xlsx,.xlsm,.csv" ${podeEditar ? "" : "disabled"}><div id="im-est-out"></div></div></div>
        <div class="panel">${H.banner("file", "2. Vendas (PDF analítico)", "cupom a cupom; um ou vários arquivos")}
          <div class="panel-body">
            <p class="src">Emita o <b>Analítico de vendas sem filtro</b>, depois do fechamento do último dia (o dia da emissão fica de fora se o relatório foi tirado durante o expediente). Para 90 dias, importe os meses em arquivos separados: cada arquivo substitui só os dias que cobre. ${d.cobertura ? `Histórico guardado: <b>${dm(d.cobertura.inicio)} a ${dm(d.cobertura.fim)}</b>.` : "Esta loja ainda não tem vendas importadas."}</p>
            <input type="file" id="im-ven" accept=".pdf" multiple ${podeEditar ? "" : "disabled"}><div id="im-ven-out"></div></div></div>
      </div>
      <div class="panel">${H.banner("clock", "Importações desta loja", "o que já entrou na planilha")}
        <div class="table-wrap"><table><thead><tr><th>Quando</th><th>Tipo</th><th>Período</th><th class="num">Linhas</th><th>Arquivo</th><th>Por</th></tr></thead><tbody>
        ${imp.slice(0, 20).map(x => `<tr><td>${esc((x.em || "").replace("T", " ").slice(0, 16))}</td><td>${x.tipo === "estoque" ? "Estoque" : "Vendas"}</td><td>${x.inicio ? dm(x.inicio) + " a " + dm(x.fim) : "—"}${x.diaDescartado ? ` <small class="src">(dia ${dm(x.diaDescartado)} fora)</small>` : ""}</td><td class="num">${int(x.linhas)}</td><td>${esc(x.arquivo)}</td><td>${esc(x.por)}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">Nada importado ainda.</div></td></tr>`}
        </tbody></table></div></div>`;
  }

  async function prepareStock(v, c, file) {
    const out = $("#im-est-out", v); out.innerHTML = `<p class="src">Lendo ${esc(file.name)}…</p>`;
    try {
      const grid = await F.readStockFile(file), r = I.parseStockGrid(grid);
      if (r.erro) { out.innerHTML = `<p class="notice">${esc(r.erro)}</p>`; return; }
      const bases = {}; for (const l of lojas) { const x = cache[l.key] || (l.key === ui.loja ? c : null); if (x) bases[l.key] = x.data.items; }
      const prov = P.lojaProvavel(r.items, bases), mine = prov[ui.loja], other = Object.keys(prov).find(k => k !== ui.loja);
      const trocada = other && prov[other].pct != null && prov[other].pct >= 0.7 && !(mine && mine.pct != null && mine.pct >= 0.5);
      const st = r.stats; pend.estoque = { items: r.items, arquivo: file.name };
      out.innerHTML = `<div class="paste-res"><b>${int(st.linhas)} produtos lidos</b> · ${int(st.semCusto)} sem custo (${pct(st.semCusto / st.linhas)})${st.duplicados ? ` · ${st.duplicados} duplicados ignorados` : ""}${st.semBarras ? ` · ${st.semBarras} sem código de barras ignorados` : ""}
        ${!st.temCusto ? `<p class="notice">A planilha não tem a coluna de custo (Últ. Prc. Entrada): sem custo não existe piso.</p>` : ""}
        ${st.semCusto / st.linhas > 0.3 ? `<p class="notice"><b>Muitos itens sem custo.</b> Neles dá para sugerir preço, mas não dá para afirmar que o piso é respeitado.</p>` : ""}
        ${trocada ? `<p class="notice"><b>Esta planilha parece ser de ${esc(clientOf(other).name)}, não de ${esc(clientOf(ui.loja).name)}:</b> o custo dos produtos em comum bate com a outra loja (${pct(prov[other].pct)}). Confira antes de gravar.</p>` : (mine && mine.pct != null ? `<p class="src">Conferência: o custo de ${pct(mine.pct)} dos produtos em comum bate com a base atual desta loja.</p>` : "")}
        ${podeEditar ? `<button type="button" class="btn primary" id="im-est-go">Gravar estoque de ${esc(clientOf(ui.loja).name)}</button>` : ""}</div>`;
      const go = $("#im-est-go", v); if (go) go.onclick = () => commit(v, go, async () => { const rr = await api("/api/promo", { action: "estoque", loja: ui.loja, items: pend.estoque.items, arquivo: pend.estoque.arquivo }); return `Estoque gravado: ${rr.produtos} produtos${rr.foraDaLista ? ` (${rr.foraDaLista} saíram da lista e ficaram com estoque 0)` : ""}.`; });
    } catch (e) { out.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
  }

  async function prepareSales(v, c, files) {
    const out = $("#im-ven-out", v); pend.vendas = []; out.innerHTML = "";
    const last = c.data.importacoes.filter(x => x.tipo === "vendas" && /CNPJ (\d{14})/.test(x.arquivo)).map(x => (x.arquivo.match(/CNPJ (\d{14})/) || [])[1])[0];
    for (const file of files) {
      const card = document.createElement("div"); card.className = "paste-res"; card.innerHTML = `<b>${esc(file.name)}</b> <span class="src">lendo…</span>`; out.appendChild(card);
      try {
        const { lines, paginas } = await F.readPdfLines(await file.arrayBuffer(), (p, n) => { card.querySelector(".src").textContent = `lendo página ${p} de ${n}…`; });
        const r = I.parseSalesLines(lines), h = r.header;
        if (!h.periodo || !r.rows.length) { card.innerHTML = `<b>${esc(file.name)}</b><p class="notice">Não reconheci este PDF como "Analítico de vendas". Confira o relatório emitido pelo sistema.</p>`; continue; }
        const drop = I.partialDay(h), cov = I.coverage(r.rows, drop), ag = I.aggregate(r.rows, { dropDay: drop });
        const total = r.rows.filter(x => !I.isNaoProduto(x) && x.data !== drop).reduce((s, x) => s + x.valor, 0), taxaOk = r.stats.taxa != null && r.stats.taxa >= 0.999;
        const cnpjDiff = last && h.cnpj && last !== h.cnpj;
        card.innerHTML = `<b>${esc(file.name)}</b><div class="src">${esc(h.empresa || "empresa não identificada")}${h.cnpj ? " · CNPJ " + esc(h.cnpj) : ""} · ${paginas} página(s) · emitido ${h.emissao ? dm(h.emissao.data) + " " + esc(h.emissao.hora) : "—"}</div>
          <p><b>${int(r.stats.lidas)} de ${int(r.stats.candidatas)} linhas lidas (${dec((r.stats.taxa || 0) * 100, 2)}%)</b> · período ${dm(h.periodo.inicio)} a ${dm(h.periodo.fim)} · ${int(Object.keys(ag).length)} produtos · ${brl(total)} em produtos</p>
          ${drop ? `<p class="notice info">O relatório saiu às ${esc(h.emissao.hora)} do último dia: <b>${dm(drop)} fica de fora</b> por estar cortado. Cobertura gravada: ${cov ? dm(cov.inicio) + " a " + dm(cov.fim) : "—"}.</p>` : ""}
          ${!taxaOk ? `<p class="notice"><b>Atenção:</b> ${int(r.stats.rejeitadas)} linha(s) não foram lidas (o esperado é 99,9% ou mais). Exemplo: <code>${esc((r.stats.exemplosRejeitados[0] || "").slice(0, 110))}</code></p>` : ""}
          ${cnpjDiff ? `<p class="notice"><b>O CNPJ deste PDF (${esc(h.cnpj)}) é diferente do último importado nesta loja (${esc(last)}).</b> Confira se é a loja certa antes de gravar.</p>` : ""}`;
        if (cov) pend.vendas.push({ nome: file.name, produtos: ag, inicio: cov.inicio, fim: cov.fim, dia: drop || "", linhas: r.stats.lidas, cand: r.stats.candidatas, cnpj: h.cnpj || "", ok: taxaOk });
      } catch (e) { card.innerHTML = `<b>${esc(file.name)}</b><p class="notice">${esc(e.message || "Não consegui ler este PDF.")}</p>`; }
    }
    const bloq = pend.vendas.filter(x => !x.ok); pend.vendas = pend.vendas.filter(x => x.ok);                /* leitura abaixo de 99,9% nunca é gravada */
    if (bloq.length) { const n = document.createElement("p"); n.className = "notice"; n.innerHTML = `<b>${bloq.length} relatório(s) bloqueado(s):</b> a leitura ficou abaixo de 99,9% e não substitui vendas já gravadas (${esc(bloq.map(x => x.nome).join(", "))}). Emita o relatório de novo; se passou de 1 MB, dia a dia.`; out.appendChild(n); }
    if (pend.vendas.length && podeEditar) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.id = "im-ven-go"; b.textContent = `Gravar ${pend.vendas.length} relatório(s) de vendas de ${clientOf(ui.loja).name}`; out.appendChild(b);
      b.onclick = () => commit(v, b, async () => {
        let n = 0;
        for (const x of pend.vendas) { b.textContent = `Gravando ${++n} de ${pend.vendas.length}…`; await api("/api/promo", { action: "vendas", loja: ui.loja, produtos: x.produtos, inicio: x.inicio, fim: x.fim, diaDescartado: x.dia, linhas: x.linhas, candidatas: x.cand, arquivo: (x.nome + (x.cnpj ? " · CNPJ " + x.cnpj : "")).slice(0, 120) }); }
        return `${pend.vendas.length} relatório(s) de vendas gravados.`;
      });
    }
  }
  async function commit(v, btn, fn) {
    btn.disabled = true; const t0 = btn.textContent;
    try { const msg = await fn(); bust(ui.loja); H.toast(msg); pend = { estoque: null, vendas: [] }; await draw(v, "importar"); }
    catch (e) { H.toast(e.message); btn.disabled = false; btn.textContent = t0; }
  }

  /* ---------- tela ---------- */
  async function draw(view, tab) {
    const host = $("#pm-body", view); host.innerHTML = `<p class="src">Carregando a base de ${esc(clientOf(ui.loja).name)}…</p>`;
    let c;
    try {
      c = await loadLoja(ui.loja);
      const outra = lojas.find(l => l.key !== ui.loja); if (outra && tab === "visao" && ui.compare && !cache[outra.key]) { try { await loadLoja(outra.key); } catch (e) { /* sem a outra loja */ } }
    } catch (e) { host.innerHTML = `<p class="notice">${esc(e.message)} <button type="button" class="btn sm" id="pm-retry">Tentar de novo</button></p>`; $("#pm-retry", view).onclick = () => draw(view, tab); return; }
    host.innerHTML = tab === "visao" ? await overview(view, c) : tab === "candidatos" ? candidatesView(c) : tab === "campanha" ? campaignView(c) : tab === "campanhas" ? savedView(c) : importView(c);
    wire(view, tab, c);
  }

  function wire(view, tab, c) {
    const redraw = () => draw(view, tab);
    if (tab === "visao") { const cb = $("#pm-cmp", view); if (cb) cb.onclick = () => { ui.compare = !ui.compare; redraw(); }; }
    if (tab === "candidatos") {
      $$("#pm-listas button", view).forEach(b => { b.onclick = () => { ui.lista = b.dataset.v; ui.limit = 50; saveUi(); redraw(); }; });
      $("#pm-cat", view).onchange = e => { ui.cat = e.target.value; ui.limit = 50; redraw(); };
      let tm; $("#pm-q", view).oninput = e => { ui.q = e.target.value; ui.limit = 50; clearTimeout(tm); tm = setTimeout(() => { redraw(); setTimeout(() => { const q = $("#pm-q", view); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 250); };
      const more = $("#pm-more", view); if (more) more.onclick = () => { ui.limit += 100; redraw(); };
      $$("[data-add]", view).forEach(b => { b.onclick = () => {
        const cart = cartOf(ui.loja), it = c.a.items.find(i => i.barras === b.dataset.add), s = P.suggest(it, regra());
        if (!it || !s.ok || cart.linhas.some(l => l.b === it.barras)) return;
        cart.linhas.push({ b: it.barras, por: s.por }); saveCart(ui.loja, cart); H.toast(`${it.desc.slice(0, 40)} entrou na cesta (${cart.linhas.length})`); redraw();
      }; });
    }
    if (tab === "campanha") {
      const cart = cartOf(ui.loja), camp = cart.camp, keep = () => { camp.nome = $("#pc-nome", view).value.trim(); camp.tipo = $("#pc-tipo", view).value; camp.inicio = $("#pc-inicio", view).value; camp.fim = $("#pc-fim", view).value; camp.regra = $("#pc-regra", view).value; camp.status = $("#pc-status", view).value; saveCart(ui.loja, cart); };
      ["#pc-nome", "#pc-inicio", "#pc-fim", "#pc-status"].forEach(s => $(s, view).addEventListener("change", () => { keep(); redraw(); }));
      $("#pc-tipo", view).onchange = e => { const t = P.CAMPANHAS.find(x => x.tipo === e.target.value); keep(); if (t) { camp.regra = t.regra; saveCart(ui.loja, cart); } redraw(); };
      $("#pc-regra", view).onchange = () => { keep(); redraw(); };
      $$("[data-por]", view).forEach(i => i.addEventListener("change", () => { const l = cart.linhas.find(x => x.b === i.dataset.por), n = Number(String(i.value).replace(",", ".")); if (l && isFinite(n) && n > 0) { l.por = Math.round(n * 100) / 100; saveCart(ui.loja, cart); } redraw(); }));
      $$("[data-rm]", view).forEach(b => { b.onclick = () => { cart.linhas = cart.linhas.filter(x => x.b !== b.dataset.rm); saveCart(ui.loja, cart); redraw(); }; });
      const by = new Map(c.a.items.map(i => [i.barras, i])), rg = P.REGRAS[camp.regra] || P.REGRAS.padrao;
      const lin = () => cart.linhas.map(l => ({ item: by.get(l.b), por: l.por })).filter(x => x.item);
      $("#pc-copy", view).onclick = async () => { const bf = P.briefing(camp, lin(), rg); try { await navigator.clipboard.writeText(bf.tsv); H.toast(`Briefing copiado (${bf.ok.length} itens)`); } catch (e) { H.toast("Não consegui copiar. Use Baixar CSV."); } };
      $("#pc-csv", view).onclick = () => { const bf = P.briefing(camp, lin(), rg), csv = "﻿" + [bf.head].concat(bf.rows).map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `Briefing_${(camp.nome || "campanha").replace(/[^A-Za-z0-9]+/g, "_")}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
      $("#pc-new", view).onclick = () => { saveCart(ui.loja, { camp: { id: "", v: "", nome: "", tipo: "Corta Preço", regra: "corta", inicio: "", fim: "", status: "rascunho" }, linhas: [] }); redraw(); };
      $("#pc-clear", view).onclick = () => { cart.linhas = []; saveCart(ui.loja, cart); redraw(); };
      const sv = $("#pc-save", view);
      if (sv) sv.onclick = async () => {
        keep(); if (!camp.nome) return H.toast("Dê um nome à campanha.");
        const dias = camp.inicio && camp.fim && camp.fim >= camp.inicio ? Math.round(P.day(camp.fim) - P.day(camp.inicio)) + 1 : 7, l = lin(), tot = P.campaignTotals(l, rg, dias);
        sv.disabled = true;
        try {
          const r = await api("/api/promo", { action: "campanha", loja: ui.loja, id: camp.id || undefined, v: camp.v || undefined, nome: camp.nome, tipo: camp.tipo, regra: camp.regra, inicio: camp.inicio, fim: camp.fim, status: camp.status, totais: tot,
            itens: l.map(x => ({ b: x.item.barras, d: x.item.desc, cat: x.item.cat, de: x.item.preco, por: x.por, c: x.item.custo, papel: x.item.papel })) });
          camp.id = r.id; camp.v = r.v; saveCart(ui.loja, cart); bust(ui.loja); H.toast("Campanha salva na planilha."); redraw();
        } catch (e) { H.toast(e.message); sv.disabled = false; }
      };
    }
    if (tab === "campanhas") {
      $$("[data-open]", view).forEach(b => { b.onclick = () => {
        const x = c.data.campanhas.find(y => y.id === b.dataset.open); if (!x) return;
        saveCart(ui.loja, { camp: { id: x.id, v: x.v, nome: x.nome, tipo: x.tipo, regra: x.regra, inicio: x.inicio, fim: x.fim, status: x.status }, linhas: x.itens.map(i => ({ b: i.b, por: i.por })) });
        location.hash = "#promocoes/campanha";
      }; });
      $$("[data-del]", view).forEach(b => { let armed = false; b.onclick = async () => {
        if (!armed) { armed = true; b.textContent = "Confirmar"; setTimeout(() => { armed = false; b.textContent = "Apagar"; }, 3500); return; }
        try { await api("/api/promo", { action: "campanha_apagar", loja: ui.loja, id: b.dataset.del }); bust(ui.loja); H.toast("Campanha apagada."); redraw(); } catch (e) { H.toast(e.message); }
      }; });
    }
    if (tab === "importar") {
      $("#im-est", view).onchange = e => { if (e.target.files[0]) prepareStock(view, c, e.target.files[0]); };
      $("#im-ven", view).onchange = e => { if (e.target.files.length) prepareSales(view, c, [...e.target.files]); };
    }
  }

  async function render(view, helpers, sub) {
    H = helpers; const tab = TABS.some(t => t[0] === sub) ? sub : "visao";
    view.innerHTML = `<p class="src">Carregando…</p>`;
    try { const r = await api("/api/promo"); lojas = r.lojas; podeEditar = r.podeEditar; }
    catch (e) { view.innerHTML = `<div class="page-head"><div><h1>Central de Promoções</h1></div></div><p class="notice">${esc(e.message)}</p>`; return; }
    if (!lojas.length) { view.innerHTML = `<div class="page-head"><div><h1>Central de Promoções</h1><p>Nenhum cliente tem o serviço <b>Promoções e preços</b>. Marque o serviço em Configurações → Clientes e serviços.</p></div></div>`; return; }
    if (!lojas.some(l => l.key === ui.loja)) ui.loja = lojas[0].key;
    view.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Preço e promoção · só equipe</div><h1>Central de Promoções</h1>
        <p>Estoque e vendas de 60 e 90 dias de cada loja: o que está parado, o que gira, o que está para acabar e por quanto vender sem furar o piso de margem. As lojas nunca se misturam.</p></div>
        <div class="seg" id="pm-loja" role="group" aria-label="Loja">${lojas.map(l => `<button type="button" data-v="${esc(l.key)}" aria-pressed="${l.key === ui.loja}">${esc(l.name)}</button>`).join("")}</div></div>
      <nav class="subtabs scroll" aria-label="Central de Promoções">${TABS.map(([id, n]) => `<a href="#promocoes${id === "visao" ? "" : "/" + id}" ${id === tab ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
      ${tab === "candidatos" ? `<div class="toolbar"><label class="lbl" for="pm-regra" style="margin:0">Regra de preço</label><select id="pm-regra">${Object.values(P.REGRAS).map(x => `<option value="${x.id}" ${x.id === ui.regra ? "selected" : ""}>${esc(x.nome)} · piso ${pct(x.margemMin)}</option>`).join("")}</select></div>` : ""}
      <div id="pm-body" class="view" style="gap:16px"></div>`;
    $$("#pm-loja button", view).forEach(b => { b.onclick = () => { ui.loja = b.dataset.v; saveUi(); render(view, H, tab); }; });
    const rg = $("#pm-regra", view); if (rg) rg.onchange = e => { ui.regra = e.target.value; saveUi(); draw(view, tab); };
    await draw(view, tab);
  }

  /* chamado pelo cérebro: abre a loja certa na lista certa, ou já com a campanha da cadência preparada */
  function focus(o) {
    if (o.loja) ui.loja = o.loja;
    if (o.lista) { ui.lista = o.lista; ui.limit = 50; ui.cat = "all"; ui.q = ""; }
    if (o.tipo) {
      const t = P.CAMPANHAS.find(x => x.tipo === o.tipo), cart = cartOf(ui.loja);
      if (!cart.camp.id && !cart.linhas.length) { Object.assign(cart.camp, { tipo: o.tipo, regra: t ? t.regra : "padrao", nome: o.tipo + (o.dia ? " · " + dm(o.dia) : ""), inicio: o.dia || "", fim: o.dia || "" }); saveCart(ui.loja, cart); }
    }
    saveUi();
  }
  root.N7Promocoes = { render, focus, _ui: ui };
})(typeof window !== "undefined" ? window : globalThis);
