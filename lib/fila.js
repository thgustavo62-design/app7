/* Fila de leitura de arquivos pesados (PDF de vendas, estoque .xlsx), para a leitura rodar no COMPUTADOR da agência (PowerShell)
   e não no navegador de quem enviou. De qualquer aparelho a pessoa solta o arquivo no site; o arquivo vai em pedaços para esta fila;
   o computador da agência busca, lê, confere e devolve o resultado; o site mostra o resultado e grava pelo fluxo de sempre.
   Em produção a fila fica no Postgres (tabelas próprias no schema n7: leitura_job, leitura_parte, leitura_trabalhador). Em desenvolvimento e
   nos testes, na memória. Com a planilha como banco não existe fila (células da planilha são pequenas demais para um PDF). */
const crypto = require('crypto');
const { cfg, ConfigError } = require('./config');

const LIMITE_ARQUIVO = 60 * 1024 * 1024, LIMITE_PARTE = 4000000, MAX_PARTES = 24, RETENCAO_H = 24, PRESO_MIN = 10, ONLINE_S = 40, MAX_ATIVOS = 12;
const ESTADOS = ['enviando', 'aguardando', 'lendo', 'pronto', 'erro', 'cancelado'];
const novoId = () => crypto.randomBytes(12).toString('hex');
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, expose: true });

/* ---------- memória (desenvolvimento e testes) ---------- */
class Mem {
  constructor() { this.jobs = new Map(); this.partes = new Map(); this.trab = null; }
  async ensure() {}
  async criar(j) { this.jobs.set(j.id, Object.assign({}, j)); }
  async job(id) { const j = this.jobs.get(id); return j ? Object.assign({}, j) : null; }
  async atualizar(id, p) { const j = this.jobs.get(id); if (!j) return null; Object.assign(j, p, { atualizado_em: Date.now() }); return Object.assign({}, j); }
  async ativos(por) { return [...this.jobs.values()].filter(j => j.por === por && ['enviando', 'aguardando', 'lendo'].includes(j.estado)).length; }
  async putParte(id, sentido, n, buf) { this.partes.set(`${id}|${sentido}|${n}`, Buffer.from(buf)); }
  async getParte(id, sentido, n) { return this.partes.get(`${id}|${sentido}|${n}`) || null; }
  async nPartes(id, sentido) { return [...this.partes.keys()].filter(k => k.startsWith(`${id}|${sentido}|`)).length; }
  async apagarPartes(id, sentido) { [...this.partes.keys()].filter(k => k.startsWith(`${id}|${sentido ? sentido + '|' : ''}`)).forEach(k => this.partes.delete(k)); }
  async apagar(id) { this.jobs.delete(id); await this.apagarPartes(id); }
  async pegar(trab) {
    const agora = Date.now(), lista = [...this.jobs.values()];
    lista.filter(j => j.estado === 'lendo' && agora - j.atualizado_em > PRESO_MIN * 60000).forEach(j => { j.estado = 'aguardando'; });
    const j = lista.filter(x => x.estado === 'aguardando').sort((a, b) => a.criado_em - b.criado_em)[0];
    if (!j) return null; Object.assign(j, { estado: 'lendo', trabalhador: trab, atualizado_em: agora }); return Object.assign({}, j);
  }
  async publicarAnalise(loja, buf) { (this.analise || (this.analise = new Map())).set(loja, { dados: Buffer.from(buf), em: Date.now() }); }
  async analises() { return [...(this.analise || new Map()).entries()].map(([loja, x]) => ({ loja, dados: x.dados, em: x.em })); }
  async visto(info) { this.trab = { visto: Date.now(), info }; }
  async ultimoVisto() { return this.trab; }
  async limpar() { const corte = Date.now() - RETENCAO_H * 3600000; for (const j of [...this.jobs.values()]) if (j.criado_em < corte) await this.apagar(j.id); }
}

/* ---------- Postgres ---------- */
const SQL = `
CREATE SCHEMA IF NOT EXISTS n7;
CREATE TABLE IF NOT EXISTS n7.leitura_job (id text PRIMARY KEY, loja text, tipo text, nome text, bytes bigint, partes int, estado text, erro text, por text, trabalhador text, resultado_partes int DEFAULT 0, criado_em timestamptz DEFAULT now(), atualizado_em timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS n7.leitura_parte (job text NOT NULL, sentido text NOT NULL, n int NOT NULL, dados bytea NOT NULL, PRIMARY KEY (job, sentido, n));
CREATE TABLE IF NOT EXISTS n7.leitura_trabalhador (id int PRIMARY KEY, visto timestamptz, info jsonb);
CREATE TABLE IF NOT EXISTS n7.leitura_analise (loja text PRIMARY KEY, dados bytea NOT NULL, atualizado timestamptz DEFAULT now());
ALTER TABLE n7.leitura_analise ENABLE ROW LEVEL SECURITY;
ALTER TABLE n7.leitura_job ENABLE ROW LEVEL SECURITY; ALTER TABLE n7.leitura_parte ENABLE ROW LEVEL SECURITY; ALTER TABLE n7.leitura_trabalhador ENABLE ROW LEVEL SECURITY;`;
const dos = r => r && Object.assign({}, r, { bytes: Number(r.bytes), criado_em: new Date(r.criado_em).getTime(), atualizado_em: new Date(r.atualizado_em).getTime() });
class Pg {
  constructor(driver) { this.d = driver; this.pronto = null; }
  ensure() { if (!this.pronto) this.pronto = this.d.pool.query(SQL).catch(e => { this.pronto = null; throw Object.assign(new Error('Não consegui preparar a fila de leitura no Postgres: ' + e.message), { status: 500, expose: true }); }); return this.pronto; }
  q(sql, p) { return this.ensure().then(() => this.d.pool.query(sql, p)); }
  async criar(j) { await this.q('INSERT INTO n7.leitura_job (id, loja, tipo, nome, bytes, partes, estado, por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [j.id, j.loja, j.tipo, j.nome, j.bytes, j.partes, j.estado, j.por]); }
  async job(id) { return dos((await this.q('SELECT * FROM n7.leitura_job WHERE id = $1', [id])).rows[0]) || null; }
  async atualizar(id, p) {
    const cols = Object.keys(p), set = cols.map((c, i) => `${c} = $${i + 2}`).concat('atualizado_em = now()').join(', ');
    return dos((await this.q(`UPDATE n7.leitura_job SET ${set} WHERE id = $1 RETURNING *`, [id, ...cols.map(c => p[c])])).rows[0]) || null;
  }
  async ativos(por) { return Number((await this.q("SELECT count(*) FROM n7.leitura_job WHERE por = $1 AND estado IN ('enviando','aguardando','lendo')", [por])).rows[0].count); }
  async putParte(id, sentido, n, buf) { await this.q('INSERT INTO n7.leitura_parte (job, sentido, n, dados) VALUES ($1,$2,$3,$4) ON CONFLICT (job, sentido, n) DO UPDATE SET dados = EXCLUDED.dados', [id, sentido, n, buf]); }
  async getParte(id, sentido, n) { const r = (await this.q('SELECT dados FROM n7.leitura_parte WHERE job = $1 AND sentido = $2 AND n = $3', [id, sentido, n])).rows[0]; return r ? r.dados : null; }
  async nPartes(id, sentido) { return Number((await this.q('SELECT count(*) FROM n7.leitura_parte WHERE job = $1 AND sentido = $2', [id, sentido])).rows[0].count); }
  async apagarPartes(id, sentido) { if (sentido) await this.q('DELETE FROM n7.leitura_parte WHERE job = $1 AND sentido = $2', [id, sentido]); else await this.q('DELETE FROM n7.leitura_parte WHERE job = $1', [id]); }
  async apagar(id) { await this.apagarPartes(id); await this.q('DELETE FROM n7.leitura_job WHERE id = $1', [id]); }
  async pegar(trab) {
    await this.q(`UPDATE n7.leitura_job SET estado = 'aguardando' WHERE estado = 'lendo' AND atualizado_em < now() - interval '${PRESO_MIN} minutes'`);
    const r = await this.q(`UPDATE n7.leitura_job SET estado = 'lendo', trabalhador = $1, atualizado_em = now() WHERE id = (SELECT id FROM n7.leitura_job WHERE estado = 'aguardando' ORDER BY criado_em LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [trab]);
    return dos(r.rows[0]) || null;
  }
  async publicarAnalise(loja, buf) { await this.q('INSERT INTO n7.leitura_analise (loja, dados, atualizado) VALUES ($1,$2,now()) ON CONFLICT (loja) DO UPDATE SET dados = EXCLUDED.dados, atualizado = now()', [loja, buf]); }
  async analises() { return (await this.q('SELECT loja, dados, atualizado FROM n7.leitura_analise')).rows.map(r => ({ loja: r.loja, dados: r.dados, em: new Date(r.atualizado).getTime() })); }
  async visto(info) { await this.q('INSERT INTO n7.leitura_trabalhador (id, visto, info) VALUES (1, now(), $1) ON CONFLICT (id) DO UPDATE SET visto = now(), info = EXCLUDED.info', [JSON.stringify(info || {})]); }
  async ultimoVisto() { const r = (await this.q('SELECT visto, info FROM n7.leitura_trabalhador WHERE id = 1')).rows[0]; return r ? { visto: new Date(r.visto).getTime(), info: r.info } : null; }
  async limpar() { await this.q(`DELETE FROM n7.leitura_parte WHERE job IN (SELECT id FROM n7.leitura_job WHERE criado_em < now() - interval '${RETENCAO_H} hours')`); await this.q(`DELETE FROM n7.leitura_job WHERE criado_em < now() - interval '${RETENCAO_H} hours'`); }
}

let mem = null, pg = null;
function backend() {
  const c = cfg();
  if (c.driver === 'pg') { if (!c.databaseUrl) throw new ConfigError('Falta DATABASE_URL para a fila de leitura.'); const { PgDriver } = require('./pg-driver'); if (!pg || pg.d.url !== c.databaseUrl) pg = new Pg(new PgDriver(c.databaseUrl)); return pg; }
  if (c.hosted) throw bad('A leitura no computador da agência precisa do banco Postgres (com a planilha como banco não há onde guardar o arquivo). Use a leitura do navegador.', 501);
  return mem || (mem = new Mem());
}
const reset = () => { mem = null; pg = null; };

const mesmoToken = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
/* o computador da agência se identifica com LEITURA_TOKEN (variável do servidor + arquivo no computador); sem a variável, ninguém é aceito */
function tokenOk(req) { const t = cfg().leituraToken; const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); return !!t && t.length >= 24 && !!h && mesmoToken(h, t); }

const publico = j => ({ id: j.id, loja: j.loja, tipo: j.tipo, nome: j.nome, bytes: j.bytes, partes: j.partes, estado: j.estado, erro: j.erro || '', resultadoPartes: j.resultado_partes || 0, criadoEm: j.criado_em });
const ehTipo = t => t === 'vendas' || t === 'estoque';

module.exports = { backend, reset, tokenOk, publico, novoId, bad, ehTipo, ESTADOS, LIMITE_ARQUIVO, LIMITE_PARTE, MAX_PARTES, MAX_ATIVOS, ONLINE_S, PRESO_MIN };
