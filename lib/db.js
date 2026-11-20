/* Escolhe onde os dados ficam: planilha (Google Sheets) ou memória (só desenvolvimento e testes). */
const { cfg, ConfigError } = require('./config');
const { Repo, MemoryDriver, SheetsDriver } = require('./repo');
const { PgDriver } = require('./pg-driver');
const { SheetsClient } = require('./google');
let memory = null, pg = null;
const pgDriver = url => (pg && pg.url === url ? pg : (pg = new PgDriver(url)));

function getRepo() {
  const c = cfg();
  if (c.driver === 'pg') { if (!c.databaseUrl) throw new ConfigError('Falta a variável DATABASE_URL na Vercel (Supabase). Depois de criá-la, faça um novo deploy.'); return new Repo(pgDriver(c.databaseUrl)); }
  if (c.driver === 'sheets') return new Repo(new SheetsDriver(new SheetsClient({ sheetId: c.sheetId, serviceAccount: c.serviceAccount })));
  if (c.hosted) throw new ConfigError('Banco não configurado: faltam SHEET_ID_DB e/ou GOOGLE_SERVICE_ACCOUNT_JSON na Vercel. Depois de criá-las, faça um novo deploy.');
  if (!memory) memory = new MemoryDriver(require('./seed').build(c));
  return new Repo(memory);
}
module.exports = { getRepo, _resetMemory() { memory = null; } };
