/* Agente do Drive: organiza as pastas de postagens de cada cliente.
   Funciona em duas etapas, sempre com a sua aprovação: (1) PROPOR: lê a pasta e devolve uma lista de mudanças com o motivo de cada uma;
   (2) APLICAR: só executa o que foi aprovado, e só RENOMEAR ou MOVER. Nunca apaga nada. Cada aplicação grava um log que permite DESFAZER.
   Convenção de pasta: AAAA-MM-DD__CÓDIGO__Titulo-Com-Hifens, com artes (01_..., 02_...) e um Google Doc "LEGENDA — ...". */
const crypto = require('crypto');
const F = require('./feed');
const { parseServiceAccount } = require('./google');
const { BadRequest, Forbidden } = require('./model');

const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';
const fail = (msg, status = 502) => Object.assign(new Error(msg), { status, expose: true });
const ehMidia = f => /^(image|video)\//.test(f.mimeType || '');

/* ---------- Drive com escrita (só renomear e mover) ---------- */
const tokensEscrita = {};
class DriveEscrita extends F.Drive {
  async token() {
    const k = this.sa.client_email, c = tokensEscrita[k];
    if (c && c.exp - 60e3 > this.now()) return c.value;
    const b64u = v => Buffer.from(v).toString('base64url'), iat = Math.floor(this.now() / 1000), aud = this.sa.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss: k, scope: 'https://www.googleapis.com/auth/drive', aud, iat, exp: iat + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key);
    const res = await this.fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64u(sig) }) });
    if (!res.ok) throw fail(`O Google recusou a conta de serviço (${res.status}).`);
    const j = await res.json(); tokensEscrita[k] = { value: j.access_token, exp: this.now() + (j.expires_in || 3600) * 1000 }; return j.access_token;
  }
  async enviar(method, url, body) { return this.chamar(method, url, { 'Content-Type': 'application/json' }, body ? JSON.stringify(body) : undefined); }
  async chamar(method, url, headers, corpo) {
    const res = await this.fetch(url, { method, headers: Object.assign({ Authorization: 'Bearer ' + await this.token() }, headers), body: corpo });
    if (!res.ok) {
      let msg = ''; try { msg = (await res.json()).error.message; } catch (e) { /* sem corpo */ }
      if (/storage ?quota|storageQuota/i.test(msg)) throw fail('A conta de serviço não tem espaço para guardar imagens numa pasta do "Meu Drive". Use uma pasta de Drive compartilhado, ou arraste as artes (ficam no computador da agência) para a pasta do post.');
      if (res.status === 403 || res.status === 404) throw fail(`O Drive não deixou alterar (${res.status}). Compartilhe a pasta com ${this.email} como EDITOR (hoje basta Leitor para o feed, mas organizar exige Editor).`);
      throw fail(`Drive ${res.status}${msg ? ': ' + msg.slice(0, 120) : ''}`);
    }
    return res.json();
  }
  /* ler arquivos para a tela de preview: procurar por nome e baixar o conteúdo */
  async buscar(q) { const j = await this.get('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=30&fields=files(id,name,mimeType)&q=' + encodeURIComponent(q)); return j.files || []; }
  async baixar(id, limite = 6e6) {
    const res = await this.fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + await this.token() } });
    if (!res.ok) throw fail(`O Drive não entregou o arquivo (${res.status}).`, res.status === 404 || res.status === 403 ? 404 : 502);
    const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > limite) throw fail('Arquivo grande demais para o preview.', 413); return buf;
  }
  renomear(id, nome) { return this.enviar('PATCH', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`, { name: nome }); }
  /* upload multipart (metadados JSON + conteúdo). Com id, troca o conteúdo; sem id, cria. Documento: o texto puro vira Google Doc */
  async subir({ id, nome, mimeType, pai, conteudo, tipoConteudo }) {
    const limite = '----n7' + Math.random().toString(36).slice(2), meta = id ? {} : { name: nome, parents: [pai] }; if (mimeType && !id) meta.mimeType = mimeType;
    const buf = Buffer.concat([Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${limite}\r\nContent-Type: ${tipoConteudo}\r\n\r\n`), Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), 'utf8'), Buffer.from(`\r\n--${limite}--`)]);
    const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink';
    return this.chamar(id ? 'PATCH' : 'POST', url, { 'Content-Type': 'multipart/related; boundary=' + limite }, buf);
  }
  criarPasta(nome, pai) { return this.enviar('POST', 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', { name: nome, mimeType: FOLDER, parents: [pai] }); }
  criarDoc(nome, pai, texto) { return this.subir({ nome, pai, mimeType: DOC, conteudo: texto, tipoConteudo: 'text/plain; charset=UTF-8' }); }
  atualizarDoc(id, texto) { return this.subir({ id, conteudo: texto, tipoConteudo: 'text/plain; charset=UTF-8' }); }
  criarArquivo(nome, pai, mime, buf) { return this.subir({ nome, pai, conteudo: buf, tipoConteudo: mime }); }
  trocarArquivo(id, mime, buf) { return this.subir({ id, conteudo: buf, tipoConteudo: mime }); }
  /* o que a conta pode fazer nesta pasta (para dizer, antes de tudo, se falta a permissão de Editor) */
  async capacidades(id) { const j = await this.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,driveId,ownedByMe,capabilities(canAddChildren,canEdit)`); return { nome: j.name, driveCompartilhado: !!j.driveId, podeCriar: !!(j.capabilities && j.capabilities.canAddChildren) }; }
  mover(id, novoPai, velhoPai) { return this.enviar('PATCH', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&addParents=${encodeURIComponent(novoPai)}&removeParents=${encodeURIComponent(velhoPai)}&fields=id,name,parents`, {}); }
}
let fabrica = null;                                                         /* os testes trocam o Drive de verdade por um de mentira */
const novoDriveEscrita = sa => (fabrica ? fabrica(sa) : (sa ? new DriveEscrita({ serviceAccount: sa }) : null));
const _trocarDrive = fn => { fabrica = fn; };

/* ---------- nomes ---------- */
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const titulo = t => String(t || '').replace(/[^A-Za-zÀ-ÿ0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 12).join('-').slice(0, 70) || 'Sem-titulo';
const nomeCanonico = (data, codigo, tit) => `${data}__${codigo}__${titulo(tit)}`;
const palavras = s => new Set(semAcento(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2));
const jaccard = (a, b) => { const i = [...a].filter(x => b.has(x)).length, u = new Set([...a, ...b]).size; return u ? i / u : 0; };
/* acha o código de uma pauta dentro de um nome fora do padrão (ex.: "post C-M15 minas club" ou "2026.11.05 CM15") */
function achaCodigo(nome, pautas) {
  const t = semAcento(nome).toUpperCase(), achados = [];
  for (const code of pautas.keys()) { const re = new RegExp('(^|[^A-Z0-9])' + code.toUpperCase().replace(/[-]/g, '[-_ ]?') + '($|[^A-Z0-9])'); if (re.test(t)) achados.push(code); }
  return achados.length === 1 ? achados[0] : '';
}
const id12 = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 12);

/* ---------- o plano ---------- */
/* arvore: { raiz, pastas: [{ id, name, filhos: [{ id, name, mimeType }] }], soltos: [{ id, name, mimeType }] }; pautas: Map código -> { code, title, date, status } */
function planejar(arvore, pautas) {
  const acoes = [], avisos = [], usados = new Set(arvore.pastas.map(p => p.name)), porCodigo = new Map();
  const add = a => { a.id = id12(a.tipo, a.alvoId, a.para); acoes.push(a); };
  const livre = (nome, sou) => !arvore.pastas.some(p => p.name === nome && p.id !== sou);
  arvore.pastas.forEach(p => {
    let info = F.parsePasta(p.name), codigo = info ? info.codigo : '', pauta = codigo ? pautas.get(codigo) : null, nomeFinal = p.name;
    if (!info) {
      const c = achaCodigo(p.name, pautas);
      if (c) { const pa = pautas.get(c), novo = nomeCanonico(pa.date, c, pa.title); codigo = c; pauta = pa; if (livre(novo, p.id)) { add({ tipo: 'renomear', alvoTipo: 'pasta', alvoId: p.id, de: p.name, para: novo, motivo: `Nome fora do padrão; o código ${c} identifica a pauta "${pa.title}" (${pa.date}).` }); nomeFinal = novo; } else avisos.push({ tipo: 'conflito', alvoId: p.id, nome: p.name, texto: `Já existe uma pasta chamada ${novo}.` }); }
      else {
        const pw = palavras(p.name), cand = [...pautas.values()].map(pa => ({ pa, s: jaccard(pw, palavras(pa.title)) })).filter(x => x.s >= 0.6).sort((a, b) => b.s - a.s);
        if (cand.length === 1 || (cand.length > 1 && cand[0].s - cand[1].s > 0.2)) { const pa = cand[0].pa, novo = nomeCanonico(pa.date, pa.code, pa.title); codigo = pa.code; pauta = pa; if (livre(novo, p.id)) { add({ tipo: 'renomear', alvoTipo: 'pasta', alvoId: p.id, de: p.name, para: novo, confirmar: true, motivo: `Sem código no nome; o título se parece (${Math.round(cand[0].s * 100)}%) com a pauta ${pa.code} "${pa.title}". Confirme antes de aplicar.` }); nomeFinal = novo; } }
        else avisos.push({ tipo: 'sem-pauta', alvoId: p.id, nome: p.name, texto: 'Pasta sem código e sem pauta parecida no calendário: não consegui ligar a nenhuma pauta.' });
      }
    } else if (pauta && pauta.date && pauta.date !== info.data) {
      const novo = nomeCanonico(pauta.date, codigo, info.titulo);
      if (livre(novo, p.id)) { add({ tipo: 'renomear', alvoTipo: 'pasta', alvoId: p.id, de: p.name, para: novo, motivo: `A data da pasta (${info.data}) é diferente da data da pauta ${codigo} no calendário (${pauta.date}).` }); nomeFinal = novo; }
    } else if (info && !pauta) avisos.push({ tipo: 'sem-pauta', alvoId: p.id, nome: p.name, texto: `O código ${codigo} não existe no calendário.` });
    if (codigo) { if (!porCodigo.has(codigo)) porCodigo.set(codigo, []); porCodigo.get(codigo).push(p.name); }
    const filhos = p.filhos || [], midias = filhos.filter(ehMidia), docs = filhos.filter(f => f.mimeType === DOC), tit = (pauta && pauta.title) || (info && info.titulo) || p.name;
    if (!midias.length) avisos.push({ tipo: 'sem-arte', alvoId: p.id, nome: p.name, texto: 'Pasta sem arte (imagem ou vídeo).' });
    if (!docs.length) avisos.push({ tipo: 'sem-legenda', alvoId: p.id, nome: p.name, texto: 'Pasta sem legenda (Google Doc).' });
    docs.forEach(d => { if (!/^legenda/i.test(d.name)) add({ tipo: 'renomear', alvoTipo: 'legenda', alvoId: d.id, de: d.name, para: `LEGENDA — ${tit}`.slice(0, 90), motivo: `O leitor do feed procura o documento que começa com "LEGENDA" na pasta ${nomeFinal}.` }); });
    if (midias.length >= 2 && !midias.some(m => /^\d{2}[_\-. ]/.test(m.name))) {
      midias.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true })).forEach((m, i) => add({ tipo: 'renomear', alvoTipo: 'arte', alvoId: m.id, de: m.name, para: `${String(i + 1).padStart(2, '0')}_${m.name}`, motivo: `Numera as artes de ${nomeFinal} para a ordem do carrossel ficar fixa (01, 02...).` }));
    }
  });
  porCodigo.forEach((nomes, codigo) => { if (nomes.length > 1) avisos.push({ tipo: 'duplicada', alvoId: '', nome: nomes.join(' | '), texto: `${nomes.length} pastas para o mesmo código ${codigo}. Escolha qual manter (o agente não apaga nem junta).` }); });
  arvore.soltos.forEach(f => avisos.push({ tipo: 'solto', alvoId: f.id, nome: f.name, texto: 'Arquivo solto na pasta de postagens: associe a uma pauta (o agente não sabe a qual).' }));
  return { acoes, avisos, resumo: { pastas: arvore.pastas.length, propostas: acoes.length, avisos: avisos.length, paraConfirmar: acoes.filter(a => a.confirmar).length } };
}

/* lê a árvore de uma pasta de postagens (um nível de subpastas) */
async function lerArvore(drive, raiz) {
  const filhos = await drive.filhos(raiz), pastas = filhos.filter(f => f.mimeType === FOLDER), soltos = filhos.filter(f => f.mimeType !== FOLDER);
  const comFilhos = [], fila = pastas.slice(0, 80); let i = 0;
  await Promise.all(Array.from({ length: Math.min(5, fila.length) }, async () => { while (i < fila.length) { const k = i++; comFilhos[k] = Object.assign({ id: fila[k].id, name: fila[k].name }, { filhos: (await drive.filhos(fila[k].id)).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })) }); } }));
  return { raiz, pastas: comFilhos, soltos: soltos.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })) };
}

/* as pautas de uma empresa como o servidor as enxerga: calendário ao vivo + pautas criadas + o que foi mudado à mão */
async function pautasDaMarca(repo, marca) {
  const M = require('./model'), DS = require('./dataset'), state = await M.loadState(repo), v = await DS.view(await M.activeClients(repo));
  const base = new Map(), over = state.overrides || {};
  (v.D.PLAN || []).filter(p => p.b === marca).forEach(p => base.set(p.code, { code: p.code, title: p.title, date: p.date, status: p.status === 'fin' ? 'agd' : p.status, format: p.format, b: marca }));
  (state.custom || []).filter(p => p.b === marca).forEach(p => base.set(p.code, { code: p.code, title: p.title, date: p.date, status: p.status === 'fin' ? 'agd' : p.status, format: p.format, b: marca }));
  base.forEach((p, c) => { const o = over[c]; if (o) { if (o.status) p.status = o.status; if (o.date) p.date = o.date; } });
  return base;
}

/* ---------- aplicar (só renomear) e desfazer ---------- */
async function aplicar(drive, acoes) {
  const feitos = [];
  for (const a of acoes) {
    try { await drive.renomear(a.alvoId, a.para); feitos.push({ id: a.id, ok: true, alvoId: a.alvoId, de: a.de, para: a.para, alvoTipo: a.alvoTipo }); }
    catch (e) { feitos.push({ id: a.id, ok: false, alvoId: a.alvoId, de: a.de, para: a.para, erro: e.expose ? e.message : 'falhou' }); if (/EDITOR/.test(e.message || '')) break; }
  }
  return feitos;
}
async function desfazer(drive, entradas) {
  const out = [];
  for (const e of entradas.filter(x => x.ok)) {
    try { const atual = await drive.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(e.alvoId)}?fields=id,name&supportsAllDrives=true`); if (atual.name !== e.para) { out.push({ alvoId: e.alvoId, ok: false, erro: `o nome mudou depois (agora "${atual.name}"): não mexi` }); continue; } await drive.renomear(e.alvoId, e.de); out.push({ alvoId: e.alvoId, ok: true, de: e.para, para: e.de }); }
    catch (err) { out.push({ alvoId: e.alvoId, ok: false, erro: err.expose ? err.message : 'falhou' }); }
  }
  return out;
}

/* ---------- o que a rota faz ---------- */
const podeOrganizar = u => !!u && u.tipo !== 'cliente' && (u.papel === 'admin' || u.papel === 'editor');
async function acesso(repo, user, marca) {
  if (!podeOrganizar(user)) throw new Forbidden('Só administrador ou editor organiza o Drive.');
  const cfg = await F.lerConfig(repo, marca), pastas = (cfg.pastas.length ? cfg.pastas : (F.PASTAS_PADRAO[marca] ? [{ id: F.PASTAS_PADRAO[marca] }] : []));
  const { activeClients } = require('./model'), { can } = require('./scope');
  const c = (await activeClients(repo)).find(x => x.key === marca); if (!c || !can(user, marca)) throw new Forbidden('Sem acesso a esta empresa.');
  if (!pastas.length) throw new BadRequest('Nenhuma pasta do Drive foi indicada para esta empresa.');
  return pastas[0].id;
}
async function propor(repo, user, marca, { drive }) {
  const raiz = await acesso(repo, user, marca); if (!drive) throw fail('O Drive não está ligado (falta GOOGLE_SERVICE_ACCOUNT_JSON).', 503);
  return Object.assign({ marca, raiz }, planejar(await lerArvore(drive, raiz), await pautasDaMarca(repo, marca)));
}
async function aplicarAprovadas(repo, user, marca, ids, { drive }) {
  const raiz = await acesso(repo, user, marca); if (!drive) throw fail('O Drive não está ligado.', 503);
  if (!Array.isArray(ids) || !ids.length) throw new BadRequest('Escolha ao menos uma mudança.');
  const plano = planejar(await lerArvore(drive, raiz), await pautasDaMarca(repo, marca)), aprov = plano.acoes.filter(a => ids.includes(a.id));
  if (!aprov.length) throw new BadRequest('Nenhuma das mudanças escolhidas existe mais (o Drive mudou). Analise de novo.');
  const feitos = await aplicar(drive, aprov), logId = 'drivelog:' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');
  await repo.upsert('Config', { chave: logId, valor: JSON.stringify({ marca, por: user.email, em: new Date().toISOString(), feitos }) }, { user });
  return { log: logId, feitos, ok: feitos.filter(x => x.ok).length, falhas: feitos.filter(x => !x.ok).length };
}
async function desfazerLog(repo, user, marca, logId, { drive }) {
  await acesso(repo, user, marca); if (!drive) throw fail('O Drive não está ligado.', 503);
  if (!/^drivelog:\d{14}-[0-9a-f]{6}$/.test(String(logId))) throw new BadRequest('Log inválido');
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(r => r.chave === logId); if (!row) throw new BadRequest('Log não encontrado');
  const reg = JSON.parse(row.valor); if (reg.marca !== marca) throw new Forbidden('Este log é de outra empresa.');
  const r = await desfazer(drive, reg.feitos);
  await repo.upsert('Config', { chave: logId, valor: JSON.stringify(Object.assign(reg, { desfeitoEm: new Date().toISOString(), desfeitoPor: user.email })) }, { user });
  return { desfeitas: r.filter(x => x.ok).length, puladas: r.filter(x => !x.ok), detalhe: r };
}
async function logs(repo, user, marca) {
  await acesso(repo, user, marca); await repo.load(['Config']);
  return repo.cache.Config.rows.filter(r => /^drivelog:/.test(r.chave)).map(r => { try { return Object.assign({ log: r.chave }, JSON.parse(r.valor)); } catch (e) { return null; } }).filter(x => x && x.marca === marca).sort((a, b) => b.em.localeCompare(a.em)).slice(0, 10).map(x => ({ log: x.log, em: x.em, por: x.por, renomeados: x.feitos.filter(f => f.ok).length, desfeitoEm: x.desfeitoEm || '' }));
}

module.exports = { FOLDER, DOC, DriveEscrita, novoDriveEscrita, _trocarDrive, planejar, lerArvore, pautasDaMarca, aplicar, desfazer, propor, aplicarAprovadas, desfazerLog, logs, nomeCanonico, achaCodigo, podeOrganizar };
