/* Windsor.ai: busca os resultados de Meta (anúncios, Instagram e página do Facebook) de todos os clientes e grava na aba Semanas.
   API: https://connectors.windsor.ai/{conector}?api_key=...&fields=...&date_from=...&date_to=...  (resposta {"data":[...]}).
   Cada métrica é pedida separadamente: se um campo não existir na conta, só aquela métrica fica sem dado (nunca vira zero). */
const { cfg, ConfigError } = require('./config');
require('../public/assets/js/analysis.js');
const A = globalThis.N7Analysis;

const BASE = 'https://connectors.windsor.ai';
/* Campo do Windsor de cada métrica do sistema. Ajuste aqui se o Windsor renomear um campo
   (o botão "Testar semana" mostra quais vieram sem dado). Referência: windsor.ai/connector/{instagram,facebook,facebook_organic}. */
const MAP = {
  ads: { connector: 'facebook', id: 'account_id', name: 'account_name', label: 'Meta Ads', fields: { gasto: 'spend', alcance: 'reach', impressoes: 'impressions', resultados: 'RESULT_FIELD' } },
  ig: { connector: 'instagram', id: 'account_id', name: 'account_name', label: 'Instagram', fields: { views: 'views', alcance: 'reach', interacoes: 'total_interactions', cliques: 'profile_links_taps', visitas: 'profile_views', seguidores: 'follower_count' } },
  fb: { connector: 'facebook_organic', id: 'page_id', name: 'page_name', label: 'Facebook', fields: { views: 'page_impressions', alcance: 'page_total_media_view_unique', interacoes: 'page_post_engagements', cliques: 'post_clicks_by_type_link_clicks', visitas: 'page_views_total', seguidores: 'page_daily_follows' } }
};
const RESULT_DEFAULT = 'actions_onsite_conversion_messaging_conversation_started_7d';   /* resultado do anúncio = conversas iniciadas */
const sysUser = { email: 'windsor@sistema', nome: 'Windsor.ai', papel: 'admin', tipo: 'equipe', empresas: [] };
const num = v => { if (v === '' || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; };
const clientIds = (client, ch) => String((client.meta && client.meta[ch]) || '').split(/[,;\s]+/).filter(Boolean);
const fieldOf = (ch, k) => { const f = MAP[ch].fields[k]; return f === 'RESULT_FIELD' ? (process.env.WINDSOR_ADS_RESULT_FIELD || RESULT_DEFAULT) : f; };

function keyOrThrow() {
  const k = cfg().windsorKey;
  if (!k) throw new ConfigError('Falta a variável WINDSOR_API_KEY na Vercel (Settings > Environment Variables). Depois de criá-la, faça um novo deploy.');
  return k;
}

/* uma chamada à API; reaproveita a espera crescente para 429 e erros 5xx */
async function call(connector, params, { fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), retries = 3 } = {}) {
  const url = `${BASE}/${connector}?` + new URLSearchParams(Object.assign({ api_key: keyOrThrow(), _renderer: 'json' }, params)).toString();
  let last;
  for (let i = 0; i <= retries; i++) {
    let res;
    try { res = await fetchFn(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); } catch (e) { last = e.message; await sleep(400 * 2 ** i); continue; }
    if (res.status === 429 || res.status >= 500) { last = res.status; await sleep(500 * 2 ** i); continue; }
    let body = null; try { body = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok || (body && body.error)) {
      const msg = body && body.error ? (body.error.message || String(body.error)) : `HTTP ${res.status}`;
      const e = new Error(`Windsor: ${msg}`); e.status = res.status; e.windsor = true; throw e;
    }
    return Array.isArray(body && body.data) ? body.data : [];
  }
  throw Object.assign(new Error(`Windsor indisponível (${last})`), { windsor: true });
}

/* contas que o Windsor enxerga, por canal: serve para você copiar o ID de cada cliente */
async function accounts(opts = {}) {
  const out = {};
  await Promise.all(Object.keys(MAP).map(async ch => {
    const m = MAP[ch];
    try {
      const rows = await call(m.connector, { fields: `${m.id},${m.name}`, date_preset: 'last_30d' }, opts);
      const seen = new Map(); rows.forEach(r => { if (r[m.id] != null && !seen.has(String(r[m.id]))) seen.set(String(r[m.id]), r[m.name] || ''); });
      out[ch] = { label: m.label, ok: true, list: [...seen].map(([id, name]) => ({ id, name })) };
    } catch (e) { out[ch] = { label: m.label, ok: false, error: e.message }; }
  }));
  return out;
}

/* valores de um canal para um período: { [account_id]: { metrica: valor|null } } e os campos que falharam */
async function channel(ch, ids, from, to, opts = {}) {
  const m = MAP[ch], res = {}, failed = [];
  ids.forEach(id => { res[id] = Object.fromEntries(Object.keys(m.fields).map(k => [k, null])); });
  await Promise.all(Object.keys(m.fields).map(async k => {
    const f = fieldOf(ch, k);
    try {
      const rows = await call(m.connector, { fields: `${m.id},${f}`, date_from: from, date_to: to, select_accounts: ids.join(',') }, opts);
      const sums = {};
      rows.forEach(r => { const id = String(r[m.id]), v = num(r[f]); if (v != null) sums[id] = (sums[id] || 0) + v; });
      ids.forEach(id => { const hit = Object.keys(sums).find(s => s === id || s.replace(/^act_/, '') === id.replace(/^act_/, '')); if (hit) res[id][k] = Math.round(sums[hit] * 100) / 100; });
    } catch (e) { failed.push({ metrica: k, campo: f, erro: e.message }); }
  }));
  return { values: res, failed };
}

/* período de uma semana (segunda a domingo) ou de um mês (dia 1 ao último dia) */
const periodRange = (tipo, inicio) => { const p = A.period(tipo, inicio); return { from: p.inicio, to: p.fim }; };
const weekRange = inicio => periodRange('semana', inicio);
const lastPeriods = (tipo, n, today = new Date()) => { const out = []; let s = A.lastClosed(tipo, today); for (let i = 0; i < n; i++) { out.push(s); s = A.prevStart(tipo, s); } return out.reverse(); };
const lastWeeks = (n, today = new Date()) => lastPeriods('semana', n, today);
const lastMonths = (n, today = new Date()) => lastPeriods('mes', n, today);

/* busca um período (semana ou mês) de todos os clientes mapeados (sem gravar). O alcance de um mês vem direto do Windsor:
   alcance não se soma entre semanas (repete pessoas), por isso o mês é pedido como um período só. */
async function fetchWeek(clients, inicio, opts = {}, tipo = 'semana') {
  const { from, to } = periodRange(tipo, inicio), result = [];
  for (const ch of Object.keys(MAP)) {
    const ids = [...new Set(clients.flatMap(c => clientIds(c, ch)))];
    if (!ids.length) continue;
    const r = await channel(ch, ids, from, to, opts);
    clients.forEach(c => {
      const mine = clientIds(c, ch); if (!mine.length) return;
      const merged = {}; Object.keys(MAP[ch].fields).forEach(k => { const vs = mine.map(id => r.values[id] && r.values[id][k]).filter(v => v != null); merged[k] = vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) * 100) / 100 : null; });
      result.push({ marca: c.key, nome: c.name, canal: ch, label: MAP[ch].label, valores: merged, semDado: Object.keys(merged).filter(k => merged[k] == null), falhas: r.failed });
    });
  }
  return { inicio, from, to, itens: result };
}

/* junta o que o Windsor trouxe com a linha que já existe na aba Semanas: só troca o que veio com valor */
function mergeRow(existing, marca, inicio, itens, today = new Date().toISOString().slice(0, 10), tipo = 'semana') {
  const base = existing || { tipo, inicio, fim: periodRange(tipo, inicio).to, marca, vendas: null, compras: null, dias: [null, null, null, null, null, null, null], c100n: null, c100rs: null, ig: {}, fb: {}, ads: {}, janela: '', fonte: '', obs: '' };
  const op = Object.assign({ t: 'week', op: 'upsert' }, base, { tipo, inicio, marca, ig: Object.assign({}, base.ig), fb: Object.assign({}, base.fb), ads: Object.assign({}, base.ads) });
  let any = false;
  itens.filter(i => i.marca === marca).forEach(i => Object.keys(i.valores).forEach(k => { if (i.valores[k] != null) { op[i.canal][k] = i.valores[k]; any = true; } }));
  if (!any) return null;
  op.fonte = `Windsor.ai (${today})${base.fonte && !/Windsor/.test(base.fonte) ? ' + ' + base.fonte : ''}`;
  return op;
}

/* grava (ou só simula, com dryRun) as últimas semanas fechadas */
async function sync({ repo, clients, weeks, tipo = 'semana', dryRun = false, now = new Date(), fetchFn, applyOp, weekFromRow }) {
  const mapped = clients.filter(c => Object.keys(MAP).some(ch => clientIds(c, ch).length));
  const report = { weeks: [], mapped: mapped.length, saved: 0 };
  if (!mapped.length) return Object.assign(report, { aviso: 'Nenhum cliente tem conta Meta informada em Configurações > Clientes e serviços.' });
  const rows = await repo.rows('Semanas');
  for (const inicio of weeks) {
    const w = await fetchWeek(mapped, inicio, { fetchFn }, tipo);
    const entry = { inicio, from: w.from, to: w.to, itens: w.itens, gravadas: [] };
    if (!dryRun) {
      for (const c of mapped) {
        const hit = rows.find(r => r.tipo === tipo && r.inicio === inicio && r.marca === c.key);
        const op = mergeRow(hit ? weekFromRow(hit) : null, c.key, inicio, w.itens, now.toISOString().slice(0, 10), tipo);
        if (!op) continue;
        const r = await applyOp(repo, op, sysUser);
        entry.gravadas.push({ marca: c.key, v: r.v }); report.saved++;
      }
    }
    report.weeks.push(entry);
  }
  return report;
}
module.exports = { MAP, call, accounts, channel, fetchWeek, mergeRow, sync, lastWeeks, lastMonths, lastPeriods, weekRange, periodRange, clientIds, sysUser };
