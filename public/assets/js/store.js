/* Armazenamento do site. Chaves "sincronizadas" ficam na memória, vêm do servidor
   no início e avisam os ouvintes a cada mudança (o sync.js envia ao servidor).
   As demais (preferências de tela) ficam só no localStorage do navegador.
   Sem localStorage (ou em testes em Node), tudo cai em memória. */
(function (root) {
  const SYNCED = ["overrides", "checks", "goals", "flow", "ideas", "custom", "events", "weeks", "weekGen", "authority", "decisions", "owners", "prospects", "contracts", "agency"];
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const data = {}, snap = {}, mem = {}, listeners = [];
  const ls = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

  function get(key, fb) {
    if (SYNCED.includes(key)) return key in data ? data[key] : fb;
    const l = ls();
    try { const v = l ? l.getItem("nova7-" + key) : null; if (v) return JSON.parse(v); } catch (e) { /* cai para memória */ }
    return key in mem ? mem[key] : fb;
  }
  function set(key, value) {
    if (SYNCED.includes(key)) {
      const old = snap[key];
      data[key] = value; snap[key] = clone(value);
      listeners.forEach(fn => { try { fn(key, old, value); } catch (e) { console.error(e); } });
      return true;
    }
    mem[key] = value;
    const l = ls(); try { if (l) l.setItem("nova7-" + key, JSON.stringify(value)); } catch (e) { return false; }
    return true;
  }
  /* carrega o estado vindo do servidor, sem disparar ouvintes */
  function hydrate(map) { Object.keys(map).forEach(k => { data[k] = map[k]; snap[k] = clone(map[k]); }); }
  /* guarda a versão devolvida pelo servidor no objeto vivo e no retrato usado para comparar */
  /* id: função (coleções em lista) ou texto (coleções em mapa, como overrides e checks) */
  function setVersion(key, id, v) {
    [data[key], snap[key]].forEach(col => {
      if (!col) return;
      const hit = typeof id === "function" ? (Array.isArray(col) ? col.find(id) : null) : col[id];
      if (hit && typeof hit === "object") hit.v = v;
    });
  }
  const onChange = fn => listeners.push(fn);
  function reset() { Object.keys(data).forEach(k => delete data[k]); Object.keys(snap).forEach(k => delete snap[k]); Object.keys(mem).forEach(k => delete mem[k]); listeners.length = 0; }

  root.N7Store = { SYNCED, get, set, hydrate, setVersion, onChange, reset, _data: data, _snap: snap };
})(typeof window !== "undefined" ? window : globalThis);
