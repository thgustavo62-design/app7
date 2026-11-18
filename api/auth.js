/* /api/auth?action=me | login | dev | logout */
const { cfg } = require('../lib/config');
const session = require('../lib/session');
const { verifyIdToken } = require('../lib/googleid');
const { getRepo } = require('../lib/db');
const { findUser } = require('../lib/model');
const { send, readJson, query, sameSiteRequest, currentUser, handle } = require('../lib/http');

const NO_LOGIN = c => ({ error: 'login', login: { clientId: c.clientId, dev: !!c.devEmail } });

function startSession(res, user, c) {
  const token = session.create(user, c.sessionSecret, c.sessionTtl);
  send(res, 200, { user }, { 'Set-Cookie': session.setCookie(token, { secure: c.hosted, maxAge: c.sessionTtl }) });
}

module.exports = handle(async (req, res) => {
  const c = cfg(), action = query(req).action;
  if (!c.sessionSecret) { const e = new Error('SESSION_SECRET não configurado'); e.status = 500; throw e; }

  if (action === 'me' && req.method === 'GET') {
    const s = currentUser(req);
    if (!s) return send(res, 401, NO_LOGIN(c));
    const u = await findUser(getRepo(), s.email);               /* confere se o acesso continua ativo */
    if (!u) return send(res, 401, NO_LOGIN(c));
    return startSession(res, u, c);                             /* renova o cookie com o acesso atual */
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });

  if (action === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': session.clearCookie(c.hosted) });

  if (action === 'dev') {
    if (!c.devEmail) return send(res, 404, { error: 'Indisponível' });
    const u = await findUser(getRepo(), c.devEmail) || { email: c.devEmail, nome: 'Desenvolvimento', papel: 'admin', tipo: 'equipe', empresas: [] };
    return startSession(res, u, c);
  }

  if (action === 'login') {
    const body = await readJson(req);
    let g;
    try { g = await verifyIdToken(body.credential, { clientId: c.clientId }); }
    catch (e) { return send(res, 401, { error: 'Não foi possível confirmar o login com o Google.' }); }
    const u = await findUser(getRepo(), g.email);
    if (!u) return send(res, 403, { error: 'Este e-mail não tem acesso. Peça a um administrador para incluí-lo na aba Usuarios.' });
    return startSession(res, u, c);
  }
  return send(res, 400, { error: 'Ação desconhecida' });
});
