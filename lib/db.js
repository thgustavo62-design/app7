/* Escolhe onde os dados ficam: planilha (Google Sheets) ou memória (só desenvolvimento e testes). */
const { cfg } = require('./config');
const { Repo, MemoryDriver, SheetsDriver } = require('./repo');
const { SheetsClient } = require('./google');
let memory = null;

function getRepo() {
  const c = cfg();
  if (c.driver === 'sheets') return new Repo(new SheetsDriver(new SheetsClient({ sheetId: c.sheetId, serviceAccount: c.serviceAccount })));
  if (c.hosted) throw new Error('Banco não configurado: defina SHEET_ID_DB e GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!memory) memory = new MemoryDriver(require('./seed').build(c));
  return new Repo(memory);
}
module.exports = { getRepo, _resetMemory() { memory = null; } };
