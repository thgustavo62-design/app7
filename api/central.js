/* GET /api/central (só administradores): estado da leitura do calendário ao vivo da Central editorial.
   ?refresh=1 ignora o cache e lê de novo. Devolve contagens e as linhas que não puderam ser importadas. */
const { getRepo } = require('../lib/db');
const { activeClients } = require('../lib/model');
const { view } = require('../lib/dataset');
const { send, query, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  if (user.tipo === 'cliente' || user.papel !== 'admin') return send(res, 403, { error: 'Só administradores veem as fontes de dados' });
  const v = await view(await activeClients(getRepo()), { force: query(req).refresh === '1' });
  send(res, 200, { report: v.report, plan: v.D.PLAN.length });
});
