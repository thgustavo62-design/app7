/* Repositório de dados: lê e grava linhas das abas da planilha-banco (ou de uma cópia em memória,
   usada em testes e no servidor local). Cada chamada de API cria um Repo novo, que lê cada aba no
   máximo uma vez e mantém a cópia atualizada enquanto grava (poucas chamadas ao Google). */
const { COLS, TABS, versioned, keyOf } = require('./schema');

class Conflict extends Error {
  constructor(tab, current) { super(`Conflito em ${tab}`); this.name = 'Conflict'; this.tab = tab; this.current = current; }
}

/* ---------- memória ---------- */
class MemoryDriver {
  constructor(seed = {}) { this.t = {}; TABS.forEach(tab => { this.t[tab] = (seed[tab] || []).map(r => Object.assign({}, r)); }); }
  async readMany(tabs) {
    const out = {};
    tabs.forEach(tab => { out[tab] = { header: COLS[tab].slice(), rows: this.t[tab].map((r, i) => r && Object.assign({ _row: i + 2 }, r)).filter(Boolean) }; });
    return out;
  }
  async append(tab, header, obj) { this.t[tab].push(pick(header, obj)); }
  async write(tab, header, row, obj) { this.t[tab][row - 2] = pick(header, obj); }
  async clear(tab, header, row) { const a = this.t[tab]; a[row - 2] = null; while (a.length && a[a.length - 1] === null) a.pop(); } /* como no Sheets, linhas vazias no fim somem */
}
const pick = (header, obj) => Object.fromEntries(header.map(h => [h, String(obj[h] ?? '')]));

/* ---------- Google Sheets ---------- */
const colLetter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
class SheetsDriver {
  constructor(client) { this.c = client; }
  async readMany(tabs) {
    const res = await this.c.batchGet(tabs);
    const out = {};
    tabs.forEach((tab, i) => {
      const values = (res.valueRanges && res.valueRanges[i] && res.valueRanges[i].values) || [];
      const header = (values[0] || []).map(h => String(h).trim());
      const missing = COLS[tab].filter(c => !header.includes(c));
      if (missing.length) throw new Error(`A aba ${tab} não tem a coluna ${missing.join(', ')}`);
      const rows = [];
      for (let r = 1; r < values.length; r++) {
        const cells = values[r] || [];
        if (!cells.some(c => String(c ?? '') !== '')) continue;
        const obj = { _row: r + 1 }; header.forEach((h, j) => { obj[h] = String(cells[j] ?? ''); });
        rows.push(obj);
      }
      out[tab] = { header, rows };
    });
    return out;
  }
  append(tab, header, obj) { return this.c.append(`${tab}!A1`, [header.map(h => String(obj[h] ?? ''))]); }
  write(tab, header, row, obj) { return this.c.update(`${tab}!A${row}:${colLetter(header.length)}${row}`, [header.map(h => String(obj[h] ?? ''))]); }
  clear(tab, header, row) { return this.c.clear(`${tab}!A${row}:${colLetter(header.length)}${row}`); }
}

/* ---------- repositório ---------- */
class Repo {
  constructor(driver, { now = () => new Date().toISOString() } = {}) { this.d = driver; this.now = now; this.cache = {}; }
  async load(tabs) {
    const need = tabs.filter(t => !this.cache[t]);
    if (!need.length) return;
    const got = await this.d.readMany(need);
    need.forEach(t => { const { header, rows } = got[t]; this.cache[t] = { header, rows, next: Math.max(1, ...rows.map(r => r._row)) + 1 }; });
  }
  async rows(tab) { await this.load([tab]); return this.cache[tab].rows; }
  async find(tab, keyObj) { const k = keyOf(tab, keyObj); return (await this.rows(tab)).find(r => keyOf(tab, r) === k); }
  stamp(tab, o, user, isNew) {
    if (COLS[tab].includes('atualizado_em')) o.atualizado_em = this.now();
    if (COLS[tab].includes('atualizado_por')) o.atualizado_por = (user && user.email) || '';
    if (isNew && COLS[tab].includes('criado_em') && !o.criado_em) o.criado_em = this.now();
  }
  /* upsert; em abas com "versao", exige que a versão lida seja a atual (senão Conflict) */
  async upsert(tab, obj, { baseV, user, check = true } = {}) {
    await this.load([tab]);
    const c = this.cache[tab], hit = await this.find(tab, obj), full = Object.assign({}, hit || {}, obj);
    if (hit) {
      if (versioned(tab) && check && String(baseV ?? '') !== String(hit.versao ?? '')) throw new Conflict(tab, hit);
      if (versioned(tab)) full.versao = String((parseInt(hit.versao, 10) || 0) + 1);
      this.stamp(tab, full, user, false);
      await this.d.write(tab, c.header, hit._row, full);
      Object.assign(hit, full);
    } else {
      if (versioned(tab)) full.versao = '1';
      this.stamp(tab, full, user, true);
      await this.d.append(tab, c.header, full);
      c.rows.push(Object.assign({ _row: c.next }, full)); c.next++;
    }
    return full;
  }
  async remove(tab, keyObj, { baseV, check = true } = {}) {
    const hit = await this.find(tab, keyObj); if (!hit) return false;
    if (versioned(tab) && check && baseV != null && String(baseV) !== String(hit.versao ?? '')) throw new Conflict(tab, hit);
    await this.d.clear(tab, this.cache[tab].header, hit._row);
    this.cache[tab].rows = this.cache[tab].rows.filter(r => r !== hit);
    return true;
  }
  /* só acrescenta (registro de eventos); se o id já existe, não grava de novo */
  async append(tab, obj, { user } = {}) {
    if (await this.find(tab, obj)) return { duplicate: true };
    const c = this.cache[tab], full = Object.assign({}, obj);
    this.stamp(tab, full, user, true);
    await this.d.append(tab, c.header, full);
    c.rows.push(Object.assign({ _row: c.next }, full)); c.next++;
    return full;
  }
}
module.exports = { Repo, MemoryDriver, SheetsDriver, Conflict, colLetter };
