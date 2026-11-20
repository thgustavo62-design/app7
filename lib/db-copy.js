/* Cópia e conferência de uma aba entre dois bancos (planilha, Postgres ou memória). Usado por /api/banco. */
const crypto = require('crypto');
const { COLS } = require('./schema');

const hash = (tab, rows) => crypto.createHash('sha256').update(rows.map(r => COLS[tab].map(h => String(r[h] ?? '')).join('\u0001')).join('\n')).digest('hex').slice(0, 16);
const summary = (tab, got) => ({ n: got[tab].rows.length, hash: hash(tab, got[tab].rows) });

/* uma aba nos dois bancos: contagem e impressão digital do conteúdo (na ordem das linhas) */
async function compareTab(a, b, tab) {
  const out = { tab, sheets: a ? summary(tab, await a.readMany([tab])) : null, pg: b ? summary(tab, await b.readMany([tab])) : null };
  out.igual = !!(out.sheets && out.pg && out.sheets.n === out.pg.n && out.sheets.hash === out.pg.hash);
  return out;
}
/* copia a aba inteira de "from" para "to" (substitui o que havia) e confere o resultado lendo de volta */
async function copyTab(from, to, tab) {
  const rows = (await from.readMany([tab]))[tab].rows;
  const antes = (await to.readMany([tab]))[tab].rows, oldLast = antes.reduce((m, r) => Math.max(m, r._row), 1);   /* a planilha precisa saber até onde limpar */
  await to.replace(tab, COLS[tab], rows, oldLast);
  const conf = summary(tab, await to.readMany([tab]));
  return { tab, linhas: rows.length, conferencia: conf, igual: conf.n === rows.length && conf.hash === hash(tab, rows) };
}
module.exports = { compareTab, copyTab, hash, summary };
