/* Preview de Feed: lê do Google Drive as postagens prontas de cada cliente e guarda, na aba Config, o que a equipe ajusta
   (perfil mostrado no celular, ordem dos posts planejados, pastas do Drive). Só leitura no Drive; nada é gravado nele.
   Convenção das pastas: AAAA-MM-DD__CÓDIGO__Titulo-Com-Hifens  (ex.: 2026-11-05__C-M15__Minas-Club-Como-Participar)
   com as artes (PNG/JPG/MP4, em ordem pelo nome: 01_..., 02_...) e um Google Doc "LEGENDA — ...". */
const crypto = require('crypto');
const { parseServiceAccount } = require('./google');
const { BadRequest, Forbidden } = require('./model');
const { can } = require('./scope');

/* pasta "POSTAGENS FINALIZADAS" de cada cliente (a chave é a do cadastro de clientes). Pode ser trocada na tela, por cliente. */
const PASTAS_PADRAO = {
  M: '1PoKHg8R5jlMHnpblNk83TYugio32Za7b', F: '1YIAzZ-OsLNbDFr5Z3lHcwvmRBw9mYdCa',
  C: '14tbqT8gIM3TPve2IZQRDvL7rJ1sZ2Gjv', N: '1iYru-buXoRizkyT-G1lQybaOn1hw7laA'
};
const PERFIL_PADRAO = { M: { handle: 'minasfarmabg' }, F: { handle: 'farmaefarmabg' }, C: { handle: 'campofortesolucao' }, N: { handle: 'nova7.produtora' }, J: { handle: 'juniorlopescontador' }, A: { handle: 'altuscontabilidade' } };
const STATUS_PASTA = ['pronto', 'producao'];       /* o que uma pasta significa: arte pronta, ou ainda em produção */
const MAX_POSTS = 40, TTL_MS = 120000;

const fail = (msg, status = 502) => Object.assign(new Error(msg), { status, expose: true });

/* ---------- nomes ---------- */
function parsePasta(nome) {
  const m = String(nome || '').match(/^(\d{4}-\d{2}-\d{2})__([A-Za-z0-9]+-[A-Za-z0-9]+)__(.+)$/);
  if (!m) return null;
  return { data: m[1], codigo: m[2].toUpperCase(), titulo: m[3].replace(/-+/g, ' ').trim() };
}
/* "https://drive.google.com/drive/folders/ID?usp=..." ou o próprio ID */
function pastaId(v) {
  const s = String(v || '').trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  const id = m ? m[1] : s;
  return /^[A-Za-z0-9_-]{10,80}$/.test(id) ? id : '';
}
/* o trecho "LEGENDA PARA COPIAR" até a próxima seção em maiúsculas */
function parseLegenda(texto) {
  const t = String(texto || '').replace(/\r/g, '').replace(/ /g, ' ');
  const linhas = t.split('\n'); const ini = linhas.findIndex(l => /^\s*LEGENDA( PARA COPIAR)?\s*:?\s*$/i.test(l));
  let corpo = [];
  if (ini >= 0) {
    for (let i = ini + 1; i < linhas.length; i++) { if (/^\s*(ORDEM DAS ARTES|OBSERVA[ÇC][ÃA]O INTERNA|ARTES|HASHTAGS?)\b.*$/.test(linhas[i]) && linhas[i] === linhas[i].toUpperCase()) break; corpo.push(linhas[i]); }
  } else corpo = linhas;
  const legenda = corpo.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
  const h = t.match(/(?:^|[^A-Za-zÀ-ÿ])[ÀAàa][Ss]\s+(\d{1,2})\s*[Hh:]\s*(\d{2})?/);
  const hora = h ? `${String(h[1]).padStart(2, '0')}:${h[2] || '00'}` : '';
  const f = t.match(/\b(CARROSSEL|REELS?|STORY|STORIES|POST)\b/i);
  return { legenda, hora, formato: f ? ({ carrossel: 'Carrossel', reel: 'Reels', reels: 'Reels', story: 'Story', stories: 'Story', post: 'Post' })[f[1].toLowerCase()] : '' };
}

/* ---------- Drive (só leitura) ---------- */
const tokens = {};
class Drive {
  constructor({ serviceAccount, fetchFn = fetch, now = Date.now }) { this.sa = parseServiceAccount(serviceAccount); this.fetch = fetchFn; this.now = now; }
  get email() { return this.sa.client_email; }
  async token() {
    const c = tokens[this.sa.client_email];
    if (c && c.exp - 60e3 > this.now()) return c.value;
    const b64u = v => Buffer.from(v).toString('base64url'), iat = Math.floor(this.now() / 1000), aud = this.sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud, iat, exp: iat + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key);
    const res = await this.fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64u(sig) }).toString() });
    if (!res.ok) throw fail(`O Google recusou a conta de serviço (${res.status}). Confira a chave em GOOGLE_SERVICE_ACCOUNT_JSON.`);
    const j = await res.json(); tokens[this.sa.client_email] = { value: j.access_token, exp: this.now() + (j.expires_in || 3600) * 1000 };
    return j.access_token;
  }
  async get(url, asText) {
    const res = await this.fetch(url, { headers: { Authorization: 'Bearer ' + await this.token() } });
    if (!res.ok) {
      let msg = ''; try { msg = (await res.json()).error.message; } catch (e) { /* sem corpo */ }
      if (res.status === 403 && /has not been used|disabled|accessNotConfigured/i.test(msg)) throw fail('A Drive API está desligada no projeto do Google Cloud. Ative "Google Drive API" e tente de novo.');
      if (res.status === 403 || res.status === 404) throw fail(`O Drive não deixou abrir a pasta (${res.status}). Compartilhe a pasta com ${this.email} como Leitor.`);
      throw fail(`Drive ${res.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
    }
    return asText ? res.text() : res.json();
  }
  /* filhos diretos de uma pasta */
  async filhos(id) {
    const out = []; let page = '';
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`), f = encodeURIComponent('nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)');
      const j = await this.get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${f}&pageSize=200&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
      out.push(...(j.files || [])); page = j.nextPageToken || '';
    } while (page && out.length < 1000);
    return out;
  }
  texto(id) { return this.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text/plain`, true); }
}

const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';
/* miniatura maior que a padrão (a do Drive vem com "=s220") */
const thumb = (u, w = 720) => (u ? String(u).replace(/=s\d+(-[a-z]+)?$/, `=w${w}`) : '');
function midiaDe(f) {
  const tipo = /^image\//.test(f.mimeType) ? 'imagem' : /^video\//.test(f.mimeType) ? 'video' : '';
  return tipo ? { id: f.id, nome: f.name, tipo, thumb: thumb(f.thumbnailLink) } : null;
}
/* uma pasta de post -> { id, codigo, data, titulo, midias[], legendaId } */
async function lerPost(drive, pasta) {
  const info = parsePasta(pasta.name) || { data: '', codigo: '', titulo: String(pasta.name || '').replace(/-+/g, ' ').trim() };
  const fs = await drive.filhos(pasta.id);
  const midias = fs.map(midiaDe).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { numeric: true }));
  const doc = fs.find(f => f.mimeType === DOC && /^legenda/i.test(f.name)) || fs.find(f => f.mimeType === DOC);
  return Object.assign({ id: pasta.id, pasta: pasta.name }, info, { midias, legendaId: doc ? doc.id : '' });
}
async function paraCada(lista, n, fn) {
  const out = new Array(lista.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) { const k = i++; out[k] = await fn(lista[k]); } }));
  return out;
}
const cache = new Map();
async function postsDaPasta(drive, id, { now = Date.now, force = false } = {}) {
  const hit = cache.get(id);
  if (!force && hit && now() - hit.at < TTL_MS) return hit.posts;
  const pastas = (await drive.filhos(id)).filter(f => f.mimeType === FOLDER)
    .sort((a, b) => ((parsePasta(b.name) || {}).data || '').localeCompare((parsePasta(a.name) || {}).data || '') || b.name.localeCompare(a.name)).slice(0, MAX_POSTS);
  const posts = await paraCada(pastas, 5, p => lerPost(drive, p));
  cache.set(id, { at: now(), posts });
  return posts;
}

/* ---------- o que a equipe ajusta (aba Config, chave feed:<empresa>) ---------- */
const keyOf = marca => 'feed:' + marca;
const txt = (v, max, what) => { const s = String(v ?? '').trim(); if (s.length > max) throw new BadRequest(`${what} passa de ${max} caracteres`); return s; };
function limpar(raw, marca) {
  const p = (raw && raw.perfil) || {}, padrao = PERFIL_PADRAO[marca] || {};
  const destaques = (Array.isArray(p.destaques) ? p.destaques : []).slice(0, 8).map(d => ({ nome: txt(d && d.nome, 20, 'Nome do destaque'), cor: /^#[0-9a-f]{6}$/i.test(d && d.cor) ? d.cor : '' })).filter(d => d.nome);
  const ordem = (Array.isArray(raw && raw.ordem) ? raw.ordem : []).slice(0, 400).map(x => String(x).slice(0, 80)).filter(Boolean);
  const pastas = (Array.isArray(raw && raw.pastas) ? raw.pastas : []).slice(0, 4).map(x => ({ id: pastaId(x && x.id), status: STATUS_PASTA.includes(x && x.status) ? x.status : 'pronto' })).filter(x => x.id);
  return {
    perfil: {
      handle: txt(p.handle ?? padrao.handle ?? '', 40, 'Perfil').replace(/^@+/, ''), nome: txt(p.nome, 60, 'Nome'), bio: txt(p.bio, 300, 'Bio'), link: txt(p.link, 120, 'Link'),
      seguidores: txt(p.seguidores, 12, 'Seguidores'), seguindo: txt(p.seguindo, 12, 'Seguindo'), destaques
    },
    ordem, pastas
  };
}
async function lerConfig(repo, marca) {
  await repo.load(['Config']);
  const row = repo.cache.Config.rows.find(r => r.chave === keyOf(marca));
  let raw = {}; try { raw = row && row.valor ? JSON.parse(row.valor) : {}; } catch (e) { raw = {}; }
  return limpar(raw, marca);
}
const podeEditar = u => !!u && u.tipo !== 'cliente' && (u.papel === 'admin' || u.papel === 'editor');
async function empresaDe(repo, user, marca) {
  const { activeClients } = require('./model');
  const c = (await activeClients(repo)).find(x => x.key === marca);
  if (!c || !can(user, marca)) throw new Forbidden('Você não tem acesso ao feed desta empresa.');
  return c;
}
async function salvar(repo, user, marca, body) {
  await empresaDe(repo, user, marca);
  if (!podeEditar(user)) throw new Forbidden('Seu acesso é só de leitura.');
  const atual = await lerConfig(repo, marca);
  const novo = limpar({ perfil: body.perfil !== undefined ? body.perfil : atual.perfil, ordem: body.ordem !== undefined ? body.ordem : atual.ordem, pastas: body.pastas !== undefined ? body.pastas : atual.pastas }, marca);
  await repo.upsert('Config', { chave: keyOf(marca), valor: JSON.stringify(novo) }, { user });
  cache.clear();
  return novo;
}

/* ---------- resposta da tela ---------- */
function pastasDe(marca, cfg) {
  const l = cfg.pastas.length ? cfg.pastas : (PASTAS_PADRAO[marca] ? [{ id: PASTAS_PADRAO[marca], status: 'pronto' }] : []);
  return l;
}
async function carregar(repo, user, marca, { drive, force = false, now = Date.now } = {}) {
  await empresaDe(repo, user, marca);
  const cfg = await lerConfig(repo, marca), pastas = pastasDe(marca, cfg);
  const out = { marca, podeEditar: podeEditar(user), perfil: cfg.perfil, ordem: cfg.ordem, pastas, drive: { ligado: false, posts: [], erro: '', conta: '' } };
  if (!drive) { out.drive.erro = 'O Drive ainda não está ligado: falta a chave da conta de serviço (GOOGLE_SERVICE_ACCOUNT_JSON).'; return out; }
  out.drive.conta = drive.email;
  if (!pastas.length) { out.drive.erro = 'Nenhuma pasta do Drive foi indicada para esta empresa.'; return out; }
  try {
    for (const p of pastas) (await postsDaPasta(drive, p.id, { force, now })).forEach(x => out.drive.posts.push(Object.assign({ origem: p.status }, x)));
    out.drive.ligado = true;
  } catch (e) { out.drive.erro = e.expose ? e.message : 'Não foi possível ler o Drive agora.'; }
  return out;
}
/* texto da legenda de um post: só de documentos que estão numa pasta deste cliente (nunca um arquivo qualquer do Drive) */
async function legenda(repo, user, marca, docId, { drive, now = Date.now } = {}) {
  await empresaDe(repo, user, marca);
  if (!drive) throw fail('O Drive não está ligado.', 503);
  const cfg = await lerConfig(repo, marca);
  for (const p of pastasDe(marca, cfg)) {
    const posts = await postsDaPasta(drive, p.id, { now });
    if (posts.some(x => x.legendaId === docId)) return parseLegenda(await drive.texto(docId));
  }
  throw new Forbidden('Este documento não pertence ao feed desta empresa.');
}
function novoDrive(serviceAccount, opts = {}) { return serviceAccount ? new Drive(Object.assign({ serviceAccount }, opts)) : null; }

module.exports = { parsePasta, pastaId, parseLegenda, thumb, Drive, novoDrive, lerConfig, salvar, carregar, legenda, limpar, podeEditar, PASTAS_PADRAO, _cache: cache, _tokens: tokens };
