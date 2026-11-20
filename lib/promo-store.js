/* Central de Promoções: o que fica guardado na planilha-banco.
   PromoBase: uma linha por produto e loja (estoque, preço, custo e as vendas dia a dia numa só célula).
   PromoImportacoes: o que foi importado, de quando a quando. PromoCampanhas: campanhas montadas (itens e totais em JSON).
   Cada importação reescreve a aba de uma vez (poucas chamadas ao Google). As vendas são mescladas por DIA: um relatório novo
   substitui os dias que cobre e mantém os demais, então a mesma venda nunca é contada duas vezes. */
const crypto = require('crypto');
const { BadRequest, Forbidden, activeClients } = require('./model');
const { can, isClient } = require('./scope');
const SV = require('../public/assets/js/services.js') && globalThis.N7Services;
require('../public/assets/js/promo.js');                                   /* regras de piso e margem: as mesmas da tela */
const PR = globalThis.N7Promo;

const KEEP_DAYS = 200;                         /* quanto histórico de vendas diárias fica guardado */
const MAX_ITEMS = 20000, MAX_CAMP_ITEMS = 400;
const REGRAS = ['padrao', 'limpeza', 'corta', 'queima'];
const STATUS = ['rascunho', 'aprovada', 'publicada', 'encerrada'];
const MIN_LEITURA = 0.999;
const day = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const isoOf = n => new Date(n * 86400000).toISOString().slice(0, 10);
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && isoOf(day(String(s))) === String(s);
const num = (v, what, { min = 0, max = 1e9, nullable = true } = {}) => {
  if (v === '' || v == null) { if (nullable) return null; throw new BadRequest(`${what} é obrigatório`); }
  const n = Number(v); if (!isFinite(n) || n < min || n > max) throw new BadRequest(`${what} inválido`);
  return Math.round(n * 10000) / 10000;
};
const txt = (v, max, what) => { const s = String(v ?? '').trim(); if (s.length > max) throw new BadRequest(`${what} passa de ${max} caracteres`); return s; };
const barrasOk = v => { const s = String(v ?? ''); if (!/^\d{6,14}$/.test(s)) throw new BadRequest(`Código de barras inválido: ${s.slice(0, 20)}`); return s; };

/* vendas de um produto: "AAMMDD:qtd:valor;AAMMDD:qtd:valor" */
const encDay = iso => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const decDay = s => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
function decodeVendas(str) {
  const out = {}; String(str || '').split(';').forEach(p => { const [d, q, v] = p.split(':'); if (/^\d{6}$/.test(d) && q !== undefined) out[decDay(d)] = [Number(q), Number(v || 0)]; });
  return out;
}
function encodeVendas(dias, minDay) {
  return Object.keys(dias || {}).filter(d => !minDay || d >= minDay).sort().map(d => `${encDay(d)}:${dias[d][0]}:${Math.round(dias[d][1] * 100) / 100}`).join(';');
}
const numOrNull = s => (s === '' || s == null ? null : (isFinite(Number(s)) ? Number(s) : null));
const rowToItem = r => ({ barras: r.barras, desc: r.descricao, estoque: numOrNull(r.estoque) ?? 0, estoqueConhecido: r.estoque !== '', preco: numOrNull(r.preco), custo: numOrNull(r.custo) || null, promoSistema: numOrNull(r.promo_sistema), aprox: numOrNull(r.aprox), ultEntrada: r.ult_entrada, fiscal: r.fiscal, dias: decodeVendas(r.vendas) });

/* lojas que o usuário pode abrir: empresas ativas com o serviço "promocoes" */
async function lojasDo(repo, user) {
  const clients = await activeClients(repo);
  return clients.filter(c => (c.services || []).includes('promocoes') && can(user, c.key));
}
async function needLoja(repo, user, loja) {
  if (!user || isClient(user)) throw new Forbidden('Usuários cliente não acessam a Central de Promoções');
  const ok = (await lojasDo(repo, user)).find(c => c.key === loja);
  if (!ok) throw new Forbidden('Esta empresa não tem o serviço Promoções e preços, ou você não tem acesso a ela.');
  return ok;
}
const canWrite = u => u && !isClient(u) && (u.papel === 'admin' || u.papel === 'editor');

async function load(repo, loja) {
  await repo.load(['PromoBase', 'PromoImportacoes', 'PromoCampanhas']);
  const items = repo.cache.PromoBase.rows.filter(r => r.loja === loja).map(rowToItem);
  const importacoes = repo.cache.PromoImportacoes.rows.filter(r => r.loja === loja).map(r => ({ id: r.id, tipo: r.tipo, inicio: r.inicio, fim: r.fim, linhas: Number(r.linhas) || 0, arquivo: r.arquivo, diaDescartado: r.dia_descartado, por: r.por, em: r.em })).sort((a, b) => b.em.localeCompare(a.em));
  const campanhas = repo.cache.PromoCampanhas.rows.filter(r => r.loja === loja).map(campFromRow).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const ds = items.flatMap(i => Object.keys(i.dias)).sort();
  /* intervalos que os relatórios de vendas realmente cobriram (menos o dia cortado): a cobertura não presume que o meio do período está completo */
  const intervalos = importacoes.filter(i => i.tipo === 'vendas' && i.inicio && i.fim).map(i => [i.inicio, i.fim, i.diaDescartado || '']);
  return { items, importacoes, campanhas, intervalos, cobertura: ds.length ? { inicio: ds[0], fim: ds[ds.length - 1] } : null, estoqueEm: (repo.cache.PromoBase.rows.find(r => r.loja === loja && r.estoque_em) || {}).estoque_em || '' };
}
const parseJson = (s, fb) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : fb; } catch (e) { return fb; } };
const campFromRow = r => ({ id: r.id, nome: r.nome, tipo: r.tipo, regra: r.regra, inicio: r.inicio, fim: r.fim, status: r.status, itens: parseJson(r.itens_json, []), totais: parseJson(r.totais_json, {}), v: r.versao, criadoPor: r.criado_por, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em });

async function log(repo, user, o) {
  await repo.append('PromoImportacoes', { id: 'imp-' + crypto.randomBytes(5).toString('hex'), loja: o.loja, tipo: o.tipo, inicio: o.inicio || '', fim: o.fim || '', linhas: String(o.linhas), arquivo: txt(o.arquivo, 120, 'Arquivo'), dia_descartado: o.dia || '', por: (user && user.email) || '', em: new Date().toISOString() }, { user });
}

/* exportação de estoque: traz a lista completa de produtos da loja; o que não está nela passa a ter estoque 0 */
async function importEstoque(repo, user, loja, body, now = new Date()) {
  const itens = Array.isArray(body.items) ? body.items : null;
  if (!itens || !itens.length) throw new BadRequest('Nenhum produto no arquivo de estoque');
  if (itens.length > MAX_ITEMS) throw new BadRequest(`Produtos demais (${MAX_ITEMS} no máximo)`);
  await repo.load(['PromoBase']);
  const at = now.toISOString(), hoje = at.slice(0, 10);
  const rows = repo.cache.PromoBase.rows.map(r => Object.assign({}, r)), mine = new Map(); rows.forEach(r => { if (r.loja === loja) mine.set(r.barras, r); });
  const seen = new Set();
  itens.forEach(it => {
    const b = barrasOk(it.barras); if (seen.has(b)) return; seen.add(b);
    const f = { loja, barras: b, descricao: txt(it.desc, 120, 'Descrição'), estoque: String(num(it.estoque, 'Estoque', { min: -1e6 }) ?? 0), preco: String(num(it.preco, 'Preço') ?? ''), custo: it.custo ? String(num(it.custo, 'Custo')) : '',
      promo_sistema: it.promoSistema ? String(num(it.promoSistema, 'Preço de promoção')) : '', aprox: it.aprox ? String(num(it.aprox, 'Valor aproximado')) : '', ult_entrada: okDate(it.ultEntrada) ? it.ultEntrada : '', fiscal: txt(it.fiscal, 6, 'Fiscal'), estoque_em: hoje, atualizado_em: at };
    const old = mine.get(b);
    if (old) Object.assign(old, f); else { const n = Object.assign({ vendas: '' }, f); rows.push(n); mine.set(b, n); }
  });
  let tirados = 0;
  mine.forEach((r, b) => { if (!seen.has(b) && r.estoque !== '0') { r.estoque = '0'; r.estoque_em = hoje; r.atualizado_em = at; tirados++; } });
  await repo.replaceAll('PromoBase', rows);
  await log(repo, user, { loja, tipo: 'estoque', linhas: seen.size, arquivo: body.arquivo });
  return { produtos: seen.size, foraDaLista: tirados };
}

/* vendas: { produtos: { barras: { desc, dias: { "AAAA-MM-DD": [qtd, valor] } } }, inicio, fim, diaDescartado } */
async function importVendas(repo, user, loja, body, now = new Date()) {
  const prod = body.produtos && typeof body.produtos === 'object' ? body.produtos : null, keys = prod ? Object.keys(prod) : [];
  if (!keys.length) throw new BadRequest('Nenhuma venda no relatório');
  if (keys.length > MAX_ITEMS) throw new BadRequest(`Produtos demais (${MAX_ITEMS} no máximo)`);
  if (!okDate(body.inicio) || !okDate(body.fim) || body.fim < body.inicio) throw new BadRequest('Período do relatório inválido');
  if (day(body.fim) - day(body.inicio) > 400) throw new BadRequest('Período grande demais (400 dias no máximo)');
  /* leitura incompleta não substitui vendas: a conferência (linhas lidas contra linhas do relatório) vem junto e precisa ser de 99,9% ou mais */
  const cand = Number(body.candidatas), lidas = Number(body.linhas);
  if (!(cand > 0) || !(lidas >= 0)) throw new BadRequest('Relatório sem a conferência de leitura (linhas lidas e linhas do relatório). Recarregue a página e importe de novo.');
  if (lidas / cand < MIN_LEITURA) throw new BadRequest(`Leitura incompleta: ${lidas} de ${cand} linhas (${(lidas / cand * 100).toFixed(2).replace('.', ',')}%). O mínimo é 99,9%: nada foi gravado. Emita o relatório de novo (se passou de 1 MB, dia a dia).`);
  await repo.load(['PromoBase']);
  const at = now.toISOString(), rows = repo.cache.PromoBase.rows.map(r => Object.assign({}, r)), mine = new Map(); rows.forEach(r => { if (r.loja === loja) mine.set(r.barras, r); });
  const maxFim = (() => { const ds = rows.filter(r => r.loja === loja).flatMap(r => Object.keys(decodeVendas(r.vendas))); return ds.length ? ds.sort().pop() : ''; })();
  const topo = maxFim > body.fim ? maxFim : body.fim, corte = isoOf(day(topo) - KEEP_DAYS);
  const incoming = new Map();
  keys.forEach(k => {
    const b = barrasOk(k), p = prod[k], dias = {};
    Object.entries(p.dias || {}).forEach(([d, qv]) => {
      if (!okDate(d)) throw new BadRequest(`Data inválida em ${b}`);
      if (d < body.inicio || d > body.fim) return;                     /* só os dias que o relatório cobre */
      dias[d] = [num(qv[0], 'Quantidade', { min: -1e6 }) ?? 0, num(qv[1], 'Valor', { min: -1e9 }) ?? 0];
    });
    incoming.set(b, { desc: txt(p.desc, 120, 'Descrição'), dias });
  });
  const ini = body.inicio, fim = body.fim;
  mine.forEach((r, b) => {                                              /* limpa os dias cobertos pelo relatório novo */
    const dias = decodeVendas(r.vendas); let mudou = false;
    Object.keys(dias).forEach(d => { if (d >= ini && d <= fim) { delete dias[d]; mudou = true; } });
    if (incoming.has(b)) { Object.assign(dias, incoming.get(b).dias); mudou = true; }
    if (mudou) { r.vendas = encodeVendas(dias, corte); r.atualizado_em = at; }
  });
  incoming.forEach((p, b) => {
    if (mine.has(b)) return;
    const n = { loja, barras: b, descricao: p.desc, estoque: '', preco: '', custo: '', promo_sistema: '', aprox: '', ult_entrada: '', fiscal: '', vendas: encodeVendas(p.dias, corte), estoque_em: '', atualizado_em: at };
    rows.push(n); mine.set(b, n);
  });
  mine.forEach(r => { if (r.vendas) { const d = decodeVendas(r.vendas); if (!Object.keys(d).length) r.vendas = ''; } });
  await repo.replaceAll('PromoBase', rows);
  await log(repo, user, { loja, tipo: 'vendas', inicio: ini, fim, linhas: Number(body.linhas) || keys.length, arquivo: body.arquivo, dia: okDate(body.diaDescartado) ? body.diaDescartado : '' });
  return { produtos: incoming.size, inicio: ini, fim };
}

/* campanhas */
function campaignFromBody(body) {
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (itens.length > MAX_CAMP_ITEMS) throw new BadRequest(`Itens demais na campanha (${MAX_CAMP_ITEMS} no máximo)`);
  if (body.inicio && !okDate(body.inicio)) throw new BadRequest('Data de início inválida');
  if (body.fim && !okDate(body.fim)) throw new BadRequest('Data de fim inválida');
  if (body.inicio && body.fim && body.fim < body.inicio) throw new BadRequest('O fim da campanha vem antes do início');
  const clean = itens.map(i => ({ b: barrasOk(i.b), d: txt(i.d, 120, 'Descrição'), cat: txt(i.cat, 40, 'Categoria'), de: num(i.de, 'Preço DE'), por: num(i.por, 'Preço POR', { nullable: false }), c: num(i.c, 'Custo'), papel: txt(i.papel, 20, 'Papel') }));
  const obj = { nome: txt(body.nome, 80, 'Nome'), tipo: txt(body.tipo, 60, 'Tipo'), regra: REGRAS.includes(body.regra) ? body.regra : 'padrao', inicio: body.inicio || '', fim: body.fim || '', status: STATUS.includes(body.status) ? body.status : 'rascunho', itens_json: JSON.stringify(clean), totais_json: JSON.stringify(body.totais && typeof body.totais === 'object' ? body.totais : {}) };
  if (!obj.nome) throw new BadRequest('Dê um nome à campanha');
  if (obj.itens_json.length > 45000) throw new BadRequest('Campanha grande demais');
  return obj;
}
/* Conferência no servidor: campanha aprovada ou publicada precisa passar pelas mesmas regras da tela, com o estoque e o custo
   de agora (a tela pode estar com uma base velha). Nenhum preço fura o piso, tem custo conhecido, estoque e termina em ,90. */
function checkApproval(rows, loja, obj, itens, regraId) {
  const regra = PR.REGRAS[regraId] || PR.REGRAS.padrao, base = new Map(rows.filter(r => r.loja === loja).map(r => [r.barras, r])), erros = [];
  if (!itens.length) erros.push('a campanha não tem itens');
  itens.forEach(i => {
    const r = base.get(i.b), nome = `${i.d || i.b}`;
    if (!r) { erros.push(`${nome}: produto não está na base desta loja`); return; }
    const custo = numOrNull(r.custo), estoque = numOrNull(r.estoque);
    if (!(estoque > 0)) erros.push(`${nome}: sem estoque na base atual`);
    if (!(custo > 0)) { erros.push(`${nome}: sem custo (sem custo não existe piso)`); return; }
    if (i.c != null && Math.abs(i.c - custo) > 0.005) erros.push(`${nome}: o custo mudou (campanha ${i.c}, base ${custo}): reabra a campanha`);
    const piso = custo / (1 - regra.margemMin);
    if (!(i.por > 0)) erros.push(`${nome}: sem preço POR`);
    else {
      if (i.por < piso - 0.005) erros.push(`${nome}: POR ${i.por.toFixed(2)} abaixo do piso ${piso.toFixed(2)}`);
      if (Math.round(i.por * 100) % 100 !== 90) erros.push(`${nome}: o preço POR não termina em ,90`);
      const lista = numOrNull(r.preco); if (lista > 0 && i.por >= lista - 0.005) erros.push(`${nome}: POR não é menor que o preço de venda atual`);
    }
  });
  if (erros.length) throw new BadRequest(`Campanha não pode ser ${obj.status === 'publicada' ? 'publicada' : 'aprovada'}: ${erros.slice(0, 5).join('; ')}${erros.length > 5 ? ` (e mais ${erros.length - 5})` : ''}.`);
}
async function saveCampaign(repo, user, loja, body, now = new Date()) {
  const obj = Object.assign(campaignFromBody(body), { loja });
  await repo.load(['PromoCampanhas', 'PromoBase']);
  const totais = parseJson(obj.totais_json, {}); delete totais.aprovacao;           /* o registro de aprovação é do servidor, nunca vem do navegador */
  const passos = { rascunho: 0, aprovada: 1, publicada: 2, encerrada: 3 };
  if (obj.status === 'aprovada' || obj.status === 'publicada') checkApproval(repo.cache.PromoBase.rows, loja, obj, JSON.parse(obj.itens_json), obj.regra);
  const reg = body.id ? repo.cache.PromoCampanhas.rows.find(r => r.id === String(body.id)) : null;
  if (obj.status === 'publicada' && !(reg && (reg.status === 'aprovada' || reg.status === 'publicada'))) throw new BadRequest('Só uma campanha já aprovada pode ser publicada: aprove primeiro.');
  if (obj.status === 'aprovada' || obj.status === 'publicada') {
    const ant = reg ? parseJson(reg.totais_json, {}).aprovacao : null, estoqueEm = (repo.cache.PromoBase.rows.find(r => r.loja === loja && r.estoque_em) || {}).estoque_em || '';
    totais.aprovacao = ant && reg.status !== 'rascunho' && reg.itens_json === obj.itens_json ? ant : { por: user.email, em: now.toISOString(), estoqueEm, itens: JSON.parse(obj.itens_json).length };
  }
  obj.totais_json = JSON.stringify(totais);
  if (body.id) {
    const id = String(body.id); if (!/^cp-[a-z0-9]{6,20}$/.test(id)) throw new BadRequest('Campanha inválida');
    const hit = repo.cache.PromoCampanhas.rows.find(r => r.id === id);
    if (hit && hit.loja !== loja) throw new Forbidden('Esta campanha é de outra loja');
    const full = await repo.upsert('PromoCampanhas', Object.assign({ id }, obj), { baseV: body.v, user });
    return { id, v: full.versao };
  }
  if (obj.status === 'publicada') throw new BadRequest('Só uma campanha já aprovada pode ser publicada: aprove primeiro.');
  const id = 'cp-' + crypto.randomBytes(5).toString('hex');
  const full = await repo.upsert('PromoCampanhas', Object.assign({ id }, obj), { user });
  return { id, v: full.versao };
}
async function deleteCampaign(repo, user, loja, id) {
  await repo.load(['PromoCampanhas']);
  const hit = repo.cache.PromoCampanhas.rows.find(r => r.id === String(id));
  if (!hit) return { ok: true };
  if (hit.loja !== loja) throw new Forbidden('Esta campanha é de outra loja');
  await repo.remove('PromoCampanhas', { id: hit.id });
  return { ok: true };
}

module.exports = { lojasDo, needLoja, canWrite, load, importEstoque, importVendas, saveCampaign, deleteCampaign, encodeVendas, decodeVendas, KEEP_DAYS, REGRAS, STATUS };
