/* /api/windsor: resultados da Meta via Windsor.ai.
   GET                  estado (chave configurada? quantos clientes mapeados?)           [admin]
   GET  ?accounts=1     contas que o Windsor enxerga, para copiar o ID de cada cliente    [admin]
   POST {action:'preview'|'sync', inicio?, semanas?}  busca (e grava, no sync)            [admin]
   GET  ?cron=1         sincronização diária (Vercel Cron, com Authorization: Bearer CRON_SECRET) */
const crypto = require('crypto');
const { cfg } = require('../lib/config');
const { getRepo } = require('../lib/db');
const { activeClients, applyOp, weekFromRow } = require('../lib/model');
const W = require('../lib/windsor');
const { send, readJson, query, sameSiteRequest, currentUser, handle } = require('../lib/http');

const same = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

async function run(repo, { inicio, semanas, tipo = 'semana', dryRun }) {
  const clients = await activeClients(repo);
  const n = Math.max(1, Math.min(tipo === 'mes' ? 3 : 6, Number(semanas) || (tipo === 'mes' ? 1 : 2)));
  const weeks = inicio ? [inicio] : W.lastPeriods(tipo, n);
  return W.sync({ repo, clients, weeks, tipo, dryRun, applyOp, weekFromRow });
}

module.exports = handle(async (req, res) => {
  const q = query(req), c = cfg(), repo = getRepo();
  if (q.cron === '1') {                                              /* chamada do agendador da Vercel */
    const auth = String(req.headers.authorization || '');
    if (!c.cronSecret || !same(auth, `Bearer ${c.cronSecret}`)) return send(res, 401, { error: 'Não autorizado' });
    const report = await run(repo, { semanas: 2 });
    /* nos primeiros dias do mês, fecha também o mês que acabou (o alcance do mês não é a soma das semanas) */
    if (new Date().getUTCDate() <= 3) report.mes = await run(repo, { tipo: 'mes' });
    return send(res, 200, { ok: true, report });
  }
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  if (user.tipo === 'cliente' || user.papel !== 'admin') return send(res, 403, { error: 'Só administradores mexem nas fontes de dados' });

  if (req.method === 'GET') {
    if (q.accounts === '1') return send(res, 200, { accounts: await W.accounts() });
    const clients = await activeClients(repo);
    return send(res, 200, { configured: !!c.windsorKey, cron: !!c.cronSecret, mapped: clients.filter(x => Object.keys(W.MAP).some(ch => W.clientIds(x, ch).length)).length, clients: clients.length });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  const body = await readJson(req);
  if (!['preview', 'sync'].includes(body.action)) return send(res, 400, { error: 'Ação desconhecida' });
  if (body.inicio && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.inicio))) return send(res, 400, { error: 'Data inválida' });
  const tipo = body.tipo === 'mes' ? 'mes' : 'semana';
  if (body.inicio && tipo === 'mes' && !String(body.inicio).endsWith('-01')) return send(res, 400, { error: 'O mês começa no dia 1' });
  send(res, 200, { ok: true, report: await run(repo, { inicio: body.inicio, semanas: body.semanas, tipo, dryRun: body.action === 'preview' }) });
});
