// Executor local de análise (scripts/analise-local): coleta com dados de exemplo e roda os agentes em paralelo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const DIR = path.join(__dirname, '..', 'scripts', 'analise-local');

test('análise local: coleta de exemplo + agentes em paralelo geram resultado.json e resumo.md sem falhas', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-analise-')), snap = path.join(tmp, 'snapshot.json'), out = path.join(tmp, 'saida');
  execFileSync(process.execPath, [path.join(DIR, 'coletar.js'), snap, '--local'], { stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(DIR, 'analisar.js'), snap, out, '--nucleos', '2', '--hoje', '2026-11-26'], { stdio: 'pipe' });
  const r = JSON.parse(fs.readFileSync(path.join(out, 'resultado.json'), 'utf8')), md = fs.readFileSync(path.join(out, 'resumo.md'), 'utf8');
  assert.equal(r.execucao.falhas, 0);
  assert.equal(r.execucao.nucleosUsados, 2);
  assert.ok(r.cerebro && r.cerebro.decisao, 'o cérebro devolve a decisão do dia');
  assert.ok(r.cerebro.clientes.every(c => Number.isFinite(c.saude)), 'saúde numérica por cliente');
  assert.ok(Object.keys(r.calendario).length >= 4, 'um calendário por cliente');
  assert.match(md, /Decisão do dia/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('análise local: a mesma entrada dá o mesmo resultado com 1 ou 3 núcleos (paralelismo não muda a conta)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-analise-')), snap = path.join(tmp, 'snapshot.json');
  execFileSync(process.execPath, [path.join(DIR, 'coletar.js'), snap, '--local'], { stdio: 'pipe' });
  const rodar = n => { const o = path.join(tmp, 'n' + n); execFileSync(process.execPath, [path.join(DIR, 'analisar.js'), snap, o, '--nucleos', String(n), '--hoje', '2026-11-26'], { stdio: 'pipe' }); const r = JSON.parse(fs.readFileSync(path.join(o, 'resultado.json'), 'utf8')); return { cerebro: r.cerebro, semanas: r.semanas, calendario: r.calendario, dados: r.dados, ideias: r.ideias }; };
  assert.deepEqual(rodar(1), rodar(3));
  fs.rmSync(tmp, { recursive: true, force: true });
});
