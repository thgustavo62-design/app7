/* Telas do Comercial (só administrador): Carteira atual, Clientes novos (ficha e posicionamento sugerido) e Contratos.
   A análise vem de comercial.js (funções puras); aqui só se monta a tela e se grava no armazenamento sincronizado. */
(function (root) {
  const C = root.N7Comercial, S = root.N7Store, SV = root.N7Services;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BRL = C.BRL;
  let H = null;
  const ui = { sel: null, ct: null, novo: null, ctDraft: null };
  const rid = p => p + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  const prospects = () => S.get("prospects", []) || [];
  const contracts = () => S.get("contracts", []) || [];
  const agency = () => S.get("agency", {}) || {};
  const team = () => (H && H.team ? H.team() : []);
  const dm = iso => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
  const chips = l => (l || []).map(s => `<span class="svc-chip" style="--svc:var(${SV.SERVICES[s] ? SV.SERVICES[s].color : "--c1"})">${esc(SV.SERVICES[s] ? SV.SERVICES[s].short : s)}</span>`).join("");
  const opts = (map, cur, vazio) => (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : "") + Object.entries(map).map(([k, n]) => `<option value="${esc(k)}"${k === cur ? " selected" : ""}>${esc(n)}</option>`).join("");
  const NIVEL = { alta: ["alta", "st-pub"], media: ["média", "p1"], baixa: ["baixa", ""] };

  /* ================= Carteira ================= */
  function carteira(view) {
    const cl = H.clients().map(c => ({ key: c.key, name: c.name, services: c.services, setor: c.setor }));
    const saude = {}; cl.forEach(c => { const s = H.saude(c); if (s != null) saude[c.key] = s; });
    const a = C.carteira({ clients: cl, contracts: contracts(), saude }), r = a.resumo, pros = prospects();
    const abertos = pros.filter(p => !["fechado", "perdido"].includes(p.etapa));
    const k = H.kpi;
    const kp = `<div class="kpis">${k("Clientes ativos", String(r.clientes), Object.entries(r.porSetor).map(([s, n]) => `${n} ${esc((SV.SECTORS[s] || s).toLowerCase())}`).join(" · ") || "—", "home")}
      ${k("Receita mensal recorrente", r.mrr ? BRL(r.mrr) : "sem dado", r.mrr ? "contratos assinados" : "registre os contratos em Contratos", "money", "green")}
      ${k("Oportunidades de venda", String(r.oportunidades), "serviços que combinam com o que o cliente já tem", "spark", "amber")}
      ${k("Clientes novos em aberto", String(abertos.length), abertos.length ? `${pros.filter(p => p.etapa === "proposta").length} com proposta enviada` : "cadastre a ficha em Clientes novos", "target")}</div>`;
    const linhas = a.linhas.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td>${esc(SV.SECTORS[l.setor] || l.setor || "—")}</td><td>${chips(l.servicos)}</td>
      <td class="num">${l.saude == null ? `<span class="na">sem dado</span>` : `<b style="color:var(${l.saude < 50 ? "--red" : "--green"})">${l.saude}</b>`}</td>
      <td>${l.contrato ? `${l.contrato.valor ? BRL(l.contrato.valor) : "sem valor"} <span class="badge ${l.contrato.status === "assinado" ? "st-pub" : "p1"}">${esc(l.contrato.status)}</span>` : `<span class="na">sem contrato</span>`}</td>
      <td>${l.oportunidades.map(o => `<div><b>${esc(SV.SERVICES[o.servico].short)}</b> <small class="src">${esc(o.motivo)}</small></div>`).join("") || `<span class="src">nenhuma agora</span>`}</td>
      <td>${l.atencao.map(t => `<div class="src">${esc(t)}</div>`).join("") || `<span class="src">—</span>`}</td></tr>`).join("");
    const cob = SV.ORDER.map(s => `<div class="mrow"><span>${esc(SV.SERVICES[s].name)}</span><b>${r.cobertura[s]} de ${r.clientes}</b></div>`).join("");
    const funil = Object.entries(C.ETAPAS).map(([e, n]) => `<div class="mrow"><span>${esc(n)}</span><b>${pros.filter(p => p.etapa === e).length}</b></div>`).join("");
    view.innerHTML = `${kp}
      <div class="panel">${H.banner("list", "Carteira atual", "serviços, saúde, contrato e onde dá para vender mais")}<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Setor</th><th>Serviços</th><th class="num">Saúde</th><th>Contrato</th><th>Oportunidades</th><th>Atenção</th></tr></thead><tbody>${linhas || `<tr><td colspan="7"><div class="empty">Nenhum cliente cadastrado.</div></td></tr>`}</tbody></table></div>
        <p class="src" style="padding:0 16px 12px">Saúde é a nota do Cérebro para quem tem redes sociais. A receita recorrente soma só contratos assinados. Oportunidade é uma sugestão por regra (o que o cliente tem e o setor dele), não uma previsão de venda.</p></div>
      <div class="grid g2"><div class="panel">${H.banner("chart", "Serviços na carteira", "quantos clientes têm cada serviço")}<div class="panel-body">${cob}</div></div>
        <div class="panel">${H.banner("target", "Funil de clientes novos", "fichas por etapa")}<div class="panel-body">${funil}<p><a href="#comercial/novos">Abrir as fichas →</a></p></div></div></div>`;
  }

  /* ================= Clientes novos ================= */
  const fld = (n, label, v, extra = "") => `<label class="fld"><span>${label}</span><input type="text" name="${n}" value="${esc(v ?? "")}" autocomplete="off"${extra}></label>`;
  const area = (n, label, v, rows = 2) => `<label class="fld wide"><span>${label}</span><textarea name="${n}" rows="${rows}" maxlength="800">${esc(v || "")}</textarea></label>`;
  function fichaForm(f) {
    const ro = !H.canWrite;
    return `<form id="cm-form" autocomplete="off" novalidate ${ro ? "" : ""}>
      <fieldset><legend>Quem é</legend><div class="fgrid">${fld("nome", "Nome do cliente", f.nome)}${fld("contato", "Contato (quem decide)", f.contato)}${fld("email", "E-mail", f.email)}${fld("telefone", "Telefone / WhatsApp", f.telefone)}${fld("cidade", "Cidade", f.cidade)}${fld("segmento", "Segmento (o que faz)", f.segmento)}
        <label class="fld"><span>Setor</span><select name="setor">${opts(SV.SECTORS, f.setor, "escolha")}</select></label>
        <label class="fld"><span>Porte</span><select name="porte">${opts(C.PORTES, f.porte, "escolha")}</select></label>${fld("tempo_mercado", "Tempo de mercado", f.tempo_mercado)}${fld("origem", "De onde veio", f.origem)}</div></fieldset>
      <fieldset><legend>O que ele quer</legend><div class="fgrid">
        <label class="fld"><span>Objetivo principal</span><select name="objetivo">${opts(C.OBJETIVOS, f.objetivo, "escolha")}</select></label>${fld("orcamento_midia", "Verba mensal de mídia (R$)", f.orcamento_midia == null ? "" : String(f.orcamento_midia).replace(".", ","), ' inputmode="decimal"')}${fld("prazo", "Prazo desejado", f.prazo)}${fld("canais", "Canais que usa hoje", f.canais)}</div>
        <div class="fgrid one">${area("publico", "Público-alvo (quem ele quer atingir)", f.publico)}${area("diferenciais", "Diferenciais (por que escolher ele)", f.diferenciais)}${area("concorrentes", "Concorrentes", f.concorrentes, 1)}${area("dor", "Dor principal (o que o fez procurar a agência)", f.dor)}</div>
        <p class="lbl">Serviços de interesse</p><div class="radio-row">${SV.ORDER.map(s => `<label class="check"><input type="checkbox" name="svc" value="${s}"${(f.servicos || []).includes(s) ? " checked" : ""}> ${esc(SV.SERVICES[s].name)}</label>`).join("")}</div></fieldset>
      <fieldset><legend>Andamento</legend><div class="fgrid">
        <label class="fld"><span>Etapa</span><select name="etapa">${opts(C.ETAPAS, f.etapa || "novo")}</select></label>
        <label class="fld"><span>Responsável</span><select name="responsavel"><option value="">ninguém</option>${team().map(u => `<option value="${esc(u.email)}"${u.email === f.responsavel ? " selected" : ""}>${esc(u.nome)}</option>`).join("")}</select></label>${fld("motivo", "Motivo (se perdido)", f.motivo)}</div>
        <div class="fgrid one">${area("observacoes", "Observações", f.observacoes, 3)}</div></fieldset></form>`;
  }
  function readFicha(view, base) {
    const f = $("#cm-form", view), g = n => (f.elements[n] ? f.elements[n].value.trim() : "");
    const orc = g("orcamento_midia").replace(/\./g, "").replace(",", ".");
    return Object.assign({}, base, { nome: g("nome"), contato: g("contato"), email: g("email"), telefone: g("telefone"), cidade: g("cidade"), segmento: g("segmento"), setor: g("setor"), porte: g("porte"), tempo_mercado: g("tempo_mercado"), origem: g("origem"), objetivo: g("objetivo"),
      orcamento_midia: orc === "" || isNaN(Number(orc)) ? null : Number(orc), prazo: g("prazo"), canais: g("canais"), publico: g("publico"), diferenciais: g("diferenciais"), concorrentes: g("concorrentes"), dor: g("dor"), servicos: $$("input[name=svc]:checked", f).map(x => x.value), etapa: g("etapa") || "novo", responsavel: g("responsavel"), motivo: g("motivo"), observacoes: g("observacoes") });
  }
  function analiseHtml(f) {
    const fit = C.fit(f), pos = C.posicionamento(f), c = fit.completude, n = NIVEL[fit.nivel];
    const li = l => `<ul class="plain">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
    return `<div class="panel">${H.banner("target", "Prioridade comercial", "regras explícitas, não é uma previsão", `<span class="badge ${n[1]}">${n[0]} · ${fit.score}/100</span>`)}<div class="panel-body">
        <div class="bar" style="margin-bottom:8px"><i style="width:${c.pct}%;background:var(--violet)"></i></div><p class="src">Ficha ${c.pct}% completa${c.faltam.length ? ` · falta: ${esc(c.faltam.join(", "))}` : ""}.</p>${li(fit.motivos)}</div></div>
      <div class="panel">${H.banner("spark", "Serviços recomendados", "pelo objetivo e pelo setor")}<div class="panel-body">${pos.servicos.length ? `<ul class="plain">${pos.servicos.map(r => `<li><b>${esc(SV.SERVICES[r.servico].name)}</b>${r.interesse ? ` <span class="badge st-pub">o cliente pediu</span>` : ""}<div class="src">${esc(r.motivos.join("; "))}</div></li>`).join("")}</ul>` : `<p class="src">Escolha o objetivo principal para ver as recomendações.</p>`}</div></div>
      <div class="panel">${H.banner("eye", "Posicionamento sugerido", "rascunho montado com a ficha e o Playbook do setor: valide com o cliente")}<div class="panel-body">
        <p class="lbl">Proposta de valor (rascunho)</p><p><b>${esc(pos.proposta)}</b></p>
        <p class="lbl">Tom de voz</p><p>${esc(pos.tom)}</p>
        ${pos.funil ? `<p class="lbl">Como esse público decide</p><p>${esc(pos.funil)}</p>` : ""}
        <p class="lbl">Pilares de conteúdo</p>${li(pos.pilares)}<p class="lbl">Canais para priorizar</p>${li(pos.canais)}${pos.formatos.length ? `<p class="lbl">Formatos que funcionam no setor</p>${li(pos.formatos)}` : ""}${pos.sazonalidade.length ? `<p class="lbl">Datas e épocas do setor</p>${li(pos.sazonalidade)}` : ""}
        <p class="lbl">Cuidados antes de publicar</p>${li(pos.cuidados)}${pos.armadilhas.length ? `<p class="lbl">Erros comuns no setor</p>${li(pos.armadilhas)}` : ""}</div></div>
      <div class="panel">${H.banner("cal", "Primeiros 30 dias e indicadores", "o que combinar com o cliente")}<div class="panel-body">${li(pos.plano30)}<p class="lbl">O que vamos medir</p><ul class="plain">${pos.indicadores.map(i => `<li><b>${esc(SV.SERVICES[i.servico].short)}:</b> ${esc(i.kpi)}</li>`).join("") || "<li>Defina os serviços para ver os indicadores.</li>"}</ul></div></div>
      ${pos.alertas.length ? `<div class="panel">${H.banner("alert", "Pontos de atenção", `${pos.alertas.length}`)}<div class="panel-body">${pos.alertas.map(a => `<p class="notice${a.nivel === "info" ? " info" : ""}">${esc(a.texto)}</p>`).join("")}</div></div>` : ""}`;
  }
  function novos(view) {
    const list = prospects().slice().sort((a, b) => (a.etapa === "fechado" || a.etapa === "perdido") - (b.etapa === "fechado" || b.etapa === "perdido") || (a.nome || "").localeCompare(b.nome || ""));
    if (ui.novo) { ui.sel = ui.novo.id; }
    const cur = ui.novo || list.find(p => p.id === ui.sel) || null;
    const itens = list.map(p => { const fit = C.fit(p); return `<button type="button" class="cm-item${cur && cur.id === p.id ? " on" : ""}" data-pick="${esc(p.id)}"><b>${esc(p.nome)}</b><small>${esc(SV.SECTORS[p.setor] || "sem setor")} · ${esc(C.ETAPAS[p.etapa] || "")}</small><span class="badge ${NIVEL[fit.nivel][1]}">prioridade ${NIVEL[fit.nivel][0]}</span></button>`; }).join("");
    view.innerHTML = `<div class="cm-wrap"><aside class="cm-list"><div class="toolbar">${H.canWrite ? `<button type="button" class="btn primary sm" id="cm-new">+ Nova ficha</button>` : ""}<span class="src">${list.length} ficha(s)</span></div>${itens || `<p class="src">Nenhuma ficha ainda. Clique em Nova ficha para cadastrar um cliente em potencial.</p>`}</aside>
      <section class="cm-main">${cur ? `<div class="panel">${H.banner("file", esc(cur.nome || "Nova ficha"), "ficha do cliente", H.canWrite ? `<span class="badge" id="cm-dirty" hidden>não salva</span><button type="button" class="btn sm primary" id="cm-save">Salvar</button>${prospects().some(p => p.id === cur.id) ? `<a class="btn sm" href="#comercial/contratos" id="cm-contract">Montar contrato</a><button type="button" class="btn sm" id="cm-del">Excluir</button>` : ""}` : "")}<div class="panel-body">${fichaForm(cur)}</div></div><h2 class="sec-title">Análise e posicionamento</h2><div id="cm-analise">${analiseHtml(cur)}</div>` : `<div class="panel"><div class="panel-body"><p class="src">Escolha uma ficha à esquerda ou crie uma nova. Ao preencher, a análise e o posicionamento sugerido aparecem aqui.</p></div></div>`}</section></div>`;
    $$("[data-pick]", view).forEach(b => b.onclick = () => { ui.novo = null; ui.sel = b.dataset.pick; render(view.closest("#view") || view, "novos", H); });
    const nw = $("#cm-new", view); if (nw) nw.onclick = () => { ui.novo = { id: rid("p-"), nome: "", etapa: "novo", servicos: [] }; render(view.closest("#view") || view, "novos", H); };
    if (!cur) return;
    const f = $("#cm-form", view); if (!f) return;
    if (!H.canWrite) $$("input,select,textarea", f).forEach(x => { x.disabled = true; });
    let draft = cur;
    const refresh = () => { draft = readFicha(view, cur); $("#cm-analise", view).innerHTML = analiseHtml(draft); const d = $("#cm-dirty", view); if (d) d.hidden = false; };
    $$("input,select,textarea", f).forEach(x => x.addEventListener("change", refresh));
    const sv = $("#cm-save", view);
    if (sv) sv.onclick = () => {
      draft = readFicha(view, cur); if (!draft.nome) return H.toast("Dê um nome à ficha.");
      const l = JSON.parse(JSON.stringify(prospects())), i = l.findIndex(p => p.id === draft.id);
      if (i >= 0) l[i] = Object.assign({}, draft, { v: l[i].v }); else l.push(draft);
      S.set("prospects", l); ui.novo = null; ui.sel = draft.id; H.toast("Ficha salva."); render(view.closest("#view") || view, "novos", H);
    };
    const del = $("#cm-del", view); if (del) { let armed = false; del.onclick = () => { if (!armed) { armed = true; del.textContent = "Confirmar"; setTimeout(() => { armed = false; del.textContent = "Excluir"; }, 3500); return; } S.set("prospects", prospects().filter(p => p.id !== cur.id)); ui.sel = null; ui.novo = null; H.toast("Ficha excluída."); render(view.closest("#view") || view, "novos", H); }; }
    const mk = $("#cm-contract", view); if (mk) mk.onclick = () => { ui.ct = null; ui.ctDraft = { novo: true, cliente_tipo: "prospect", cliente_ref: cur.id }; };
  }

  /* ================= Contratos ================= */
  const stNome = { rascunho: "Rascunho", enviado: "Enviado", assinado: "Assinado", encerrado: "Encerrado" };
  const AGENCIA_CAMPOS = [["razao_social", "Razão social"], ["nome_fantasia", "Nome fantasia"], ["cnpj", "CNPJ"], ["endereco", "Endereço"], ["cidade", "Cidade e UF"], ["representante", "Representante legal"], ["cpf_representante", "CPF do representante"], ["email", "E-mail"], ["telefone", "Telefone"], ["foro", "Foro (cidade)"], ["pix", "Chave PIX (opcional)"]];
  function contratante(ref, tipo) {
    if (tipo === "cliente") { const c = H.clients().find(x => x.key === ref); return c ? { nome: c.name, setor: c.setor, cidade: "" } : { nome: "" }; }
    const p = prospects().find(x => x.id === ref); return p ? { nome: p.nome, setor: p.setor, cidade: p.cidade || "", representante: p.contato || "" } : { nome: "" };
  }
  function ctDefault(tipo, ref) {
    const cont = contratante(ref, tipo), p = tipo === "prospect" ? prospects().find(x => x.id === ref) : null, c = tipo === "cliente" ? H.clients().find(x => x.key === ref) : null;
    const svs = (p ? p.servicos : c ? c.services : []) || [];
    return { id: rid("ct-"), cliente_tipo: tipo, cliente_ref: ref, cliente_nome: cont.nome, servicos: svs, valores: {}, inicio: "", meses: 12, vencimento: 5, reajuste: "ipca", status: "rascunho", texto: "", dados: { contratante: { doc: "", endereco: "", cidade: cont.cidade || "", representante: cont.representante || "", setor: cont.setor || "" }, escopos: {}, params: {}, cond: { aviso_dias: 30, multa_atraso: 2, juros: 1, prazo_aprovacao: 3, tacita: false, verba_midia: "" } } };
  }
  function montar(ct) {
    const d = ct.dados || {}, cont = Object.assign({ nome: ct.cliente_nome }, d.contratante || {}), ag = agency();
    const servicos = (ct.servicos || []).map(id => ({ id, valor: Number(ct.valores[id]) || 0, escopo: (d.escopos || {})[id] || C.escopoPadrao(id, (d.params || {})[id] || {}) }));
    return C.gerarContrato({ agencia: ag, contratante: cont, servicos, condicoes: Object.assign({}, d.cond, { inicio: ct.inicio, meses: ct.meses || 12, vencimento: ct.vencimento || 5, reajuste: ct.reajuste }), data: "" });
  }
  const num = v => { const t = String(v ?? "").replace(/\./g, "").replace(",", ".").trim(); return t === "" || isNaN(Number(t)) ? 0 : Number(t); };
  function contratos(view) {
    const root0 = view.closest("#view") || view, list = contracts().slice().sort((a, b) => (b.atualizado_em || "").localeCompare(a.atualizado_em || ""));
    if (ui.ctDraft && ui.ctDraft.novo) { ui.ct = ctDefault(ui.ctDraft.cliente_tipo, ui.ctDraft.cliente_ref); ui.ctDraft = null; }
    const cur = ui.ct, ag = agency(), faltaAg = ["razao_social", "cnpj", "representante"].filter(k => !String(ag[k] || "").trim());
    const lista = list.map(c => `<tr><td><b>${esc(c.cliente_nome)}</b><div class="src">${esc(c.cliente_tipo === "prospect" ? "cliente novo" : "cliente")}</div></td><td>${chips(c.servicos)}</td><td class="num">${BRL(C.valorContrato(c))}</td><td><span class="badge ${c.status === "assinado" ? "st-pub" : "p1"}">${esc(stNome[c.status] || c.status)}</span></td><td class="src">${c.inicio ? dm(c.inicio) : ""}</td><td style="text-align:right"><button type="button" class="btn sm" data-open="${esc(c.id)}">Abrir</button></td></tr>`).join("");
    const origem = [...H.clients().map(c => `<option value="cliente|${esc(c.key)}">${esc(c.name)} (cliente)</option>`), ...prospects().filter(p => p.etapa !== "perdido").map(p => `<option value="prospect|${esc(p.id)}">${esc(p.nome)} (cliente novo)</option>`)].join("");
    view.innerHTML = `<div class="panel no-print">${H.banner("shield", "Dados da Nova7 no contrato", faltaAg.length ? "faltam dados obrigatórios" : "preenchidos", `<button type="button" class="btn sm" id="ag-toggle">${faltaAg.length ? "Preencher" : "Editar"}</button>`)}<div class="panel-body" id="ag-body" ${faltaAg.length ? "" : "hidden"}>
        <form id="ag-form" autocomplete="off"><div class="fgrid">${AGENCIA_CAMPOS.map(([k, n]) => fld(k, n, ag[k])).join("")}</div></form>${H.canWrite ? `<div class="toolbar"><button type="button" class="btn sm primary" id="ag-save">Salvar dados da Nova7</button></div>` : ""}</div></div>
      <div class="panel no-print">${H.banner("file", "Contratos", `${list.length} salvo(s)`, H.canWrite ? `<select id="ct-origem"><option value="">Novo contrato para…</option>${origem}</select>` : "")}<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviços</th><th class="num">Valor mensal</th><th>Situação</th><th>Início</th><th></th></tr></thead><tbody>${lista || `<tr><td colspan="6"><div class="empty">Nenhum contrato ainda. Escolha um cliente acima para montar o primeiro.</div></td></tr>`}</tbody></table></div></div>
      ${cur ? contratoEditor(cur) : ""}`;
    wireContratos(view, root0);
  }
  function contratoEditor(ct) {
    const d = ct.dados || {}, lock = ct.status === "assinado" || ct.status === "encerrado", cont = d.contratante || {}, cond = d.cond || {};
    const svBlocks = SV.ORDER.map(s => { const on = (ct.servicos || []).includes(s), P = C.PARAMS[s] || []; return `<div class="ct-sv${on ? " on" : ""}"><label class="check"><input type="checkbox" name="ctsvc" value="${s}"${on ? " checked" : ""}> <b>${esc(SV.SERVICES[s].name)}</b></label>
        ${on ? `<div class="fgrid">${fld("val_" + s, "Valor mensal (R$)", (ct.valores[s] || "") === "" ? "" : String(ct.valores[s]).replace(".", ","), ' inputmode="decimal"')}${P.map(([k, n, def]) => fld(`par_${s}_${k}`, n, ((d.params || {})[s] || {})[k] ?? def, ' inputmode="numeric"')).join("")}</div>
        ${area("esc_" + s, "Escopo no contrato (editável)", (d.escopos || {})[s] || C.escopoPadrao(s, (d.params || {})[s] || {}), 3)}` : ""}</div>`; }).join("");
    const doc = montar(ct);
    return `<div class="no-print"><h2 class="sec-title">${esc(ct.cliente_nome || "Contrato")} <span class="badge ${ct.status === "assinado" ? "st-pub" : "p1"}">${esc(stNome[ct.status])}</span></h2>
      ${lock ? `<p class="notice info">Contrato ${esc(stNome[ct.status].toLowerCase())}: o texto não é mais editável. Para mudar o que foi combinado, crie um novo contrato (aditivo).</p>` : ""}
      <div class="panel"><div class="panel-body"><form id="ct-form" autocomplete="off"><fieldset ${lock ? "disabled" : ""}><legend>Contratante</legend><div class="fgrid">${fld("c_nome", "Nome ou razão social", ct.cliente_nome)}${fld("c_doc", "CPF ou CNPJ", cont.doc)}${fld("c_end", "Endereço", cont.endereco)}${fld("c_cid", "Cidade e UF", cont.cidade)}${fld("c_rep", "Representante", cont.representante)}
        <label class="fld"><span>Setor (cláusula de conformidade)</span><select name="c_setor">${opts(SV.SECTORS, cont.setor, "nenhum")}</select></label></div></fieldset>
        <fieldset ${lock ? "disabled" : ""}><legend>Serviços e valores</legend>${svBlocks}</fieldset>
        <fieldset ${lock ? "disabled" : ""}><legend>Condições</legend><div class="fgrid">${fld("k_inicio", "Início (AAAA-MM-DD)", ct.inicio)}${fld("k_meses", "Prazo (meses)", ct.meses, ' inputmode="numeric"')}${fld("k_venc", "Dia do vencimento", ct.vencimento, ' inputmode="numeric"')}
          <label class="fld"><span>Reajuste anual</span><select name="k_reaj">${opts({ ipca: "IPCA", igpm: "IGP-M", nenhum: "Sem reajuste" }, ct.reajuste)}</select></label>${fld("k_aviso", "Aviso prévio (dias)", cond.aviso_dias ?? 30, ' inputmode="numeric"')}${fld("k_multa", "Multa por atraso (%)", cond.multa_atraso ?? 2, ' inputmode="decimal"')}${fld("k_juros", "Juros ao mês (%)", cond.juros ?? 1, ' inputmode="decimal"')}${fld("k_aprov", "Prazo de aprovação (dias úteis)", cond.prazo_aprovacao ?? 3, ' inputmode="numeric"')}${fld("k_verba", "Verba de mídia prevista (texto)", cond.verba_midia)}
          <label class="check" style="align-self:end"><input type="checkbox" name="k_tacita"${cond.tacita ? " checked" : ""}> Aprovação tácita se não responder no prazo</label></div></fieldset>
        <fieldset><legend>Situação</legend><div class="fgrid"><label class="fld"><span>Situação do contrato</span><select name="k_status">${opts(stNome, ct.status)}</select></label></div></fieldset></form>
        <div class="toolbar">${H.canWrite ? `<button type="button" class="btn primary" id="ct-save">Salvar contrato</button>${contracts().some(c => c.id === ct.id) ? `<button type="button" class="btn" id="ct-del">Excluir</button>` : ""}` : ""}<span class="spacer"></span><button type="button" class="btn" id="ct-copy">Copiar texto</button><button type="button" class="btn" id="ct-doc">Baixar .doc</button><button type="button" class="btn" id="ct-print">Imprimir / PDF</button></div></div></div>
      <p class="notice"><b>Minuta de apoio.</b> O texto é montado por regras a partir dos serviços e das condições acima. Ele não substitui um advogado: revise o contrato com um profissional antes de enviar para assinatura.</p></div>
      <div class="panel ct-doc"><div class="panel-body" id="ct-prev">${doc.html}</div></div>`;
  }
  function readContrato(view, base) {
    const f = $("#ct-form", view), g = n => (f.elements[n] ? f.elements[n].value.trim() : ""), svc = $$("input[name=ctsvc]:checked", f).map(x => x.value);
    const d = JSON.parse(JSON.stringify(base.dados || {})); d.params = d.params || {}; d.escopos = d.escopos || {};
    const valores = {};
    svc.forEach(s => { valores[s] = num(g("val_" + s)); d.params[s] = Object.fromEntries((C.PARAMS[s] || []).map(([k, , def]) => [k, g(`par_${s}_${k}`) || def])); if (f.elements["esc_" + s]) d.escopos[s] = g("esc_" + s); });
    Object.keys(d.escopos).forEach(k => { if (!svc.includes(k)) delete d.escopos[k]; });
    d.contratante = { doc: g("c_doc"), endereco: g("c_end"), cidade: g("c_cid"), representante: g("c_rep"), setor: g("c_setor") };
    d.cond = { aviso_dias: num(g("k_aviso")) || 30, multa_atraso: num(g("k_multa")), juros: num(g("k_juros")), prazo_aprovacao: num(g("k_aprov")) || 3, verba_midia: g("k_verba"), tacita: !!f.elements.k_tacita.checked };
    return Object.assign({}, base, { cliente_nome: g("c_nome") || base.cliente_nome, servicos: svc, valores, inicio: g("k_inicio"), meses: Math.round(num(g("k_meses"))) || 12, vencimento: Math.round(num(g("k_venc"))) || 5, reajuste: g("k_reaj") || "ipca", status: g("k_status") || "rascunho", dados: d });
  }
  const slug = s => String(s || "contrato").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  function wireContratos(view, rootView) {
    const rerender = () => render(rootView, "contratos", H);
    const tg = $("#ag-toggle", view); if (tg) tg.onclick = () => { const b = $("#ag-body", view); b.hidden = !b.hidden; };
    const as = $("#ag-save", view); if (as) as.onclick = () => { const o = {}; AGENCIA_CAMPOS.forEach(([k]) => { o[k] = ($("#ag-form", view).elements[k].value || "").trim(); }); S.set("agency", o); H.toast("Dados da Nova7 salvos."); rerender(); };
    const og = $("#ct-origem", view); if (og) og.onchange = () => { if (!og.value) return; const [t, r] = og.value.split("|"); ui.ct = ctDefault(t, r); rerender(); };
    $$("[data-open]", view).forEach(b => b.onclick = () => { ui.ct = JSON.parse(JSON.stringify(contracts().find(c => c.id === b.dataset.open))); rerender(); });
    const cur = ui.ct; if (!cur) return;
    const f = $("#ct-form", view); if (!f) return;
    let draft = cur;
    const refresh = (full) => { draft = readContrato(view, cur); if (full) { ui.ct = draft; rerender(); } else $("#ct-prev", view).innerHTML = montar(draft).html; };
    $$("input,select,textarea", f).forEach(x => x.addEventListener("change", () => refresh(x.name === "ctsvc" || /^par_/.test(x.name))));
    const sv = $("#ct-save", view);
    if (sv) sv.onclick = () => {
      draft = readContrato(view, cur); const doc = montar(draft); draft.texto = doc.texto;
      const l = JSON.parse(JSON.stringify(contracts())), i = l.findIndex(c => c.id === draft.id), row = Object.assign({}, draft, { atualizado_em: new Date().toISOString() });
      if (i >= 0) l[i] = Object.assign({}, row, { v: l[i].v }); else l.push(row);
      S.set("contracts", l); ui.ct = row; H.toast("Contrato salvo."); rerender();
    };
    const del = $("#ct-del", view); if (del) { let armed = false; del.onclick = () => { if (!armed) { armed = true; del.textContent = "Confirmar"; setTimeout(() => { armed = false; del.textContent = "Excluir"; }, 3500); return; } S.set("contracts", contracts().filter(c => c.id !== cur.id)); ui.ct = null; H.toast("Contrato excluído."); rerender(); }; }
    const text = () => montar(readContrato(view, cur)).texto;
    $("#ct-copy", view).onclick = async () => { try { await navigator.clipboard.writeText(text()); H.toast("Texto do contrato copiado."); } catch (e) { H.toast("Não consegui copiar. Use Baixar .doc."); } };
    $("#ct-doc", view).onclick = () => {
      const d = readContrato(view, cur), doc = montar(d), css = "body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;margin:2.2cm}h1{font-size:14pt;text-align:center}h2{font-size:11pt;margin-top:14pt}p{text-align:justify;margin:4pt 0}.minuta{color:#b00;font-weight:bold;text-align:center}.linhas div{display:inline-block;width:46%;margin-top:30pt;text-align:center;vertical-align:top}hr{border:0;border-top:1px solid #000}";
      const blob = new Blob([`<html><head><meta charset="utf-8"><title>${esc(doc.titulo)}</title><style>${css}</style></head><body>${doc.html}</body></html>`], { type: "application/msword" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Contrato_${slug(d.cliente_nome)}_${(d.inicio || new Date().toISOString().slice(0, 10))}.doc`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      H.toast("Arquivo gerado. Abra no Word e revise antes de enviar.");
    };
    $("#ct-print", view).onclick = () => { $("#ct-prev", view).innerHTML = montar(readContrato(view, cur)).html; window.print(); };
  }

  /* ================= tela ================= */
  function render(view, sub, helpers) {
    H = helpers; const tab = ["novos", "contratos"].includes(sub) ? sub : "carteira";
    const titulo = { carteira: ["Carteira atual", "Como estão os clientes de hoje e onde dá para vender mais."], novos: ["Clientes novos", "Preencha a ficha de quem pode virar cliente e veja o posicionamento sugerido."], contratos: ["Contratos", "Monte o contrato a partir dos serviços, com valor, escopo e condições."] }[tab];
    view.innerHTML = `<div class="page-head no-print"><div><div class="eyebrow">Comercial · só administradores</div><h1>${titulo[0]}</h1><p>${titulo[1]}</p></div></div><nav class="subtabs no-print" aria-label="Comercial">${[["carteira", "Carteira atual"], ["novos", "Clientes novos"], ["contratos", "Contratos"]].map(([k, n]) => `<a href="#comercial${k === "carteira" ? "" : "/" + k}"${k === tab ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav><div id="cm-body" class="view" style="gap:16px"></div>`;
    const body = $("#cm-body", view);
    (tab === "novos" ? novos : tab === "contratos" ? contratos : carteira)(body);
  }

  root.N7ComercialUI = { render };
})(typeof window !== "undefined" ? window : globalThis);
