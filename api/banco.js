/* /api/banco: cópia e conferência entre a planilha e o Postgres (Supabase). Só administradores.
   GET                      estado: qual banco está em uso, se a planilha e o Postgres estão configurados e a lista de abas
   GET  ?tab=Aba            conta linhas e calcula uma impressão digital da aba nos dois bancos e diz se são iguais
   POST {action:'copiar', tab, de:'sheets'|'pg'}   copia uma aba inteira de um banco para o outro (uma transação no Postgres)
   Uma aba por pedido, para caber no tempo limite da função. A cópia de volta (pg para planilha) serve de cópia de segurança e de plano de volta. */
const { cfg } = require('../lib/config');
const { TABS } = require('../lib/schema');
const { compareTab, copyTab } = require('../lib/db-copy');
const { SheetsDriver } = require('../lib/repo');
const { SheetsClient } = require('../lib/google');
const { PgDriver } = require('../lib/pg-driver');
const { send, readJson, query, sameSiteRequest, handle } = require('../lib/http');
const { authUser } = require('../lib/guard');

function drivers(c) {
  return {
    sheets: c.sheetId && c.serviceAccount ? new SheetsDriver(new SheetsClient({ sheetId: c.sheetId, serviceAccount: c.serviceAccount })) : null,
    pg: c.databaseUrl ? new PgDriver(c.databaseUrl) : null              /* o pool é compartilhado com o resto do servidor: nunca é fechado aqui */
  };
}

module.exports = handle(async (req, res) => {
  const user = await authUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  if (user.tipo === 'cliente' || user.papel !== 'admin') return send(res, 403, { error: 'Só administradores mexem no banco de dados' });
  const c = cfg(), d = drivers(c), q = query(req);
  {
    if (req.method === 'GET') {
      if (!q.tab) return send(res, 200, { backend: c.driver, sheets: !!d.sheets, pg: !!d.pg, tabs: TABS });
      if (!TABS.includes(q.tab)) return send(res, 400, { error: 'Aba desconhecida' });
      const out = await compareTab(d.sheets, d.pg, q.tab);
      return send(res, 200, out);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
    if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
    const body = await readJson(req);
    if (body.action !== 'copiar') return send(res, 400, { error: 'Ação desconhecida' });
    if (!TABS.includes(body.tab)) return send(res, 400, { error: 'Aba desconhecida' });
    if (!d.sheets || !d.pg) return send(res, 400, { error: 'Faltam as duas conexões: a planilha (SHEET_ID_DB e GOOGLE_SERVICE_ACCOUNT_JSON) e o Postgres (DATABASE_URL).' });
    const de = body.de === 'pg' ? 'pg' : 'sheets', para = de === 'pg' ? 'sheets' : 'pg';
    /* escrever no banco que está em uso por cima do outro é a virada ou o plano de volta: só quando isso é pedido de propósito */
    if (para === c.driver && !body.confirmo) return send(res, 400, { error: `O banco em uso agora é ${c.driver === 'pg' ? 'o Postgres' : 'a planilha'}. Copiar para ele sobrescreve os dados atuais: confirme.` });
    const r = await copyTab(d[de], d[para], body.tab);
    return send(res, 200, Object.assign({ ok: true, de, para }, r));
  }
});
