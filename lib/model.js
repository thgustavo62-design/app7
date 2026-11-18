/* Do estado do site para linhas da planilha e de volta, com validação de cada operação.
   O navegador nunca grava direto: manda "operações", e aqui cada uma é conferida. */
const { Conflict } = require('./repo');

class BadRequest extends Error { constructor(msg) { super(msg); this.name = 'BadRequest'; this.status = 400; } }
class Forbidden extends Error { constructor(msg) { super(msg); this.name = 'Forbidden'; this.status = 403; } }

const STATUS = ['prop', 'plan', 'prod', 'apr', 'agd', 'pub'];
const BRANDS = ['M', 'F', 'C', 'N'];
const FORMATS = ['Carrossel', 'Reels'];
const SLOT_FORMATS = ['Carrossel', 'Reels', 'Qualquer'];
const STAGES = ['nova', 'analise', 'aprovada', 'descartada', 'agendada'];
const POLICIES = ['none', 'internal', 'internal_client'];
const ACTS = ['aprovou', 'reabriu', 'pediu_ajustes', 'comentou'];
const KINDS = ['internal', 'client'];
const STEPS = ['roteiro', 'gravar', 'editar', 'aprovar', 'agendar'];
const ROLES = ['admin', 'editor', 'leitura'];

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

const canWrite = u => u && (u.papel === 'admin' || u.papel === 'editor');
const canAdmin = u => u && u.papel === 'admin';
const needWrite = u => { if (!canWrite(u)) throw new Forbidden('Seu acesso é só de leitura'); };
const needAdmin = u => { if (!canAdmin(u)) throw new Forbidden('Só administradores mudam políticas e horários'); };

const parseJson = (s, fb) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : fb; } catch (e) { return fb; } };
const nonEmpty = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/* ---------- linhas -> estado do site ---------- */
async function loadState(repo) {
  await repo.load(['Alteracoes', 'PautasCriadas', 'Ideias', 'Aprovacoes', 'Checagens', 'Politicas', 'Horarios', 'Metas']);
  const R = t => repo.cache[t].rows;
  const overrides = {};
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
  return { overrides, custom, ideas, events, checks, flow: { policy, slots }, goals };
}

/* ---------- usuários ---------- */
async function findUser(repo, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const r = (await repo.rows('Usuarios')).find(x => String(x.email).trim().toLowerCase() === e);
  if (!r || String(r.ativo).trim().toLowerCase() === 'nao') return null;
  return { email: e, nome: r.nome || e, papel: ROLES.includes(String(r.papel).trim()) ? String(r.papel).trim() : 'leitura' };
}

/* ---------- operações de gravação ---------- */
async function applyOp(repo, op, user, now = Date.now()) {
  if (!op || typeof op !== 'object') throw new BadRequest('Operação inválida');
  const del = op.op === 'delete';
  if (op.op && !['upsert', 'delete'].includes(op.op)) throw new BadRequest('Operação desconhecida');
  switch (op.t) {
    case 'override': {
      needWrite(user);
      const c = code(op.code);
      if (del) { await repo.remove('Alteracoes', { codigo: c }, { baseV: op.v }); return {}; }
      const status = op.status ? oneOf(op.status, STATUS, 'Status') : '';
      const full = await repo.upsert('Alteracoes', { codigo: c, status, data: date(op.date) }, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'custom': {
      needWrite(user);
      const c = code(op.code);
      if (del) { await repo.remove('PautasCriadas', { codigo: c }, { baseV: op.v }); return {}; }
      const steps = op.steps || {};
      const obj = { codigo: c, marca: oneOf(op.b, BRANDS, 'Marca'), titulo: text(op.title, 200, 'Título', { required: true }), formato: oneOf(op.format, FORMATS, 'Formato'), data: date(op.date, { optional: false }), hora: time(op.time), status: oneOf(op.status || 'plan', STATUS, 'Status'), doc: url(op.doc), nota: text(op.note, 500, 'Nota'), ideia_id: text(op.fromIdea, 60, 'Ideia') };
      STEPS.forEach(s => { obj[s] = date(steps[s]); });
      const full = await repo.upsert('PautasCriadas', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'idea': {
      needWrite(user);
      const id = text(op.id, 60, 'Id', { required: true });
      if (!/^[A-Za-z0-9-]{1,60}$/.test(id)) throw new BadRequest('Id inválido');
      if (del) { await repo.remove('Ideias', { id }, { baseV: op.v }); return {}; }
      const obj = { id, marca: oneOf(op.b, BRANDS, 'Marca'), formato: oneOf(op.format, FORMATS, 'Formato'), titulo: text(op.title, 200, 'Título', { required: true }), observacao: text(op.note, 500, 'Observação'), etapa: oneOf(op.stage, STAGES, 'Etapa'), origem: text(op.src, 200, 'Origem'), criada_em: date(op.at), pauta_codigo: op.promoted ? code(op.promoted) : '' };
      const full = await repo.upsert('Ideias', obj, { baseV: op.v, user });
      return { v: full.versao };
    }
    case 'event': {
      needWrite(user);
      const e = op.ev || {};
      if (!/^e-[a-z0-9]{6,40}$/.test(String(e.id))) throw new BadRequest('Id de evento inválido');
      let at = new Date(e.at).getTime();
      if (!isFinite(at) || Math.abs(at - now) > 24 * 3600e3) at = now;
      const r = await repo.append('Aprovacoes', { id: e.id, codigo: code(e.code), tipo: oneOf(e.kind, KINDS, 'Tipo'), acao: oneOf(e.act, ACTS, 'Ação'), por: text(e.by, 80, 'Nome'), em: new Date(at).toISOString(), texto: text(e.text, 500, 'Texto') }, { user });
      return { at: new Date(at).toISOString(), duplicate: !!r.duplicate };
    }
    case 'check': {
      needWrite(user);
      const c = code(op.code);
      if (del) { await repo.remove('Checagens', { codigo: c }); return {}; }
      const dims = JSON.stringify(op.dims || {}), ck = JSON.stringify(op.checks || {});
      if (dims.length > 1000 || ck.length > 1000) throw new BadRequest('Checagem grande demais');
      await repo.upsert('Checagens', { codigo: c, criterios_json: dims, conformidade_json: ck, nota: op.nota == null ? '' : String(Number(op.nota) || 0) }, { user });
      return {};
    }
    case 'policy': {
      needAdmin(user);
      await repo.upsert('Politicas', { marca: oneOf(op.marca, BRANDS, 'Marca'), politica: oneOf(op.politica, POLICIES, 'Política') }, { user });
      return {};
    }
    case 'slots': {
      needAdmin(user);
      const m = oneOf(op.marca, BRANDS, 'Marca');
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
      const m = String(op.key || '').match(/^([MFCN])-([a-z]{2,20})$/);
      if (!m) throw new BadRequest('Meta inválida');
      if (del || op.value == null) { await repo.remove('Metas', { marca: m[1], indicador: m[2] }); return {}; }
      const v = Number(op.value);
      if (!isFinite(v) || v < 0 || v > 1e12) throw new BadRequest('Valor da meta inválido');
      await repo.upsert('Metas', { marca: m[1], indicador: m[2], valor: String(v) }, { user });
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

module.exports = { loadState, findUser, applyOp, applyOps, BadRequest, Forbidden, ROLES };
