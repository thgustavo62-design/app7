// Calendário ao vivo da Central editorial: leitura da aba PRODUÇÃO CENTRAL, junção com a cópia embutida e plano B.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
delete process.env.VERCEL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const central = require('../lib/central');
const dataset = require('../lib/dataset');
const clients = require('../lib/clients').defaults().map(r => ({ key: r.chave, name: r.nome, short: r.curto }));

const HEAD = ['CÓDIGO', 'MARCA', 'PUBLICAR', 'FORMATO', 'GANCHO / TÍTULO', 'ROTEIRO ATÉ', 'GRAVAR/CAPTAR', 'EDITAR / DESIGN ATÉ', 'APROVAR ATÉ', 'AGENDAR ATÉ', 'STATUS', 'RESPONSÁVEL', 'ROTEIRO (LINK)'];
const row = (o, sync = '') => { const r = new Array(31).fill(''); Object.entries(o).forEach(([k, v]) => { r[HEAD.indexOf(k)] = v; }); r[30] = sync; return r; };
const HEADER = HEAD.concat(new Array(17).fill('X'), ['SINCRONIZAÇÃO']);
const base = (code, marca, extra = {}) => ({ 'CÓDIGO': code, MARCA: marca, PUBLICAR: '03/11/2026', FORMATO: 'CARROSSEL', 'GANCHO / TÍTULO': 'Título ' + code, 'ROTEIRO ATÉ': '26/10/2026', 'GRAVAR/CAPTAR': '27/10/2026', 'EDITAR / DESIGN ATÉ': '28/10/2026', 'APROVAR ATÉ': '30/10/2026', 'AGENDAR ATÉ': '02/11/2026', STATUS: 'Publicado', 'ROTEIRO (LINK)': 'https://drive.google.com/drive/folders/abc', ...extra });
const ROWS = [HEADER,
  row(base('C-F01', 'FARMA E FARMA'), 'PUBLICADO • 03/11 17h25: horário real confirmado'),
  row(base('CF-01', 'CAMPO FORTE', { STATUS: 'PROPOSTO' }), 'PROPOSTO — AGUARDA AGRÔNOMO'),
  row(base('C-M14', 'MINAS FARMA', { 'AGENDAR ATÉ': '03/11/2026 às 12:00', FORMATO: 'Reels' }), ''),
  row(base('N7-01', 'NOVA7', { STATUS: 'A planejar' }), '')];

test('parseRows: empresa, data, etapas, formato e status vêm da planilha', () => {
  const { plan, skipped } = central.parseRows(ROWS, clients);
  assert.equal(plan.length, 4); assert.equal(skipped.length, 0);
  const by = c => plan.find(p => p.code === c);
  assert.deepEqual([by('C-F01').b, by('CF-01').b, by('C-M14').b, by('N7-01').b], ['F', 'C', 'M', 'N']);
  assert.equal(by('C-F01').date, '2026-11-03'); assert.equal(by('C-F01').steps.roteiro, '2026-10-26'); assert.equal(by('C-F01').steps.agendar, '2026-11-02');
  assert.equal(by('C-M14').steps.agendar, '2026-11-03', 'data com horário junto'); assert.equal(by('C-M14').format, 'Reels');
  assert.deepEqual([by('C-F01').status, by('CF-01').status, by('N7-01').status], ['pub', 'prop', 'plan']);
  assert.equal(by('C-F01').note, 'PUBLICADO • 03/11 17h25: horário real confirmado');
});
test('parseRows: linha problemática é pulada com o motivo, sem derrubar as demais', () => {
  const rows = ROWS.concat([
    row(base('X-1', 'LOJA INEXISTENTE')), row(base('X-2', 'MINAS FARMA', { PUBLICAR: '31/02/2026' })), row(base('C-F01', 'FARMA E FARMA')),
    row(base('X-4', 'MINAS FARMA', { 'GANCHO / TÍTULO': '' })), row(base('código inválido!', 'MINAS FARMA')), new Array(31).fill('')]);
  const { plan, skipped } = central.parseRows(rows, clients);
  assert.equal(plan.length, 4);
  assert.deepEqual(skipped.map(s => s.why), ['empresa "LOJA INEXISTENTE" não cadastrada', 'data de publicação inválida', 'código repetido', 'sem título', 'código inválido']);
  assert.throws(() => central.parseRows([['A', 'B']], clients), /colunas esperadas/);
});
test('status: textos livres da planilha viram os status do site', () => {
  const s = central.statusOf;
  assert.deepEqual(['Publicado', 'AGENDADO — 12H', 'Em aprovação', 'Em produção', 'Proposto', 'A planejar', 'qualquer coisa'].map(s), ['pub', 'agd', 'apr', 'prod', 'prop', 'plan', 'plan']);
});
test('merge: roteiro e nota que a planilha não traz ficam da cópia; só confia na planilha quando ela cobre quase tudo', () => {
  const stat = [{ code: 'A', doc: 'https://docs.google.com/document/d/zzz', note: 'nota antiga', title: 'a', b: 'F', date: '2026-11-03', steps: {}, status: 'pub', format: 'Reels' }];
  const live = central.parseRows(ROWS, clients).plan.map(p => (p.code === 'C-F01' ? { ...p, code: 'A' } : p));
  const m = central.merge(live, stat);
  assert.equal(m.plan.find(p => p.code === 'A').doc, 'https://docs.google.com/document/d/zzz', 'pasta no lugar do roteiro: mantém o documento da cópia');
  assert.equal(m.plan.find(p => p.code === 'A').note, 'PUBLICADO • 03/11 17h25: horário real confirmado', 'nota ao vivo vale mais');
  assert.ok(m.plan.every(p => !('_doc' in p)));
  /* planilha curta demais (menos de 10 linhas): não apaga nada da cópia */
  const stat2 = stat.concat([{ code: 'ZZ', b: 'M', title: 'z', date: '2026-11-04', steps: {}, status: 'plan', format: 'Reels' }]);
  const m2 = central.merge(live, stat2); assert.ok(m2.plan.some(p => p.code === 'ZZ')); assert.equal(m2.kept, 1); assert.equal(m2.removed, 0);
  /* planilha completa: o que saiu dela sai do site */
  const many = Array.from({ length: 12 }, (_, i) => ({ code: 'P' + i, b: 'M', title: 't', date: '2026-11-04', steps: {}, status: 'plan', format: 'Reels', note: '', doc: '' }));
  const m3 = central.merge(many, many.slice(0, 11).concat([{ ...many[0], code: 'GONE' }]));
  assert.equal(m3.removed, 1); assert.ok(!m3.plan.some(p => p.code === 'GONE')); assert.equal(m3.added, 1);
});
test('plan: lê ao vivo, usa cache, e se a Central falhar devolve a cópia com o motivo', async () => {
  central._reset();
  const staticPlan = [{ code: 'OLD', b: 'M', title: 'velha', date: '2026-11-04', steps: {}, status: 'plan', format: 'Reels' }];
  let calls = 0; const ok = { values: async () => { calls++; return { values: ROWS }; } };
  const a = await central.plan({ clients, staticPlan, central: 'sheet', client: ok, force: true });
  assert.equal(a.report.source, 'central'); assert.equal(a.report.rows, 4); assert.ok(a.plan.some(p => p.code === 'C-F01') && a.plan.some(p => p.code === 'OLD'));
  await central.plan({ clients, staticPlan, central: 'sheet', client: ok }); assert.equal(calls, 1, 'segunda chamada usa o cache');
  await central.plan({ clients, staticPlan, central: 'sheet', client: ok, force: true }); assert.equal(calls, 2, 'refresh ignora o cache');
  const down = { values: async () => { throw new Error('Sheets 403: sem permissão'); } };
  const b = await central.plan({ clients, staticPlan, central: 'sheet', client: down, force: true });
  assert.equal(b.report.source, 'static'); assert.match(b.report.error, /403/); assert.deepEqual(b.plan, staticPlan);
  central._reset();
});
test('dataset: sem Google configurado usa a cópia embutida e informa a origem', async () => {
  central._reset();
  const v = await dataset.view(clients);
  assert.equal(v.report.source, 'static'); assert.ok(v.D.PLAN.length > 50);
  const js = dataset.scriptFor(new Set(['F']), { internal: false }, v);
  const D = JSON.parse(js.replace(/^window\.N7 = /, '').replace(/;\s*$/, ''));
  assert.equal(D.PLAN_SOURCE.source, 'static'); assert.ok(D.PLAN.every(p => p.b === 'F'));
  central._reset();
});
test('chave do Google: colagem quebrada em qualquer ponto (inclusive dentro de BEGIN e END) continua válida', () => {
  const { SheetsClient } = require('../lib/google');
  const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const obj = { type: 'service_account', client_email: 'robo@proj.iam.gserviceaccount.com', private_key: kp.privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
  const normal = JSON.stringify(obj, null, 2);
  for (let w = 7; w < 60; w += 3) {
    const quebrado = normal.replace(/("private_key": ")([^"]+)(")/, (m, a, b, c) => a + b.replace(new RegExp(`(.{${w}})`, 'g'), '$1\n ') + c);
    const sa = new SheetsClient({ sheetId: 'x', serviceAccount: quebrado }).sa;
    assert.equal(sa.client_email, obj.client_email); assert.ok(crypto.createPrivateKey(sa.private_key), `largura ${w}`);
  }
});
