/* Calendário ao vivo: lê a aba "PRODUÇÃO CENTRAL" da planilha Central editorial (Drive) e monta o plano de pautas.
   Se a leitura falhar, o site continua com a cópia embutida (private/data.js) e informa o motivo. Cache de 5 minutos. */
const { cfg } = require('./config');
const { SheetsClient } = require('./google');

const TAB = 'PRODUÇÃO CENTRAL';
const RANGE = `'${TAB}'!A1:AE600`;
const TTL = 5 * 60e3, TTL_ERR = 60e3;
let cache = null, inflight = null;

const plain = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const up = s => plain(s).toUpperCase();
function isoDate(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return '';
  const [d, mo, y] = [+m[1], +m[2], +m[3]], dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
}
const STATUS = [
  [/PUBLICAD/, 'pub'], [/AGENDAD|PRONT|FINALIZAD|ENTREGUE/, 'agd'], [/APROVA/, 'apr'], [/PRODU|GRAV|EDIT|ROTEIRO|DESIGN|ANDAMENTO/, 'prod'],
  [/PROPOS/, 'prop'], [/PLANEJ/, 'plan']
];
const statusOf = s => { const t = up(s); const hit = STATUS.find(([re]) => re.test(t)); return hit ? hit[1] : 'plan'; };
const formatOf = s => { const t = up(s); return t.startsWith('CARROSS') ? 'Carrossel' : t.startsWith('REEL') ? 'Reels' : t ? t[0] + t.slice(1).toLowerCase() : 'Carrossel'; };
const isDoc = u => /^https:\/\/docs\.google\.com\/document\//.test(u || '');
const isLink = u => /^https:\/\//.test(u || '');

/* empresa da linha: compara o nome da coluna MARCA com o nome das empresas cadastradas */
function brandOf(marca, clients) {
  const m = up(marca); if (!m) return null;
  const hit = clients.find(c => { const n = up(c.name); return n === m || n.startsWith(m) || m.startsWith(n) || up(c.short) === m; });
  return hit ? hit.key : null;
}

/* linhas da planilha (primeira linha = cabeçalho) -> pautas */
function parseRows(rows, clients) {
  const head = (rows[0] || []).map(up);
  const col = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const I = { code: col('CODIGO'), brand: col('MARCA'), date: col('PUBLICAR'), format: col('FORMATO'), title: col('GANCHO / TITULO', 'TITULO'),
    roteiro: col('ROTEIRO ATE'), gravar: col('GRAVAR'), editar: col('EDITAR'), aprovar: col('APROVAR ATE'), agendar: col('AGENDAR ATE'),
    status: col('STATUS'), doc: col('ROTEIRO (LINK)'), sync: col('SINCRONIZACAO') };
  const miss = ['code', 'brand', 'date', 'title', 'status'].filter(k => I[k] < 0);
  if (miss.length) throw Object.assign(new Error(`A aba ${TAB} não tem as colunas esperadas (${miss.join(', ')})`), { status: 500, expose: true });
  const cell = (r, k) => (I[k] >= 0 ? String(r[I[k]] == null ? '' : r[I[k]]).trim() : '');
  const plan = [], skipped = [], seen = new Set();
  rows.slice(1).forEach((r, n) => {
    const line = n + 2, code = cell(r, 'code');
    if (!code && !cell(r, 'title')) return;                                           /* linha vazia */
    const b = brandOf(cell(r, 'brand'), clients), date = isoDate(cell(r, 'date')), title = cell(r, 'title');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(code)) return skipped.push({ line, why: 'código inválido' });
    if (seen.has(code)) return skipped.push({ line, code, why: 'código repetido' });
    if (!b) return skipped.push({ line, code, why: `empresa "${cell(r, 'brand')}" não cadastrada` });
    if (!date) return skipped.push({ line, code, why: 'data de publicação inválida' });
    if (!title) return skipped.push({ line, code, why: 'sem título' });
    seen.add(code);
    const steps = {}; ['roteiro', 'gravar', 'editar', 'aprovar', 'agendar'].forEach(k => { steps[k] = isoDate(cell(r, k)) || date; });
    const link = cell(r, 'doc'), note = cell(r, 'sync');
    plan.push({ code, b, title, format: formatOf(cell(r, 'format')), date, steps, status: statusOf(cell(r, 'status')), note, doc: isLink(link) ? link : '', _doc: isDoc(link) });
  });
  return { plan, skipped };
}

/* junta o que veio ao vivo com a cópia embutida: notas e roteiros que a planilha não traz ficam da cópia */
function merge(live, stat) {
  const byCode = new Map(stat.map(p => [p.code, p]));
  const out = live.map(({ _doc, ...p }) => { const s = byCode.get(p.code) || {}; return Object.assign({}, p, { doc: _doc ? p.doc : (s.doc || p.doc), note: p.note || s.note || '' }); });
  const liveCodes = new Set(live.map(p => p.code)), gone = stat.filter(p => !liveCodes.has(p.code));
  const trusted = live.length >= 10 && gone.length <= stat.length * 0.2;
  return { plan: trusted ? out : out.concat(gone), removed: trusted ? gone.length : 0, kept: trusted ? 0 : gone.length, added: live.filter(p => !byCode.has(p.code)).length };
}

const centralId = D => cfg().centralSheetId || ((String(D.CENTRAL || '').match(/\/d\/([A-Za-z0-9_-]+)/) || [])[1] || '');

async function build({ clients, staticPlan, central, client }) {
  const c = cfg();
  const base = { source: 'static', at: new Date().toISOString() };
  if (c.driver !== 'sheets' && !client) return Object.assign(base, { reason: 'banco em memória (modo de desenvolvimento)' });
  if (!central && !client) return Object.assign(base, { reason: 'planilha da Central não informada' });
  try {
    const cl = client || new SheetsClient({ sheetId: central, serviceAccount: c.serviceAccount });
    const res = await cl.values(RANGE);
    const { plan, skipped } = parseRows(res.values || [], clients);
    const m = merge(plan, staticPlan);
    return { source: 'central', at: base.at, plan: m.plan, rows: plan.length, added: m.added, removed: m.removed, kept: m.kept, skipped: skipped.length, skippedList: skipped.slice(0, 15) };
  } catch (e) {
    return Object.assign(base, { error: e && e.message ? String(e.message).slice(0, 300) : 'erro ao ler a Central' });
  }
}

/* devolve { plan, report }; sempre devolve um plano (o embutido, se a Central falhar) */
async function plan({ clients, staticPlan, central, force = false, client } = {}) {
  const now = Date.now(), key = JSON.stringify(clients.map(c => [c.key, c.name]));
  if (!force && cache && cache.key === key && now - cache.t < (cache.r.error ? TTL_ERR : TTL)) return { plan: cache.r.plan || staticPlan, report: pub(cache.r) };
  if (!inflight || force) inflight = build({ clients, staticPlan, central, client }).finally(() => { inflight = null; });
  const r = await inflight; cache = { t: Date.now(), key, r };
  return { plan: r.plan || staticPlan, report: pub(r) };
}
const pub = r => { const { plan: p, ...rest } = r; return rest; };
module.exports = { plan, parseRows, merge, brandOf, statusOf, isoDate, centralId, _reset() { cache = null; inflight = null; }, TAB };
