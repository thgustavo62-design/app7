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
      ${k("Clientes novos em aberto", String(abertos.length), (() => { const F = C.funil(pros, hojeIso()); return F.atrasados.length ? `${F.atrasados.length} retorno(s) atrasado(s): veja o Funil` : abertos.length ? `${pros.filter(p => p.etapa === "proposta").length} com proposta enviada${F.aberto.ponderado ? ` · previsão ${brl0(F.aberto.ponderado)}/mês` : ""}` : "cadastre a ficha em Clientes novos"; })(), "target", C.funil(pros, hojeIso()).atrasados.length ? "red" : "")}</div>`;
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
        <div class="panel">${H.banner("target", "Funil de clientes novos", "fichas por etapa")}<div class="panel-body">${funil}<p><a href="#comercial/funil">Abrir o funil →</a> · <a href="#comercial/novos">Abrir as fichas →</a></p></div></div></div>`;
  }

  /* ================= Funil de vendas ================= */
  const hojeIso = () => C.hojeIso();
  const brl0 = v => BRL(v).replace(",00", "");
  function gravarPros(fn) { const l = JSON.parse(JSON.stringify(prospects())); fn(l); S.set("prospects", l); }
  /* muda a etapa de uma ficha e deixa a mudança registrada no histórico; perdido pede o motivo antes */
  function mover(id, etapa, motivo) {
    const p = prospects().find(x => x.id === id); if (!p || p.etapa === etapa || !H.canWrite) return false;
    if (etapa === "perdido" && !motivo) { ui.perda = { id }; return "perda"; }
    const nota = `${C.ETAPAS[p.etapa]} → ${C.ETAPAS[etapa]}${motivo ? ` (${motivo})` : ""}`, ativ = { em: hojeIso(), tipo: "etapa", texto: nota };
    gravarPros(l => { const r = l.find(x => x.id === id); r.etapa = etapa; r.motivo = etapa === "perdido" ? motivo : ""; r.atividades = [ativ, ...(r.atividades || [])].slice(0, 60); });
    if (ui.edit && ui.edit.id === id) ui.edit = Object.assign({}, ui.edit, { etapa, motivo: etapa === "perdido" ? motivo : "", atividades: [ativ, ...(ui.edit.atividades || [])].slice(0, 60) });
    ui.perda = null; ui.fechou = etapa === "fechado" ? id : null;
    return true;
  }
  function funilTela(view) {
    const pros = prospects(), F = C.funil(pros, hojeIso()), k = H.kpi, ro = !H.canWrite, nomeDe = e => (team().find(u => u.email === e) || { nome: "" }).nome;
    const tx = F.fechamento.taxa;
    const kp = `<div class="kpis">${k("Em negociação", String(F.aberto.n), F.aberto.valor ? `${brl0(F.aberto.valor)}/mês estimados${F.aberto.semValor ? ` · ${F.aberto.semValor} sem valor` : ""}` : (F.aberto.n ? "informe o valor estimado nas fichas" : "nenhuma ficha em aberto"), "target")}
      ${k("Previsão ponderada", F.aberto.valor ? brl0(F.aberto.ponderado) : "sem dado", F.aberto.valor ? "valor × chance da etapa (10% a 60%). Estimativa, não promessa" : "precisa do valor estimado nas fichas", "money", "green")}
      ${k("Retornos atrasados", String(F.atrasados.length), F.atrasados.length ? "contato combinado que passou da data" : "nenhum em atraso", "bell", F.atrasados.length ? "red" : "")}
      ${k("Taxa de fechamento", tx == null ? "sem amostra" : `${tx}%`, tx == null ? `${F.fechamento.amostra} decisão(ões): precisa de 5 para calcular` : `${F.fechamento.ganhos} fechados de ${F.fechamento.amostra} decididos`, "chart")}</div>`;
    const card = p => {
      const atras = p.proximo_contato && p.proximo_contato < hojeIso() && C.ABERTAS.includes(p.etapa), fit = C.fit(p), uc = C.ultimoContato(p);
      return `<div class="fn-card${atras ? " late" : ""}" ${ro ? "" : 'draggable="true"'} data-id="${esc(p.id)}">
        <span class="fn-name" role="button" tabindex="0" data-abrir="${esc(p.id)}">${esc(p.nome)}</span>
        <small class="src">${esc(SV.SECTORS[p.setor] || "sem setor")}${C.valorOk(p) ? ` · <b>${brl0(p.valor_estimado)}</b>/mês` : ""}</small>
        ${p.proximo_contato ? `<small class="${atras ? "fn-late" : "src"}">${atras ? "retorno atrasado: " : "retorno em "}${dm(p.proximo_contato)}${p.proximo_passo ? ` · ${esc(p.proximo_passo)}` : ""}</small>` : (C.ABERTAS.includes(p.etapa) ? `<small class="fn-late">sem próximo contato marcado</small>` : "")}
        ${uc ? `<small class="src">último contato ${dm(uc)}</small>` : ""}${p.responsavel ? `<small class="src">com ${esc(nomeDe(p.responsavel) || p.responsavel)}</small>` : ""}${p.etapa === "perdido" && p.motivo ? `<small class="src">motivo: ${esc(p.motivo)}</small>` : ""}${p.cliente_chave ? `<small class="src"><b>cliente cadastrado</b> (${esc(p.cliente_chave)})</small>` : ""}
        ${ro ? "" : `<select class="fn-move" data-mover="${esc(p.id)}" aria-label="Mover ${esc(p.nome)} para outra etapa"><option value="">Mover para…</option>${Object.entries(C.ETAPAS).filter(([e]) => e !== p.etapa).map(([e, n]) => `<option value="${e}">${esc(n)}</option>`).join("")}</select>`}</div>`;
    };
    const colunas = Object.entries(C.ETAPAS).map(([e, n]) => { const c = F.colunas[e], l = pros.filter(p => p.etapa === e).sort((a, b) => (a.proximo_contato || "9999").localeCompare(b.proximo_contato || "9999"));
      return `<div class="kcol fn-col" data-etapa="${e}"><div class="kcol-head"><span>${esc(n)}</span><small>${c.n}${c.valor ? ` · ${brl0(c.valor)}` : ""}${C.PROB[e] && e !== "fechado" ? ` · ${C.PROB[e]}%` : ""}</small></div>${l.map(card).join("") || `<p class="src fn-empty">${ro ? "—" : "Arraste uma ficha para cá"}</p>`}</div>`; }).join("");
    const perda = ui.perda && pros.find(p => p.id === ui.perda.id);
    const aviso = perda ? `<div class="panel"><div class="panel-body"><p><b>Por que ${esc(perda.nome)} não fechou?</b> O motivo ajuda a ver o que corrigir na venda.</p><div class="toolbar"><select id="fn-motivo">${C.MOTIVOS.map(m => `<option>${esc(m)}</option>`).join("")}</select><input type="text" id="fn-motivo-txt" placeholder="Detalhe (opcional)" maxlength="120" style="flex:1;min-width:160px"><button type="button" class="btn primary sm" id="fn-perda-ok">Registrar perda</button><button type="button" class="btn sm" id="fn-perda-x">Cancelar</button></div></div></div>` : "";
    const fechou = ui.fechou && pros.find(p => p.id === ui.fechou && p.etapa === "fechado");
    const aviso2 = fechou ? `<div class="panel"><div class="panel-body"><p><b>${esc(fechou.nome)} fechou.</b> Próximos passos: cadastrar como cliente e montar o contrato com os serviços combinados.</p><div class="toolbar">${fechou.cliente_chave ? "" : `<button type="button" class="btn primary sm" id="fn-conv" data-id="${esc(fechou.id)}">Cadastrar como cliente</button>`}<a class="btn ${fechou.cliente_chave ? "primary " : ""}sm" href="#comercial/contratos" id="fn-contrato" data-id="${esc(fechou.id)}">Montar contrato</a><button type="button" class="btn sm" id="fn-contrato-x">Agora não</button></div></div></div>` : "";
    const convP = ui.conv && pros.find(p => p.id === ui.conv && p.etapa === "fechado" && !p.cliente_chave), conv = convP ? conversaHtml(convP) : "";
    const atr = F.atrasados.map(a => `<li><button type="button" class="linkish" data-abrir="${esc(a.id)}"><b>${esc(a.nome)}</b></button> <small class="src">${a.dias} dia(s) de atraso${a.responsavel ? ` · ${esc(nomeDe(a.responsavel) || a.responsavel)}` : ""}</small></li>`).join("");
    const semp = F.semProximo.slice(0, 8).map(a => `<li><button type="button" class="linkish" data-abrir="${esc(a.id)}">${esc(a.nome)}</button></li>`).join("");
    const par = F.parados.map(a => `<li><button type="button" class="linkish" data-abrir="${esc(a.id)}">${esc(a.nome)}</button> <small class="src">${a.dias} dias sem contato</small></li>`).join("");
    const mot = F.motivos.map(([m, n]) => `<div class="mrow"><span>${esc(m)}</span><b>${n}</b></div>`).join("");
    const org = F.origens.map(o => `<div class="mrow"><span>${esc(o.origem)}</span><b>${o.n} ficha(s) · ${o.ganhos} fechada(s)</b></div>`).join("");
    view.innerHTML = `${kp}${aviso}${aviso2}${conv}
      <div class="panel">${H.banner("target", "Funil de vendas", ro ? "somente leitura" : "arraste a ficha para outra etapa ou use \"Mover para…\"")}<div class="panel-body"><div class="fn-board">${colunas}</div><p class="src" style="margin-top:8px">A porcentagem de cada etapa é a chance de fechar usada na previsão: um ponto de partida comum de CRM, não medido na sua agência. Com o histórico de fechados e perdidos você pode calibrar.</p></div></div>
      <div class="grid g2"><div class="panel">${H.banner("bell", "Precisam de atenção", `${F.atrasados.length + F.semProximo.length + F.parados.length}`)}<div class="panel-body">
          ${atr ? `<p class="lbl">Retorno atrasado</p><ul class="plain">${atr}</ul>` : ""}${semp ? `<p class="lbl">Sem próximo contato marcado</p><ul class="plain">${semp}</ul>` : ""}${par ? `<p class="lbl">Parados há 14 dias ou mais</p><ul class="plain">${par}</ul>` : ""}
          ${atr || semp || par ? "" : `<p class="src">Tudo em dia: toda ficha aberta tem retorno marcado e contato recente.</p>`}</div></div>
        <div class="panel">${H.banner("chart", "Por que perdemos e de onde vêm", "só o que está registrado nas fichas")}<div class="panel-body"><p class="lbl">Motivos de perda</p>${mot || `<p class="src">Nenhuma perda registrada.</p>`}<p class="lbl">Origem das fichas</p>${org || `<p class="src">Preencha "De onde veio" nas fichas.</p>`}</div></div></div>`;
    const refazer = () => render(document.querySelector("#view") || view.closest("#view") || view, "funil", H);
    $$("[data-abrir]", view).forEach(b => { const abrir = () => { ui.novo = null; ui.edit = null; ui.novoSujo = false; ui.sel = b.dataset.abrir; location.hash = "#comercial/novos"; }; b.onclick = abrir; b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } }; });
    $$("[data-mover]", view).forEach(sel => sel.onchange = () => { if (!sel.value) return; const r = mover(sel.dataset.mover, sel.value); if (r === true) H.toast("Etapa atualizada."); refazer(); });
    let arrastando = null;
    $$(".fn-card[draggable]", view).forEach(c => { c.addEventListener("dragstart", e => { arrastando = c.dataset.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", arrastando); } catch (x) { /* navegador sem suporte */ } c.classList.add("drag"); }); c.addEventListener("dragend", () => { c.classList.remove("drag"); $$(".fn-col", view).forEach(x => x.classList.remove("over")); }); });
    $$(".fn-col", view).forEach(col => { col.addEventListener("dragover", e => { if (arrastando) { e.preventDefault(); col.classList.add("over"); } }); col.addEventListener("dragleave", () => col.classList.remove("over")); col.addEventListener("drop", e => { e.preventDefault(); col.classList.remove("over"); const id = arrastando; arrastando = null; if (!id) return; const r = mover(id, col.dataset.etapa); if (r === true) H.toast("Etapa atualizada."); refazer(); }); });
    const ok = $("#fn-perda-ok", view); if (ok) ok.onclick = () => { const m = $("#fn-motivo", view).value, d = ($("#fn-motivo-txt", view).value || "").trim(); mover(ui.perda.id, "perdido", d ? `${m}: ${d}` : m); H.toast("Perda registrada."); refazer(); };
    const px = $("#fn-perda-x", view); if (px) px.onclick = () => { ui.perda = null; refazer(); };
    const cx = $("#fn-contrato-x", view); if (cx) cx.onclick = () => { ui.fechou = null; refazer(); };
    const ct = $("#fn-contrato", view); if (ct) ct.onclick = () => { const r = refContrato(prospects().find(p => p.id === ct.dataset.id) || {}); ui.ct = null; ui.ctDraft = { novo: true, cliente_tipo: r.tipo, cliente_ref: r.ref || ct.dataset.id }; ui.fechou = null; };
    const cvb = $("#fn-conv", view); if (cvb) cvb.onclick = () => { ui.conv = cvb.dataset.id; refazer(); };
    if (convP) wireConversa(view, convP, refazer);
  }

  /* ficha fechada vira cliente cadastrado: o administrador revisa os dados sugeridos e cria */
  const refContrato = p => (p.cliente_chave ? { tipo: "cliente", ref: p.cliente_chave } : { tipo: "prospect", ref: p.id });
  function conversaHtml(p) {
    const s = C.sugerirCliente(p, H.clients().map(c => ({ key: c.key, id: c.id, color: c.color })));
    return `<div class="panel" id="cv-panel"><div class="panel-body"><p><b>Cadastrar ${esc(p.nome)} como cliente.</b> Revise os dados sugeridos: o cliente passa a aparecer no menu, na Carteira e nas análises, e os contratos desta ficha passam a valer como contratos dele.</p>
      <form id="cv-form" autocomplete="off"><div class="fgrid">${fld("nome", "Nome", s.nome)}${fld("curto", "Nome curto", s.curto)}${fld("id", "Endereço no site (minúsculas e hífen)", s.id)}${fld("chave", "Chave (1 a 4 letras ou números)", s.chave, ' maxlength="4"')}${fld("segmento", "Segmento", s.segmento)}
        <label class="fld"><span>Setor</span><select name="setor">${opts(SV.SECTORS, s.setor || "saude")}</select></label><input type="hidden" name="cor" value="${esc(s.cor)}"></div>
        <p class="lbl">Serviços contratados</p><div class="radio-row">${SV.ORDER.map(x => `<label class="check"><input type="checkbox" name="cvsvc" value="${x}"${s.servicos.includes(x) ? " checked" : ""}> ${esc(SV.SERVICES[x].name)}</label>`).join("")}</div></form>
      <p class="notice" id="cv-err" hidden></p><div class="toolbar"><button type="button" class="btn primary sm" id="cv-ok">Criar cliente</button><button type="button" class="btn sm" id="cv-x">Cancelar</button></div></div></div>`;
  }
  function wireConversa(view, p, rerender) {
    const x = $("#cv-x", view); if (x) x.onclick = () => { ui.conv = null; rerender(); };
    const ok = $("#cv-ok", view); if (!ok) return;
    ok.onclick = async () => {
      const f = $("#cv-form", view), g = n => f.elements[n].value.trim(), err = $("#cv-err", view);
      const op = { t: "client", chave: g("chave").toUpperCase(), id: g("id"), nome: g("nome"), curto: g("curto"), cor: g("cor"), segmento: g("segmento"), perfil: "", setor: g("setor"), servicos: $$("input[name=cvsvc]:checked", f).map(i => i.value), ativo: "sim", endereco: p.endereco || "", bairro: p.bairro || "", lat: C.temPonto(p) ? p.lat : "", lng: C.temPonto(p) ? p.lng : "", raio_km: p.raio_km == null ? "" : p.raio_km };
      err.hidden = true; ok.disabled = true;
      try { await H.criarCliente(op); } catch (e) { err.textContent = e.message; err.hidden = false; ok.disabled = false; return; }
      gravarPros(l => { const r = l.find(y => y.id === p.id); if (r) { r.cliente_chave = op.chave; r.atividades = [{ em: hojeIso(), tipo: "nota", texto: `Virou cliente cadastrado: ${op.nome} (${op.chave})` }, ...(r.atividades || [])].slice(0, 60); } });
      if (ui.edit && ui.edit.id === p.id) ui.edit = null;
      const cts = JSON.parse(JSON.stringify(contracts())), novos = C.contratosDoCliente(cts, p.id, op.chave);
      if (JSON.stringify(novos) !== JSON.stringify(cts)) S.set("contracts", novos);
      ui.conv = null; ui.fechou = null; H.toast(`Cliente criado: ${op.nome}.`); rerender();
    };
  }

  /* histórico de contatos da ficha (ligação, WhatsApp, reunião, nota e mudanças de etapa) */
  function historico(f) {
    const l = (f.atividades || []).slice(), ro = !H.canWrite;
    return `<div class="panel">${H.banner("list", "Histórico de contatos", `${l.length} registro(s)`)}<div class="panel-body">
      ${ro ? "" : `<div class="toolbar" id="cm-ativ"><select id="at-tipo">${Object.entries(C.ATIVIDADES).filter(([k]) => k !== "etapa").map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("")}</select><input type="date" id="at-em" value="${hojeIso()}"><input type="text" id="at-txt" placeholder="O que foi falado ou combinado" maxlength="300" style="flex:1;min-width:200px"><button type="button" class="btn sm primary" id="at-add">Registrar</button></div>`}
      ${l.length ? `<ul class="plain cm-ativ">${l.map(a => `<li><small class="src">${dm(a.em)} · ${esc(C.ATIVIDADES[a.tipo] || a.tipo)}</small> ${esc(a.texto)}</li>`).join("")}</ul>` : `<p class="src">Nenhum contato registrado ainda.</p>`}</div></div>`;
  }
  function registrar(id, tipo, em, texto) {
    const ativ = { em, tipo, texto };
    gravarPros(l => { const r = l.find(x => x.id === id); r.atividades = [ativ, ...(r.atividades || [])].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 60); });
    const novas = (prospects().find(x => x.id === id) || {}).atividades || [];
    if (ui.edit && ui.edit.id === id) ui.edit = Object.assign({}, ui.edit, { atividades: novas });
  }

  /* ================= Clientes novos ================= */
  const fld = (n, label, v, extra = "") => `<label class="fld"><span>${label}</span><input type="text" name="${n}" value="${esc(v ?? "")}" autocomplete="off"${extra}></label>`;
  const area = (n, label, v, rows = 2) => `<label class="fld wide"><span>${label}</span><textarea name="${n}" rows="${rows}" maxlength="800">${esc(v || "")}</textarea></label>`;
  /* perguntas da conversa de posicionamento: as longas viram caixa de texto */
  const LONGOS = ["proposta_atual", "nao_quer", "prova_social", "presenca", "sazonalidade", "fluxo", "diferencial_tecnico", "cases", "convenios", "onde_lembrado", "credenciais", "delivery"];
  const fxCampo = (k, n, v) => (LONGOS.includes(k) ? `<label class="fld wide"><span>${esc(n)}</span><textarea name="fx_${k}" rows="2" maxlength="300">${esc(v || "")}</textarea></label>` : `<label class="fld"><span>${esc(n)}</span><input type="text" name="fx_${k}" value="${esc(v || "")}" maxlength="300" autocomplete="off"></label>`);
  function fichaForm(f) {
    const ro = !H.canWrite;
    return `<form id="cm-form" autocomplete="off" novalidate ${ro ? "" : ""}>
      <fieldset><legend>Quem é</legend><div class="fgrid">${fld("nome", "Nome do cliente", f.nome)}${fld("contato", "Contato (quem decide)", f.contato)}${fld("email", "E-mail", f.email)}${fld("telefone", "Telefone / WhatsApp", f.telefone)}${fld("cidade", "Cidade", f.cidade)}${fld("segmento", "Segmento (o que faz)", f.segmento)}
        <label class="fld"><span>Setor</span><select name="setor">${opts(SV.SECTORS, f.setor, "escolha")}</select></label>
        <label class="fld"><span>Tipo de negócio</span><select name="tipo_negocio">${opts(C.TIPOS, f.tipo_negocio, "escolha")}</select></label>
        <label class="fld"><span>Porte</span><select name="porte">${opts(C.PORTES, f.porte, "escolha")}</select></label>${fld("tempo_mercado", "Tempo de mercado", f.tempo_mercado)}${fld("origem", "De onde veio", f.origem)}</div></fieldset>
      <fieldset><legend>O que ele quer</legend><div class="fgrid">
        <label class="fld"><span>Objetivo principal</span><select name="objetivo">${opts(C.OBJETIVOS, f.objetivo, "escolha")}</select></label>${fld("orcamento_midia", "Verba mensal de mídia (R$)", f.orcamento_midia == null ? "" : String(f.orcamento_midia).replace(".", ","), ' inputmode="decimal"')}${fld("prazo", "Prazo desejado", f.prazo)}${fld("canais", "Canais que usa hoje", f.canais)}</div>
        <div class="fgrid one">${area("publico", "Público-alvo (quem ele quer atingir)", f.publico)}${area("diferenciais", "Diferenciais (por que escolher ele)", f.diferenciais)}${area("concorrentes", "Concorrentes", f.concorrentes, 1)}${area("dor", "Dor principal (o que o fez procurar a agência)", f.dor)}</div>
        <p class="lbl">Serviços de interesse</p><div class="radio-row">${SV.ORDER.map(s => `<label class="check"><input type="checkbox" name="svc" value="${s}"${(f.servicos || []).includes(s) ? " checked" : ""}> ${esc(SV.SERVICES[s].name)}</label>`).join("")}</div></fieldset>
      <fieldset><legend>Onde fica</legend>${root.N7ComercialMapa ? root.N7ComercialMapa.campos(f, ro) : `<p class="src">O mapa não carregou.</p>`}</fieldset>
      <fieldset><legend>Conversa de posicionamento</legend>${f.tipo_negocio ? "" : `<p class="src">Escolha o tipo de negócio em "Quem é" para ver as perguntas certas. Enquanto isso valem as perguntas gerais.</p>`}
        ${(() => { const cs = C.camposDoTipo(f.tipo_negocio), fx = f.ficha || {}; return `<div class="fgrid">${cs.filter(([k]) => !LONGOS.includes(k)).map(([k, n]) => fxCampo(k, n, fx[k])).join("")}</div><div class="fgrid one">${cs.filter(([k]) => LONGOS.includes(k)).map(([k, n]) => fxCampo(k, n, fx[k])).join("")}</div>`; })()}</fieldset>
      <fieldset><legend>Andamento</legend><div class="fgrid">
        <label class="fld"><span>Etapa</span><select name="etapa">${opts(C.ETAPAS, f.etapa || "novo")}</select></label>
        <label class="fld"><span>Responsável</span><select name="responsavel"><option value="">ninguém</option>${team().map(u => `<option value="${esc(u.email)}"${u.email === f.responsavel ? " selected" : ""}>${esc(u.nome)}</option>`).join("")}</select></label>${fld("motivo", "Motivo (se perdido)", f.motivo, ' list="cm-motivos"')}<datalist id="cm-motivos">${C.MOTIVOS.map(m => `<option value="${esc(m)}">`).join("")}</datalist>
        ${fld("valor_estimado", "Valor estimado do contrato (R$/mês)", f.valor_estimado == null || f.valor_estimado === "" ? "" : String(f.valor_estimado).replace(".", ","), ' inputmode="decimal"')}<label class="fld"><span>Próximo contato</span><input type="date" name="proximo_contato" value="${esc(f.proximo_contato || "")}"></label>${fld("proximo_passo", "Próximo passo combinado", f.proximo_passo)}</div>
        <div class="fgrid one">${area("observacoes", "Observações", f.observacoes, 3)}</div></fieldset></form>`;
  }
  function readFicha(view, base) {
    const f = $("#cm-form", view), g = n => (f.elements[n] ? f.elements[n].value.trim() : "");
    const orc = g("orcamento_midia").replace(/\./g, "").replace(",", ".");
    const rk = g("raio_km").replace(",", "."), coordN = n => (g(n) === "" || isNaN(Number(g(n))) ? null : Number(g(n)));
    const fxLido = {}; $$("[name^=fx_]", f).forEach(x => { fxLido[x.name.slice(3)] = x.value.trim(); });
    return Object.assign({}, base, { tipo_negocio: g("tipo_negocio"), endereco: g("endereco"), bairro: g("bairro"), raio_km: rk === "" || isNaN(Number(rk)) ? null : Number(rk), lat: coordN("lat"), lng: coordN("lng"), ficha: Object.assign({}, base.ficha || {}, fxLido), nome: g("nome"), contato: g("contato"), email: g("email"), telefone: g("telefone"), cidade: g("cidade"), segmento: g("segmento"), setor: g("setor"), porte: g("porte"), tempo_mercado: g("tempo_mercado"), origem: g("origem"), objetivo: g("objetivo"),
      orcamento_midia: orc === "" || isNaN(Number(orc)) ? null : Number(orc), valor_estimado: (() => { const t = g("valor_estimado").replace(/\./g, "").replace(",", "."); return t === "" || isNaN(Number(t)) ? null : Number(t); })(), proximo_contato: g("proximo_contato"), proximo_passo: g("proximo_passo"), prazo: g("prazo"), canais: g("canais"), publico: g("publico"), diferenciais: g("diferenciais"), concorrentes: g("concorrentes"), dor: g("dor"), servicos: $$("input[name=svc]:checked", f).map(x => x.value), etapa: g("etapa") || "novo", responsavel: g("responsavel"), motivo: g("motivo"), observacoes: g("observacoes") });
  }
  function analiseHtml(f) {
    const fit = C.fit(f), pos = C.posicionamento(f), c = fit.completude, n = NIVEL[fit.nivel];
    const li = l => `<ul class="plain">${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
    return `<div class="panel">${H.banner("target", "Prioridade comercial", "regras explícitas, não é uma previsão", `<span class="badge ${n[1]}">${n[0]} · ${fit.score}/100</span>`)}<div class="panel-body">
        <div class="bar" style="margin-bottom:8px"><i style="width:${c.pct}%;background:var(--violet)"></i></div><p class="src">Ficha ${c.pct}% completa${c.faltam.length ? ` · falta: ${esc(c.faltam.join(", "))}` : ""}.</p>${li(fit.motivos)}</div></div>
      <div class="panel">${H.banner("spark", "Serviços recomendados", "pelo objetivo e pelo setor")}<div class="panel-body">${pos.servicos.length ? `<ul class="plain">${pos.servicos.map(r => `<li><b>${esc(SV.SERVICES[r.servico].name)}</b>${r.interesse ? ` <span class="badge st-pub">o cliente pediu</span>` : ""}<div class="src">${esc(r.motivos.join("; "))}</div></li>`).join("")}</ul>` : `<p class="src">Escolha o objetivo principal para ver as recomendações.</p>`}</div></div>
      <div class="panel">${H.banner("eye", "Posicionamento sugerido", "rascunho montado com a ficha e o Playbook do setor: valide com o cliente")}<div class="panel-body">
        <p class="lbl">Proposta de valor (rascunho)</p><p><b>${esc(pos.proposta)}</b></p>
        ${pos.partida ? `<p class="lbl">Como ele se apresenta hoje</p><p>${esc(pos.partida)}</p>` : ""}${pos.territorio.length ? `<p class="lbl">Território</p>${li(pos.territorio)}` : ""}
        <p class="lbl">Tom de voz</p><p>${esc(pos.tom)}</p>
        ${pos.funil ? `<p class="lbl">Como esse público decide</p><p>${esc(pos.funil)}</p>` : ""}
        <p class="lbl">Pilares de conteúdo</p>${li(pos.pilares)}<p class="lbl">Canais para priorizar</p>${li(pos.canais)}${pos.formatos.length ? `<p class="lbl">Formatos que funcionam no setor</p>${li(pos.formatos)}` : ""}${pos.sazonalidade.length ? `<p class="lbl">Datas e épocas do setor</p>${li(pos.sazonalidade)}` : ""}
        <p class="lbl">Cuidados antes de publicar</p>${li(pos.cuidados)}${pos.armadilhas.length ? `<p class="lbl">Erros comuns no setor</p>${li(pos.armadilhas)}` : ""}</div></div>
      <div class="panel">${H.banner("cal", "Primeiros 30 dias e indicadores", "o que combinar com o cliente")}<div class="panel-body">${li(pos.plano30)}<p class="lbl">O que vamos medir</p><ul class="plain">${pos.indicadores.map(i => `<li><b>${esc(SV.SERVICES[i.servico].short)}:</b> ${esc(i.kpi)}</li>`).join("") || "<li>Defina os serviços para ver os indicadores.</li>"}</ul></div></div>
      ${pos.alertas.length ? `<div class="panel">${H.banner("alert", "Pontos de atenção", `${pos.alertas.length}`)}<div class="panel-body">${pos.alertas.map(a => `<p class="notice${a.nivel === "info" ? " info" : ""}">${esc(a.texto)}</p>`).join("")}</div></div>` : ""}`;
  }
  /* mapa da ficha: o bloco "Onde fica" é o mesmo do cadastro de clientes (comercial-mapa.js) */
  const ligarMapa = (view, f, onMudou) => { if (root.N7ComercialMapa) root.N7ComercialMapa.ligar(view, f, { leitura: !H.canWrite, onMudou }); };
  function novos(view) {
    const list = prospects().slice().sort((a, b) => (a.etapa === "fechado" || a.etapa === "perdido") - (b.etapa === "fechado" || b.etapa === "perdido") || (a.nome || "").localeCompare(b.nome || ""));
    if (ui.novo) { ui.sel = ui.novo.id; }
    const cur = ui.novo || (ui.edit && ui.edit.id === ui.sel ? ui.edit : null) || list.find(p => p.id === ui.sel) || null, sujo = !!(ui.novo ? ui.novoSujo : (ui.edit && ui.edit.id === ui.sel));
    const itens = list.map(p => { const fit = C.fit(p); return `<button type="button" class="cm-item${cur && cur.id === p.id ? " on" : ""}" data-pick="${esc(p.id)}"><b>${esc(p.nome)}</b><small>${esc(SV.SECTORS[p.setor] || "sem setor")} · ${esc(C.ETAPAS[p.etapa] || "")}</small><span class="badge ${NIVEL[fit.nivel][1]}">prioridade ${NIVEL[fit.nivel][0]}</span></button>`; }).join("");
    view.innerHTML = `<div class="cm-wrap"><aside class="cm-list"><div class="toolbar">${H.canWrite ? `<button type="button" class="btn primary sm" id="cm-new">+ Nova ficha</button>` : ""}<span class="src">${list.length} ficha(s)</span></div>${itens || `<p class="src">Nenhuma ficha ainda. Clique em Nova ficha para cadastrar um cliente em potencial.</p>`}</aside>
      <section class="cm-main">${cur ? `<div class="panel">${H.banner("file", esc(cur.nome || "Nova ficha"), "ficha do cliente", H.canWrite ? `<span class="badge" id="cm-dirty"${sujo ? "" : " hidden"}>não salva</span><button type="button" class="btn sm primary" id="cm-save">Salvar</button>${prospects().some(p => p.id === cur.id) ? `${cur.cliente_chave ? `<span class="badge st-pub">cliente cadastrado (${esc(cur.cliente_chave)})</span>` : (cur.etapa === "fechado" ? `<button type="button" class="btn sm primary" id="cm-conv">Cadastrar como cliente</button>` : "")}<a class="btn sm" href="#comercial/contratos" id="cm-contract">Montar contrato</a><button type="button" class="btn sm" id="cm-del">Excluir</button>` : ""}` : "")}<div class="panel-body">${fichaForm(cur)}</div></div>${ui.conv === cur.id && cur.etapa === "fechado" && !cur.cliente_chave && prospects().some(p => p.id === cur.id) ? conversaHtml(cur) : ""}${prospects().some(p => p.id === cur.id) ? historico(cur) : `<p class="src">Salve a ficha para começar o histórico de contatos.</p>`}<h2 class="sec-title">Análise e posicionamento</h2><div id="cm-analise">${analiseHtml(cur)}</div>` : `<div class="panel"><div class="panel-body"><p class="src">Escolha uma ficha à esquerda ou crie uma nova. Ao preencher, a análise e o posicionamento sugerido aparecem aqui.</p></div></div>`}</section></div>`;
    $$("[data-pick]", view).forEach(b => b.onclick = () => { ui.novo = null; ui.edit = null; ui.novoSujo = false; ui.sel = b.dataset.pick; render(view.closest("#view") || view, "novos", H); });
    const nw = $("#cm-new", view); if (nw) nw.onclick = () => { ui.edit = null; ui.novoSujo = false; ui.novo = { id: rid("p-"), nome: "", etapa: "novo", servicos: [] }; render(view.closest("#view") || view, "novos", H); };
    if (!cur) return;
    const f = $("#cm-form", view); if (!f) return;
    if (!H.canWrite) $$("input,select,textarea", f).forEach(x => { x.disabled = true; });
    let draft = cur;
    const refresh = () => { draft = readFicha(view, cur); if (ui.novo) { ui.novo = draft; ui.novoSujo = true; } else ui.edit = draft; $("#cm-analise", view).innerHTML = analiseHtml(draft); const d = $("#cm-dirty", view); if (d) d.hidden = false; };
    $$("input,select,textarea", f).forEach(x => x.addEventListener("change", () => { refresh(); if (x.name === "tipo_negocio") render(view.closest("#view") || view, "novos", H); }));
    ligarMapa(view, f, refresh);
    const sv = $("#cm-save", view);
    if (sv) sv.onclick = () => {
      draft = readFicha(view, cur); if (!draft.nome) return H.toast("Dê um nome à ficha.");
      const l = JSON.parse(JSON.stringify(prospects())), i = l.findIndex(p => p.id === draft.id);
      if (i >= 0 && l[i].etapa !== draft.etapa) draft.atividades = [{ em: C.hojeIso(), tipo: "etapa", texto: `${C.ETAPAS[l[i].etapa]} → ${C.ETAPAS[draft.etapa]}${draft.etapa === "perdido" && draft.motivo ? ` (${draft.motivo})` : ""}` }, ...(draft.atividades || [])].slice(0, 60);
      if (i >= 0) l[i] = Object.assign({}, draft, { v: l[i].v }); else l.push(draft);
      S.set("prospects", l); ui.novo = null; ui.edit = null; ui.novoSujo = false; ui.sel = draft.id; H.toast("Ficha salva."); render(view.closest("#view") || view, "novos", H);
    };
    const del = $("#cm-del", view); if (del) { let armed = false; del.onclick = () => { if (!armed) { armed = true; del.textContent = "Confirmar"; setTimeout(() => { armed = false; del.textContent = "Excluir"; }, 3500); return; } S.set("prospects", prospects().filter(p => p.id !== cur.id)); ui.sel = null; ui.novo = null; H.toast("Ficha excluída."); render(view.closest("#view") || view, "novos", H); }; }
    const mk = $("#cm-contract", view); if (mk) mk.onclick = () => { const r = refContrato(cur); ui.ct = null; ui.ctDraft = { novo: true, cliente_tipo: r.tipo, cliente_ref: r.ref }; };
    const cvb = $("#cm-conv", view); if (cvb) cvb.onclick = () => { ui.conv = cur.id; render(view.closest("#view") || view, "novos", H); };
    if (ui.conv === cur.id) wireConversa(view, cur, () => render(document.querySelector("#view") || view.closest("#view") || view, "novos", H));
    const ad = $("#at-add", view); if (ad) ad.onclick = () => { const t = ($("#at-txt", view).value || "").trim(), em = $("#at-em", view).value || hojeIso(); if (!t) return H.toast("Escreva o que foi falado ou combinado."); registrar(cur.id, $("#at-tipo", view).value, em, t); H.toast("Contato registrado."); render(view.closest("#view") || view, "novos", H); };
  }

  /* ================= Mapa das fichas ================= */
  const COR_ETAPA = { novo: "#7c4dff", contato: "#2563eb", reuniao: "#d97706", proposta: "#db2777", fechado: "#16a34a", perdido: "#9ca3af" };
  const abrirFicha = id => { ui.novo = null; ui.edit = null; ui.novoSujo = false; ui.sel = id; location.hash = "#comercial/novos"; };
  const COR_CLIENTE = "#0f766e";
  /* clientes cadastrados + fichas, no mesmo mapa. Ficha que já virou cliente com ponto não aparece duas vezes. */
  function mapaTela(view) {
    const M = root.N7ComercialMapa, ponto = x => !!M && M.valido(x.lat, x.lng);
    const cls = H.clients().map(c => ({ id: "c:" + c.key, key: c.key, rota: c.id, nome: c.name, lat: (c.local || {}).lat, lng: (c.local || {}).lng, endereco: (c.local || {}).endereco || "", bairro: (c.local || {}).bairro || "", setor: c.setor }));
    const clComPonto = new Set(cls.filter(ponto).map(c => c.key));
    const fichas = prospects().filter(p => !(p.cliente_chave && clComPonto.has(p.cliente_chave)));
    const cCom = cls.filter(ponto), cSem = cls.filter(c => !ponto(c));
    const fCom = fichas.filter(p => C.temPonto(p)), fSem = fichas.filter(p => !C.temPonto(p) && p.etapa !== "perdido" && !p.cliente_chave);
    const total = cCom.length + fCom.length, semTotal = cSem.length + fSem.length;
    const leg = `<span><i style="background:${COR_CLIENTE}"></i>Cliente (${cCom.length})</span>` + Object.entries(C.ETAPAS).map(([e, n]) => `<span><i style="background:${COR_ETAPA[e]}"></i>${esc(n)} (${fCom.filter(p => p.etapa === e).length})</span>`).join("");
    const liCom = [...cCom.map(c => `<li><button type="button" class="linkish" data-foco="${esc(c.id)}"><b>${esc(c.nome)}</b></button> <small class="src">cliente${c.bairro ? ` · ${esc(c.bairro)}` : ""}</small></li>`), ...fCom.map(p => `<li><button type="button" class="linkish" data-foco="p:${esc(p.id)}"><b>${esc(p.nome)}</b></button> <small class="src">${esc(C.ETAPAS[p.etapa] || "")}${p.bairro ? ` · ${esc(p.bairro)}` : ""}${p.cidade ? ` · ${esc(p.cidade)}` : ""}</small></li>`)];
    const liSem = [...cSem.map(c => `<li><a href="#config/clientes">${esc(c.nome)}</a> <small class="src">cliente: marque o ponto em Configurações</small></li>`), ...fSem.map(p => `<li><button type="button" class="linkish" data-abrir-ficha="${esc(p.id)}">${esc(p.nome)}</button> <small class="src">${esc(C.ETAPAS[p.etapa] || "")}</small></li>`)];
    view.innerHTML = `<div class="panel">${H.banner("target", "Mapa de clientes e fichas", `${total} no mapa · ${semTotal} sem ponto`)}<div class="panel-body"><div class="mp-leg">${leg}</div><div class="mp-box grande" id="mp-box" role="application" aria-label="Mapa de clientes e fichas"></div><p class="src" id="mp-msg"></p></div></div>
      <div class="grid g2"><div class="panel">${H.banner("list", "No mapa", String(total))}<div class="panel-body">${liCom.length ? `<ul class="plain">${liCom.join("")}</ul>` : `<p class="src">Nada no mapa ainda. Abra uma ficha ou um cliente e use "Localizar no mapa" em "Onde fica".</p>`}</div></div>
        <div class="panel">${H.banner("alert", "Sem ponto no mapa", String(semTotal))}<div class="panel-body">${liSem.length ? `<ul class="plain">${liSem.join("")}</ul>` : `<p class="src">Todo cliente e ficha em aberto já tem ponto no mapa.</p>`}</div></div></div>`;
    $$("[data-abrir-ficha]", view).forEach(b => { b.onclick = () => abrirFicha(b.dataset.abrirFicha); });
    const box = $("#mp-box", view), msg = t => { const m = $("#mp-msg", view); if (m) m.textContent = t; };
    let ctl = null;
    if (!M) return;
    const pontos = [
      ...cCom.map(c => ({ id: c.id, lat: c.lat, lng: c.lng, cor: COR_CLIENTE, html: `<b>${esc(c.nome)}</b><br>Cliente · ${esc(SV.SECTORS[c.setor] || "")}${c.endereco ? `<br>${esc(c.endereco)}` : ""}<br><button type="button" class="btn sm" data-pin-abrir="${esc(c.id)}">Abrir cliente</button>` })),
      ...fCom.map(p => ({ id: "p:" + p.id, lat: p.lat, lng: p.lng, cor: COR_ETAPA[p.etapa], html: `<b>${esc(p.nome)}</b><br>${esc(SV.SECTORS[p.setor] || "sem setor")} · ${esc(C.ETAPAS[p.etapa] || "")}${C.valorOk(p) ? `<br>${brl0(p.valor_estimado)}/mês` : ""}${p.endereco ? `<br>${esc(p.endereco)}` : ""}<br><button type="button" class="btn sm" data-pin-abrir="p:${esc(p.id)}">Abrir ficha</button>` }))];
    const abrir = id => { if (id.startsWith("p:")) abrirFicha(id.slice(2)); else { const c = cls.find(x => x.id === id); if (c) location.hash = "#" + c.rota; } };
    M.ensure().then(() => { if (!document.body.contains(box)) return; ctl = M.visao(box, pontos, abrir); }).catch(e => msg(e.message));
    $$("[data-foco]", view).forEach(b => { b.onclick = () => { if (ctl) ctl.foco(b.dataset.foco); box.scrollIntoView({ behavior: "smooth", block: "center" }); }; });
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
    const origem = [...H.clients().map(c => `<option value="cliente|${esc(c.key)}">${esc(c.name)} (cliente)</option>`), ...prospects().filter(p => p.etapa !== "perdido" && !p.cliente_chave).map(p => `<option value="prospect|${esc(p.id)}">${esc(p.nome)} (cliente novo)</option>`)].join("");
    view.innerHTML = `<div class="panel no-print">${H.banner("shield", "Dados da Nova7 no contrato", faltaAg.length ? "faltam dados obrigatórios" : "preenchidos", `<button type="button" class="btn sm" id="ag-toggle">${faltaAg.length ? "Preencher" : "Editar"}</button>`)}<div class="panel-body" id="ag-body" ${faltaAg.length ? "" : "hidden"}>
        <form id="ag-form" autocomplete="off"><div class="fgrid">${AGENCIA_CAMPOS.map(([k, n]) => fld(k, n, ag[k])).join("")}</div></form>${H.canWrite ? `<div class="toolbar"><button type="button" class="btn sm primary" id="ag-save">Salvar dados da Nova7</button></div>` : ""}</div></div>
      <div class="panel no-print">${H.banner("file", "Contratos", `${list.length} salvo(s)`, H.canWrite ? `<select id="ct-origem"><option value="">Novo contrato para…</option>${origem}</select>` : "")}<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviços</th><th class="num">Valor mensal</th><th>Situação</th><th>Início</th><th></th></tr></thead><tbody>${lista || `<tr><td colspan="6"><div class="empty">Nenhum contrato ainda. Escolha um cliente acima para montar o primeiro.</div></td></tr>`}</tbody></table></div></div>
      ${cur ? contratoEditor(cur) : ""}`;
    wireContratos(view, root0);
  }
  function contratoEditor(ct) {
    const d = ct.dados || {}, saved = contracts().find(c => c.id === ct.id), lock = !!saved && (saved.status === "assinado" || saved.status === "encerrado"), cont = d.contratante || {}, cond = d.cond || {};
    const svBlocks = SV.ORDER.map(s => { const on = (ct.servicos || []).includes(s), P = C.PARAMS[s] || []; return `<div class="ct-sv${on ? " on" : ""}"><label class="check"><input type="checkbox" name="ctsvc" value="${s}"${on ? " checked" : ""}> <b>${esc(SV.SERVICES[s].name)}</b></label>
        ${on ? `<div class="fgrid">${fld("val_" + s, "Valor mensal (R$)", (ct.valores[s] || "") === "" ? "" : String(ct.valores[s]).replace(".", ","), ' inputmode="decimal"')}${P.map(([k, n, def]) => fld(`par_${s}_${k}`, n, ((d.params || {})[s] || {})[k] ?? def, ' inputmode="numeric"')).join("")}</div>
        ${area("esc_" + s, "Escopo no contrato (editável)", (d.escopos || {})[s] || C.escopoPadrao(s, (d.params || {})[s] || {}), 3)}` : ""}</div>`; }).join("");
    const doc = montar(ct);
    return `<div class="no-print"><h2 class="sec-title">${esc(ct.cliente_nome || "Contrato")} <span class="badge ${ct.status === "assinado" ? "st-pub" : "p1"}">${esc(stNome[ct.status])}</span></h2>
      ${lock ? `<p class="notice info">Contrato ${esc(stNome[saved.status].toLowerCase())}: o texto não é mais editável. Para mudar o que foi combinado, crie um novo contrato (aditivo).</p>` : ""}
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
    const refresh = (full) => { draft = readContrato(view, cur); ui.ct = draft; if (full) rerender(); else $("#ct-prev", view).innerHTML = montar(draft).html; };
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
    H = helpers; if (root.N7ComercialMapa) root.N7ComercialMapa.destruirTodos();
    const tab = ["funil", "novos", "mapa", "contratos"].includes(sub) ? sub : "carteira";
    const titulo = { carteira: ["Carteira atual", "Como estão os clientes de hoje e onde dá para vender mais."], funil: ["Funil de vendas", "Cada cliente novo em sua etapa, com valor, próximo contato e o que está atrasado."], novos: ["Clientes novos", "Preencha a ficha de quem pode virar cliente e veja o posicionamento sugerido."], mapa: ["Mapa de clientes e fichas", "Onde ficam os clientes da carteira e os comércios que você está prospectando."], contratos: ["Contratos", "Monte o contrato a partir dos serviços, com valor, escopo e condições."] }[tab];
    view.innerHTML = `<div class="page-head no-print"><div><div class="eyebrow">Comercial · só administradores</div><h1>${titulo[0]}</h1><p>${titulo[1]}</p></div></div><nav class="subtabs in-side no-print" aria-label="Comercial">${[["carteira", "Carteira atual"], ["funil", "Funil de vendas"], ["novos", "Clientes novos"], ["mapa", "Mapa"], ["contratos", "Contratos"]].map(([k, n]) => `<a href="#comercial${k === "carteira" ? "" : "/" + k}"${k === tab ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav><div id="cm-body" class="view" style="gap:16px"></div>`;
    const body = $("#cm-body", view);
    (tab === "funil" ? funilTela : tab === "novos" ? novos : tab === "mapa" ? mapaTela : tab === "contratos" ? contratos : carteira)(body);
  }

  root.N7ComercialUI = { render };
})(typeof window !== "undefined" ? window : globalThis);
