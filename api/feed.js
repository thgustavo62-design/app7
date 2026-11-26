/* /api/feed: Preview de Feed.
   GET ?marca=M                 perfil, ordem e pastas guardados + posts lidos do Drive (artes, data, título, código)
   GET ?marca=M&legenda=DOC_ID  texto da legenda (e hora) de um post
   GET ?marca=M&atualizar=1     ignora a memória de 2 minutos e lê o Drive de novo
   POST {marca, perfil?, ordem?, pastas?}  só equipe que edita (admin ou editor)
   Usuário cliente lê só o feed da própria empresa. O Drive é só lido; nada é gravado nele. */
const { getRepo } = require('../lib/db');
const F = require('../lib/feed');
const { cfg } = require('../lib/config');
const { send, readJson, query, sameSiteRequest, handle } = require('../lib/http');
const { authUser } = require('../lib/guard');

module.exports = handle(async (req, res) => {
  const user = await authUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  const repo = getRepo(), drive = F.novoDrive(cfg().serviceAccount);
  if (req.method === 'GET') {
    const q = query(req);
    if (!q.marca) return send(res, 400, { error: 'Falta a empresa (marca)' });
    if (q.legenda) return send(res, 200, await F.legenda(repo, user, q.marca, q.legenda, { drive }));
    return send(res, 200, await F.carregar(repo, user, q.marca, { drive, force: q.atualizar === '1' }));
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  const body = await readJson(req, 60000);
  if (!body.marca) return send(res, 400, { error: 'Falta a empresa (marca)' });
  const novo = await F.salvar(repo, user, body.marca, body);
  return send(res, 200, { ok: true, perfil: novo.perfil, ordem: novo.ordem, pastas: novo.pastas });
});
