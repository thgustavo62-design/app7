/* Criação: o que os agentes de posts e criativo precisam do servidor.
   - sincronizar: pauta com arte e legenda COMPLETAS no Drive, ainda em "A planejar" ou "Em produção", é adiantada para "Aprovação" (a aprovação continua obrigatória).
   - referências de cada cliente (perfis da V4, estilo, o que evitar): chave Config referencias:<empresa>.
   - fila de criação: pautas dos próximos dias SEM material e sem rascunho, com o contexto para a IA escrever (perfil, referências, legendas recentes).
   - rascunhos do agente criativo: chave Config rascunho:<código>. O agente NUNCA publica: o rascunho passa pela aprovação interna e do cliente. */
const F = require('./feed');
const { BadRequest, Forbidden } = require('./model');
const { pautasDaMarca } = require('./drive-org');

const hoje = () => new Date().toISOString().slice(0, 10);
const dia = iso => Date.parse(iso + 'T12:00:00Z') / 864e5;
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const completo = p => (p.midias || []).length >= 1 && !!p.legendaId;

async function clientesComDrive(repo) {
  const { activeClients } = require('./model');
  return (await activeClients(repo)).filter(c => (c.services || []).some(s => s === 'redes' || s === 'criativos'));
}

/* adianta para Aprovação as pautas com material completo no Drive */
async function sincronizar(repo, user, { drive }) {
  const M = require('./model'), out = { movidas: [], semDrive: [] }; if (!drive) return Object.assign(out, { erro: 'Drive desligado' });
  const state = await M.loadState(repo), ops = [];
  for (const c of await clientesComDrive(repo)) {
    let posts; try { posts = (await F.carregar(repo, user, c.key, { drive })).drive; } catch (e) { out.semDrive.push(c.key); continue; }
    if (!posts.ligado) { out.semDrive.push(c.key); continue; }
    const pautas = await pautasDaMarca(repo, c.key);
    posts.posts.filter(completo).forEach(p => {
      const pa = p.codigo && pautas.get(p.codigo); if (!pa || !['prop', 'plan', 'prod'].includes(pa.status)) return;
      const o = (state.overrides || {})[pa.code] || {};
      ops.push({ t: 'override', op: 'upsert', code: pa.code, status: 'apr', date: o.date || '', v: o.v });
      out.movidas.push({ code: pa.code, marca: c.key, de: pa.status, para: 'apr', titulo: pa.title });
    });
  }
  if (ops.length) await M.applyOps(repo, ops, user);
  return out;
}

/* ---------- referências ---------- */
const keyRef = m => 'referencias:' + m;
function limparRef(r) {
  r = r || {};
  return {
    v4: (Array.isArray(r.v4) ? r.v4 : []).slice(0, 10).map(x => ({ handle: txt(x && x.handle, 40).replace(/^@+/, ''), notas: txt(x && x.notas, 500) })).filter(x => x.handle),
    estilo: txt(r.estilo, 1200), evitar: txt(r.evitar, 600), exemplos: (Array.isArray(r.exemplos) ? r.exemplos : []).slice(0, 6).map(x => txt(x, 700)).filter(Boolean)
  };
}
async function lerReferencias(repo, marca) { await repo.load(['Config']); const row = repo.cache.Config.rows.find(r => r.chave === keyRef(marca)); let raw = {}; try { raw = row ? JSON.parse(row.valor) : {}; } catch (e) { raw = {}; } return limparRef(raw); }
async function salvarReferencias(repo, user, marca, body) {
  if (!F.podeEditar(user)) throw new Forbidden('Seu acesso é só de leitura.');
  const { activeClients } = require('./model'), { can } = require('./scope');
  if (!(await activeClients(repo)).some(c => c.key === marca) || !can(user, marca)) throw new Forbidden('Sem acesso a esta empresa.');
  const novo = limparRef(body); await repo.upsert('Config', { chave: keyRef(marca), valor: JSON.stringify(novo) }, { user }); return novo;
}

/* ---------- rascunhos ---------- */
const keyRas = c => 'rascunho:' + c;
async function lerRascunhos(repo, marca) {
  await repo.load(['Config']);
  return repo.cache.Config.rows.filter(r => /^rascunho:/.test(r.chave)).map(r => { try { return JSON.parse(r.valor); } catch (e) { return null; } }).filter(x => x && (!marca || x.marca === marca)).sort((a, b) => String(b.geradoEm).localeCompare(String(a.geradoEm)));
}
function limparRascunho(r, pauta) {
  const lista = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map(x => txt(x, m)).filter(Boolean);
  return { codigo: pauta.code, marca: pauta.b, titulo: pauta.title, formato: pauta.format, data: pauta.date, legenda: txt(r.legenda, 2200), slides: lista(r.slides, 10, 220), roteiro: lista(r.roteiro, 12, 300), briefArte: txt(r.briefArte, 900), hashtags: lista(r.hashtags, 12, 40), alertas: lista(r.alertas, 10, 200),
    canvaUrl: /^https:\/\/(www\.)?canva\.com\//.test(String(r.canvaUrl || '')) ? String(r.canvaUrl).slice(0, 300) : '', imagens: lista(r.imagens, 6, 120), modelo: txt(r.modelo, 60), geradoEm: new Date().toISOString(), status: 'novo' };
}
async function guardarRascunho(repo, user, corpo) {
  const M = require('./model'), codigo = String(corpo.codigo || ''); if (!/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(codigo)) throw new BadRequest('Código da pauta inválido');
  const marca = String(corpo.marca || ''), pauta = (await pautasDaMarca(repo, marca)).get(codigo); if (!pauta) throw new BadRequest('Esta pauta não existe no calendário.');
  const r = limparRascunho(corpo, pauta); if (!r.legenda && !r.slides.length && !r.roteiro.length) throw new BadRequest('O rascunho veio vazio.');
  await repo.upsert('Config', { chave: keyRas(codigo), valor: JSON.stringify(r) }, { user });
  if (['prop', 'plan'].includes(pauta.status)) { const o = ((await M.loadState(repo)).overrides || {})[codigo] || {}; await M.applyOps(repo, [{ t: 'override', op: 'upsert', code: codigo, status: 'prod', date: o.date || '', v: o.v }], user); }
  return r;
}
async function decidirRascunho(repo, user, codigo, status) {
  if (!F.podeEditar(user)) throw new Forbidden('Seu acesso é só de leitura.'); if (!['aprovado', 'descartado', 'novo'].includes(status)) throw new BadRequest('Status inválido');
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(r => r.chave === keyRas(codigo)); if (!row) throw new BadRequest('Rascunho não encontrado');
  const r = JSON.parse(row.valor); r.status = status; r.decididoPor = user.email; r.decididoEm = new Date().toISOString();
  await repo.upsert('Config', { chave: keyRas(codigo), valor: JSON.stringify(r) }, { user }); return r;
}

/* ---------- fila de criação: o que o agente criativo deve produzir agora ---------- */
async function filaCriacao(repo, user, { drive, dias = 7, max = 6 } = {}) {
  const itens = [], ras = new Set((await lerRascunhos(repo)).filter(r => r.status !== 'descartado').map(r => r.codigo));
  for (const c of await clientesComDrive(repo)) {
    const pautas = await pautasDaMarca(repo, c.key); let posts = [];
    if (drive) { try { const d = (await F.carregar(repo, user, c.key, { drive })); posts = d.drive.ligado ? d.drive.posts : []; } catch (e) { posts = []; } }
    const temMaterial = new Set(posts.filter(p => (p.midias || []).length).map(p => p.codigo)), ref = await lerReferencias(repo, c.key), cfg = await F.lerConfig(repo, c.key);
    const prox = [...pautas.values()].filter(p => p.status !== 'pub' && p.date >= hoje() && dia(p.date) - dia(hoje()) <= dias && !temMaterial.has(p.code) && !ras.has(p.code)).sort((a, b) => a.date.localeCompare(b.date));
    if (!prox.length) continue;
    const recentes = []; for (const p of posts.filter(x => x.legendaId).slice(0, 3)) { try { recentes.push((await F.legenda(repo, user, c.key, p.legendaId, { drive })).legenda); } catch (e) { /* sem legenda de exemplo */ } }
    prox.slice(0, 3).forEach(p => itens.push({ marca: c.key, cliente: c.name, setor: c.setor || '', codigo: p.code, titulo: p.title, formato: p.format, data: p.date, perfil: { handle: cfg.perfil.handle, bio: cfg.perfil.bio }, referencias: ref, legendasRecentes: recentes }));
  }
  return itens.sort((a, b) => a.data.localeCompare(b.data)).slice(0, max);
}

module.exports = { sincronizar, lerReferencias, salvarReferencias, lerRascunhos, guardarRascunho, decidirRascunho, filaCriacao, limparRef, completo };
