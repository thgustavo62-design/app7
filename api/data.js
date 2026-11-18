/* GET /api/data: dados dos clientes como script, só para quem fez login e só das empresas que o usuário pode ver.
   O arquivo private/data.js fica fora da pasta pública e nunca é servido como arquivo estático. */
const { getRepo } = require('../lib/db');
const { loadRegistry, activeClients } = require('../lib/model');
const { scopeOf, isClient } = require('../lib/scope');
const { scriptFor, view } = require('../lib/dataset');
const { send, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  const repo = getRepo();
  const { clients } = await loadRegistry(repo, Object.assign({}, user, { papel: 'leitura' }));   /* só ativas e permitidas */
  const v = await view(await activeClients(repo));                                             /* calendário ao vivo da Central */
  let allowed = scopeOf(user);
  const visible = new Set(clients.map(c => c.key));
  allowed = allowed ? new Set([...allowed].filter(k => visible.has(k))) : (visible.size ? visible : null);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(scriptFor(allowed, { internal: !isClient(user) }, v));
});
