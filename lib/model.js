/* Do estado do site para linhas da planilha e de volta, com validação de cada operação.
   O navegador nunca grava direto: manda "operações", e aqui cada uma é conferida. */
const { Conflict } = require('./repo');
const { isClient, can, restricted, scopeOf } = require('./scope');
const { planBrands, view } = require('./dataset');
const { defaults: defaultClients, fromRow: clientFromRow, SV } = require('./clients');

class BadRequest extends Error { constructor(msg) { super(msg); this.name = 'BadRequest'; this.status = 400; } }
class Forbidden extends Error { constructor(msg) { super(msg); this.name = 'Forbidden'; this.status = 403; } }

const STATUS = ['prop', 'plan', 'prod', 'apr', 'agd', 'pub'];
const FORMATS = ['Carrossel', 'Reels'];
const SLOT_FORMATS = ['Carrossel', 'Reels', 'Qualquer'];
const STAGES = ['nova', 'analise', 'aprovada', 'descartada', 'agendada'];
const POLICIES = ['none', 'internal', 'internal_client'];
const ACTS = ['aprovou', 'reabriu', 'pediu_ajustes', 'comentou'];
const KINDS = ['internal', 'client'];
const STEPS = ['roteiro', 'gravar', 'editar', 'aprovar', 'agendar'];
const ROLES = ['admin', 'editor', 'leitura'];
const TIPOS = ['equipe', 'cliente'];
const SETORES = Object.keys(SV.SECTORS);

const oneOf = (v, list, what) => { if (!list.includes(v)) throw new BadRequest(`${what} inválido`); return v; };
const text = (v, max, what, { required = false } = {}) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw new BadRequest(`${what} é obrigatório`);
  if (s.length > max) throw new BadRequest(`${what} passa de ${max} caracteres`);
  return s;
};
const code = v => { const s = String(v ?? ''); if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(s)) throw new BadRequest('Código inválido'); return s; };
const date = (v, { optional = true } = {}) => {
  if (v == null || v === '') { if (optional) return ''; throw new BadRequest('Data é obrigatória'); }
  const s = String(v), d = new Date(s + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d) || d.toISOString().slice(0, 10) !== s) throw new BadRequest('Data inválida');
  return s;
};
const time = v => { if (v == null || v === '') return ''; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw new BadRequest('Hora inválida'); return String(v); };
const url = v => { const s = text(v, 300, 'Link'); if (s && !/^https:\/\//.test(s)) throw new BadRequest('O link precisa começar com https://'); return s; };

/* IDs das contas Meta no Windsor.ai (anúncios, Instagram, página do Facebook): letras, números e _ . : - */
const metaId = (v, what) => {
  const toks = String(v == null ? '' : v).split(/[,;\s]+/).filter(Boolean);
  if (toks.length > 5 || toks.some(t => !/^(act_)?\d{3,30}$/.test(t))) throw new BadRequest(`${what} inválido: use só o número do ID (vários, separados por vírgula)`);
  return toks.join(',');
};
const metaFields = op => Object.assign({}, op.meta_ads !== undefined ? { meta_ads: metaId(op.meta_ads, 'Conta de anúncios') } : {}, op.meta_ig !== undefined ? { meta_ig: metaId(op.meta_ig, 'Conta do Instagram') } : {}, op.meta_fb !== undefined ? { meta_fb: metaId(op.meta_fb, 'Página do Facebook') } : {});
const canWrite = u => u && !isClient(u) && (u.papel === 'admin' || u.papel === 'editor');
const canAdmin = u => u && !isClient(u) && u.papel === 'admin';
const needWrite = u => { if (isClient(u)) throw new Forbidden('Usuários cliente só registram aprovação das pautas'); if (!canWrite(u)) throw new Forbidden('Seu acesso é só de leitura'); };
const needAdmin = u => { if (!canAdmin(u)) throw new Forbidden('Só administradores mudam configurações, políticas e horários'); };

/* ---------- empresas (aba Clientes) ---------- */
async function clientRows(repo) { await repo.load(['Clientes']); const r = repo.cache.Clientes.rows; return r.length ? r : defaultClients(); }
const isActive = r => String(r.ativo).trim().toLowerCase() !== 'nao';
async function brandKeys(repo) { return (await clientRows(repo)).filter(isActive).map(r => r.chave); }
/* confere que a empresa existe e está ativa, e que o usuário pode mexer nela */
async function brand(repo, v, user) {
  if (!(await brandKeys(repo)).includes(v)) throw new BadRequest('Empresa inválida');
  if (user && !can(user, v)) throw new Forbidden('Você não tem acesso a esta empresa');
  return v;
}
const activeClients = async repo => (await clientRows(repo)).filter(isActive).map(clientFromRow);
/* mapa código -> empresa do plano ao vivo (cache de 5 min no servidor) */
async function planMap(repo) { return planBrands((await view(await activeClients(repo))).D.PLAN); }
async function brandOfCode(repo, c) {
  const m = (await planMap(repo)).get(c); if (m) return m;
  const r = (await repo.rows('PautasCriadas')).find(x => x.codigo === c); return r ? r.marca : null;
}
async function codeScope(repo, c, user, { novaOk = false } = {}) {
  if (!restricted(user)) return;
  const b = await brandOfCode(repo, c);
  if (!b && novaOk) return;                                  /* pauta nova: quem vale é a empresa informada, conferida em brand() */
  if (!b || !can(user, b)) throw new Forbidden('Você não tem acesso a esta pauta');
}

const parseJson = (s, fb) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : fb; } catch (e) { return fb; } };
const nonEmpty = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/* ---------- semanas e meses (aba Semanas) ---------- */
const SOCIAL_F = ['views', 'alcance', 'interacoes', 'cliques', 'visitas', 'seguidores'];
const ADS_F = ['gasto', 'alcance', 'impressoes', 'resultados'];
const toNum = v => { if (v === '' || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; };
const cell = v => (v == null ? '' : String(v));
const num = (v, what) => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n) || n < 0 || n > 1e10) throw new BadRequest(`${what} inválido`);
  return Math.round(n * 100) / 100;
};
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* período fechado de uma linha: semana = segunda a domingo; mês = dia 1 ao último dia */
function periodEnd(tipo, inicio) {
  const d = new Date(inicio + 'T00:00:00Z');
  if (tipo === 'semana') { if (d.getUTCDay() !== 1) throw new BadRequest('A semana precisa começar numa segunda-feira'); return addDays(inicio, 6); }
  if (d.getUTCDate() !== 1) throw new BadRequest('O mês precisa começar no dia 1');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
/* ---------- autoridade: números semanais de marca pessoal ou profissional, por canal (li, ig) e "geral" (contatos, reuniões, menções) ---------- */
const AUTH_CANAIS = ['li', 'ig', 'geral'];
const AUTH_NUM = { impressoes: 'impressoes', alcance: 'alcance', interacoes: 'interacoes', comentarios: 'comentarios', compartilhamentos: 'compartilhamentos', salvamentos: 'salvamentos', visitas: 'visitas', segNovos: 'seg_novos', segTotal: 'seg_total', posts: 'posts', contatos: 'contatos', reunioes: 'reunioes', mencoes: 'mencoes' };
const authFromRow = r => Object.assign({ tipo: r.tipo, inicio: r.inicio, fim: r.fim, marca: r.marca, canal: r.canal, obs: r.obs, v: r.versao }, Object.fromEntries(Object.entries(AUTH_NUM).map(([k, col]) => [k, toNum(r[col])])));
function authToRow(op, marca) {
  const tipo = oneOf(op.tipo || 'semana', ['semana'], 'Tipo de período'), inicio = date(op.inicio, { optional: false });
  const row = { tipo, inicio, fim: periodEnd(tipo, inicio), marca, canal: oneOf(op.canal, AUTH_CANAIS, 'Canal') };
  Object.entries(AUTH_NUM).forEach(([k, col]) => { row[col] = cell(num(op[k], k)); });
  row.obs = text(op.obs, 300, 'Observação');
  return row;
}
const weekFromRow = r => {
  const g = (p, f) => toNum(r[`${p}_${f}`]);
  return {
    tipo: r.tipo, inicio: r.inicio, fim: r.fim, marca: r.marca, vendas: toNum(r.vendas), compras: toNum(r.compras),
    dias: [1, 2, 3, 4, 5, 6, 7].map(i => toNum(r[`dia${i}`])), c100n: toNum(r.c100_n), c100rs: toNum(r.c100_rs),
    ig: Object.fromEntries(SOCIAL_F.map(f => [f, g('ig', f)])), fb: Object.fromEntries(SOCIAL_F.map(f => [f, g('fb', f)])),
    ads: Object.fromEntries(ADS_F.map(f => [f, g('ads', f)])), janela: r.janela, fonte: r.fonte, obs: r.obs, v: r.versao
  };
};
function weekToRow(op, marca) {
  const tipo = oneOf(op.tipo, ['semana', 'mes'], 'Tipo de período'), inicio = date(op.inicio, { optional: false });
  const row = { tipo, inicio, fim: periodEnd(tipo, inicio), marca };
  row.vendas = cell(num(op.vendas, 'Vendas')); row.compras = cell(num(op.compras, 'Compras'));
  const dias = Array.isArray(op.dias) ? op.dias : [];
  if (dias.length && dias.length !== 7) throw new BadRequest('Informe os 7 dias ou nenhum');
  for (let i = 0; i < 7; i++) row[`dia${i + 1}`] = cell(num(dias[i], `Dia ${i + 1}`));
  row.c100_n = cell(num(op.c100n, 'Cestas acima de R$100')); row.c100_rs = cell(num(op.c100rs, 'Valor das cestas acima de R$100'));
  [['ig', op.ig, SOCIAL_F], ['fb', op.fb, SOCIAL_F], ['ads', op.ads, ADS_F]].forEach(([p, src, fields]) => {
    fields.forEach(f => { row[`${p}_${f}`] = cell(num((src || {})[f], `${p} ${f}`)); });
  });
  row.janela = text(op.janela, 300, 'Janela'); row.fonte = text(op.fonte, 300, 'Fonte'); row.obs = text(op.obs, 500, 'Observação');
  return row;
}
const RUMO = ['', 'sim', 'nao'];
const genFromRow = r => ({ tipo: r.tipo, inicio: r.inicio, promocao: r.promocao, concorrencia: r.concorrencia, decisao: r.decisao, rumo: r.rumo, notas: r.notas, v: r.versao });
function genToRow(op) {
  const tipo = oneOf(op.tipo, ['semana', 'mes'], 'Tipo de período'), inicio = date(op.inicio, { optional: false });
  periodEnd(tipo, inicio);
  return { tipo, inicio, promocao: text(op.promocao, 300, 'Promoção'), concorrencia: text(op.concorrencia, 600, 'Concorrência'), decisao: text(op.decisao, 500, 'Decisão'), rumo: oneOf(op.rumo || '', RUMO, 'Resposta'), notas: text(op.notas, 800, 'Notas') };
}

/* ---------- linhas -> estado do site ---------- */
async function loadState(repo) {
  await repo.load(['Alteracoes', 'Responsaveis', 'PautasCriadas', 'Ideias', 'Aprovacoes', 'Checagens', 'Politicas', 'Horarios', 'Metas', 'Semanas', 'Autoridade', 'SemanasGeral', 'Decisoes']);
  const R = t => repo.cache[t].rows;
  const overrides = {};
  const owners = {};
  R('Responsaveis').forEach(r => { owners[r.codigo] = Object.assign(Object.fromEntries(STEPS.filter(s => r[s]).map(s => [s, String(r[s]).trim().toLowerCase()])), { v: r.versao }); });
  R('Alteracoes').forEach(r => { overrides[r.codigo] = Object.assign(nonEmpty({ status: r.status, date: r.data }), { v: r.versao }); });
  const custom = R('PautasCriadas').map(r => Object.assign({
    code: r.codigo, b: r.marca, title: r.titulo, format: r.formato, date: r.data, time: r.hora || null, status: r.status || 'plan',
    steps: Object.fromEntries(STEPS.map(s => [s, r[s] || null])), doc: r.doc, note: r.nota, v: r.versao
  }, r.ideia_id ? { fromIdea: r.ideia_id } : {}));
  const ideas = R('Ideias').map(r => Object.assign({ id: r.id, b: r.marca, format: r.formato, title: r.titulo, note: r.observacao, stage: r.etapa, src: r.origem, at: r.criada_em, v: r.versao }, r.pauta_codigo ? { promoted: r.pauta_codigo } : {}));
  const events = R('Aprovacoes').map(r => ({ id: r.id, code: r.codigo, kind: r.tipo, act: r.acao, by: r.por, at: r.em, text: r.texto }));
  const checks = {};
  R('Checagens').forEach(r => { checks[r.codigo] = { dims: parseJson(r.criterios_json, {}), checks: parseJson(r.conformidade_json, {}) }; });
  const policy = {}; R('Politicas').forEach(r => { policy[r.marca] = r.politica; });
  const slots = {};
  R('Horarios').slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(r => { (slots[r.marca] = slots[r.marca] || []).push({ dow: Number(r.dia_semana), time: r.hora, format: r.formato }); });
  const goals = {}; R('Metas').forEach(r => { const n = Number(r.valor); if (isFinite(n)) goals[`${r.marca}-${r.indicador}`] = n; });
  const weeks = R('Semanas').map(weekFromRow).sort((x, y) => x.inicio.localeCompare(y.inicio) || x.marca.localeCompare(y.marca));
  const weekGen = R('SemanasGeral').map(genFromRow).sort((x, y) => x.inicio.localeCompare(y.inicio));
  const authority = R('Autoridade').map(authFromRow).sort((x, y) => x.inicio.localeCompare(y.inicio) || x.marca.localeCompare(y.marca) || x.canal.localeCompare(y.canal));
  const decisions = R('Decisoes').map(r => ({ chave: r.chave, agente: r.agente, marca: r.marca, titulo: r.titulo, status: r.status, ate: r.ate, nota: r.nota, em: r.em, responsavel: String(r.responsavel || '').trim().toLowerCase(), v: r.versao }));
  return { overrides, custom, ideas, events, checks, flow: { policy, slots }, goals, weeks, weekGen, authority, decisions, owners };
}

/* ---------- usuários ---------- */
const keyList = v => String(v || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
async function findUser(repo, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const r = (await repo.rows('Usuarios')).find(x => String(x.email).trim().toLowerCase() === e);
  if (!r || String(r.ativo).trim().toLowerCase() === 'nao') return null;
  const tipo = String(r.tipo).trim().toLowerCase() === 'cliente' ? 'cliente' : 'equipe';
  const papel = tipo === 'cliente' ? 'cliente' : (ROLES.includes(String(r.papel).trim()) ? String(r.papel).trim() : 'leitura');
  return { email: e, nome: r.nome || e, papel, tipo, empresas: keyList(r.empresas) };
}

/* cadastro de empresas e (para administradores) de usuários, enviado junto com o estado */
async function loadRegistry(repo, user) {
  const rows = await clientRows(repo);
  let clients = rows.map(clientFromRow);
  const s = scopeOf(user);
  if (!canAdmin(user)) clients = clients.filter(c => c.active);
  if (s) clients = clients.filter(c => s.has(c.key));
  const out = { clients };
  if (!isClient(user)) {                                  /* quem atribui etapas precisa ver a equipe, mesmo sem ser administrador */
    await repo.load(['Usuarios']);
    out.team = repo.cache.Usuarios.rows.filter(r => String(r.tipo).trim().toLowerCase() !== 'cliente' && String(r.ativo).trim().toLowerCase() !== 'nao').map(r => ({ email: String(r.email).trim().toLowerCase(), nome: r.nome || r.email })).filter(u => u.email);
  }
  if (canAdmin(user)) {
    await repo.load(['Usuarios']);
    out.users = repo.cache.Usuarios.rows.map(r => ({ email: String(r.email).trim().toLowerCase(), nome: r.nome, tipo: String(r.tipo).trim().toLowerCase() === 'cliente' ? 'cliente' : 'equipe', papel: r.papel, empresas: keyList(r.empresas), ativo: String(r.ativo).trim().toLowerCase() !== 'nao', senhaPadrao: !r.senha_hash }));
  }
  return out;
}

/* ---------- operações de gravação ---------- */
async function applyOp(repo, op, user, now = Date.now()) {
  if (!op || typeof op !== 'object') throw new BadRequest('Operação inválida');
  const del = op.op === 'delete';
  if (op.op && !['upsert', 'delete'].includes(op.op)) throw new BadRequest('Operação desconhecida');
  switch (op.t) {
    case 'override': {
      needWrite(user);
      const c = code(op.code); await codeScope(repo, c, user);
      if (del) { await repo.remove('Alteracoes', { codigo: c }, { baseV: op.v }); return {}; }
      const status = op.status ? oneOf(op.status, STATUS, 'Status') : '';
      const full = await repo.upsert('Alteracoes', { codigo: c, status, data: date(op.date) }, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'owners': {                         /* responsável por etapa de cada pauta: só gente da equipe, ativa */
      needWrite(user);
      const c = code(op.code); await codeScope(repo, c, user);
      if (del) { await repo.remove('Responsaveis', { codigo: c }, { baseV: op.v }); return {}; }
      const obj = { codigo: c };
      for (const s of STEPS) {
        const e = String(op[s] || '').trim().toLowerCase();
        if (e) { const u = await findUser(repo, e); if (!u || u.tipo !== 'equipe') throw new BadRequest(`Responsável inválido em ${s}: precisa ser alguém da equipe, com acesso ativo`); }
        obj[s] = e;
      }
      if (!STEPS.some(s => obj[s])) { await repo.remove('Responsaveis', { codigo: c }, { baseV: op.v }).catch(() => {}); return {}; }
      const full = await repo.upsert('Responsaveis', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'custom': {
      needWrite(user);
      const c = code(op.code); await codeScope(repo, c, user, { novaOk: true });
      if (del) { await repo.remove('PautasCriadas', { codigo: c }, { baseV: op.v }); return {}; }
      const steps = op.steps || {};
      const obj = { codigo: c, marca: await brand(repo, op.b, user), titulo: text(op.title, 200, 'Título', { required: true }), formato: oneOf(op.format, FORMATS, 'Formato'), data: date(op.date, { optional: false }), hora: time(op.time), status: oneOf(op.status || 'plan', STATUS, 'Status'), doc: url(op.doc), nota: text(op.note, 500, 'Nota'), ideia_id: text(op.fromIdea, 60, 'Ideia') };
      STEPS.forEach(s => { obj[s] = date(steps[s]); });
      const full = await repo.upsert('PautasCriadas', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'idea': {
      needWrite(user);
      const id = text(op.id, 60, 'Id', { required: true });
      if (!/^[A-Za-z0-9-]{1,60}$/.test(id)) throw new BadRequest('Id inválido');
      if (del) {
        const old = (await repo.rows('Ideias')).find(r => r.id === id);
        if (old && !can(user, old.marca)) throw new Forbidden('Você não tem acesso a esta empresa');
        await repo.remove('Ideias', { id }, { baseV: op.v }); return {};
      }
      { const old = (await repo.rows('Ideias')).find(r => r.id === id); if (old && !can(user, old.marca)) throw new Forbidden('Você não tem acesso a esta empresa'); }   /* não dá para sobrescrever ideia de outra empresa */
      const obj = { id, marca: await brand(repo, op.b, user), formato: oneOf(op.format, FORMATS, 'Formato'), titulo: text(op.title, 200, 'Título', { required: true }), observacao: text(op.note, 500, 'Observação'), etapa: oneOf(op.stage, STAGES, 'Etapa'), origem: text(op.src, 200, 'Origem'), criada_em: date(op.at), pauta_codigo: op.promoted ? code(op.promoted) : '' };
      const full = await repo.upsert('Ideias', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'event': {
      const e = op.ev || {};
      if (isClient(user)) { if (e.kind !== 'client') throw new Forbidden('Usuários cliente só registram aprovação do cliente'); } else needWrite(user);
      if (!/^e-[a-z0-9]{6,40}$/.test(String(e.id))) throw new BadRequest('Id de evento inválido');
      await codeScope(repo, code(e.code), user);
      let at = new Date(e.at).getTime();
      if (!isFinite(at) || Math.abs(at - now) > 24 * 3600e3) at = now;
      const r = await repo.append('Aprovacoes', { id: e.id, codigo: code(e.code), tipo: oneOf(e.kind, KINDS, 'Tipo'), acao: oneOf(e.act, ACTS, 'Ação'), por: isClient(user) ? text(user.nome, 80, 'Nome') : text(e.by, 80, 'Nome'), em: new Date(at).toISOString(), texto: text(e.text, 500, 'Texto') }, { user });
      return { at: new Date(at).toISOString(), duplicate: !!r.duplicate };
    }
    case 'check': {
      needWrite(user);
      const c = code(op.code); await codeScope(repo, c, user);
      if (del) { await repo.remove('Checagens', { codigo: c }); return {}; }
      const dims = JSON.stringify(op.dims || {}), ck = JSON.stringify(op.checks || {});
      if (dims.length > 1000 || ck.length > 1000) throw new BadRequest('Checagem grande demais');
      await repo.upsert('Checagens', { codigo: c, criterios_json: dims, conformidade_json: ck, nota: op.nota == null ? '' : String(Number(op.nota) || 0) }, { user });
      return {};
    }
    case 'policy': {
      needAdmin(user);
      await repo.upsert('Politicas', { marca: await brand(repo, op.marca, user), politica: oneOf(op.politica, POLICIES, 'Política') }, { user });
      return {};
    }
    case 'slots': {
      needAdmin(user);
      const m = await brand(repo, op.marca, user);
      const list = Array.isArray(op.rows) ? op.rows : [];
      if (list.length > 20) throw new BadRequest('Horários demais');
      const next = list.map(s => ({ dia_semana: String(oneOf(Number(s.dow), [0, 1, 2, 3, 4, 5, 6], 'Dia')), hora: time(s.time) || (() => { throw new BadRequest('Hora é obrigatória'); })(), formato: oneOf(s.format, SLOT_FORMATS, 'Formato') }));
      const old = (await repo.rows('Horarios')).filter(r => r.marca === m).sort((a, b) => a.id.localeCompare(b.id));
      const used = new Set((await repo.rows('Horarios')).map(r => r.id));
      let n = 0; const newId = () => { let id; do { n++; id = `H-${m}${String(n).padStart(2, '0')}`; } while (used.has(id)); used.add(id); return id; };
      for (let i = 0; i < next.length; i++) await repo.upsert('Horarios', Object.assign({ id: old[i] ? old[i].id : newId(), marca: m }, next[i]), { user });
      for (let i = next.length; i < old.length; i++) await repo.remove('Horarios', { id: old[i].id });
      return {};
    }
    case 'goal': {
      needWrite(user);
      const m = String(op.key || '').match(/^([A-Z][A-Z0-9]{0,3})-([a-z]{2,20})$/);
      if (!m) throw new BadRequest('Meta inválida');
      await brand(repo, m[1], user);
      if (del || op.value == null) { await repo.remove('Metas', { marca: m[1], indicador: m[2] }); return {}; }
      const v = Number(op.value);
      if (!isFinite(v) || v < 0 || v > 1e12) throw new BadRequest('Valor da meta inválido');
      await repo.upsert('Metas', { marca: m[1], indicador: m[2], valor: String(v) }, { user });
      return {};
    }
    case 'week': {
      needWrite(user);
      if (del) {
        const tipo = oneOf(op.tipo, ['semana', 'mes'], 'Tipo de período');
        await repo.remove('Semanas', { tipo, inicio: date(op.inicio, { optional: false }), marca: await brand(repo, op.marca, user) }, { baseV: op.v }); return {};
      }
      const full = await repo.upsert('Semanas', weekToRow(op, await brand(repo, op.marca, user)), { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'auth': {
      needWrite(user);
      const marca = await brand(repo, op.marca, user);
      const cl = (await clientRows(repo)).find(r => r.chave === marca);
      if (!SV.parse(cl && cl.servicos).includes('autoridade')) throw new BadRequest('Esta empresa não tem o serviço Autoridade e posicionamento');
      if (del) {
        const canal = oneOf(op.canal, AUTH_CANAIS, 'Canal');
        await repo.remove('Autoridade', { tipo: 'semana', inicio: date(op.inicio, { optional: false }), marca, canal }, { baseV: op.v }); return {};
      }
      const full = await repo.upsert('Autoridade', authToRow(op, marca), { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'weekgen': {
      needWrite(user);
      if (restricted(user)) throw new Forbidden('O contexto geral do período é só para quem vê todas as empresas');
      if (del) { await repo.remove('SemanasGeral', { tipo: oneOf(op.tipo, ['semana', 'mes'], 'Tipo de período'), inicio: date(op.inicio, { optional: false }) }, { baseV: op.v }); return {}; }
      const full = await repo.upsert('SemanasGeral', genToRow(op), { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'decision': {                       /* memória da Central de Inteligência: o que foi feito, adiado ou ignorado */
      needWrite(user);
      const chave = String(op.chave || '');
      if (!/^[a-z0-9][a-z0-9_.:-]{2,90}$/i.test(chave)) throw new BadRequest('Chave da decisão inválida');
      if (op.marca && restricted(user) && !can(user, op.marca)) throw new Forbidden('Você não tem acesso a esta empresa');
      { const old = (await repo.rows('Decisoes')).find(r => r.chave === chave); if (old && old.marca && restricted(user) && !can(user, old.marca)) throw new Forbidden('Você não tem acesso a esta empresa'); }
      if (del) { await repo.remove('Decisoes', { chave }, { baseV: op.v }); return {}; }
      const obj = { chave, agente: oneOf(op.agente, require('./agents'), 'Agente'), marca: op.marca ? await brand(repo, op.marca, user) : '', titulo: text(op.titulo, 200, 'Título', { required: true }), status: oneOf(op.status, ['feita', 'adiada', 'ignorada', 'atribuida'], 'Situação'), ate: date(op.ate, { optional: false }), nota: text(op.nota, 300, 'Nota'), em: new Date(now).toISOString(), responsavel: '' };
      if (obj.status === 'atribuida') {                   /* tarefa: precisa de um responsável da equipe, com acesso ativo, e de um prazo */
        const e = String(op.responsavel || '').trim().toLowerCase(), u = e && await findUser(repo, e);
        if (!u || u.tipo !== 'equipe') throw new BadRequest('Responsável inválido: precisa ser alguém da equipe, com acesso ativo');
        obj.responsavel = e;
      }
      const full = await repo.upsert('Decisoes', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'client': {
      needAdmin(user);
      if (del) throw new BadRequest('Empresas não são apagadas: desative a empresa para tirá-la do site');
      const chave = String(op.chave || '');
      if (!/^[A-Z][A-Z0-9]{0,3}$/.test(chave)) throw new BadRequest('Chave inválida (1 a 4 letras ou números, começando por letra)');
      const id = String(op.id || '');
      if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new BadRequest('Endereço inválido (letras minúsculas, números e hífen)');
      if (['painel', 'insights', 'semana', 'calendario', 'fluxo', 'alertas', 'playbook', 'config'].includes(id)) throw new BadRequest('Endereço reservado do site');
      const servicos = SV.parse(Array.isArray(op.servicos) ? op.servicos.join(',') : op.servicos);
      if (!servicos.length) throw new BadRequest('Escolha pelo menos um serviço');
      const rows = await clientRows(repo);
      if (rows.some(r => r.id === id && r.chave !== chave)) throw new BadRequest('Já existe uma empresa com este endereço');
      const isNew = !rows.some(r => r.chave === chave);
      if (!repo.cache.Clientes.rows.length) for (const d of defaultClients()) await repo.upsert('Clientes', d, { check: false, user });   /* primeira gravação: leva junto os clientes iniciais */
      const full = await repo.upsert('Clientes', {
        chave, id, nome: text(op.nome, 80, 'Nome', { required: true }), curto: text(op.curto, 20, 'Nome curto', { required: true }),
        cor: oneOf(op.cor, SV.COLORS, 'Cor'), segmento: text(op.segmento, 80, 'Segmento'), perfil: text(op.perfil, 60, 'Perfil'),
        setor: oneOf(op.setor, SETORES, 'Setor'), servicos: servicos.join(','), ativo: oneOf(op.ativo || 'sim', ['sim', 'nao'], 'Situação'), ...metaFields(op)
      }, { baseV: op.v, user });
      if (isNew) await repo.upsert('Politicas', { marca: chave, politica: 'internal_client' }, { user });   /* empresa nova nasce com aprovação interna e do cliente */
      return { v: full.versao };
    }
    case 'user': {
      needAdmin(user);
      const email = String(op.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) throw new BadRequest('E-mail inválido');
      await repo.load(['Usuarios']);
      const rows = repo.cache.Usuarios.rows, hit = rows.find(r => String(r.email).trim().toLowerCase() === email);
      const isAdminRow = r => r && String(r.ativo).trim().toLowerCase() !== 'nao' && String(r.tipo).trim().toLowerCase() !== 'cliente' && String(r.papel).trim() === 'admin';
      const self = email === String(user.email).trim().toLowerCase();
      let next = null;
      if (!del) {
        const tipo = oneOf(op.tipo || 'equipe', TIPOS, 'Tipo');
        const todas = (await clientRows(repo)).map(r => r.chave);
        const empresas = keyList(Array.isArray(op.empresas) ? op.empresas.join(',') : op.empresas);
        empresas.forEach(k => { if (!todas.includes(k)) throw new BadRequest('Empresa inválida na lista'); });
        if (tipo === 'cliente' && !empresas.length) throw new BadRequest('Usuário cliente precisa de pelo menos uma empresa');
        next = { email: hit ? hit.email : email, nome: text(op.nome, 80, 'Nome', { required: true }), tipo, papel: tipo === 'cliente' ? 'cliente' : oneOf(op.papel, ROLES, 'Papel'), empresas: empresas.join(','), ativo: oneOf(op.ativo || 'sim', ['sim', 'nao'], 'Situação') };
      }
      const stillAdmin = rows.some(r => r !== hit && isAdminRow(r)) || (next && isAdminRow(next));
      if (self && (del || !isAdminRow(next))) throw new BadRequest('Você não pode tirar o seu próprio acesso de administrador');
      if (!stillAdmin) throw new BadRequest('O site precisa de pelo menos um administrador ativo');
      if (next && op.resetSenha) Object.assign(next, { senha_hash: '', tentativas: '', bloqueado_ate: '' });   /* volta para a senha padrão e desbloqueia */
      if (del) { if (hit) await repo.remove('Usuarios', { email: hit.email }); return {}; }
      await repo.upsert('Usuarios', next, { user });
      return {};
    }
    default: throw new BadRequest('Tipo de operação desconhecido');
  }
}

/* aplica em ordem; para no primeiro conflito */
async function applyOps(repo, ops, user, now) {
  if (!Array.isArray(ops) || !ops.length) throw new BadRequest('Nada para gravar');
  if (ops.length > 40) throw new BadRequest('Operações demais de uma vez');
  const results = [];
  for (let i = 0; i < ops.length; i++) {
    try { results.push(await applyOp(repo, ops[i], user, now)); }
    catch (e) { if (e instanceof Conflict) return { results, conflict: { index: i, tab: e.tab } }; throw e; }
  }
  return { results };
}

module.exports = { authFromRow, weekFromRow, loadState, loadRegistry, activeClients, planMap, findUser, applyOp, applyOps, brandOfCode, BadRequest, Forbidden, ROLES };
