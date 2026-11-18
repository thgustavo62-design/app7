// Teste do deck semanal: monta o PowerPoint com dados reais do deck de 02–08/11 e confere estrutura e honestidade dos textos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

const root = path.join(__dirname, '..', 'public', 'assets');
const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, Buffer };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'pptxgen.bundle.js'), 'utf8'), ctx);
globalThis.PptxGenJS = ctx.PptxGenJS;
require('../public/assets/js/analysis.js'); require('../public/assets/js/report.js');
const { WEEKS, GENS } = require('../lib/seed-weeks');
const A = globalThis.N7Analysis, R = globalThis.N7Report;
const analyze = (extra = {}) => A.analyze(Object.assign({ weeks: WEEKS, gens: GENS, tipo: 'semana', inicio: '2026-11-02' }, extra));
const texts = pres => JSON.stringify(pres.slides.map(s => s._slideObjects)).replace(/\\"/g, '"');

test('deck: sem Meta Ads são 7 slides; frase da capa usa os mesmos dias da semana, sem inventar período anterior', () => {
  const an = analyze(), pres = R.build(an);
  assert.equal(pres.slides.length, 7);
  const h = R.headline(an);
  assert.match(h, /R\$\s159\.153,93/); assert.match(h, /Minas Farma \+18,4%/); assert.match(h, /Farma e Farma \+5,5%/);
  const t = texts(pres);
  assert.match(t, /Promoção do período: Black Friday/);
  assert.match(t, /sem dado/, 'o que falta aparece como "sem dado"');
  assert.match(t, /Meta Ads/, 'Meta Ads aparece na lista do que não pôde ser respondido');
});
test('deck: com anúncio informado ganha o slide de mídia paga e a decisão digitada vai ao último slide', () => {
  const m = WEEKS.map(w => (w.inicio === '2026-11-02' && w.marca === 'M') ? Object.assign({}, w, { ads: { gasto: 90, alcance: 31000, impressoes: 60000, resultados: 0 } }) : w);
  const gens = [Object.assign({}, GENS[0], { decisao: 'Reduzir frequência na Minas Farma', rumo: 'nao', concorrencia: 'Inova com leite em oferta' })];
  const an = analyze({ weeks: m, gens }), pres = R.build(an);
  assert.equal(pres.slides.length, 8);
  const t = texts(pres);
  assert.match(t, /Saturação provável em Minas Farma/);
  assert.match(t, /Reduzir frequência na Minas Farma/); assert.match(t, /NÃO/); assert.match(t, /Inova com leite em oferta/);
  assert.ok(an.signals.some(s => s.canal === 'Meta Ads' && s.classe === 'CORRIGIR'));
});
test('deck mensal sem vendas por dia não cria slide dia a dia; arquivo sai sem pastas no zip', async () => {
  const mes = [{ tipo: 'mes', inicio: '2026-10-01', fim: '2026-10-31', marca: 'M', vendas: 400000, compras: 6000, dias: [null, null, null, null, null, null, null], c100n: null, c100rs: null, ig: { views: 500000, alcance: null, interacoes: 1000, cliques: 300, visitas: 2000, seguidores: 90 }, fb: { views: null, alcance: null, interacoes: null, cliques: null, visitas: null, seguidores: null }, ads: { gasto: null, alcance: null, impressoes: null, resultados: null }, janela: '', fonte: '', obs: '' }];
  const an = A.analyze({ weeks: mes, gens: [], tipo: 'mes', inicio: '2026-10-01' }), pres = R.build(an);
  assert.ok(pres.slides.length >= 5 && pres.slides.length <= 8);
  assert.ok(!/Dia a dia/.test(texts(pres)));
  assert.equal(R.fileName(an), 'Mensal_MinasFarma_FarmaEFarma_2026-10-01.pptx');
  const bytes = await R.pack(R.build(an), ctx.JSZip);
  const z = await ctx.JSZip.loadAsync(bytes);
  assert.equal(Object.values(z.files).filter(f => f.dir).length, 0);
  assert.ok(z.file('ppt/presentation.xml'));
});
