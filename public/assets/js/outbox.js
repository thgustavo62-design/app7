/* Caixa de saída: guarda no aparelho as alterações que ainda não chegaram à planilha, para não se perderem se a conexão cair e o app for fechado.
   IndexedDB quando existe (é o que sobrevive a fechar o app no celular), localStorage como reserva e memória em testes.
   Uma caixa por usuário. Só guarda a fila de operações (as mesmas que o sync.js envia), nunca senhas nem dados de clientes além do que está na própria operação. */
(function (root) {
  const DB = "nova7-outbox", STORE = "fila";
  const mem = new Map();
  const lsOf = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };
  const idb = () => new Promise(res => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) return res(null);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: "email" }); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  const run = (db, mode, fn) => new Promise(res => {
    try { const tx = db.transaction(STORE, mode), out = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(out && "result" in out ? out.result : true); tx.onerror = tx.onabort = () => res(null); }
    catch (e) { res(null); }
  });

  function forUser(email) {
    const key = String(email || "").toLowerCase();
    return {
      async save(ops) {
        const rec = { email: key, at: new Date().toISOString(), ops: JSON.parse(JSON.stringify(ops)) };
        mem.set(key, rec);
        const db = await idb(); let ok = false;
        if (db) { ok = !!(await run(db, "readwrite", s => s.put(rec))); db.close(); }
        if (!ok) { const l = lsOf(); try { if (l) l.setItem("nova7-outbox:" + key, JSON.stringify(rec)); } catch (e) { /* sem espaço: fica só em memória */ } }
        return true;
      },
      async clear() {
        mem.delete(key);
        const db = await idb(); if (db) { await run(db, "readwrite", s => s.delete(key)); db.close(); }
        const l = lsOf(); try { if (l) l.removeItem("nova7-outbox:" + key); } catch (e) { /* ignora */ }
        return true;
      },
      async load() {
        let rec = null;
        const db = await idb();
        if (db) { const r = await new Promise(res => { try { const rq = db.transaction(STORE, "readonly").objectStore(STORE).get(key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } }); db.close(); rec = r; }
        if (!rec) { const l = lsOf(); try { const t = l && l.getItem("nova7-outbox:" + key); if (t) rec = JSON.parse(t); } catch (e) { /* ignora */ } }
        if (!rec) rec = mem.get(key) || null;
        return rec && Array.isArray(rec.ops) && rec.ops.length ? rec : null;
      }
    };
  }
  root.N7Outbox = { forUser, _mem: mem };
})(typeof window !== "undefined" ? window : globalThis);
