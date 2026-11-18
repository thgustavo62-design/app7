/* =====================================================================
   Fluxo de trabalho: etapas de aprovação por cliente, horários fixos de
   publicação e quadro de ideias. Sem dependência de tela, por isso dá
   para testar em Node. Tudo fica no navegador (localStorage) até existir
   um servidor.
   Conceitos adaptados do Brightbean Studio (brightbeanxyz/brightbean-studio,
   AGPL-3.0): só as ideias de produto; o código é próprio.
   ===================================================================== */
(function (root) {
  const KEYS = { flow: "nova7-fluxo-v1", ideas: "nova7-ideias-v1", approvals: "nova7-aprovacoes-v1", custom: "nova7-pautas-v1" };
  const mem = {};
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in mem ? mem[k] : fb); } catch (e) { return k in mem ? mem[k] : fb; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- datas (locais, sem fuso) ---------- */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

  /* ---------- política de aprovação ---------- */
  const POLICIES = {
    none: { name: "Sem aprovação", needs: [], text: "A peça pode ir direto para pronta e publicada." },
    internal: { name: "Só interna", needs: ["internal"], text: "Uma pessoa da equipe aprova antes de a peça ficar pronta." },
    internal_client: { name: "Interna e do cliente", needs: ["internal", "client"], text: "A equipe aprova e depois o cliente aprova. Só então a peça pode ficar pronta ou publicada." }
  };
  const INTERNAL_ROLE = { M: "farmacêutico responsável", F: "farmacêutico responsável", C: "revisão agronômica", N: "direção da agência" };
  const KIND_NAME = { internal: "Interna", client: "Cliente" };

  /* ---------- horários fixos: sugeridos a partir do plano Nov–Dez ---------- */
  const FORMATS = ["Carrossel", "Reels"];
  const SLOT_FORMATS = ["Carrossel", "Reels", "Qualquer"];
  const slot = (dow, time, format) => ({ dow, time, format });
  const DEFAULT_FLOW = {
    user: "",
    policy: { M: "internal_client", F: "internal_client", C: "internal_client", N: "internal" },
    slots: {
      M: [slot(1, "12:00", "Carrossel"), slot(2, "12:00", "Carrossel"), slot(4, "18:30", "Reels"), slot(6, "11:00", "Reels")],
      F: [slot(1, "12:00", "Carrossel"), slot(3, "18:30", "Reels"), slot(5, "12:00", "Carrossel")],
      C: [slot(2, "12:00", "Carrossel"), slot(5, "18:30", "Reels")],
      N: [slot(2, "12:00", "Carrossel"), slot(4, "18:30", "Reels"), slot(6, "11:00", "Carrossel")]
    }
  };
  function getFlow() {
    const saved = store.get(KEYS.flow, {}) || {};
    const d = clone(DEFAULT_FLOW);
    return { user: saved.user || "", policy: Object.assign(d.policy, saved.policy || {}), slots: Object.assign(d.slots, saved.slots || {}) };
  }
  const saveFlow = f => store.set(KEYS.flow, f);
  const defaultSlots = b => clone(DEFAULT_FLOW.slots[b] || []);

  /* ---------- aprovações ---------- */
  const emptyRec = () => ({ internal: null, client: null, comments: [], history: [] });
  const allApprovals = () => store.get(KEYS.approvals, {}) || {};
  const recOf = code => Object.assign(emptyRec(), allApprovals()[code] || {});
  function saveRec(code, rec) { const all = allApprovals(); all[code] = rec; store.set(KEYS.approvals, all); }
  const stamp = now => now || new Date().toISOString();
  function approve(code, kind, by, now) {
    by = String(by || "").trim(); if (!by) return { ok: false, msg: "Informe o nome de quem está aprovando." };
    const r = recOf(code), at = stamp(now);
    r[kind] = { by, at }; r.history.push({ at, text: `Aprovação ${KIND_NAME[kind].toLowerCase()} registrada por ${by}.` });
    saveRec(code, r); return { ok: true };
  }
  function revoke(code, kind, by, now) {
    const r = recOf(code); if (!r[kind]) return { ok: false, msg: "Não há aprovação para reabrir." };
    const at = stamp(now); r.history.push({ at, text: `Aprovação ${KIND_NAME[kind].toLowerCase()} reaberta${by ? " por " + by : ""} (era de ${r[kind].by}).` });
    r[kind] = null; saveRec(code, r); return { ok: true };
  }
  function requestChanges(code, kind, by, text, now) {
    text = String(text || "").trim(); by = String(by || "").trim();
    if (!text) return { ok: false, msg: "Escreva o que precisa mudar no campo de comentário." };
    const r = recOf(code), at = stamp(now), who = by || KIND_NAME[kind];
    r[kind] = null; r.comments.push({ kind, by: who, at, text, change: true });
    r.history.push({ at, text: `${KIND_NAME[kind]}: ${who} pediu ajustes.` });
    saveRec(code, r); return { ok: true };
  }
  function comment(code, kind, by, text, now) {
    text = String(text || "").trim(); if (!text) return { ok: false, msg: "Escreva o comentário." };
    const r = recOf(code), at = stamp(now);
    r.comments.push({ kind, by: String(by || "").trim() || KIND_NAME[kind], at, text });
    r.history.push({ at, text: `Comentário ${KIND_NAME[kind].toLowerCase()} de ${String(by || "").trim() || KIND_NAME[kind]}.` });
    saveRec(code, r); return { ok: true };
  }
  function approvalState(code, brand, flow) {
    flow = flow || getFlow();
    const policy = flow.policy[brand] || "none", needs = (POLICIES[policy] || POLICIES.none).needs, rec = recOf(code);
    const done = needs.filter(n => rec[n]), pending = needs.filter(n => !rec[n]);
    return { policy, needs, done, pending, complete: pending.length === 0, rec };
  }
  /* trava ao ir para "pronto" ou "publicado" */
  function gate(toStatus, st) {
    if ((toStatus === "agd" || toStatus === "pub") && !st.complete) {
      const falta = st.pending.map(k => KIND_NAME[k].toLowerCase()).join(" e ");
      return { ok: false, msg: `Falta a aprovação ${falta}.` };
    }
    return { ok: true };
  }

  /* ---------- datas que pedem atenção (a Central manda antecipar 24, 25 e 31/12) ---------- */
  const HOLIDAYS = { "2026-11-20": "Consciência Negra", "2026-12-24": "véspera de Natal", "2026-12-25": "Natal", "2026-12-31": "Réveillon", "2027-01-01": "Ano Novo" };

  /* ---------- horários livres ---------- */
  const slotFits = (s, format) => !format || s.format === "Qualquer" || s.format === format;
  const bySlotTime = (a, b) => a.time.localeCompare(b.time);
  /* taken(brand, isoDate, slotFormat) diz se já existe pauta ocupando o horário */
  function freeSlots({ brand, format, from, to, count, taken, flow, maxDays }) {
    const slots = (flow || getFlow()).slots[brand] || [], out = [];
    const last = to ? Math.round((to - from) / 864e5) : (maxDays || 400);
    for (let i = 0; i <= last; i++) {
      if (count && out.length >= count) break;
      const d = addDays(from, i), ds = iso(d);
      slots.filter(s => s.dow === d.getDay() && slotFits(s, format)).sort(bySlotTime).forEach(s => {
        if ((!count || out.length < count) && !taken(brand, ds, s.format)) out.push({ date: ds, time: s.time, format: s.format, holiday: HOLIDAYS[ds] || null });
      });
    }
    return out;
  }

  /* ---------- ideias ---------- */
  const STAGES = [["nova", "Nova ideia", "ainda sem análise"], ["analise", "Em análise", "avaliando com o cliente ou a equipe"], ["aprovada", "Aprovada", "pronta para ganhar data"], ["descartada", "Descartada", "fora do plano por enquanto"]];
  const SEED_IDEAS = [
    { id: "seed-1", b: "F", format: "Carrossel", stage: "analise", title: "Farma Club: como cadastrar, acumular pontos e participar do sorteio", note: "Em vez de repetir os benefícios (já há dois posts), explicar cadastro, pontos e regra do sorteio. Confirmar o regulamento antes.", src: "Auditoria de 10/11: direção recomendada para o C-F19", at: "2026-11-18" },
    { id: "seed-2", b: "M", format: "Carrossel", stage: "nova", title: "Black Friday: campanha do mês × validade de cada lote", note: "Deixar claro o que vale o mês inteiro e o que vence por rodada (ex.: até 17/11). Ligar cada peça à tabela de preços aprovada.", src: "Auditoria de 10/11: condições e periodicidade da Black", at: "2026-11-18" },
    { id: "seed-3", b: "C", format: "Reels", stage: "analise", title: "Visita técnica: o que o técnico registra no caderno de campo", note: "Mostrar só o que a Campo Forte confirma entregar. Sem promessa de produtividade. Passa por revisão agronômica.", src: "Diretoria de marketing: série \"O preço de decidir no escuro\"", at: "2026-11-18" },
    { id: "seed-4", b: "N", format: "Carrossel", stage: "nova", title: "Como a agência organiza o calendário de duas farmácias sem repetir pauta", note: "Exemplo para teste do quadro. Só vira case com autorização expressa dos clientes.", src: "Exemplo para começar o quadro", at: "2026-11-18" }
  ];
  const getIdeas = () => { let v = store.get(KEYS.ideas, null); if (!v) { v = clone(SEED_IDEAS); store.set(KEYS.ideas, v); } return v; };
  const saveIdeas = v => store.set(KEYS.ideas, v);
  function addIdea({ b, format, title, note, at }) {
    title = String(title || "").trim();
    if (title.length < 3) return { ok: false, msg: "Dê um título à ideia (pelo menos 3 letras)." };
    if (!FORMATS.includes(format)) format = "Carrossel";
    const v = getIdeas(), idea = { id: "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), b, format, stage: "nova", title, note: String(note || "").trim(), src: "Criada no quadro", at: at || iso(new Date()) };
    v.push(idea); saveIdeas(v); return { ok: true, idea };
  }
  function updateIdea(id, patch) {
    const v = getIdeas(), i = v.find(x => x.id === id); if (!i) return { ok: false };
    if (patch.title != null && String(patch.title).trim().length < 3) return { ok: false, msg: "O título precisa de pelo menos 3 letras." };
    Object.assign(i, patch); if (patch.title != null) i.title = String(patch.title).trim(); saveIdeas(v); return { ok: true, idea: i };
  }
  function removeIdea(id) { saveIdeas(getIdeas().filter(x => x.id !== id)); }

  /* ---------- pautas criadas a partir de ideias ---------- */
  const getCustom = () => store.get(KEYS.custom, []) || [];
  const saveCustom = v => store.set(KEYS.custom, v);
  /* datas de produção seguem o padrão da Central, sem cair no passado */
  function promote(id, slotPick, doc, today) {
    const ideas = getIdeas(), idea = ideas.find(x => x.id === id);
    if (!idea) return { ok: false, msg: "Ideia não encontrada." };
    if (idea.stage !== "aprovada") return { ok: false, msg: "Aprove a ideia antes de agendar." };
    if (!slotPick || !slotPick.date) return { ok: false, msg: "Escolha um horário." };
    const custom = getCustom(); let n = custom.filter(c => c.b === idea.b).length + 1, code;
    do { code = `I-${idea.b}${String(n).padStart(2, "0")}`; n++; } while (custom.some(c => c.code === code));
    const d = parse(slotPick.date), t = today || iso(new Date());
    const off = k => { const s = iso(addDays(d, -k)); return s < t ? t : s; };
    const pauta = { code, b: idea.b, title: idea.title, format: idea.format, date: slotPick.date, time: slotPick.time || null, steps: { roteiro: off(10), gravar: off(8), editar: off(4), aprovar: off(2), agendar: off(1) }, status: "plan", note: "Criada no quadro de ideias." + (idea.note ? " " + idea.note : ""), doc, fromIdea: id };
    custom.push(pauta); saveCustom(custom);
    idea.stage = "agendada"; idea.promoted = code; saveIdeas(ideas);
    return { ok: true, pauta };
  }
  function removeCustom(code) {
    const c = getCustom(), p = c.find(x => x.code === code); if (!p) return { ok: false };
    saveCustom(c.filter(x => x.code !== code));
    const ideas = getIdeas(), i = ideas.find(x => x.id === p.fromIdea);
    if (i) { i.stage = "aprovada"; delete i.promoted; saveIdeas(ideas); }
    return { ok: true };
  }

  root.N7Flow = {
    KEYS, HOLIDAYS, POLICIES, INTERNAL_ROLE, KIND_NAME, FORMATS, SLOT_FORMATS, STAGES,
    getFlow, saveFlow, defaultSlots,
    recOf, approve, revoke, requestChanges, comment, approvalState, gate,
    freeSlots,
    getIdeas, addIdea, updateIdea, removeIdea,
    getCustom, promote, removeCustom,
    _iso: iso, _parse: parse, _addDays: addDays,
    _reset() { Object.keys(mem).forEach(k => delete mem[k]); try { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); } catch (e) { } }
  };
})(typeof window !== "undefined" ? window : globalThis);
