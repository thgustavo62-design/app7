// Central de Promoções: armazenamento (base por loja, mesclagem de vendas por dia, campanhas) e acesso.
const test = require('node:test');
const assert = require('node:assert/strict');
delete process.env.VERCEL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const { Repo, MemoryDriver, SheetsDriver, Conflict } = require('../lib/repo');
const P = require('../lib/promo-store');
const { BadRequest, Forbidden } = require('../lib/model');

const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const seeded = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));
const fresh = repo => new Repo(repo.d);
const est = (b, o = {}) => Object.assign({ barras: b, desc: 'PRODUTO ' + b, estoque: 10, preco: 20, custo: 12 }, o);
const vendas = (inicio, fim, prod) => ({ produtos: prod, inicio, fim, arquivo: 'analitico.pdf', linhas: 10, candidatas: 10 });

test('acesso: só quem tem o serviço Promoções e preços; usuário cliente não entra; leitura não grava', async () => {
  const r = seeded();
  assert.deepEqual((await P.lojasDo(r, admin)).map(c => c.key), ['M', 'F'], 'as duas farmácias migradas têm o serviço');
  assert.deepEqual((await P.lojasDo(r, { ...admin, empresas: ['F'] })).map(c => c.key), ['F'], 'equipe restrita só vê a sua');
  await assert.rejects(P.needLoja(r, admin, 'C'), /não tem o serviço/);
  await assert.rejects(P.needLoja(r, { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['M'] }, 'M'), /cliente não acessam/);
  await assert.rejects(P.needLoja(r, { ...admin, empresas: ['F'] }, 'M'), /não tem o serviço|acesso/);
  assert.equal(P.canWrite({ ...admin, papel: 'leitura' }), false); assert.equal(P.canWrite({ ...admin, papel: 'editor' }), true);
});
test('estoque: cria e atualiza por barras, mantém as vendas, e o que sumiu da lista fica com estoque 0', async () => {
  const r = seeded();
  const a = await P.importEstoque(r, admin, 'M', { items: [est('7890000000011'), est('7890000000028', { custo: null, estoque: 3 })], arquivo: 'estoque.xlsx' });
  assert.deepEqual([a.produtos, a.foraDaLista], [2, 0]);
  let d = await P.load(fresh(r), 'M'); assert.equal(d.items.length, 2); assert.equal(d.items.find(i => i.barras === '7890000000028').custo, null, 'sem custo continua sem custo');
  await P.importVendas(fresh(r), admin, 'M', vendas('2026-11-01', '2026-11-08', { '7890000000011': { desc: 'PRODUTO 1', dias: { '2026-11-02': [3, 60] } } }));
  const b = await P.importEstoque(fresh(r), admin, 'M', { items: [est('7890000000011', { estoque: 4, preco: 22 })], arquivo: 'estoque2.xlsx' });
  assert.equal(b.foraDaLista, 1);
  d = await P.load(fresh(r), 'M'); const um = d.items.find(i => i.barras === '7890000000011'), dois = d.items.find(i => i.barras === '7890000000028');
  assert.equal(um.estoque, 4); assert.equal(um.preco, 22); assert.deepEqual(um.dias, { '2026-11-02': [3, 60] }, 'a atualização do estoque não apaga as vendas'); assert.equal(dois.estoque, 0);
  assert.equal(d.importacoes.filter(x => x.tipo === 'estoque').length, 2); assert.ok(d.estoqueEm);
  await assert.rejects(P.importEstoque(fresh(r), admin, 'M', { items: [est('abc')] }), /Código de barras inválido/);
  await assert.rejects(P.importEstoque(fresh(r), admin, 'M', { items: [] }), /Nenhum produto/);
});
test('vendas: um relatório novo substitui os dias que cobre e mantém os outros (nunca conta duas vezes); produto novo entra só com vendas', async () => {
  const r = seeded();
  await P.importEstoque(r, admin, 'F', { items: [est('7890000000011')], arquivo: 'e.xlsx' });
  const rel1 = vendas('2026-10-01', '2026-10-31', { '7890000000011': { desc: 'P1', dias: { '2026-10-05': [2, 40], '2026-10-20': [1, 20] } }, '7890000000099': { desc: 'SO VENDA', dias: { '2026-10-06': [5, 50] } } });
  await P.importVendas(fresh(r), admin, 'F', rel1);
  await P.importVendas(fresh(r), admin, 'F', rel1);                                          /* mesmo relatório de novo */
  let d = await P.load(fresh(r), 'F'), p1 = d.items.find(i => i.barras === '7890000000011'), novo = d.items.find(i => i.barras === '7890000000099');
  assert.deepEqual(p1.dias, { '2026-10-05': [2, 40], '2026-10-20': [1, 20] }, 'repetir o relatório não dobra'); assert.equal(novo.estoqueConhecido, false); assert.deepEqual(novo.dias, { '2026-10-06': [5, 50] });
  await P.importVendas(fresh(r), admin, 'F', vendas('2026-10-15', '2026-11-08', { '7890000000011': { desc: 'P1', dias: { '2026-10-20': [4, 80], '2026-11-03': [1, 20], '2026-09-01': [9, 9] } } }));
  d = await P.load(fresh(r), 'F'); p1 = d.items.find(i => i.barras === '7890000000011');
  assert.deepEqual(p1.dias, { '2026-10-05': [2, 40], '2026-10-20': [4, 80], '2026-11-03': [1, 20] }, 'dias de 15/10 em diante foram trocados; 05/10 ficou; dia fora do período do relatório foi ignorado');
  assert.deepEqual(d.items.find(i => i.barras === '7890000000099').dias, { '2026-10-06': [5, 50] }, 'o outro produto não tinha venda a partir de 15/10 e não mudou');
  assert.deepEqual(d.cobertura, { inicio: '2026-10-05', fim: '2026-11-03' });
  assert.equal((await P.load(fresh(r), 'M')).items.length, 0, 'as lojas nunca se misturam');
  await assert.rejects(P.importVendas(fresh(r), admin, 'F', { produtos: {}, inicio: '2026-10-01', fim: '2026-10-02' }), /Nenhuma venda/);
  await assert.rejects(P.importVendas(fresh(r), admin, 'F', vendas('2026-11-05', '2026-11-01', { '7890000000011': { desc: 'x', dias: {} } })), /Período/);
});
test('vendas: histórico muito antigo é descartado (200 dias) e a codificação ida e volta preserva os valores', async () => {
  const dias = { '2026-01-02': [1, 2.5], '2026-11-03': [-1, -20] };
  assert.deepEqual(P.decodeVendas(P.encodeVendas(dias)), dias); assert.equal(P.encodeVendas(dias, '2026-05-01'), '261103:-1:-20');
  const r = seeded();
  await P.importVendas(r, admin, 'M', vendas('2026-01-01', '2026-01-31', { '7890000000011': { desc: 'P1', dias: { '2026-01-02': [1, 10] } } }));
  await P.importVendas(fresh(r), admin, 'M', vendas('2026-11-01', '2026-11-08', { '7890000000011': { desc: 'P1', dias: { '2026-11-03': [2, 20] } } }));
  assert.deepEqual((await P.load(fresh(r), 'M')).items[0].dias, { '2026-11-03': [2, 20] }, 'janeiro ficou mais de 200 dias para trás');
});
test('campanhas: salvar, atualizar com versão, conflito, apagar e validar', async () => {
  const r = seeded();
  await P.importEstoque(r, admin, 'F', { items: [est('7890000000011')], arquivo: 'estoque.xlsx' });
  const itens = [{ b: '7890000000011', d: 'PRODUTO 1', cat: 'Bebê', de: 20, por: 15.9, c: 12, papel: 'giro' }];
  const a = await P.saveCampaign(r, admin, 'F', { nome: 'Atacadão do Bebê', tipo: 'Atacadão do Bebê', regra: 'padrao', inicio: '2026-11-19', fim: '2026-11-20', itens, totais: { itens: 1 } });
  assert.match(a.id, /^cp-/); assert.equal(a.v, '1');
  let d = await P.load(fresh(r), 'F'); assert.equal(d.campanhas.length, 1); assert.equal(d.campanhas[0].itens[0].por, 15.9); assert.equal(d.campanhas[0].status, 'rascunho');
  const b = await P.saveCampaign(fresh(r), admin, 'F', { id: a.id, v: a.v, nome: 'Atacadão do Bebê', tipo: 'Atacadão do Bebê', status: 'aprovada', itens });
  assert.equal(b.v, '2');
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'F', { id: a.id, v: '1', nome: 'x', itens }), Conflict);
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'M', { id: a.id, v: '2', nome: 'x', itens }), /outra loja/);
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'F', { nome: '', itens }), /nome/i);
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'F', { nome: 'x', inicio: '2026-11-20', fim: '2026-11-19', itens }), /fim da campanha/);
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'F', { nome: 'x', itens: [{ b: '1', por: 1 }] }), /barras/);
  await assert.rejects(P.deleteCampaign(fresh(r), admin, 'M', a.id), /outra loja/);
  await P.deleteCampaign(fresh(r), admin, 'F', a.id); assert.equal((await P.load(fresh(r), 'F')).campanhas.length, 0);
});
test('planilha: a troca da base grava em blocos de 1000 linhas e limpa o que havia antes', async () => {
  const calls = [];
  const client = { clear: async r => calls.push(['clear', r]), update: async (r, rows) => calls.push(['update', r, rows.length]), append: async () => {}, batchGet: async ranges => ({ valueRanges: ranges.map(() => ({ values: [['loja', 'barras', 'descricao', 'estoque', 'preco', 'custo', 'promo_sistema', 'aprox', 'ult_entrada', 'fiscal', 'vendas', 'estoque_em', 'atualizado_em'], ['M', '1', 'x', '1', '1', '1', '', '', '', '', '', '', '']] })) }) };
  const repo = new Repo(new SheetsDriver(client)), obj = i => ({ loja: 'M', barras: String(7890000000000 + i), descricao: 'P', estoque: '1' });
  await repo.replaceAll('PromoBase', Array.from({ length: 2300 }, (_, i) => obj(i)));
  assert.deepEqual(calls[0], ['clear', 'PromoBase!A2:M2']);
  assert.deepEqual(calls.filter(c => c[0] === 'update').map(c => [c[1], c[2]]), [['PromoBase!A2:M1001', 1000], ['PromoBase!A1002:M2001', 1000], ['PromoBase!A2002:M2301', 300]]);
  assert.equal((await repo.rows('PromoBase')).length, 2300, 'a cópia em memória acompanha');
});

const regUsers = async list => require('../lib/model').applyOps(require('../lib/db').getRepo(), list.map(u => Object.assign({ t: 'user', op: 'upsert' }, u)), { email: 'dev@agencia.test', papel: 'admin', tipo: 'equipe', empresas: [] });   /* as rotas conferem o cadastro: o usuário do cookie precisa existir na planilha */
test('rota /api/promo: lista lojas, importa um pacote grande (mais de 200 KB), recusa cliente e leitura', async () => {
  const db = require('../lib/db'), session = require('../lib/session'), { cfg } = require('../lib/config');
  db._resetMemory();
  await regUsers([{ email: 'l@x.com', nome: 'L', tipo: 'equipe', papel: 'leitura', empresas: [] }, { email: 'c@x.com', nome: 'C', tipo: 'cliente', empresas: ['M'] }]);
  const { createServer } = require('../dev-server'); const srv = createServer(); await new Promise(rs => srv.listen(0, rs));
  const base = 'http://localhost:' + srv.address().port, ck = u => 'n7_session=' + encodeURIComponent(session.create(u, cfg().sessionSecret, 600));
  const call = async (p, cookie, body) => { const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-n7': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => null) }; };
  try {
    const adm = ck({ ...admin, email: 'dev@local' }), lei = ck({ email: 'l@x.com', nome: 'L', papel: 'leitura', tipo: 'equipe', empresas: [] }), cli = ck({ email: 'c@x.com', nome: 'C', papel: 'cliente', tipo: 'cliente', empresas: ['M'] });
    assert.equal((await call('/api/promo')).status, 401);
    const l = await call('/api/promo', adm); assert.deepEqual(l.json.lojas.map(x => x.key), ['M', 'F']);
    const itens = Array.from({ length: 2500 }, (_, i) => ({ barras: String(7890000000000 + i), desc: 'PRODUTO NUMERO ' + i + ' COM DESCRICAO LONGA PARA ENGORDAR O PACOTE', estoque: 5, preco: 19.9, custo: 11.5 }));
    assert.ok(JSON.stringify(itens).length > 200000, 'pacote maior que o limite padrão');
    const imp = await call('/api/promo', adm, { action: 'estoque', loja: 'M', items: itens, arquivo: 'estoque.xlsx' }); assert.equal(imp.status, 200); assert.equal(imp.json.produtos, 2500);
    const d = await call('/api/promo?loja=M', adm); assert.equal(d.json.items.length, 2500); assert.equal(d.json.podeEditar, true);
    assert.equal((await call('/api/promo?loja=F', adm)).json.items.length, 0, 'a outra loja segue vazia');
    assert.equal((await call('/api/promo?loja=M', lei)).status, 200); assert.equal((await call('/api/promo?loja=M', lei)).json.podeEditar, false);
    assert.equal((await call('/api/promo', lei, { action: 'estoque', loja: 'M', items: itens.slice(0, 1) })).status, 403, 'leitura não importa');
    assert.equal((await call('/api/promo?loja=M', cli)).status, 403); assert.equal((await call('/api/promo?loja=C', adm)).status, 403, 'empresa sem o serviço');
    assert.equal((await call('/api/promo', adm, { action: 'nada', loja: 'M' })).status, 400);
  } finally { srv.close(); db._resetMemory(); }
});

test('campanha aprovada ou publicada: o servidor confere piso, custo, estoque e terminação com a base de agora e registra quem aprovou', async () => {
  const r = seeded(), ok = { nome: 'Limpeza', tipo: 'Limpeza', regra: 'padrao', inicio: '2026-11-21', fim: '2026-11-23' };
  await P.importEstoque(r, admin, 'F', { items: [est('7890000000011'), est('7890000000028', { custo: null }), est('7890000000035', { estoque: 0 })], arquivo: 'e.xlsx' });
  const it = (b, o = {}) => ({ b, d: 'P ' + b, cat: 'Limpeza', de: 20, por: 15.9, c: 12, papel: 'giro', ...o });
  const tenta = (itens, status = 'aprovada', extra = {}) => P.saveCampaign(fresh(r), admin, 'F', { ...ok, itens, status, ...extra });
  await assert.rejects(tenta([it('7890000000011', { por: 14.9 })]), /abaixo do piso 15\.00/);
  await assert.rejects(tenta([it('7890000000011', { por: 16 })]), /não termina em ,90/);
  await assert.rejects(tenta([it('7890000000011', { por: 20.9 })]), /não é menor que o preço de venda/);
  await assert.rejects(tenta([it('7890000000028')]), /sem custo/);
  await assert.rejects(tenta([it('7890000000035')]), /sem estoque/);
  await assert.rejects(tenta([it('7890000000099')]), /não está na base desta loja/);
  await assert.rejects(tenta([it('7890000000011', { c: 10 })]), /o custo mudou/);
  await assert.rejects(tenta([]), /não tem itens/);
  await assert.rejects(tenta([it('7890000000011')], 'publicada'), /aprove primeiro/, 'campanha nova não nasce publicada');
  const rasc = await tenta([it('7890000000028')], 'rascunho'); assert.ok(rasc.id, 'rascunho aceita item sem custo (só não aprova)');
  const ap = await tenta([it('7890000000011')], 'aprovada', { totais: { aprovacao: { por: 'falso@x.com' } } });
  let c = (await P.load(fresh(r), 'F')).campanhas.find(x => x.id === ap.id);
  assert.equal(c.totais.aprovacao.por, 'dev@agencia.test', 'o registro de aprovação é do servidor'); assert.ok(c.totais.aprovacao.em);
  const pub = await P.saveCampaign(fresh(r), admin, 'F', { ...ok, id: ap.id, v: ap.v, itens: [it('7890000000011')], status: 'publicada' });
  c = (await P.load(fresh(r), 'F')).campanhas.find(x => x.id === ap.id); assert.equal(c.status, 'publicada'); assert.equal(c.totais.aprovacao.por, 'dev@agencia.test');
  /* a base mudou depois da aprovação: custo subiu, o preço aprovado já não respeita o piso e a publicação é barrada */
  await P.importEstoque(r, admin, 'F', { items: [est('7890000000011', { custo: 14 })], arquivo: 'e2.xlsx' });
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'F', { ...ok, id: ap.id, v: pub.v, itens: [it('7890000000011', { c: 14 })], status: 'publicada' }), /abaixo do piso 17\.50/);
  /* uma campanha de outra loja nunca é validada com a base da primeira */
  await assert.rejects(P.saveCampaign(fresh(r), admin, 'M', { ...ok, itens: [it('7890000000011')], status: 'aprovada' }), /não está na base desta loja/);
});
test('vendas: leitura abaixo de 99,9% (ou sem a conferência) não grava nem substitui nada', async () => {
  const r = seeded(), prod = { '7890000000011': { desc: 'P1', dias: { '2026-11-03': [2, 20] } } };
  await P.importVendas(r, admin, 'M', { produtos: prod, inicio: '2026-11-01', fim: '2026-11-08', arquivo: 'a.pdf', linhas: 1000, candidatas: 1000 });
  const novo = { '7890000000011': { desc: 'P1', dias: { '2026-11-03': [99, 999] } } };
  await assert.rejects(P.importVendas(fresh(r), admin, 'M', { produtos: novo, inicio: '2026-11-01', fim: '2026-11-08', arquivo: 'b.pdf', linhas: 997, candidatas: 1000 }), /Leitura incompleta: 997 de 1000/);
  await assert.rejects(P.importVendas(fresh(r), admin, 'M', { produtos: novo, inicio: '2026-11-01', fim: '2026-11-08', arquivo: 'b.pdf', linhas: 10 }), /sem a conferência/);
  assert.deepEqual((await P.load(fresh(r), 'M')).items[0].dias, { '2026-11-03': [2, 20] }, 'as vendas anteriores continuam intactas');
  await P.importVendas(fresh(r), admin, 'M', { produtos: novo, inicio: '2026-11-01', fim: '2026-11-08', arquivo: 'c.pdf', linhas: 999, candidatas: 1000 });
  assert.deepEqual((await P.load(fresh(r), 'M')).items[0].dias, { '2026-11-03': [99, 999] }, '99,9% exato passa');
  const d = await P.load(fresh(r), 'M'); assert.deepEqual(d.intervalos, [['2026-11-01', '2026-11-08', ''], ['2026-11-01', '2026-11-08', '']], 'os intervalos cobertos vêm do registro de importações');
});
