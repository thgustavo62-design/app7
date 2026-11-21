/* Cópia e conferência de abas entre dois bancos (planilha, Postgres ou memória). Usado por /api/banco.
   Cada função lê todas as abas pedidas de uma vez (uma leitura por banco), o que poupa a cota da API do Google. */
const crypto = require('crypto');
const { COLS } = require('./schema');

const hash = (tab, rows) => crypto.createHash('sha256').update(rows.map(r => COLS[tab].map(h => String(r[h] ?? '')).join('\u0001')).join('\n')).digest('hex').slice(0, 16);
const summary = (tab, got) => ({ n: got[tab].rows.length, hash: hash(tab, got[tab].rows) });

/* abas nos dois bancos: contagem e impressão digital do conteúdo (na ordem das linhas) */
async function compareTabs(a, b, tabs) {
  const ga = a ? await a.readMany(tabs) : null, gb = b ? await b.readMany(tabs) : null;
  return tabs.map(tab => {
    const out = { tab, sheets: ga ? summary(tab, ga) : null, pg: gb ? summary(tab, gb) : null };
    out.igual = !!(out.sheets && out.pg && out.sheets.n === out.pg.n && out.sheets.hash === out.pg.hash);
    return out;
  });
}
const compareTab = async (a, b, tab) => (await compareTabs(a, b, [tab]))[0];

/* copia as abas de "from" para "to" (substitui o que havia) e confere cada uma lendo de volta.
   Para quando passa de "limiteMs", devolvendo o que ficou para a próxima chamada (a função da Vercel tem tempo máximo). */
async function copyTabs(from, to, tabs, { limiteMs = 40000 } = {}) {
  const t0 = Date.now(), src = await from.readMany(tabs), dst = await to.readMany(tabs), feitas = [], faltam = [];
  for (const tab of tabs) {
    if (Date.now() - t0 > limiteMs) { faltam.push(tab); continue; }
    const rows = src[tab].rows, oldLast = dst[tab].rows.reduce((m, r) => Math.max(m, r._row), 1);   /* a planilha precisa saber até onde limpar */
    await to.replace(tab, dst[tab].header && dst[tab].header.length ? dst[tab].header : COLS[tab], rows, oldLast);   /* o cabeçalho de verdade do destino */
    const conf = summary(tab, await to.readMany([tab]));
    feitas.push({ tab, linhas: rows.length, conferencia: conf, igual: conf.n === rows.length && conf.hash === hash(tab, rows) });
  }
  return { feitas, faltam };
}
const copyTab = async (from, to, tab) => (await copyTabs(from, to, [tab])).feitas[0];
module.exports = { compareTab, compareTabs, copyTab, copyTabs, hash, summary };
