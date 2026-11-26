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
  const TABS = [["visao", "Visão geral"], ["candidatos", "Candidatos"], ["campanha", "Montar campanha"], ["campanhas", "Campanhas"], ["resultado", "Resultado"], ["analise", "Análise completa"], ["importar", "Importar"]];
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
  const STEPS = ["rascunho", "aprovada", "publicada", "encerrada"], STEP_NAME = { rascunho: "Rascunho", aprovada: "Aprovada", publicada: "Publicada", encerrada: "Encerrada" };
  const NEXT = { rascunho: [["aprovada", "Aprovar", true]], aprovada: [["publicada", "Publicar", true], ["rascunho", "Voltar a rascunho", false]], publicada: [["encerrada", "Encerrar", false]], encerrada: [] };
  const stepper = st => `<span class="steps" aria-label="Situação">${STEPS.map((x, i) => `<i class="${x === st ? "on" : STEPS.indexOf(st) > i ? "done" : ""}">${STEP_NAME[x]}</i>`).join("")}</span>`;
  const quem = x => { const a = x.totais && x.totais.aprovacao; return a ? `<div class="src">aprovada por ${esc(a.por)} em ${esc((a.em || "").slice(0, 10).split("-").reverse().join("/"))}${a.estoqueEm ? ` · estoque de ${esc(a.estoqueEm.split("-").reverse().join("/"))}` : ""}</div>` : ""; };
  function savedView(c) {
    const list = c.data.campanhas;
    return `<div class="panel">${H.banner("file", "Campanhas desta loja", `${list.length} salva(s) · Rascunho, Aprovada, Publicada e Encerrada`)}
      <p class="src" style="padding:0 16px">Aprovar e publicar passam por uma conferência no servidor: estoque, custo, piso de margem e preço terminando em ,90, com a base de agora. O servidor registra quem aprovou.</p>
      <div class="table-wrap"><table><thead><tr><th>Campanha</th><th>Tipo</th><th>Período</th><th class="num">Itens</th><th class="num">Margem</th><th>Situação</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr><td><b>${esc(x.nome)}</b><div class="src">por ${esc(x.criadoPor)} · ${esc((x.criadoEm || "").slice(0, 10).split("-").reverse().join("/"))}</div>${quem(x)}</td><td>${esc(x.tipo)}</td><td>${x.inicio ? dm(x.inicio) : "—"}${x.fim ? " a " + dm(x.fim) : ""}</td><td class="num">${x.itens.length}</td><td class="num">${x.totais && x.totais.margemBase != null ? pct(x.totais.margemBase) : "—"}</td><td>${stepper(x.status)}</td>
        <td style="text-align:right;white-space:nowrap"><button type="button" class="btn sm" data-open="${esc(x.id)}">Abrir</button>${podeEditar ? NEXT[x.status].map(([to, nome, main]) => ` <button type="button" class="btn sm${main ? " primary" : ""}" data-st="${esc(x.id)}" data-to="${to}">${nome}</button>`).join("") + ` <button type="button" class="btn sm" data-del="${esc(x.id)}">Apagar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">Nenhuma campanha salva.</div></td></tr>`}
      </tbody></table></div></div>`;
  }

  /* ---------- resultado das campanhas ---------- */
  function resultView(c) {
    const list = c.data.campanhas.filter(x => x.status !== "rascunho");
    if (!list.length) return `<div class="panel"><div class="panel-body"><p class="notice info">Nenhuma campanha aprovada ainda. O resultado aparece aqui depois que a campanha for aprovada e as vendas dos dias dela forem importadas.</p></div></div>`;
    const CLS = { ESCALAR: "st-pub", MANTER: "st-pub", CORRIGIR: "p0", ENCERRAR: "p0", TESTAR: "p1", INCONCLUSIVO: "" };
    const num = (v, f) => (v == null ? `<span class="na">sem dado</span>` : f(v));
    const sg = v => (v >= 0 ? "+" : "") + dec(v * 100, 0) + "%";
    return list.map(x => {
      const r = P.resultadoCampanha(x, c.data.items, c.data.intervalos);
      const cab = H.banner("chart", esc(x.nome), `${esc(x.tipo)} · ${x.inicio ? dm(x.inicio) : "—"}${x.fim ? " a " + dm(x.fim) : ""} · ${STEP_NAME[x.status]}`, `<span class="badge ${CLS[r.classe]}">${r.classe}</span><span class="badge">confiança ${r.confianca}</span>`);
      const kp = r.dias >= 2 && r.unBase >= 10 ? `<div class="kpis">${H.kpi("Unidades vendidas", int(r.un), `esperado ${dec(r.unBase, 0)} · ${r.lift == null ? "sem base" : sg(r.lift)}`, "cart", "green")}${H.kpi("Receita", brl(r.receita), `esperado ${brl(r.receitaBase)}`, "money", "green")}${H.kpi("Margem", brl(r.margem), `esperado ${brl(r.margemBase)}`, "target", "amber")}${H.kpi("Margem incremental", (r.margemIncremental >= 0 ? "+" : "") + brl(r.margemIncremental), "contra o esperado nos mesmos dias da semana", "chart", r.margemIncremental >= 0 ? "green" : "red")}</div>` : "";
      const rows = r.porItem.slice().sort((a, b) => ((b.margem || 0) - (b.margemBase || 0)) - ((a.margem || 0) - (a.margemBase || 0)));
      const tab = rows.length && r.dias >= 2 ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Unid.</th><th class="num">Esperado</th><th class="num">Variação</th><th class="num">Margem</th><th class="num">Esperada</th></tr></thead><tbody>${rows.map(i => `<tr><td>${esc(i.d)}</td><td class="num">${int(i.un)}</td><td class="num">${dec(i.unBase, 1)}</td><td class="num">${i.lift == null ? "—" : sg(i.lift)}</td><td class="num">${num(i.margem, brl)}</td><td class="num">${num(i.margemBase, brl)}</td></tr>`).join("")}</tbody></table></div>` : "";
      return `<div class="panel">${cab}<div class="panel-body">${r.texto ? `<p><b>${esc(r.texto)}</b></p>` : ""}${kp}${r.motivos.map(m => `<p class="src">${esc(m)}</p>`).join("")}</div>${tab}</div>`;
    }).join("");
  }

  /* ---------- importar ---------- */
  function importView(c) {
    const d = c.data, imp = d.importacoes;
    return `
      ${!podeEditar ? `<p class="notice info">Seu acesso é só de leitura: você vê as importações, mas não importa.</p>` : ""}
      <div id="im-agente"></div>
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

  /* ---------- leitura no computador da agência (PowerShell) ----------
     De qualquer aparelho: o arquivo vai em pedaços para a fila do site, o computador da agência (Agente.ps1) busca, lê, CONFERE ao centavo e devolve;
     o resultado volta para esta tela e é gravado pelo fluxo de sempre. Se o computador estiver desligado, a leitura é feita aqui no navegador. */
  const ag = { ok: false, info: null, em: 0 }, PARTE = 3500000, dorme = ms => new Promise(r => setTimeout(r, ms));
  async function detectarAgente(force) {
    if (!force && Date.now() - ag.em < 5000) return ag.ok;
    ag.em = Date.now();
    try { const j = await api("/api/leitura?acao=estado"); ag.ok = !!j.online; ag.info = j; } catch (e) { ag.ok = false; ag.info = null; }
    return ag.ok;
  }
  const rawPost = async (url, body, tipo) => { const r = await fetch(url, { method: "POST", headers: { "X-N7": "1", "Content-Type": tipo || "application/json" }, body }), j = await r.json().catch(() => ({})); if (r.status === 401) { location.reload(); throw new Error("Sua sessão terminou."); } if (!r.ok) throw new Error(j.error || "Falha ao enviar o arquivo."); return j; };
  async function lerNoAgente(rota, file, onStatus = () => {}) {
    const tipo = rota === "/ler-vendas" ? "vendas" : "estoque", partes = Math.max(1, Math.ceil(file.size / PARTE));
    const { id } = await rawPost("/api/leitura?acao=nova", JSON.stringify({ loja: ui.loja, tipo, nome: file.name, bytes: file.size, partes }));
    let pronto = false;
    try {
      for (let n = 0; n < partes; n++) { onStatus(`enviando para o computador da agência (${n + 1}/${partes})…`); await rawPost(`/api/leitura?acao=parte&id=${id}&n=${n}`, file.slice(n * PARTE, (n + 1) * PARTE), "application/octet-stream"); }
      await rawPost(`/api/leitura?acao=pronto&id=${id}`, "{}");
      const t0 = Date.now(); let st;
      for (;;) {
        await dorme(1500); st = await api(`/api/leitura?acao=status&id=${id}`);
        if (st.estado === "pronto") break;
        if (st.estado === "erro") throw new Error(st.erro || "O computador da agência não conseguiu ler o arquivo.");
        if (st.estado === "cancelado") throw new Error("A leitura foi cancelada.");
        const seg = Math.round((Date.now() - t0) / 1000);
        onStatus(st.estado === "lendo" ? `lendo no computador da agência… ${seg} s` : `na fila do computador da agência… ${seg} s`);
        if (st.estado === "aguardando" && seg > 45 && !(await detectarAgente(true))) throw new Error("O computador da agência parou de responder (Agente.ps1 desligado?).");
        if (seg > 20 * 60) throw new Error("A leitura demorou demais (mais de 20 minutos).");
      }
      const bufs = []; for (let n = 0; n < st.resultadoPartes; n++) { const r = await fetch(`/api/leitura?acao=resultado&id=${id}&n=${n}`, { headers: { "X-N7": "1" } }); if (!r.ok) throw new Error("Não consegui baixar o resultado da leitura."); bufs.push(new Uint8Array(await r.arrayBuffer())); }
      const all = new Uint8Array(bufs.reduce((t, b) => t + b.length, 0)); let o = 0; bufs.forEach(b => { all.set(b, o); o += b.length; });
      pronto = true; rawPost(`/api/leitura?acao=limpar&id=${id}`, "{}").catch(() => {});
      return JSON.parse(new TextDecoder().decode(all));
    } catch (e) { if (!pronto) rawPost(`/api/leitura?acao=cancelar&id=${id}`, "{}").catch(() => {}); throw e; }
  }
  const confLista = checks => `<ul class="conf">${checks.map(c => `<li class="${c.ok ? (c.aviso ? "w" : "ok") : "x"}">${c.ok ? (c.aviso ? "⚠" : "✔") : "✘"} ${esc(c.aviso ? c.detalhe : c.msg)}${!c.ok && c.detalhe ? `<br><code>${esc(JSON.stringify(c.detalhe).slice(0, 300))}</code>` : ""}</li>`).join("")}</ul>`;
  const agenteBadge = () => ag.ok
    ? `<p class="notice info"><b>Leitura no computador da agência (PowerShell): ligada</b>${ag.info && ag.info.computador ? " · " + esc(ag.info.computador) : ""} · ${int((ag.info && ag.info.nucleos) || 0)} núcleo(s). Pode enviar o arquivo de qualquer aparelho: ele é lido e conferido ao centavo com o total do relatório antes de gravar.</p>`
    : `<p class="notice"><b>Computador da agência desligado.</b> Vou ler aqui no navegador, sem a conferência ao centavo com o total do relatório. Para ligar: no computador da agência, abra o PowerShell, entre na pasta <code>scripts\\analise-local</code> e rode <code>.\\Agente.ps1</code> (deixe a janela aberta). <button type="button" class="btn sm" id="im-agente-rv">Verificar de novo</button></p>`;

  /* Análise completa: o que o computador da agência publicou para esta loja */
  async function analiseView() {
    let a = null;
    try { const j = await api("/api/leitura?acao=analise"); a = (j.lojas || {})[ui.loja] || null; } catch (e) { return `<p class="notice">${esc(e.message)}</p>`; }
    if (!a) return `<div class="panel">${H.banner("target", "Análise completa de ${esc(clientOf(ui.loja).name)}", "ainda não há análise publicada")}<div class="panel-body"><p class="notice info">Esta análise é feita pelo <b>computador da agência</b> (PowerShell) com os relatórios de vendas já conferidos, e vai crescendo conforme você solta relatórios <b>novos</b> em <a href="#promocoes/importar">Importar</a> (fracionados por dia, semana ou mês; o que já foi lido não conta duas vezes). Deixe o <code>Agente.ps1</code> ligado e solte o primeiro PDF.</p></div></div>`;
    return root.N7AnaliseVendas.html(a, H);
  }

  async function prepareStock(v, c, file) {
    const out = $("#im-est-out", v); out.innerHTML = `<p class="src">Lendo ${esc(file.name)}…</p>`;
    try {
      let r, conf = null;
      if (await detectarAgente()) {
        try {
          conf = await lerNoAgente("/ler-estoque", file, m => { out.innerHTML = `<p class="src">${esc(file.name)}: ${esc(m)}</p>`; });
          if (!conf.ok) { out.innerHTML = `<div class="paste-res"><b>${esc(file.name)}: arquivo recusado pela conferência</b>${confLista(conf.checks)}</div>`; return; }
          r = { items: conf.items, stats: Object.assign({}, conf.stats, { linhas: conf.produtosNoArquivo }), erro: null };
        } catch (e) { conf = null; ag.ok = false; H.toast("Leitura no computador da agência falhou (" + e.message + "). Lendo aqui no navegador."); }
      }
      if (!conf) { const grid = await F.readStockFile(file); r = I.parseStockGrid(grid); }
      if (r.erro) { out.innerHTML = `<p class="notice">${esc(r.erro)}</p>`; return; }
      const bases = {}; for (const l of lojas) { const x = cache[l.key] || (l.key === ui.loja ? c : null); if (x) bases[l.key] = x.data.items; }
      const prov = P.lojaProvavel(r.items, bases), mine = prov[ui.loja], other = Object.keys(prov).find(k => k !== ui.loja);
      const trocada = other && prov[other].pct != null && prov[other].pct >= 0.7 && !(mine && mine.pct != null && mine.pct >= 0.5);
      const st = r.stats; pend.estoque = { items: r.items, arquivo: file.name };
      out.innerHTML = `<div class="paste-res">${conf ? confLista(conf.checks) + (conf.omitidosSemEstoque ? `<p class="notice info">Para caber no limite do site, só os ${int(r.items.length)} produtos <b>com estoque</b> serão gravados (${int(conf.omitidosSemEstoque)} com estoque zero ficam de fora; a promoção não usa produto sem estoque).</p>` : "") : ""}<b>${int(st.linhas)} produtos lidos</b> · ${int(st.semCusto)} sem custo (${pct(st.semCusto / st.linhas)})${st.duplicados ? ` · ${st.duplicados} duplicados ignorados` : ""}${st.semBarras ? ` · ${st.semBarras} sem código de barras ignorados` : ""}
        ${!st.temCusto ? `<p class="notice">A planilha não tem a coluna de custo (Últ. Prc. Entrada): sem custo não existe piso.</p>` : ""}
        ${st.semCusto / st.linhas > 0.3 ? `<p class="notice"><b>Muitos itens sem custo.</b> Neles dá para sugerir preço, mas não dá para afirmar que o piso é respeitado.</p>` : ""}
        ${trocada ? `<p class="notice"><b>Esta planilha parece ser de ${esc(clientOf(other).name)}, não de ${esc(clientOf(ui.loja).name)}:</b> o custo dos produtos em comum bate com a outra loja (${pct(prov[other].pct)}). Confira antes de gravar.</p>` : (mine && mine.pct != null ? `<p class="src">Conferência: o custo de ${pct(mine.pct)} dos produtos em comum bate com a base atual desta loja.</p>` : "")}
        ${podeEditar ? `<button type="button" class="btn primary" id="im-est-go">Gravar estoque de ${esc(clientOf(ui.loja).name)}</button>` : ""}</div>`;
      const go = $("#im-est-go", v); if (go) go.onclick = () => commit(v, go, async () => { const rr = await api("/api/promo", { action: "estoque", loja: ui.loja, items: pend.estoque.items, arquivo: pend.estoque.arquivo }); return `Estoque gravado: ${rr.produtos} produtos${rr.foraDaLista ? ` (${rr.foraDaLista} saíram da lista e ficaram com estoque 0)` : ""}.`; });
    } catch (e) { out.innerHTML = `<p class="notice">${esc(e.message)}</p>`; }
  }

  /* ---------- janela inteira do relatório: semana a semana, dia a dia ---------- */
  const R$ = c => (c == null ? "—" : brl(c / 100));
  function janelaHtml(jn) {
    if (!jn) return "";
    const comp = jn.semanas.filter(w => w.completa).length;
    return `<details class="jan"><summary><b>Janela de ${int(jn.nDias)} dias</b> (${dm(jn.inicio)} a ${dm(jn.fim)}) · ${comp} semana(s) completa(s) · ${R$(jn.vendasCentavos)} — ver semana a semana e dia a dia</summary>
      <div class="table-wrap"><table><thead><tr><th>Semana</th><th></th><th class="num">Vendas</th><th class="num">Cupons</th><th class="num">Ticket</th><th class="num">Cestas &gt; R$ 100</th></tr></thead><tbody>${jn.semanas.map(w => `<tr><td>${dm(w.inicio)} a ${dm(w.fim)}</td><td>${w.completa ? "completa" : `parcial (${w.diasCobertos} d)`}</td><td class="num">${R$(w.vendasCentavos)}</td><td class="num">${int(w.cupons)}</td><td class="num">${R$(w.ticketCentavos)}</td><td class="num">${int(w.c100n)}</td></tr>`).join("")}</tbody></table></div>
      ${jn.diasSemVenda.length ? `<p class="notice">Dias dentro da janela <b>sem nenhuma venda</b>: ${esc(jn.diasSemVenda.map(dm).join(", "))}. Loja fechada ou relatório incompleto?</p>` : ""}
      ${jn.diasAtipicos.length ? `<p class="src">Fora do padrão (contra a mediana do mesmo dia da semana): ${esc(jn.diasAtipicos.slice(0, 8).map(a => dm(a.d) + " " + R$(a.vendasCentavos)).join(" · "))}</p>` : ""}
      <div class="table-wrap"><table><thead><tr><th>Dia</th><th class="num">Vendas</th><th class="num">Cupons</th><th class="num">Itens</th></tr></thead><tbody>${jn.porDia.map(x => `<tr><td>${dm(x.d)}</td><td class="num">${R$(x.v)}</td><td class="num">${int(x.cupons)}</td><td class="num">${int(x.itens)}</td></tr>`).join("")}</tbody></table></div></details>`;
  }
  const semanaLoja = (inicio, loja) => (((root.N7Store && root.N7Store.get("weeks", [])) || []).find(r => r.tipo === "semana" && r.inicio === inicio && r.marca === loja)) || null;
  /* semanas completas dos PDFs conferidos; se dois PDFs trazem a mesma semana, vale o emitido por último */
  function semanasPendentes() {
    const m = new Map(); (pend.janelas || []).forEach(x => x.semanas.forEach(w => { const o = m.get(w.inicio); if (!o || x.emissao >= o.emissao) m.set(w.inicio, { w, emissao: x.emissao, nome: x.nome }); }));
    return [...m.values()].map(x => x.w).sort((a, b) => a.inicio.localeCompare(b.inicio)).map(w => {
      const old = semanaLoja(w.inicio, ui.loja), igual = old && Math.round((old.vendas || 0) * 100) === w.vendasCentavos && (old.compras || 0) === w.cupons;
      return { w, old, estado: !old || old.vendas == null ? "nova" : igual ? "igual" : "difere" };
    });
  }
  function gravarSemanas(lista) {
    const A = root.N7Analysis, S = root.N7Store; if (!A || !S) throw new Error("A tela Semana não carregou. Recarregue a página.");
    const cur = (S.get("weeks", []) || []).slice();
    lista.forEach(({ w, old }) => {
      const base = Object.assign({ tipo: "semana", inicio: w.inicio, fim: w.fim, marca: ui.loja }, A.norm({}), old ? A.norm(old) : {});
      const row = Object.assign(base, { vendas: w.vendasCentavos / 100, compras: w.cupons, c100n: w.c100n, c100rs: w.c100Centavos / 100, dias: w.dias7.map(v => (v == null ? null : v / 100)),
        janela: old ? old.janela || "" : "", fonte: "PDF de vendas conferido ao centavo (PowerShell)", obs: old && old.obs ? old.obs : "Vendas = total do relatório (inclui taxa de entrega e arredondamentos); compras = cupons; cestas = cupons acima de R$ 100." });
      if (old) row.v = old.v;
      const i = cur.findIndex(r => r.tipo === "semana" && r.inicio === w.inicio && r.marca === ui.loja);
      if (i >= 0) cur[i] = row; else cur.push(row);
    });
    S.set("weeks", cur);
  }
  function semanasBox(out) {
    const box = document.createElement("div"); box.className = "paste-res"; const lista = semanasPendentes(); if (!lista.length) return;
    const novas = lista.filter(x => x.estado === "nova"), difere = lista.filter(x => x.estado === "difere"), iguais = lista.filter(x => x.estado === "igual");
    box.innerHTML = `<b>Semana a semana para a Análise semanal</b><p class="src">Só semanas completas (segunda a domingo) de relatórios que fecharam ao centavo. Vendas = total do relatório, compras = cupons, cestas = cupons acima de R$ 100. ${novas.length} nova(s) · ${iguais.length} já igual(is) · ${difere.length} diferente(s) do que está na tela Semana.</p>
      ${difere.length ? `<div class="table-wrap"><table><thead><tr><th>Semana</th><th class="num">No site hoje</th><th class="num">No PDF</th></tr></thead><tbody>${difere.map(x => `<tr><td>${dm(x.w.inicio)} a ${dm(x.w.fim)}</td><td class="num">${brl(x.old.vendas || 0)}</td><td class="num">${R$(x.w.vendasCentavos)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${podeEditar ? `<div class="toolbar">${novas.length ? `<button type="button" class="btn primary" id="im-sem-novas">Gravar ${novas.length} semana(s) nova(s) na Análise semanal</button>` : ""}${difere.length ? ` <button type="button" class="btn" id="im-sem-dif">Substituir também as ${difere.length} que já existem e diferem</button>` : ""}</div>` : ""}`;
    out.appendChild(box);
    const go = (id, l) => { const b = box.querySelector(id); if (b) b.onclick = () => { try { gravarSemanas(l); H.toast(`${l.length} semana(s) gravada(s) na Análise semanal.`); b.disabled = true; } catch (e) { H.toast(e.message); } }; };
    go("#im-sem-novas", novas); go("#im-sem-dif", difere);
  }

  /* resultado do agente local para um PDF de vendas: mostra a conferência e só deixa gravar se TUDO fechou */
  function cardAgente(card, file, j, last) {
    const h = j.header || {}, cov = j.cobertura, cnpjDiff = last && h.cnpj && last !== h.cnpj;
    const naOutra = h.cnpj && lojas.find(l => l.key !== ui.loja && cache[l.key] && cache[l.key].data.importacoes.some(x => String(x.arquivo || "").includes("CNPJ " + h.cnpj)));
    const nomeOutra = lojas.find(l => l.key !== ui.loja && h.empresa && new RegExp(String(l.name).split(" ")[0], "i").test(h.empresa) && !new RegExp(String(clientOf(ui.loja).name).split(" ")[0], "i").test(h.empresa));
    const outraLoja = naOutra || nomeOutra, bloqueio = outraLoja ? `<p class="notice"><b>Este PDF parece ser de ${esc(outraLoja.name)}, não de ${esc(clientOf(ui.loja).name)}</b> (${h.cnpj && naOutra ? "o CNPJ " + esc(h.cnpj) + " já foi importado lá" : "a empresa do cabeçalho é " + esc(h.empresa)}). Troque a loja no topo da tela e envie de novo; nada será gravado aqui.</p>` : "";
    card.innerHTML = `<b>${esc(file.name)}</b> <span class="src">${j.ok ? "✔ conferido ao centavo" : "✘ recusado pela conferência"}</span><div class="src">${esc(h.empresa || "empresa não identificada")}${h.cnpj ? " · CNPJ " + esc(h.cnpj) : ""} · ${int(j.paginas)} página(s) · emitido ${h.emissao ? dm(h.emissao.data) + " " + esc(h.emissao.hora) : "—"} · lido em ${dec((j.ms || 0) / 1000, 1)} s</div>
      <p><b>${int(j.linhas)} vendas lidas</b>${j.ajustes ? ` (+ ${j.ajustes} ajuste(s) de arredondamento)` : ""}${h.periodo ? ` · período ${dm(h.periodo.inicio)} a ${dm(h.periodo.fim)}` : ""} · ${int(j.nProdutos)} produtos · ${brl((j.totalProdutosCentavos || 0) / 100)} em produtos</p>
      ${confLista(j.checks || [])}
      ${janelaHtml(j.janela)}
      ${j.diaParcial ? `<p class="notice info">O relatório saiu no último dia durante o expediente: <b>${dm(j.diaParcial)} fica de fora</b> por estar cortado. Cobertura gravada: ${cov ? dm(cov.inicio) + " a " + dm(cov.fim) : "—"}.</p>` : ""}
      ${bloqueio}${cnpjDiff ? `<p class="notice"><b>O CNPJ deste PDF (${esc(h.cnpj)}) é diferente do último importado nesta loja (${esc(last)}).</b> Confira se é a loja certa antes de gravar.</p>` : ""}`;
    if (j.ok && cov && !outraLoja && j.janela) pend.janelas.push({ nome: file.name, emissao: h.emissao ? h.emissao.data + h.emissao.hora : "", semanas: j.janela.semanas.filter(w => w.completa) });
    pend.vendas.push({ nome: file.name, produtos: j.produtos, inicio: cov && cov.inicio, fim: cov && cov.fim, dia: j.diaParcial || "", linhas: j.linhas, cand: j.linhas, cnpj: h.cnpj || "", ok: !!(j.ok && cov && !outraLoja), conf: { totalCentavos: j.totalRodapeCentavos, somaCentavos: j.somaCentavos } });
  }

  async function prepareSales(v, c, files) {
    const out = $("#im-ven-out", v); pend.vendas = []; pend.janelas = []; out.innerHTML = "";
    const last = c.data.importacoes.filter(x => x.tipo === "vendas" && /CNPJ (\d{14})/.test(x.arquivo)).map(x => (x.arquivo.match(/CNPJ (\d{14})/) || [])[1])[0];
    const usaAgente = await detectarAgente();
    const cards = files.map(file => { const card = document.createElement("div"); card.className = "paste-res"; card.innerHTML = `<b>${esc(file.name)}</b> <span class="src">${usaAgente ? "enviando para o computador da agência…" : "lendo…"}</span>`; out.appendChild(card); return card; });
    const lidos = usaAgente ? files.map((f, i) => lerNoAgente("/ler-vendas", f, m => { const s = cards[i].querySelector(".src"); if (s) s.textContent = m; }).catch(e => ({ falhaAgente: e }))) : null;
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi], card = cards[fi];
      if (lidos) {
        const j = await lidos[fi];
        if (!j.falhaAgente) { cardAgente(card, file, j, last); continue; }
        ag.ok = false; card.querySelector(".src").textContent = "o computador da agência não respondeu (" + j.falhaAgente.message + "); lendo aqui no navegador…";
      }
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
    semanasBox(out);
    const bloq = pend.vendas.filter(x => !x.ok); pend.vendas = pend.vendas.filter(x => x.ok);                /* leitura abaixo de 99,9% nunca é gravada */
    if (bloq.length) { const n = document.createElement("p"); n.className = "notice"; n.innerHTML = `<b>${bloq.length} relatório(s) bloqueado(s):</b> a leitura não passou na conferência (veja os itens com ✘ acima) e não substitui vendas já gravadas (${esc(bloq.map(x => x.nome).join(", "))}). Emita o relatório de novo; se passou de 1 MB, dia a dia.`; out.appendChild(n); }
    if (pend.vendas.length && podeEditar) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.id = "im-ven-go"; b.textContent = `Gravar ${pend.vendas.length} relatório(s) de vendas de ${clientOf(ui.loja).name}`; out.appendChild(b);
      b.onclick = () => commit(v, b, async () => {
        let n = 0;
        for (const x of pend.vendas) { b.textContent = `Gravando ${++n} de ${pend.vendas.length}…`; await api("/api/promo", { action: "vendas", loja: ui.loja, produtos: x.produtos, inicio: x.inicio, fim: x.fim, diaDescartado: x.dia, linhas: x.linhas, candidatas: x.cand, conferencia: x.conf || undefined, arquivo: (x.nome + (x.cnpj ? " · CNPJ " + x.cnpj : "") + (x.conf ? " · conferido" : "")).slice(0, 120) }); }
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
    host.innerHTML = tab === "visao" ? await overview(view, c) : tab === "candidatos" ? candidatesView(c) : tab === "campanha" ? campaignView(c) : tab === "campanhas" ? savedView(c) : tab === "resultado" ? resultView(c) : tab === "analise" ? await analiseView() : importView(c);
    wire(view, tab, c);
  }

  function wire(view, tab, c) {
    const redraw = () => draw(view, tab);
    if (tab === "visao") { const cb = $("#pm-cmp", view); if (cb) cb.onclick = () => { ui.compare = !ui.compare; redraw(); }; }
    if (tab === "candidatos") {
      $$("#pm-listas button", view).forEach(b => { b.onclick = () => { ui.lista = b.dataset.v; ui.limit = 50; saveUi(); redraw(); }; });
      const cat = $("#pm-cat", view); if (cat) cat.onchange = e => { ui.cat = e.target.value; ui.limit = 50; redraw(); };   /* sem dados da loja, a tela só mostra o aviso e esses campos não existem */
      const busca = $("#pm-q", view); let tm; if (busca) busca.oninput = e => { ui.q = e.target.value; ui.limit = 50; clearTimeout(tm); tm = setTimeout(() => { redraw(); setTimeout(() => { const q = $("#pm-q", view); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 0); }, 250); };
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
      $$("[data-st]", view).forEach(b => { b.onclick = async () => {
        const x = c.data.campanhas.find(y => y.id === b.dataset.st); if (!x) return; b.disabled = true;
        try { await api("/api/promo", { action: "campanha", loja: ui.loja, id: x.id, v: x.v, nome: x.nome, tipo: x.tipo, regra: x.regra, inicio: x.inicio, fim: x.fim, status: b.dataset.to, itens: x.itens, totais: x.totais }); bust(ui.loja); H.toast(`Campanha ${STEP_NAME[b.dataset.to].toLowerCase()}.`); redraw(); }
        catch (e) { H.toast(e.message); b.disabled = false; }
      }; });
      $$("[data-del]", view).forEach(b => { let armed = false; b.onclick = async () => {
        if (!armed) { armed = true; b.textContent = "Confirmar"; setTimeout(() => { armed = false; b.textContent = "Apagar"; }, 3500); return; }
        try { await api("/api/promo", { action: "campanha_apagar", loja: ui.loja, id: b.dataset.del }); bust(ui.loja); H.toast("Campanha apagada."); redraw(); } catch (e) { H.toast(e.message); }
      }; });
    }
    if (tab === "importar") {
      const mostra = async force => { await detectarAgente(force); const el = $("#im-agente", view); if (el) { el.innerHTML = agenteBadge(); const b = $("#im-agente-rv", view); if (b) b.onclick = () => mostra(true); } };
      mostra(true);
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
      <nav class="subtabs scroll in-side" aria-label="Central de Promoções">${TABS.map(([id, n]) => `<a href="#promocoes${id === "visao" ? "" : "/" + id}" ${id === tab ? 'aria-current="page"' : ""}>${n}</a>`).join("")}</nav>
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
