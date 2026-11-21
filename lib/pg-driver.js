/* Driver do Postgres (Neon, Supabase ou qualquer outro). Mesma interface do SheetsDriver e do MemoryDriver, então o resto do servidor não muda.
   Todas as abas ficam numa tabela só, n7.linhas (aba, id, dados jsonb): é a "fase 1" do plano em docs/migracao-postgres.md.
   O que muda para melhor: gravar a aba inteira (replace) é uma transação, a gravação de uma linha com versão só vale se a versão
   ainda é a lida (sem perder atualização de outra pessoa) e a reserva da revisão de importação é atômica.
   Segurança: o schema n7 não é exposto por APIs automáticas de provedores (como a do Supabase) e a tabela tem RLS ligada sem política (só a conexão do servidor lê). */
const { COLS, TABS, versioned } = require('./schema');

let PgPool = null;
const pools = new Map();
/* o sslmode da URL (que a integração da Vercel acrescenta) faria o driver exigir a cadeia completa de certificados e recusar poolers de provedores como o Supabase:
   o SSL é decidido aqui, sempre ligado fora do computador local */
const cleanUrl = url => url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
function poolFor(url, { max = 3 } = {}) {
  if (!pools.has(url)) {
    if (!PgPool) PgPool = require('pg').Pool;
    const local = /@(localhost|127\.0\.0\.1)(:|\/|$)|host=\/|sslmode=disable/.test(url);
    pools.set(url, new PgPool({ connectionString: cleanUrl(url), max, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000, ssl: local ? false : { rejectUnauthorized: false } }));
  }
  return pools.get(url);
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS n7;
CREATE TABLE IF NOT EXISTS n7.linhas (id bigserial PRIMARY KEY, aba text NOT NULL, dados jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS linhas_aba_idx ON n7.linhas (aba, id);
ALTER TABLE n7.linhas ENABLE ROW LEVEL SECURITY;`;

class PgDriver {
  constructor(url, opts = {}) { this.url = url; this.pool = poolFor(url, opts); this.ready = null; }
  ensure() {
    if (!this.ready) this.ready = this.pool.query(SCHEMA_SQL).catch(e => { this.ready = null; throw Object.assign(new Error('Não consegui preparar o banco Postgres: ' + e.message), { status: 500, expose: true }); });
    return this.ready;
  }
  async tx(fn) {
    await this.ensure();
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
    catch (e) { try { await c.query('ROLLBACK'); } catch (x) { /* conexão já caiu */ } throw e; }
    finally { c.release(); }
  }
  async readMany(tabs) {
    await this.ensure();
    const r = await this.pool.query('SELECT aba, id, dados FROM n7.linhas WHERE aba = ANY($1) ORDER BY id', [tabs]);
    const out = {}; tabs.forEach(t => { out[t] = { header: COLS[t].slice(), rows: [] }; });
    r.rows.forEach(x => out[x.aba].rows.push(Object.assign({ _row: Number(x.id) }, fill(COLS[x.aba], x.dados))));
    return out;
  }
  /* devolve o id da linha criada: o Repo usa como "número da linha" */
  async append(tab, header, obj) {
    await this.ensure();
    const r = await this.pool.query('INSERT INTO n7.linhas (aba, dados) VALUES ($1, $2) RETURNING id', [tab, pick(header, obj)]);
    return Number(r.rows[0].id);
  }
  /* regrava uma linha; em abas com versão, só se a versão guardada ainda é a que foi lida (senão Conflict, e nada é gravado) */
  async write(tab, header, row, obj, { expectVersion } = {}) {
    await this.ensure();
    const dados = pick(header, obj);
    const r = versioned(tab) && expectVersion !== undefined
      ? await this.pool.query(`UPDATE n7.linhas SET dados = $3 WHERE id = $1 AND aba = $2 AND COALESCE(dados->>'versao', '') = $4`, [row, tab, dados, String(expectVersion ?? '')])
      : await this.pool.query('UPDATE n7.linhas SET dados = $3 WHERE id = $1 AND aba = $2', [row, tab, dados]);
    if (!r.rowCount) { const e = new Error(`Conflito em ${tab}`); e.name = 'Conflict'; e.tab = tab; e.pgStale = true; throw e; }
  }
  async clear(tab, header, row) { await this.ensure(); await this.pool.query('DELETE FROM n7.linhas WHERE id = $1 AND aba = $2', [row, tab]); }
  /* troca todas as linhas da aba numa transação só: ou fica tudo novo, ou tudo como estava */
  async replace(tab, header, objs, oldLast, guard) {
    return this.tx(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['n7:' + tab]);
      if (guard) await this.cas(c, guard);
      await c.query('DELETE FROM n7.linhas WHERE aba = $1', [tab]);
      for (let i = 0; i < objs.length; i += 1000) {
        const chunk = objs.slice(i, i + 1000).map(o => pick(header, o));
        await c.query('INSERT INTO n7.linhas (aba, dados) SELECT $1, x FROM jsonb_array_elements($2::jsonb) AS x', [tab, JSON.stringify(chunk)]);
      }
    });
  }
  /* compara e troca um valor da aba Config na mesma transação (revisão da loja): se mudou desde que a importação começou, 409 */
  async cas(c, { key, expect, set }) {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['n7:Config']);
    const r = await c.query(`SELECT id, dados FROM n7.linhas WHERE aba = 'Config' AND dados->>'chave' = $1 FOR UPDATE`, [key]);
    const atual = r.rows[0] ? String(r.rows[0].dados.valor || '') : '';
    if (atual !== (expect || '')) { const e = new Error('Outra importação desta loja acabou de gravar. Nada foi apagado: confira o que foi importado e tente de novo.'); e.status = 409; e.expose = true; throw e; }
    const dados = pick(COLS.Config, { chave: key, valor: set });
    if (r.rows[0]) await c.query('UPDATE n7.linhas SET dados = $2 WHERE id = $1', [r.rows[0].id, dados]);
    else await c.query(`INSERT INTO n7.linhas (aba, dados) VALUES ('Config', $1)`, [dados]);
  }
  /* regrava a aba só se a revisão ainda é a lida, tudo numa transação */
  replaceGuarded(tab, header, objs, guard) { return this.replace(tab, header, objs, 0, guard); }
  async close() { await this.pool.end(); pools.delete(this.url); }
}
const pick = (header, obj) => Object.fromEntries(header.map(h => [h, String(obj[h] ?? '')]));
const fill = (header, dados) => Object.fromEntries(header.map(h => [h, String((dados && dados[h]) ?? '')]));

module.exports = { PgDriver, TABS };
