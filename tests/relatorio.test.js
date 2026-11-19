// Relatório mensal por cliente: fechamento do mês (semanas inteiras, alcance que não soma, linha de mês), seções por serviço e deck.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

const root = path.join(__dirname, '..', 'public', 'assets');
const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, Buffer };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'pptxgen.bundle.js'), 'utf8'), ctx);
globalThis.PptxGenJS = ctx.PptxGenJS;
['services', 'analysis', 'report', 'relatorio'].forEach(f => require(`../public/assets/js/${f}.js`));
const A = globalThis.N7Analysis, R = globalThis.N7Relatorio;

const empty = () => ({ views: null, alcance: null, interacoes: null, cliques: null, visitas: null, seguidores: null });
const week = (inicio, marca, o = {}) => Object.assign({ tipo: 'semana', inicio, fim: A.period('semana', inicio).fim, marca, vendas: null, compras: null, dias: Array(7).fill(null), c100n: null, c100rs: null, ig: empty(), fb: empty(), ads: { gasto: null, alcance: null, impressoes: null, resultados: null }, janela: '', fonte: '', obs: '' }, o);
const month = (inicio, marca, o = {}) => Object.assign(week(inicio, marca), { tipo: 'mes', fim: A.period('mes', inicio).fim }, o);
const ads = (gasto, impressoes, resultados, alcance = null) => ({ gasto, alcance, impressoes, resultados });
const client = { key: 'X', name: 'Padaria Bom Pão', color: '--c5', services: ['trafego', 'criativos'] };

test('fechamento do mês: só semanas inteiras dentro do mês', () => {
  assert.deepEqual(A.weeksInside('2026-10-01'), ['2026-10-05', '2026-10-12', '2026-10-19'], 'a semana de 26/10 a 01/11 atravessa o mês e fica de fora');
  assert.deepEqual(A.weeksInside('2026-11-01'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
});
test('soma das semanas: alcance não se soma, parcial é marcado, linha de mês tem prioridade', () => {
  const w = [week('2026-11-02', 'X', { ads: ads(100, 10000, 5, 4000) }), week('2026-11-09', 'X', { ads: ads(200, 12000, 7, 5000) }), week('2026-11-16', 'X', { ads: ads(150, 11000, 6, 4500) }), week('2026-11-23', 'X', { ads: ads(50, 9000, null, 3000) })];
  const r = A.rollupMonth(w, '2026-11-01', 'X');
  assert.equal(r.row.ads.gasto, 500); assert.equal(r.origem['ads.gasto'], 'semanas'); assert.equal(r.row.ads.alcance, null, 'alcance do mês não é a soma das semanas');
  assert.equal(r.row.ads.resultados, 18); assert.equal(r.origem['ads.resultados'], 'parcial', 'uma semana sem resultado: total parcial');
  const comMes = A.rollupMonth(w.concat([month('2026-11-01', 'X', { ads: ads(null, null, null, 9500) })]), '2026-11-01', 'X');
  assert.equal(comMes.row.ads.alcance, 9500); assert.equal(comMes.origem['ads.alcance'], 'mes'); assert.equal(comMes.row.ads.gasto, 500, 'o que a linha de mês não tem vem das semanas');
  const so = A.rollupMonth([month('2026-11-01', 'X', { ads: ads(480, 40000, 20, 9000) })].concat(w), '2026-11-01', 'X');
  assert.equal(so.row.ads.gasto, 480, 'valor do mês inteiro vence a soma das semanas'); assert.equal(so.fonte, 'mes');
  assert.equal(A.rollupMonth([], '2026-11-01', 'X').fonte, 'vazio');
});
test('modelo: seções seguem os serviços; sem número é "sem dado"; base pequena não vira destaque', () => {
  const w = [week('2026-10-05', 'X', { ads: ads(300, 30000, 3) }), week('2026-10-12', 'X', { ads: ads(300, 30000, 2) }), week('2026-11-02', 'X', { ads: ads(450, 30000, 12) }), week('2026-11-09', 'X', { ads: ads(450, 31000, 10) })];
  const posts = [{ b: 'X', date: '2026-11-04', status: 'pub', format: 'Carrossel', title: 'Promo de pães' }, { b: 'X', date: '2026-11-11', status: 'plan', format: 'Reels', title: 'Receita' }, { b: 'Y', date: '2026-11-04', status: 'pub', format: 'Reels', title: 'Outro cliente' }];
  const m = R.model({ client, weeks: w, inicio: '2026-11-01', posts });
  assert.deepEqual(m.sections.map(s => s.id), ['trafego', 'entregas'], 'cliente de tráfego e criativos não ganha redes nem varejo');
  const t = m.sections[0].kpis, get = l => t.find(k => k.label.startsWith(l));
  assert.equal(get('Investimento').cur, 900); assert.equal(get('Investimento').prev, 600); assert.equal(Math.round(get('Investimento').pct), 50);
  assert.equal(get('Resultados').prev, 5); assert.equal(get('Alcance').text, 'sem dado'); assert.equal(get('Frequência').text, 'sem dado');
  assert.ok(!m.destaques.some(d => /Resultados/.test(d.texto)), 'de 5 para 22 resultados é base pequena (menos de 20): não é destaque');
  assert.ok(m.destaques.some(d => /Investimento/.test(d.texto)));
  const e = m.sections[1]; assert.equal(e.kpis[0].cur, 1, 'só publicações deste cliente no mês'); assert.equal(e.kpis[1].cur, 2); assert.equal(e.lista.length, 1);
  assert.ok(m.avisos.some(a => /semanas inteiras/.test(a)));
  const vazio = R.model({ client, weeks: [], inicio: '2026-11-01', posts: [] }); assert.ok(vazio.vazio); assert.ok(vazio.avisos.some(a => /Sem números de/.test(a)));
});
test('serviços de varejo e redes entram quando contratados', () => {
  const c = { key: 'M', name: 'Minas Farma', color: '--c1', services: ['redes', 'trafego', 'varejo'] };
  const w = [week('2026-11-02', 'M', { vendas: 100000, compras: 1600, ig: Object.assign(empty(), { views: 50000, interacoes: 100 }) }), week('2026-10-05', 'M', { vendas: 80000, compras: 1500, ig: Object.assign(empty(), { views: 40000, interacoes: 80 }) })];
  const m = R.model({ client: c, weeks: w, inicio: '2026-11-01', posts: [] });
  assert.deepEqual(m.sections.map(s => s.id), ['redes', 'trafego', 'varejo', 'entregas']);
  const v = m.sections.find(s => s.id === 'varejo').kpis; assert.equal(v[0].cur, 100000); assert.equal(Math.round(v[0].pct), 25); assert.equal(v[2].cur, 62.5, 'ticket = vendas ÷ compras');
  assert.ok(m.sections.find(s => s.id === 'trafego').vazio);
});
test('deck do cliente: capa, resumo e um slide por serviço com número; próximos passos só se escritos; zip sem pastas', async () => {
  const w = [week('2026-10-05', 'X', { ads: ads(300, 30000, 30) }), week('2026-11-02', 'X', { ads: ads(450, 30000, 40) }), week('2026-11-09', 'X', { ads: ads(450, 31000, 35) })];
  const m = R.model({ client, weeks: w, inicio: '2026-11-01', posts: [] });
  const sem = R.build(m); assert.equal(sem.slides.length, 3, 'capa, resumo e tráfego (criativos sem entregas não gera slide)');
  const com = R.build(m, { obs: 'Subir o investimento\nTestar vídeo curto' }); assert.equal(com.slides.length, 4);
  assert.equal(R.fileName(m), 'Relatorio_PadariaBomPao_2026-11.pptx');
  const bytes = await globalThis.N7Report.pack(com, ctx.JSZip), z = await ctx.JSZip.loadAsync(bytes);
  assert.equal(Object.values(z.files).filter(f => f.dir).length, 0);
  const vazio = R.build(R.model({ client, weeks: [], inicio: '2026-11-01', posts: [] })); assert.equal(vazio.slides.length, 1, 'sem números: só a capa');
});
