/* GET /api/state: estado do site (alterações, ideias, aprovações, políticas, horários, metas, semanas) e o cadastro de
   empresas, já recortados para o que este usuário pode ver. Administradores recebem também a lista de usuários. */
const { getRepo } = require('../lib/db');
const { loadState, loadRegistry, planMap } = require('../lib/model');
const { scopeState } = require('../lib/scope');
const { send, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  const repo = getRepo();
  const full = await loadState(repo), registry = await loadRegistry(repo, user);
  const brands = await planMap(repo); full.custom.forEach(p => brands.set(p.code, p.b));
  send(res, 200, { user, state: scopeState(full, user, code => brands.get(code)), registry, now: new Date().toISOString() });
});
