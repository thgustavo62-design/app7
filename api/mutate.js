/* POST /api/mutate  { ops: [...] }: grava operações validadas. 409 quando outra pessoa mudou o mesmo registro. */
const { getRepo } = require('../lib/db');
const { applyOps } = require('../lib/model');
const { send, readJson, sameSiteRequest, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  const body = await readJson(req);
  const out = await applyOps(getRepo(), body.ops, user);
  if (out.conflict) return send(res, 409, { ok: false, error: 'conflict', conflict: out.conflict, results: out.results });
  send(res, 200, { ok: true, results: out.results });
});
