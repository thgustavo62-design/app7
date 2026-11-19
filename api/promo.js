/* /api/promo: Central de Promoções.
   GET                       lojas com o serviço Promoções e preços que o usuário pode abrir
   GET  ?loja=M              base da loja (produtos, vendas por dia), importações e campanhas
   POST {action:'estoque'|'vendas', loja, ...}   importação (reescreve a base da loja de uma vez)
   POST {action:'campanha'|'campanha_apagar', loja, ...}
   Só equipe: quem edita (admin ou editor) importa e salva; leitura só consulta; usuário cliente não entra. */
const { getRepo } = require('../lib/db');
const P = require('../lib/promo-store');
const { send, readJson, query, sameSiteRequest, currentUser, handle } = require('../lib/http');

module.exports = handle(async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  const repo = getRepo(), q = query(req);
  if (req.method === 'GET') {
    if (!q.loja) return send(res, 200, { lojas: (await P.lojasDo(repo, user)).map(c => ({ key: c.key, name: c.name, color: c.color, id: c.id })), podeEditar: P.canWrite(user) });
    await P.needLoja(repo, user, q.loja);
    return send(res, 200, Object.assign({ podeEditar: P.canWrite(user) }, await P.load(repo, q.loja)));
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  if (!P.canWrite(user)) return send(res, 403, { error: 'Seu acesso é só de leitura' });
  const body = await readJson(req, 4000000);                           /* a base de uma loja chega de uma vez (até ~4 MB) */
  await P.needLoja(repo, user, body.loja);
  switch (body.action) {
    case 'estoque': return send(res, 200, { ok: true, ...(await P.importEstoque(repo, user, body.loja, body)) });
    case 'vendas': return send(res, 200, { ok: true, ...(await P.importVendas(repo, user, body.loja, body)) });
    case 'campanha': return send(res, 200, { ok: true, ...(await P.saveCampaign(repo, user, body.loja, body)) });
    case 'campanha_apagar': return send(res, 200, { ok: true, ...(await P.deleteCampaign(repo, user, body.loja, body.id)) });
    default: return send(res, 400, { error: 'Ação desconhecida' });
  }
});
