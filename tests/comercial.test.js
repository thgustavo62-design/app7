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
  assert.equal(C.completude(ficha()).pct, 92); assert.ok(C.completude(ficha()).faltam.includes('Tipo de negócio'), 'sem tipo de negócio a ficha não passa de 92%');
  assert.equal(C.completude(ficha({ tipo_negocio: 'loja_fisica', lat: -19.52, lng: -41.01, ficha: { proposta_atual: 'a', prova_social: 'b', presenca: 'c' } })).pct, 100);
  assert.deepEqual(C.completude(ficha({ tipo_negocio: 'loja_fisica', ficha: {} })).faltam, ['Como ele se apresenta hoje', 'Provas (avaliações, depoimentos)', 'Presença digital hoje', 'Ponto no mapa'], 'negócio físico precisa de ponto no mapa');
  assert.equal(C.completude(ficha({ tipo_negocio: 'online', ficha: { proposta_atual: 'a', prova_social: 'b', presenca: 'c' } })).pct, 100, 'online não precisa de ponto no mapa');
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

test('funil: previsão ponderada só com valor informado, retornos atrasados, taxa de fechamento só com amostra e motivos de perda', () => {
  const H = '2026-11-21', p = (o) => Object.assign({ id: 'p-' + Math.random(), nome: 'X', etapa: 'novo', valor_estimado: '', proximo_contato: '', atividades: [] }, o);
  const f = C.funil([
    p({ id: 'a', nome: 'A', etapa: 'proposta', valor_estimado: 2000, proximo_contato: '2026-11-10', atividades: [{ em: '2026-11-01', tipo: 'ligacao', texto: 'x' }, { em: '2026-11-19', tipo: 'etapa', texto: 'Reunião → Proposta' }] }),
    p({ id: 'b', nome: 'B', etapa: 'reuniao', valor_estimado: 1000, proximo_contato: '2026-11-25' }),
    p({ id: 'c', nome: 'C', etapa: 'contato' }),
    p({ id: 'd', nome: 'D', etapa: 'perdido', motivo: 'Preço: achou caro', origem: 'Indicação' }), p({ id: 'e', etapa: 'fechado', origem: 'Indicação', valor_estimado: 3000 })
  ], H);
  assert.equal(f.aberto.n, 3); assert.equal(f.aberto.valor, 3000); assert.equal(f.aberto.semValor, 1, 'valor que falta não vira zero: é contado à parte');
  assert.equal(f.aberto.ponderado, 1600, '2000×60% + 1000×40%'); assert.equal(f.colunas.fechado.valor, 3000);
  assert.deepEqual(f.atrasados.map(x => [x.id, x.dias]), [['a', 11]]); assert.deepEqual(f.semProximo.map(x => x.id), ['c']);
  assert.deepEqual(f.parados.map(x => [x.id, x.dias]), [['a', 20]], 'mudança de etapa não conta como contato');
  assert.equal(f.fechamento.taxa, null, 'poucas decisões: sem taxa'); assert.deepEqual(f.motivos, [['Preço', 1]]);
  assert.equal(f.origens.find(o => o.origem === 'Indicação').ganhos, 1);
  const muitos = [...Array(3)].map(() => p({ etapa: 'fechado' })).concat([...Array(2)].map(() => p({ etapa: 'perdido' })));
  assert.equal(C.funil(muitos, H).fechamento.taxa, 60);
  assert.deepEqual(C.retornos([p({ id: 'a', etapa: 'novo', proximo_contato: '2026-11-20', responsavel: 'z@x' }), p({ id: 'b', etapa: 'novo', proximo_contato: '2026-12-01' }), p({ id: 'c', etapa: 'fechado', proximo_contato: '2026-11-01' })], H).map(x => x.id), ['a']);
  assert.deepEqual(C.retornos([p({ id: 'a', etapa: 'novo', proximo_contato: '2026-11-20', responsavel: 'z@x' })], H, 'outro@x'), []);
});

test('dados do funil: valor, próximo contato e histórico de contatos gravam, validam e voltam na leitura', async () => {
  const r = mk();
  await run(r, [pr({ valor_estimado: 2500, proximo_contato: '2026-11-30', proximo_passo: 'Enviar proposta', atividades: [{ em: '2026-11-20', tipo: 'ligacao', texto: 'Quer ver cases' }] })]);
  const p = (await model.loadState(new Repo(r.d))).prospects[0];
  assert.equal(p.valor_estimado, 2500); assert.equal(p.proximo_contato, '2026-11-30'); assert.equal(p.proximo_passo, 'Enviar proposta');
  assert.deepEqual(p.atividades, [{ em: '2026-11-20', tipo: 'ligacao', texto: 'Quer ver cases' }]);
  await assert.rejects(run(r, [pr({ valor_estimado: -5, v: p.v })]), /Valor estimado inválido/);
  await assert.rejects(run(r, [pr({ proximo_contato: '30/11', v: p.v })]), /Data inválida/);
  await assert.rejects(run(r, [pr({ atividades: [{ em: '2026-11-20', tipo: 'fax', texto: 'x' }], v: p.v })]), /Tipo de contato/);
  await run(r, [pr({ valor_estimado: '', proximo_contato: '', atividades: [], v: p.v })]);
  const q = (await model.loadState(new Repo(r.d))).prospects[0]; assert.deepEqual([q.valor_estimado, q.proximo_contato, q.atividades], [null, '', []]);
  const a = { ...p, atividades: [...p.atividades, { em: '2026-11-21', tipo: 'nota', texto: 'ok' }] };
  assert.equal(diffKey('prospects', [p], [a])[0].atividades.length, 2, 'adicionar contato vira operação com a lista inteira');
});

test('ficha fechada vira cliente: sugestão sem repetir chave, endereço e cor; contratos passam a ser do cliente; servidor valida a chave', async () => {
  const existentes = [{ key: 'CS', id: 'clinica-sorriso', color: '--c1' }, { key: 'M', id: 'minas', color: '--c2' }];
  const s = C.sugerirCliente({ nome: 'Clínica Sorriso', setor: 'saude', segmento: 'odonto', servicos: ['redes', 'trafego'] }, existentes);
  assert.equal(s.chave, 'CS2', 'chave igual à de outro cliente ganha número'); assert.equal(s.id, 'clinica-sorriso-2'); assert.equal(s.cor, '--c3');
  assert.deepEqual([s.nome, s.curto, s.setor, s.servicos], ['Clínica Sorriso', 'Clínica', 'saude', ['redes', 'trafego']]);
  assert.equal(C.sugerirCliente({ nome: 'Config' }, []).id, 'config-2', 'endereço reservado do site não é usado');
  assert.match(C.sugerirCliente({ nome: '7 Mares' }, []).chave, /^[A-Z]/, 'chave começa por letra');
  const cts = [{ id: 'ct-1', cliente_tipo: 'prospect', cliente_ref: 'p-1' }, { id: 'ct-2', cliente_tipo: 'prospect', cliente_ref: 'p-2' }, { id: 'ct-3', cliente_tipo: 'cliente', cliente_ref: 'M' }];
  assert.deepEqual(C.contratosDoCliente(cts, 'p-1', 'CS2').map(c => [c.cliente_tipo, c.cliente_ref]), [['cliente', 'CS2'], ['prospect', 'p-2'], ['cliente', 'M']]);
  assert.equal(cts[0].cliente_tipo, 'prospect', 'não altera a lista original');
  const r = mk(); await run(r, [pr({ cliente_chave: 'CS2' })]);
  assert.equal((await model.loadState(new Repo(r.d))).prospects[0].cliente_chave, 'CS2');
  await assert.rejects(run(r, [pr({ cliente_chave: 'cs 2!', v: '1' })]), /Chave do cliente inválida/);
  const carteira = C.carteira({ clients: [{ key: 'CS2', name: 'Clínica Sorriso', services: ['redes'] }], contracts: C.contratosDoCliente([{ id: 'ct-1', cliente_tipo: 'prospect', cliente_ref: 'p-1', status: 'assinado', valores: { redes: 1500 } }], 'p-1', 'CS2') });
  assert.equal(carteira.resumo.mrr, 1500, 'depois de virar cliente, o contrato assinado entra na receita recorrente');
});

test('ficha ampliada: campos por tipo de negócio, território e posicionamento usam o que o cliente contou; servidor guarda e valida', async () => {
  assert.deepEqual(Object.keys(C.TIPOS), ['loja_fisica', 'servico_local', 'profissional', 'online', 'b2b', 'misto']);
  assert.ok(C.camposDoTipo('loja_fisica').some(c => c[0] === 'fluxo') && !C.camposDoTipo('online').some(c => c[0] === 'fluxo'), 'cada tipo tem as suas perguntas');
  assert.ok(C.camposDoTipo('b2b').some(c => c[0] === 'decisor') && C.camposDoTipo('profissional').some(c => c[0] === 'credenciais'));
  assert.equal(new Set(C.FICHA_KEYS).size, C.FICHA_KEYS.length, 'sem chave repetida');
  const f = ficha({ tipo_negocio: 'loja_fisica', bairro: 'Centro', lat: -19.52, lng: -41.01, raio_km: 5, ficha: { nao_quer: 'parecer barato', tom_desejado: 'acolhedor e direto', sazonalidade: 'Dia das Mães', presenca: 'só Instagram', prova_social: '200 avaliações' } });
  const p = C.posicionamento(f);
  assert.ok(p.territorio.some(t => /bairro Centro/.test(t)) && p.territorio.some(t => /raio de 5 km/.test(t)));
  assert.ok(/acolhedor e direto \(o que o cliente pediu\)/.test(p.tom) && /Base do setor/.test(p.tom));
  assert.ok(p.cuidados[0] === 'Evitar, a pedido do cliente: parecer barato' && p.sazonalidade[0] === 'Do cliente: Dia das Mães');
  assert.ok(p.canais[0].startsWith('Google Meu Negócio') && p.pilares[0].startsWith('O lugar'));
  assert.ok(p.alertas.some(a => /não cita o Google Meu Negócio/.test(a.texto)), 'presença sem Google num negócio físico');
  assert.ok(!p.alertas.some(a => /sem ponto no mapa/.test(a.texto)) && !p.alertas.some(a => /Sem provas coletadas/.test(a.texto)));
  assert.ok(C.posicionamento(ficha({ tipo_negocio: 'servico_local' })).alertas.some(a => /sem ponto no mapa/.test(a.texto)), 'físico sem ponto no mapa avisa');
  assert.ok(!C.posicionamento(ficha({ tipo_negocio: 'online' })).alertas.some(a => /sem ponto no mapa/.test(a.texto)), 'online não precisa de ponto');
  /* servidor */
  const model2 = require('../lib/model'); const src = require('fs').readFileSync(require.resolve('../lib/model'), 'utf8');
  const lista = JSON.parse(src.match(/const FICHA_KEYS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(lista.slice().sort(), C.FICHA_KEYS.slice().sort(), 'a lista de campos do servidor bate com a do cliente');
  const r = mk(); await run(r, [pr({ tipo_negocio: 'loja_fisica', endereco: 'Rua A, 10', bairro: 'Centro', lat: -19.52, lng: -41.0123456789, raio_km: 5, ficha: { carro_chefe: 'Pão francês', horario: '6h às 20h', inventada: 'x', site: '   ' } })]);
  const q = (await model.loadState(new Repo(r.d))).prospects[0];
  assert.deepEqual([q.tipo_negocio, q.endereco, q.bairro, q.lat, q.lng, q.raio_km], ['loja_fisica', 'Rua A, 10', 'Centro', -19.52, -41.012346, 5]);
  assert.deepEqual(q.ficha, { horario: '6h às 20h', carro_chefe: 'Pão francês' }, 'campo desconhecido e campo em branco ficam de fora');
  await assert.rejects(run(r, [pr({ lat: -19.5, lng: '', v: q.v })]), /juntas/);
  await assert.rejects(run(r, [pr({ lat: 95, lng: 10, v: q.v })]), /Latitude inválida/);
  await assert.rejects(run(r, [pr({ lat: 10, lng: 200, v: q.v })]), /Longitude inválida/);
  await assert.rejects(run(r, [pr({ raio_km: 900, v: q.v })]), /0 a 500/);
  await assert.rejects(run(r, [pr({ tipo_negocio: 'fabrica', v: q.v })]), /Tipo de negócio/);
  await run(r, [pr({ lat: '', lng: '', raio_km: '', ficha: {}, tipo_negocio: '', v: q.v })]);
  const z = (await model.loadState(new Repo(r.d))).prospects[0]; assert.deepEqual([z.lat, z.lng, z.raio_km, z.ficha], [null, null, null, {}], 'apagar o ponto volta a vazio, sem virar zero');
});

test('clientes cadastrados guardam endereço, ponto no mapa e raio; vazio continua vazio; só administrador grava', async () => {
  const r = mk(), cli = o => Object.assign({ t: 'client', op: 'upsert', chave: 'PE', id: 'padaria-estrela', nome: 'Padaria Estrela', curto: 'Padaria', cor: '--c5', segmento: 'padaria', perfil: '', setor: 'varejo', servicos: ['redes'], ativo: 'sim' }, o);
  await run(r, [cli({ endereco: 'Rua A, 10', bairro: 'Centro', lat: -19.52, lng: -41.0123456789, raio_km: 3 })]);
  const reg = async () => (await model.loadRegistry(new Repo(r.d), admin)).clients.find(c => c.key === 'PE');
  let c = await reg(); assert.deepEqual(c.local, { endereco: 'Rua A, 10', bairro: 'Centro', lat: -19.52, lng: -41.012346, raio: 3 });
  assert.deepEqual((await model.loadRegistry(new Repo(r.d), admin)).clients.find(x => x.key === 'M').local, { endereco: '', bairro: '', lat: null, lng: null, raio: null }, 'cliente sem ponto: vazio, nunca zero');
  await run(r, [cli({ nome: 'Padaria Estrela 2', v: c.v })]); c = await reg();
  assert.equal(c.local.lat, -19.52, 'operação sem localização não apaga o ponto'); 
  await assert.rejects(run(r, [cli({ lat: -19.5, lng: '', v: c.v })]), /juntas/);
  await assert.rejects(run(r, [cli({ lat: 99, lng: 1, v: c.v })]), /Latitude inválida/);
  await assert.rejects(run(r, [cli({ raio_km: 999, v: c.v })]), /0 a 500/);
  await assert.rejects(run(r, [cli({ lat: 1, lng: 1, v: c.v })], { email: 'ed@x.test', nome: 'Ed', papel: 'editor', tipo: 'equipe', empresas: [] }), /administrador/i);
  await run(r, [cli({ lat: '', lng: '', raio_km: '', endereco: '', v: c.v })]); c = await reg();
  assert.deepEqual([c.local.lat, c.local.lng, c.local.raio, c.local.endereco], [null, null, null, ''], 'apagar o ponto volta a vazio');
});

test('importar ficha: lê a tabela Campo | Valor, reconhece só o que o sistema oferece e não transforma "a confirmar" em dado', () => {
  const tabela = [
    '| Campo da ficha | Valor |', '| --- | --- |',
    '| Nome do cliente | Maria Souza (Exemplo Contabilidade) |', '| Setor | Contabilidade |', '| Tipo de negócio | Profissional liberal ou autoridade pessoal |',
    '| Segmento | Contabilidade e consultoria para empresários |', '| Cidade | A confirmar |', '| Objetivo principal | Ser referência na área |',
    '| Público-alvo | Empresários que querem crescer com responsabilidade |', '| Serviços de interesse | Autoridade e posicionamento; Redes sociais (Criativos conforme o levantamento) |',
    '| Etapa | Novo |', '| Como ele se apresenta hoje | “Consultora de empresários” |', '| Provas que já tem | 20 anos de mercado (declarado) |', '| Instagram | @exemplo |',
    '| Valor estimado | Em branco até a conversa |', '| Verba mensal de mídia | R$ 1.500,50 |', '| Campo inventado | qualquer coisa |', '| Setor de teste | x |', '| Observações | Setor regulado: conferir regras |'
  ].join('\n');
  const r = C.importarFicha(tabela), f = r.f;
  assert.equal(f.nome, 'Maria Souza (Exemplo Contabilidade)'); assert.equal(f.setor, 'contabilidade'); assert.equal(f.tipo_negocio, 'profissional'); assert.equal(f.objetivo, 'ser_referencia'); assert.equal(f.etapa, 'novo');
  assert.deepEqual(f.servicos.slice().sort(), ['autoridade', 'redes']);
  assert.equal(f.cidade, undefined, '“A confirmar” não vira cidade'); assert.ok(r.vazios.includes('Cidade') && r.vazios.includes('Valor estimado'));
  assert.equal(f.valor_estimado, undefined, '“Em branco” não vira valor'); assert.equal(f.orcamento_midia, 1500.5);
  assert.deepEqual(f.ficha, { proposta_atual: 'Consultora de empresários', prova_social: '20 anos de mercado (declarado)', instagram: '@exemplo' }, 'respostas da conversa vão para a ficha ampliada, sem as aspas');
  assert.ok(r.ignorados.includes('Campo inventado') && r.ignorados.includes('Setor de teste'), 'rótulo desconhecido é listado, não importado'); assert.ok(!r.ignorados.includes('Campo da ficha'));
  assert.equal(f.observacoes, 'Setor regulado: conferir regras');
  const inv = C.importarFicha('Setor: Astrologia\nObjetivo principal: vender tudo\nServiços de interesse: nada\nVerba mensal de mídia: muito\nPorte: Microempresa');
  assert.deepEqual(inv.invalidos.map(x => x.rotulo), ['Setor', 'Objetivo principal', 'Serviços de interesse', 'Verba mensal de mídia'], 'valor que o sistema não oferece é recusado com motivo');
  assert.equal(inv.f.setor, undefined); assert.equal(inv.f.porte, 'micro');
  const dois = C.importarFicha('Nome: Fulano\nCidade: Vitória, ES'); assert.equal(dois.f.nome, 'Fulano'); assert.equal(dois.f.cidade, 'Vitória, ES', 'linhas Campo: valor também funcionam');
  const tab = C.importarFicha('Nome do cliente\tJoão Silva\nSetor\tAgro\nObjetivo principal\tVender mais'); assert.deepEqual([tab.f.nome, tab.f.setor, tab.f.objetivo], ['João Silva', 'agro', 'vender_mais'], 'tabela colada com tabulação também funciona');
  assert.deepEqual(C.importarFicha('').reconhecidos, []);
});

test('importar sobre ficha existente: mostra antes e depois, soma serviços, mescla respostas e não mexe em etapa, histórico nem responsável', () => {
  const atual = { id: 'p-1', nome: 'Fulano', setor: 'varejo', cidade: '', etapa: 'reuniao', responsavel: 'a@x.test', servicos: ['redes'], atividades: [{ em: '2026-11-01', tipo: 'nota', texto: 'x' }], valor_estimado: 1500, ficha: { instagram: '@antigo', prova_social: 'mantida' } };
  const imp = C.importarFicha(['Nome do cliente | Fulano', 'Setor | Contabilidade', 'Cidade | Vitória', 'Etapa | Novo', 'Serviços de interesse | Redes sociais; Criativos', 'Instagram | @novo', 'Link do dossiê | https://exemplo.test/dossie', 'Próximo contato | 05/12/2026', 'Valor estimado | Em branco até a conversa', 'Dor principal | A confirmar'].join('\n'));
  assert.equal(imp.f.proximo_contato, '2026-12-05', 'data em DD/MM/AAAA vira AAAA-MM-DD'); assert.equal(imp.f.ficha.dossie, 'https://exemplo.test/dossie');
  const dif = C.compararFicha(atual, imp.f), campos = dif.map(d => d.campo);
  assert.deepEqual(campos.sort(), ['cidade', 'ficha.dossie', 'ficha.instagram', 'proximo_contato', 'servicos', 'setor'].sort(), 'só o que realmente muda; nome igual, etapa e valor em branco ficam de fora');
  assert.deepEqual(dif.find(d => d.campo === 'setor'), { campo: 'setor', rotulo: 'Setor', antes: SV_NAME('varejo'), depois: SV_NAME('contabilidade') });
  assert.equal(dif.find(d => d.campo === 'servicos').depois, 'Redes sociais, Criativos e design', 'serviços novos são somados, nunca removidos');
  assert.deepEqual([dif.find(d => d.campo === 'ficha.instagram').antes, dif.find(d => d.campo === 'ficha.instagram').depois], ['@antigo', '@novo']);
  const novo = C.aplicarImportacao(atual, imp.f);
  assert.deepEqual([novo.etapa, novo.responsavel, novo.valor_estimado, novo.atividades.length, novo.id], ['reuniao', 'a@x.test', 1500, 1, 'p-1'], 'etapa, responsável, valor, histórico e id ficam como estavam');
  assert.deepEqual([novo.setor, novo.cidade, novo.servicos, novo.proximo_contato], ['contabilidade', 'Vitória', ['redes', 'criativos'], '2026-12-05']);
  assert.deepEqual(novo.ficha, { instagram: '@novo', prova_social: 'mantida', dossie: 'https://exemplo.test/dossie' }, 'respostas novas entram e as que não vieram ficam');
  assert.equal(atual.setor, 'varejo', 'não altera a ficha original');
  assert.deepEqual(C.compararFicha(novo, imp.f), [], 'importar duas vezes o mesmo texto não muda mais nada');
  assert.equal(C.importarFicha('Próximo contato | 31/02/2026').invalidos.length, 1, 'data impossível é recusada');
});
function SV_NAME(k) { return globalThis.N7Services.SECTORS[k]; }
