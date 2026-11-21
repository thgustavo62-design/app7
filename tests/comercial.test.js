// Comercial: ficha, serviços recomendados, posicionamento, prioridade, carteira, valor por extenso, contrato, e a camada de dados (só administrador).
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;                  // o playbook.js grava em window.N7_PLAYBOOK
require('../public/assets/js/services.js'); require('../public/assets/js/playbook.js'); require('../public/assets/js/analysis.js'); require('../public/assets/js/store.js'); require('../public/assets/js/sync.js'); require('../public/assets/js/comercial.js');
const C = globalThis.N7Comercial, { diffKey } = globalThis.N7Sync;
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const { scopeState } = require('../lib/scope');

const ficha = (o = {}) => Object.assign({ nome: 'Clínica Sorriso', setor: 'saude', segmento: 'clínica odontológica', cidade: 'Baixo Guandu', objetivo: 'captar_leads', publico: 'famílias da região', diferenciais: 'atendimento sem fila e horário estendido', concorrentes: 'Odonto Centro', canais: 'Instagram e WhatsApp', orcamento_midia: 1200, servicos: ['redes', 'trafego'], dor: 'agenda vazia', prazo: 'em 30 dias' }, o);

test('valor por extenso: reais e centavos, "e" entre grupos e milhões', () => {
  const casos = [[1, 'um real'], [100, 'cem reais'], [101, 'cento e um reais'], [1500, 'mil e quinhentos reais'], [2100, 'dois mil e cem reais'], [2350, 'dois mil, trezentos e cinquenta reais'], [1001, 'mil e um reais'],
    [1500.5, 'mil e quinhentos reais e cinquenta centavos'], [0.99, 'noventa e nove centavos'], [1000000, 'um milhão de reais'], [12345.67, 'doze mil, trezentos e quarenta e cinco reais e sessenta e sete centavos'], [0, 'zero real']];
  casos.forEach(([v, t]) => assert.equal(C.extenso(v), t, String(v)));
  assert.equal(C.extenso(-5), ''); assert.equal(C.extenso('abc'), '');
});

test('ficha: completude lista o que falta; prioridade comercial explica o porquê', () => {
  const vazio = C.completude({ nome: 'X' }); assert.ok(vazio.pct < 20); assert.ok(vazio.faltam.includes('Objetivo principal') && vazio.faltam.includes('Serviços de interesse'));
  assert.equal(C.completude(ficha()).pct, 100);
  const alta = C.fit(ficha()); assert.equal(alta.nivel, 'alta'); assert.ok(alta.motivos.some(m => /Playbook/.test(m)));
  const baixa = C.fit({ nome: 'Y' }); assert.equal(baixa.nivel, 'baixa');
  const semVerba = C.fit(ficha({ orcamento_midia: '' })); assert.ok(semVerba.score < alta.score); assert.ok(semVerba.motivos.some(m => /verba de mídia não informada/.test(m)));
});

test('serviços recomendados seguem o objetivo e o setor, e dizem por quê', () => {
  const r = C.recomendar(ficha()).map(x => x.servico); assert.equal(r[0], 'trafego'); assert.ok(r.includes('redes'));
  const ref = C.recomendar(ficha({ setor: 'contabilidade', objetivo: 'ser_referencia', servicos: [] })); assert.equal(ref[0].servico, 'autoridade'); assert.ok(ref[0].motivos.length >= 2);
  const varejo = C.recomendar(ficha({ setor: 'saude', objetivo: 'promocoes_varejo', servicos: [] })).map(x => x.servico); assert.ok(varejo.includes('varejo') && varejo.includes('promocoes'));
  assert.ok(C.recomendar(ficha({ objetivo: 'ganhar_presenca', servicos: ['criativos'] })).find(x => x.servico === 'criativos').interesse, 'o que o cliente pediu fica marcado');
});

test('posicionamento: proposta com os dados da ficha, cuidados do setor e alertas honestos', () => {
  const p = C.posicionamento(ficha());
  assert.match(p.proposta, /Para famílias da região, Clínica Sorriso é clínica odontológica de Baixo Guandu que se diferencia por atendimento sem fila/);
  assert.match(p.proposta, /Odonto Centro/); assert.equal(p.setor, 'saude'); assert.ok(p.pilares.length === 4 && p.canais.length && p.cuidados.some(c => /farmacêutico|responsável/i.test(c)));
  assert.ok(p.alertas.some(a => a.nivel === 'regulado'), 'setor regulado avisa sobre a revisão técnica no prazo');
  assert.equal(p.plano30.length, 4); assert.ok(p.indicadores.some(i => i.servico === 'trafego'));
  const fraco = C.posicionamento(ficha({ orcamento_midia: 300, canais: 'Instagram', diferenciais: '', concorrentes: '' }));
  assert.ok(fraco.alertas.some(a => /baixa/.test(a.texto)), 'verba baixa'); assert.ok(fraco.alertas.some(a => /destino|para onde/.test(a.texto)), 'sem destino de conversão'); assert.ok(fraco.alertas.some(a => /diferenciais/.test(a.texto)));
  assert.match(fraco.proposta, /\[informe o principal diferencial na ficha\]/, 'lacuna aparece como pendência, não inventada');
  const outro = C.posicionamento({ nome: 'Z', setor: 'outro' }); assert.ok(outro.pilares.length && outro.cuidados.length, 'setor sem Playbook usa o genérico');
});

test('carteira: oportunidades de venda, atenção e receita recorrente só de contrato assinado', () => {
  const clients = [{ key: 'M', name: 'Minas Farma', services: ['redes', 'varejo'], setor: 'saude' }, { key: 'W', name: 'Werllem', services: ['redes'], setor: 'executivo' }, { key: 'C', name: 'Campo Forte', services: ['redes', 'trafego'], setor: 'agro' }];
  const contracts = [{ id: 'ct-1', cliente_tipo: 'cliente', cliente_ref: 'M', status: 'assinado', valores: { redes: 1500, varejo: 800 }, atualizado_em: '2026-11-01' }, { id: 'ct-2', cliente_tipo: 'cliente', cliente_ref: 'C', status: 'rascunho', valores: { redes: 900 } }, { id: 'ct-3', cliente_tipo: 'prospect', cliente_ref: 'p-1', status: 'assinado', valores: { redes: 999 } }];
  const c = C.carteira({ clients, contracts, saude: { M: 45, W: 80 } });
  assert.equal(c.resumo.mrr, 2300, 'só contrato assinado de cliente'); assert.equal(c.resumo.semContrato, 1, 'só o Werllem não tem contrato nenhum'); assert.ok(c.linhas.find(l => l.key === 'C').atencao.some(a => /em rascunho, ainda não assinado/.test(a))); assert.equal(c.resumo.emRisco, 1);
  const m = c.linhas.find(l => l.key === 'M'), w = c.linhas.find(l => l.key === 'W');
  assert.ok(m.oportunidades.some(o => o.servico === 'promocoes')); assert.ok(!m.oportunidades.some(o => o.servico === 'trafego'), 'saúde baixa: antes resolver');
  assert.ok(m.atencao.some(a => /saúde baixa/.test(a))); assert.ok(w.oportunidades.some(o => o.servico === 'autoridade') && w.oportunidades.some(o => o.servico === 'trafego'));
  assert.equal(c.resumo.cobertura.redes, 3); assert.equal(c.resumo.porSetor.saude, 1);
});

test('contrato: partes, escopo por serviço, valor por extenso, cláusulas condicionais e lacunas visíveis', () => {
  const agencia = { razao_social: 'Nova7 Produtora LTDA', cnpj: '12.345.678/0001-90', endereco: 'Rua A, 10', cidade: 'Baixo Guandu - ES', representante: 'Gustavo Silva', foro: 'Baixo Guandu - ES', pix: 'pix@nova7.com' };
  const c = C.gerarContrato({ agencia, contratante: { nome: 'Clínica Sorriso LTDA', doc: '98.765.432/0001-10', setor: 'saude' }, servicos: [{ id: 'redes', valor: 1500 }, { id: 'trafego', valor: 800.5 }], condicoes: { inicio: '2026-12-01', meses: 12, vencimento: 10, reajuste: 'igpm', verba_midia: 'R$ 1.200,00', prazo_aprovacao: 2 }, data: '2026-11-21' });
  assert.match(c.texto, /CONTRATADA: Nova7 Produtora LTDA.*12\.345\.678\/0001-90/); assert.match(c.texto, /CONTRATANTE: Clínica Sorriso LTDA/);
  assert.match(c.texto, /12 publicações por mês/); assert.match(c.texto, /campanhas simultâneas de anúncios/);
  assert.equal(c.total, 2300.5); assert.match(c.texto, /valor mensal total de R\$\s?2\.300,50 \(dois mil e trezentos reais e cinquenta centavos\)/);
  assert.match(c.texto, /até o dia 10 de cada mês/); assert.match(c.texto, /IGP-M/); assert.match(c.texto, /em até 2 dias úteis/);
  assert.ok(c.clausulas.some(x => x.t === 'DA VERBA DE MÍDIA') && /R\$ 1\.200,00/.test(c.texto), 'tráfego traz a cláusula da verba de mídia');
  assert.ok(c.clausulas.some(x => x.t === 'DA CONFORMIDADE DO SETOR') && /profissional responsável/.test(c.texto), 'saúde traz a cláusula do setor');
  assert.match(c.texto, /Os serviços são de meio e não de resultado/); assert.match(c.texto, /LGPD/); assert.match(c.texto, /MINUTA PARA REVISÃO JURÍDICA/);
  const vazio = C.gerarContrato({ servicos: [{ id: 'criativos', valor: 0 }] });
  assert.match(vazio.texto, /\[RAZÃO SOCIAL DA CONTRATADA\]/); assert.match(vazio.texto, /\[NOME DA CONTRATANTE\]/); assert.ok(!vazio.clausulas.some(x => x.t === 'DA VERBA DE MÍDIA'));
  assert.ok(!C.gerarContrato({ servicos: [], minuta: false }).texto.includes('MINUTA'), 'sem o aviso quando a minuta é dispensada');
  assert.match(c.texto, /CLÁUSULA 1ª – DAS PARTES\n1\.1 CONTRATADA:[^\n]*\n1\.2 CONTRATANTE:/, 'parágrafos numerados desde 1.1');
  assert.match(c.texto, /CLÁUSULA 6ª – DO VALOR E DO PAGAMENTO\n6\.1 Pelos serviços/); assert.match(c.texto, /\n6\.2 O pagamento será feito até o dia 10/, 'a lista de valores não consome número');
  assert.match(c.html, /<h2>CLÁUSULA 2ª – DO OBJETO<\/h2>/); assert.ok(!/<script/i.test(C.gerarContrato({ contratante: { nome: '<script>x</script>' }, servicos: [] }).html), 'html escapado');
});

/* ---------- dados: só administrador ---------- */
const mk = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const run = (r, ops, u = admin) => model.applyOps(new Repo(r.d), ops, u);
const pr = o => Object.assign({ t: 'prospect', op: 'upsert', id: 'p-abc123', nome: 'Clínica Sorriso', setor: 'saude', objetivo: 'captar_leads', orcamento_midia: 1200, servicos: ['redes', 'trafego'], etapa: 'novo' }, o);

test('dados do Comercial: ficha e contrato gravam e validam; agência vai para a Config; leitura e editor não mexem; recorte esconde de quem não é administrador', async () => {
  const r = mk();
  assert.equal((await run(r, [pr()])).results[0].v, '1');
  let st = await model.loadState(new Repo(r.d)); const p = st.prospects[0];
  assert.deepEqual([p.nome, p.setor, p.orcamento_midia, p.servicos, p.etapa], ['Clínica Sorriso', 'saude', 1200, ['redes', 'trafego'], 'novo']);
  await assert.rejects(run(r, [pr({ setor: 'inventado' })]), /Setor inválido/); await assert.rejects(run(r, [pr({ etapa: 'x' })]), /Etapa inválido/); await assert.rejects(run(r, [pr({ id: 'ruim' })]), /Id da ficha/); await assert.rejects(run(r, [pr({ nome: '' })]), /Nome é obrigatório/); await assert.rejects(run(r, [pr({ orcamento_midia: -5 })]), /inválid|negativ|Verba/);
  await assert.rejects(run(r, [pr({ responsavel: 'fantasma@x.com' })]), /Responsável inválido/);
  assert.equal((await run(r, [pr({ etapa: 'proposta', v: '1' })])).results[0].v, '2'); assert.ok((await run(r, [pr({ v: '1' })])).conflict, 'versão velha conflita');
  const ct = { t: 'contract', op: 'upsert', id: 'ct-abc123', cliente_tipo: 'prospect', cliente_ref: 'p-abc123', cliente_nome: 'Clínica Sorriso', servicos: ['redes'], valores: { redes: 1500 }, inicio: '2026-12-01', meses: 12, vencimento: 10, reajuste: 'ipca', dados: { a: 1 }, texto: 'texto do contrato', status: 'rascunho' };
  assert.equal((await run(r, [ct])).results[0].v, '1');
  await assert.rejects(run(r, [{ ...ct, meses: 120 }]), /1 a 60 meses/); await assert.rejects(run(r, [{ ...ct, vencimento: 40 }]), /1 a 31/); await assert.rejects(run(r, [{ ...ct, status: 'x' }]), /Situação inválido/); await assert.rejects(run(r, [{ ...ct, texto: 'x'.repeat(45001) }]), /passa de/);
  await run(r, [{ t: 'agency', op: 'upsert', razao_social: 'Nova7 LTDA', cnpj: '12.345.678/0001-90', representante: 'Gustavo' }]);
  st = await model.loadState(new Repo(r.d));
  assert.equal(st.agency.razao_social, 'Nova7 LTDA'); assert.equal(st.contracts[0].valores.redes, 1500); assert.equal(st.contracts[0].servicos[0], 'redes'); assert.equal(st.contracts[0].texto, 'texto do contrato');
  for (const u of [{ email: 'e@x.com', papel: 'editor', tipo: 'equipe', empresas: [] }, { email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] }, { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['M'] }]) {
    await assert.rejects(run(r, [pr({ id: 'p-outra12' })], u), /Só administradores|só de leitura|aprovação/, u.papel);
    const v = scopeState(st, u, () => 'M'); assert.deepEqual([v.prospects, v.contracts, v.agency], [[], [], {}], 'recorte esconde o Comercial: ' + u.papel);
  }
  assert.equal(scopeState(st, admin, () => 'M').prospects.length, 1);
  await run(r, [{ t: 'prospect', op: 'delete', id: 'p-abc123', v: '2' }, { t: 'contract', op: 'delete', id: 'ct-abc123', v: '1' }]);
  st = await model.loadState(new Repo(r.d)); assert.deepEqual([st.prospects.length, st.contracts.length], [0, 0]);
});

test('sync: ficha, contrato e agência viram operações', () => {
  const p = { id: 'p-1', nome: 'X', servicos: ['redes'], v: '1' };
  assert.deepEqual(diffKey('prospects', [p], [JSON.parse(JSON.stringify(p))]), []);
  const ops = diffKey('prospects', [p], [{ ...p, nome: 'Y', v: undefined }]); assert.equal(ops[0].t, 'prospect'); assert.equal(ops[0].v, '1'); assert.equal(ops[0].nome, 'Y');
  assert.equal(diffKey('contracts', [], [{ id: 'ct-1', cliente_nome: 'Z' }])[0].t, 'contract');
  assert.deepEqual(diffKey('agency', { cnpj: '1' }, { cnpj: '1' }), []); assert.equal(diffKey('agency', {}, { cnpj: '1' })[0].t, 'agency');
});
