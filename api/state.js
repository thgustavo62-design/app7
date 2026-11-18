/* GET /api/state: estado completo do site (alterações, ideias, aprovações, políticas, horários, metas). */
const { getRepo } = require('../lib/db');
const { loadState } = require('../lib/model');
const { send, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  send(res, 200, { user, state: await loadState(getRepo()), now: new Date().toISOString() });
});
