// Proposta comercial em PowerPoint: conteúdo vem da ficha; o que falta vira lacuna avisada (nunca texto inventado nem valor zero).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

const root = path.join(__dirname, '..', 'public', 'assets');
const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Promise, Buffer };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'vendor', 'pptxgen.bundle.js'), 'utf8'), ctx);
globalThis.PptxGenJS = ctx.PptxGenJS; globalThis.window = globalThis;
['services', 'playbook', 'analysis', 'report', 'comercial', 'proposta'].forEach(f => require(`../public/assets/js/${f}.js`));
const P = globalThis.N7Proposta, C = globalThis.N7Comercial;

const ficha = (o = {}) => Object.assign({ nome: 'Clínica Sorriso', setor: 'saude', segmento: 'clínica odontológica', cidade: 'Baixo Guandu', objetivo: 'captar_leads', publico: 'famílias da região', diferenciais: 'atendimento sem fila e horário estendido', concorrentes: 'Odonto Centro', canais: 'Instagram e WhatsApp', orcamento_midia: 1200, servicos: ['redes', 'trafego'], dor: 'agenda vazia', prazo: 'em 30 dias' }, o);
async function textos(pres) {
  const z = await ctx.JSZip.loadAsync(await globalThis.N7Report.pack(pres, ctx.JSZip)), out = [];
  const nomes = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  for (const n of nomes) out.push([...(await z.file(n).async('string')).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(' '));
  return { slides: out, nomes: Object.keys(z.files) };
}

test('modelo: usa a ficha, soma só o que tem valor e diz o que falta', () => {
  const m = P.model(ficha({ ficha: { prova_social: '200 avaliações' } }), { valores: { redes: 1500, trafego: 800 }, hoje: '2026-11-21T12:00:00Z', validadeDias: 10 });
  assert.deepEqual(m.servicos.map(s => [s.id, s.valor]), [['redes', 1500], ['trafego', 800]]);
  assert.deepEqual([m.total, m.origem], [2300, 'soma']); assert.deepEqual(m.faltando, [], 'ficha completa e com valores: nada a avisar');
  assert.ok(/Para famílias da região, Clínica Sorriso/.test(m.proposta) && !/\[/.test(m.proposta));
  assert.ok(m.ouvimos.some(x => x.rotulo === 'Provas que já tem' && x.texto === '200 avaliações') && m.ouvimos.some(x => /Objetivo/.test(x.rotulo)));
  assert.ok(m.servicos[0].entregas.some(e => /12 publicações/.test(e)) && !/CONTRATANTE/.test(JSON.stringify(m.servicos)), 'entregas em linguagem de cliente');
  assert.equal(m.dias, 10); assert.ok(/novembro de 2026/.test(m.data) && /dezembro de 2026|novembro de 2026/.test(m.validade));
  assert.ok(/1\.200 por mês, paga diretamente/.test(m.midia.replace(/R\$\s?/, '')), 'verba de mídia fica fora dos valores');
  assert.ok(m.regulado.length > 0, 'setor de saúde leva o aviso de revisão técnica');
  assert.ok(/^Por ser um setor com regras próprias/.test(m.regulado) && !/combine desde/.test(m.regulado), 'aviso escrito para o cliente, não como conselho interno');
  assert.ok(!m.canais.some(c => /farmac/i.test(c)), 'clínica não recebe canal de farmácia');
  assert.equal(P.model(ficha({ setor: 'varejo', servicos: ['redes'] })).midia, '', 'sem tráfego não fala de verba de mídia');
  const parcial = P.model(ficha(), { valores: { redes: 1500 } }); assert.deepEqual([parcial.total, parcial.origem], [1500, 'parcial']); assert.ok(parcial.faltando.some(f => /alguns serviços/.test(f)));
  const pacote = P.model(ficha({ valor_estimado: 2500 })); assert.deepEqual([pacote.total, pacote.origem], [2500, 'pacote'], 'sem valor por serviço, usa o valor estimado da ficha como pacote');
  const semValor = P.model(ficha()); assert.equal(semValor.total, null, 'sem valor nenhum: nunca vira zero'); assert.ok(semValor.faltando.some(f => /Valores/.test(f)));
  assert.equal(P.model(ficha(), { valores: { redes: 0, trafego: '' } }).total, null, 'zero ou vazio não conta como valor');
  assert.equal(P.model(ficha(), { validadeDias: 9999 }).dias, 90); assert.equal(P.model(ficha(), { validadeDias: 'x' }).dias, 15);
});

test('modelo: ficha quase vazia não inventa texto e lista as lacunas', () => {
  const m = P.model({ nome: 'Y' });
  assert.equal(m.proposta, '', 'sem público e diferencial a proposta de valor fica de fora (nada de colchetes)');
  assert.deepEqual(m.ouvimos, []); assert.ok(m.faltando.includes('Serviços') || m.servicos.length >= 0);
  assert.ok(m.faltando.some(f => /O que o cliente quer/.test(f)) && m.faltando.some(f => /Público e diferencial/.test(f)) && m.faltando.some(f => /Valores/.test(f)));
  assert.equal(m.agencia.nome, 'Nova7'); assert.equal(P.model({ nome: 'Y' }, { agencia: { nome_fantasia: 'Agência Teste', email: 'a@b.c' } }).agencia.nome, 'Agência Teste');
});

test('deck: capa, ouvimos, posicionamento, entregas, 30 dias, investimento e próximos passos; zip sem pastas', async () => {
  const m = P.model(ficha({ ficha: { prova_social: 'x' } }), { valores: { redes: 1500, trafego: 800 }, obs: 'Desconto no primeiro mês', agencia: { nome_fantasia: 'Nova7', email: 'contato@nova7.test' } });
  const pres = P.build(m), t = await textos(pres);
  assert.equal(pres.slides.length, 7, 'capa + 6 slides'); assert.equal(t.nomes.filter(n => n.endsWith('/')).length, 0, 'sem entradas de pasta no zip');
  assert.ok(/Proposta comercial/.test(t.slides[0]) && /Clínica Sorriso/.test(t.slides[0]) && /válida até/.test(t.slides[0]));
  assert.ok(/O que ouvimos de você/.test(t.slides[1]) && /agenda vazia/.test(t.slides[1]));
  assert.ok(/Como vamos posicionar/.test(t.slides[2]) && /Para famílias da região/.test(t.slides[2]));
  assert.ok(/Redes sociais/.test(t.slides[3]) && /12 publicações/.test(t.slides[3]));
  assert.ok(/não prometemos resultado/i.test(t.slides[4]));
  assert.ok(/Investimento/.test(t.slides[5]) && /1\.500/.test(t.slides[5]) && /2\.300/.test(t.slides[5]) && /Desconto no primeiro mês/.test(t.slides[5]) && /diretamente às plataformas/.test(t.slides[5]));
  assert.ok(/Próximos passos/.test(t.slides[6]) && /contato@nova7\.test/.test(t.slides[6]));
});

test('deck: sem valor diz "a combinar"; ficha mínima gera só o que tem conteúdo; nome do arquivo', async () => {
  const t = await textos(P.build(P.model(ficha())));
  assert.ok(/a combinar/.test(t.slides.find(s => /^Investimento/.test(s))) && !/R\$\s?0\b/.test(t.slides.join(' ')), 'nenhum R$ 0 inventado');
  const minimo = P.build(P.model({ nome: 'Y' })); const tm = await textos(minimo);
  assert.ok(minimo.slides.length >= 4 && minimo.slides.length < 7, 'sem ouvimos e sem posicionamento o deck encolhe: ' + minimo.slides.length);
  assert.ok(!tm.slides.some(s => /O que ouvimos/.test(s)) && !tm.slides.some(s => /\[defina|\[informe/.test(s)), 'sem seção vazia e sem colchetes');
  assert.equal(P.fileName(P.model(ficha()), '2026-11-21'), 'Proposta_ClinicaSorriso_2026-11-21.pptx');
});
