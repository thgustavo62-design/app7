/* Sincronização com o servidor. A tela continua trabalhando na memória (rápida); cada mudança é
   comparada com o retrato anterior, vira "operações" e é enviada em fila a /api/mutate.
   diffKey() é pura e roda em Node nos testes. */
(function (root) {
  const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x);
  const strip = o => { const c = Object.assign({}, o); delete c.v; return c; };
  const same = (a, b) => stable(strip(a)) === stable(strip(b));

  function diffList(old, nw, idKey, up, del) {
    const idOf = typeof idKey === "function" ? idKey : x => x[idKey];
    const prev = new Map((old || []).map(x => [idOf(x), x])), ops = [];
    (nw || []).forEach(x => { const o = prev.get(idOf(x)); if (!o || !same(o, x)) ops.push(up(x, o)); prev.delete(idOf(x)); });
    prev.forEach(o => ops.push(del(o)));
    return ops;
  }
  function diffMap(old, nw, up, del, eq = same) {
    old = old || {}; nw = nw || {}; const ops = [];
    Object.keys(nw).forEach(k => { if (!old[k] || !eq(old[k], nw[k])) ops.push(up(k, nw[k], old[k])); });
    Object.keys(old).forEach(k => { if (!(k in nw)) ops.push(del(k, old[k])); });
    return ops;
  }
  const slotRows = list => (list || []).map(s => ({ dow: Number(s.dow), time: s.time, format: s.format }));

  /* ops que o servidor entende (ver lib/model.js) */
  function diffKey(key, old, nw) {
    switch (key) {
      case "overrides": return diffMap(old, nw,
        (code, n, o) => ({ t: "override", op: "upsert", code, status: n.status || "", date: n.date || "", v: n.v ?? (o && o.v) }),
        (code, o) => ({ t: "override", op: "delete", code, v: o && o.v }));
      case "ideas": return diffList(old, nw, "id",
        (x, o) => ({ t: "idea", op: "upsert", id: x.id, b: x.b, format: x.format, title: x.title, note: x.note || "", stage: x.stage, src: x.src || "", at: x.at || "", promoted: x.promoted || "", v: x.v ?? (o && o.v) }),
        o => ({ t: "idea", op: "delete", id: o.id, v: o.v }));
      case "custom": return diffList(old, nw, "code",
        (x, o) => ({ t: "custom", op: "upsert", code: x.code, b: x.b, title: x.title, format: x.format, date: x.date, time: x.time || "", status: x.status || "plan", steps: x.steps || {}, doc: x.doc || "", note: x.note || "", fromIdea: x.fromIdea || "", v: x.v ?? (o && o.v) }),
        o => ({ t: "custom", op: "delete", code: o.code, v: o.v }));
      case "weeks": return diffList(old, nw, x => `${x.tipo}|${x.inicio}|${x.marca}`,
        (x, o) => Object.assign({ t: "week", op: "upsert", v: x.v ?? (o && o.v) }, strip(x), { v: x.v ?? (o && o.v) }),
        o => ({ t: "week", op: "delete", tipo: o.tipo, inicio: o.inicio, marca: o.marca, v: o.v }));
      case "decisions": return diffList(old, nw, "chave",
        (x, o) => ({ t: "decision", op: "upsert", chave: x.chave, agente: x.agente, marca: x.marca || "", titulo: x.titulo, status: x.status, ate: x.ate, nota: x.nota || "", v: x.v ?? (o && o.v) }),
        o => ({ t: "decision", op: "delete", chave: o.chave, marca: o.marca || "", v: o.v }));
      case "weekGen": return diffList(old, nw, x => `${x.tipo}|${x.inicio}`,
        (x, o) => Object.assign({ t: "weekgen", op: "upsert" }, strip(x), { v: x.v ?? (o && o.v) }),
        o => ({ t: "weekgen", op: "delete", tipo: o.tipo, inicio: o.inicio, v: o.v }));
      case "events": {
        const seen = new Set((old || []).map(e => e.id));
        return (nw || []).filter(e => !seen.has(e.id)).map(e => ({ t: "event", ev: { id: e.id, code: e.code, kind: e.kind, act: e.act, by: e.by, at: e.at, text: e.text || "" } }));
      }
      case "checks": return diffMap(old, nw,
        (code, n) => ({ t: "check", op: "upsert", code, dims: n.dims || {}, checks: n.checks || {} }),
        code => ({ t: "check", op: "delete", code }),
        (a, b) => stable({ d: a.dims, c: a.checks }) === stable({ d: b.dims, c: b.checks }));
      case "goals": return diffMap(old, nw,
        (k, n) => ({ t: "goal", op: "upsert", key: k, value: n }),
        k => ({ t: "goal", op: "delete", key: k }),
        (a, b) => a === b);
      case "flow": {
        const ops = [], o = old || { policy: {}, slots: {} }, n = nw || { policy: {}, slots: {} };
        Object.keys(n.policy || {}).forEach(m => { if ((o.policy || {})[m] !== n.policy[m]) ops.push({ t: "policy", marca: m, politica: n.policy[m] }); });
        Object.keys(n.slots || {}).forEach(m => { if (stable(slotRows((o.slots || {})[m])) !== stable(slotRows(n.slots[m]))) ops.push({ t: "slots", marca: m, rows: slotRows(n.slots[m]) }); });
        return ops;
      }
      default: return [];
    }
  }

  /* motor de envio (só no navegador) */
  function createSync({ store, fetchFn, onState, onFatal, onAuth, retryMs = 6000 }) {
    fetchFn = fetchFn || ((u, i) => fetch(u, i));
    let queue = [], busy = false, attempts = 0, timer = null, sent = 0;   /* queue[0..sent-1] já foram enviadas e aguardam resposta */
    const target = op => `${op.t}|${op.id || op.code || op.key || op.chave || (op.t === "week" || op.t === "weekgen" ? op.tipo + "|" + op.inicio + "|" + (op.marca || "") : op.marca) || (op.ev && op.ev.id)}`;
    const setState = s => { try { onState && onState(s); } catch (e) { /* ignora */ } };

    function applyResult(op, r) {
      if (!r || r.v == null) return;
      /* repassa a versão nova às mudanças do mesmo registro que ainda estão na fila */
      queue.forEach(q => { if (target(q) === target(op) && q.v === op.v) q.v = r.v; });
      if (op.t === "idea") store.setVersion("ideas", x => x.id === op.id, r.v);
      else if (op.t === "custom") store.setVersion("custom", x => x.code === op.code, r.v);
      else if (op.t === "override") store.setVersion("overrides", op.code, r.v);
      else if (op.t === "week") store.setVersion("weeks", x => x.tipo === op.tipo && x.inicio === op.inicio && x.marca === op.marca, r.v);
      else if (op.t === "decision") store.setVersion("decisions", x => x.chave === op.chave, r.v);
      else if (op.t === "weekgen") store.setVersion("weekGen", x => x.tipo === op.tipo && x.inicio === op.inicio, r.v);
    }
    async function flush() {
      if (busy) return; busy = true; clearTimeout(timer); setState("saving");
      while (queue.length) {
        const batch = queue.slice(0, 20); sent = batch.length;
        let res, body;
        try {
          res = await fetchFn("/api/mutate", { method: "POST", headers: { "Content-Type": "application/json", "X-N7": "1" }, body: JSON.stringify({ ops: batch }) });
          body = await res.json().catch(() => ({}));
        } catch (e) { res = null; }
        sent = 0;
        if (res && res.status === 401) { busy = false; onAuth && onAuth(); return; }
        if (res && res.status === 409) { queue = []; busy = false; onFatal && onFatal("Outra pessoa mudou isto ao mesmo tempo. Vou recarregar com a versão mais recente."); return; }
        if (res && res.status >= 400 && res.status < 500) { queue = []; busy = false; onFatal && onFatal((body && body.error) || "Não foi possível salvar."); return; }
        if (!res || !res.ok) {
          attempts++; busy = false; setState("error");
          if (attempts < 6) timer = setTimeout(flush, retryMs * Math.min(attempts, 4));
          return;
        }
        attempts = 0; queue.splice(0, batch.length);
        batch.forEach((op, i) => applyResult(op, (body.results || [])[i]));
      }
      busy = false; setState("saved");
    }
    store.onChange((key, old, nw) => {
      const ops = diffKey(key, old, nw);
      if (!ops.length) return;
      ops.forEach(op => {
        /* duas mudanças seguidas no mesmo registro, ainda não enviadas, viram uma só */
        const i = op.op === "delete" ? -1 : queue.findIndex((q, idx) => idx >= sent && q.op !== "delete" && target(q) === target(op) && q.t !== "event");
        if (i >= 0) queue[i] = Object.assign({}, op, { v: queue[i].v }); else queue.push(op);
      });
      flush();
    });
    return { flush, pending: () => queue.length + (busy ? 1 : 0), _queue: () => queue };
  }

  root.N7Sync = { diffKey, createSync, _stable: stable };
})(typeof window !== "undefined" ? window : globalThis);
