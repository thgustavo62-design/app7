/* Criação: o que os agentes de posts e criativo precisam do servidor.
   - sincronizar: pauta com arte e legenda COMPLETAS no Drive, ainda em "A planejar" ou "Em produção", é adiantada para "Aprovação" (a aprovação continua obrigatória).
   - referências de cada cliente (perfis da V4, estilo, o que evitar): chave Config referencias:<empresa>.
   - fila de criação: pautas dos próximos dias SEM material e sem rascunho, com o contexto para a IA escrever (perfil, referências, legendas recentes).
   - rascunhos do agente criativo: chave Config rascunho:<código>. O agente NUNCA publica: o rascunho passa pela aprovação interna e do cliente. */
const F = require('./feed');
const { BadRequest, Forbidden } = require('./model');
const { pautasDaMarca, nomeCanonico, achaCodigo, FOLDER, DOC } = require('./drive-org');

class NotFound extends Error { constructor(msg) { super(msg); this.name = 'NotFound'; this.status = 404; this.expose = true; } }
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
    const pautas = await pautasDaMarca(repo, c.key), rascs = new Map((await lerRascunhos(repo, c.key)).map(x => [x.codigo, x]));
    posts.posts.filter(completo).forEach(p => {
      const pa = p.codigo && pautas.get(p.codigo); if (!pa || !['prop', 'plan', 'prod'].includes(pa.status)) return;
      const ras = rascs.get(p.codigo); if (ras && ras.status !== 'aprovado') return;                /* material feito pela IA só vai ao cliente depois que uma pessoa aprova o rascunho */
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
function limparArte(a) {
  a = a || {}; const c = (v, n) => txt(v, n), sl = (Array.isArray(a.slides) ? a.slides : []).slice(0, 8).map(x => ({ titulo: c(x && x.titulo, 60), texto: c(x && x.texto, 180) })).filter(x => x.titulo);
  return { tag: c(a.tag, 30), titulo: c(a.titulo, 70), subtitulo: c(a.subtitulo, 100), cta: c(a.cta, 45), slides: sl };
}
function limparRascunho(r, pauta) {
  const lista = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map(x => txt(x, m)).filter(Boolean);
  return { codigo: pauta.code, marca: pauta.b, titulo: pauta.title, formato: pauta.format, data: pauta.date, legenda: txt(r.legenda, 2200), slides: lista(r.slides, 10, 220), roteiro: lista(r.roteiro, 12, 300), briefArte: txt(r.briefArte, 900), hashtags: lista(r.hashtags, 12, 40), alertas: lista(r.alertas, 10, 200),
    arte: limparArte(r.arte), canvaUrl: /^https:\/\/(www\.)?canva\.com\//.test(String(r.canvaUrl || '')) ? String(r.canvaUrl).slice(0, 300) : '', imagens: lista(r.imagens, 10, 120), previews: lista(r.previews, 10, 60).filter(n => /^[\w.-]+\.jpg$/i.test(n)), pastaArtes: txt(r.pastaArtes, 120).replace(/\.\./g, ''), modelo: txt(r.modelo, 60), geradoEm: new Date().toISOString(), status: 'novo' };
}
async function guardarRascunho(repo, user, corpo) {
  const M = require('./model'), codigo = String(corpo.codigo || ''); if (!/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(codigo)) throw new BadRequest('Código da pauta inválido');
  const marca = String(corpo.marca || ''), pauta = (await pautasDaMarca(repo, marca)).get(codigo); if (!pauta) throw new BadRequest('Esta pauta não existe no calendário.');
  const r = limparRascunho(corpo, pauta); if (!r.legenda && !r.slides.length && !r.roteiro.length) throw new BadRequest('O rascunho veio vazio.');
  await repo.load(['Config']); const antes = repo.cache.Config.rows.find(x => x.chave === keyRas(codigo)); let ant = null; try { ant = antes ? JSON.parse(antes.valor) : null; } catch (e) { ant = null; }
  if (ant) { r.versao = (ant.versao || 1) + 1; r.ajustes = (ant.ajustes || []).concat(ant.ajuste ? [{ instrucao: ant.ajuste.instrucao, em: ant.ajuste.em, por: ant.ajuste.por }] : []).slice(-8); if (ant.drive) r.drive = ant.drive; } else { r.versao = 1; r.ajustes = []; }
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
async function contextoDe(repo, user, c, drive) {
  const ref = await lerReferencias(repo, c.key), cfg = await F.lerConfig(repo, c.key); let posts = [];
  if (drive) { try { const d = await F.carregar(repo, user, c.key, { drive }); posts = d.drive.ligado ? d.drive.posts : []; } catch (e) { posts = []; } }
  const recentes = []; for (const p of posts.filter(x => x.legendaId).slice(0, 3)) { try { recentes.push((await F.legenda(repo, user, c.key, p.legendaId, { drive })).legenda); } catch (e) { /* sem legenda de exemplo */ } }
  return { ref, cfg, recentes };
}
/* pedidos de ajuste (a equipe escreveu o que mudar) e rascunhos cujo material ainda não foi para o Drive */
async function filaAjustes(repo, user, { drive } = {}) {
  const todos = await lerRascunhos(repo), itens = [], exportar = [], clientes = await clientesComDrive(repo);
  for (const r of todos.filter(x => x.status === 'ajustando' && x.ajuste)) {
    const c = clientes.find(x => x.key === r.marca); if (!c) continue; const ctx = await contextoDe(repo, user, c, drive);
    itens.push({ marca: c.key, slug: c.id, cliente: c.name, setor: c.setor || '', codigo: r.codigo, titulo: r.titulo, formato: r.formato, data: r.data, perfil: { handle: ctx.cfg.perfil.handle, bio: ctx.cfg.perfil.bio }, referencias: ctx.ref, legendasRecentes: ctx.recentes, ajuste: r.ajuste.instrucao, refazerArte: r.ajuste.refazerArte !== false, anterior: { legenda: r.legenda, arte: r.arte, slides: r.slides, roteiro: r.roteiro, briefArte: r.briefArte, hashtags: r.hashtags } });
  }
  const limite = Date.now() - 6 * 864e5;
  todos.filter(r => r.status !== 'descartado' && r.status !== 'ajustando' && Date.parse(r.geradoEm) > limite && (!r.drive || !r.drive.docId || (r.imagens || []).length > ((r.drive.artes || []).length))).forEach(r => exportar.push({ marca: r.marca, codigo: r.codigo, imagens: r.imagens || [] }));
  /* rascunhos com arte mas sem miniatura no site (criados antes do preview): o agente gera e manda */
  const semPreview = todos.filter(r => r.status !== 'descartado' && r.status !== 'ajustando' && Date.parse(r.geradoEm) > Date.now() - 14 * 864e5 && (r.imagens || []).length && !(r.previews || []).length).map(r => ({ marca: r.marca, codigo: r.codigo, imagens: r.imagens, legenda: r.legenda, hashtags: r.hashtags, roteiro: r.roteiro, alertas: r.alertas }));
  return { itens, exportar, semPreview };
}
/* o agente avisa que as miniaturas (e a pasta delas no Drive) estão prontas */
async function salvarPreviews(repo, user, codigo, { previews, pastaArtes } = {}) {
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(x => x.chave === keyRas(codigo)); if (!row) throw new BadRequest('Rascunho não encontrado');
  const r = JSON.parse(row.valor), lista = (Array.isArray(previews) ? previews : []).map(n => txt(n, 60)).filter(n => /^[\w.-]+\.jpg$/i.test(n)).slice(0, 10);
  r.previews = lista; r.pastaArtes = txt(pastaArtes, 120).replace(/\.\./g, ''); await repo.upsert('Config', { chave: keyRas(codigo), valor: JSON.stringify(r) }, { user }); return { previews: r.previews, pastaArtes: r.pastaArtes };
}
/* miniatura n (1,2,...) do rascunho, lida do Drive: ARTES/<empresa>/<código>/_preview/<arquivo>.jpg (o app Google Drive do computador da agência envia) */
const raizArtes = { id: '', ate: 0 };
async function lerPreview(repo, drive, codigo, n) {
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(x => x.chave === keyRas(codigo)); if (!row) throw new BadRequest('Rascunho não encontrado');
  const r = JSON.parse(row.valor), nome = (r.previews || [])[Number(n) - 1]; if (!nome || !r.pastaArtes) throw new NotFound('Este rascunho não tem miniatura.');
  const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase(), filho = async (pai, nm) => (await drive.filhos(pai)).find(f => igual(f.name, nm));
  if (!raizArtes.id || raizArtes.ate < Date.now()) { const id = process.env.DRIVE_ARTES_ID || ((await drive.buscar("mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = 'ARTES'")).find(f => igual(f.name, 'artes')) || {}).id; if (!id) throw new NotFound('A pasta "ARTES" do Drive não está visível para a conta de serviço: compartilhe-a com ' + drive.email + ' (Leitor).'); raizArtes.id = id; raizArtes.ate = Date.now() + 3600e3; }
  let pai = raizArtes.id; for (const parte of [...r.pastaArtes.split('/').filter(Boolean), '_preview']) { const f = await filho(pai, parte); if (!f) throw new NotFound('A miniatura ainda não chegou ao Drive (o app do Google leva alguns minutos para sincronizar).'); pai = f.id; }
  const arq = await filho(pai, nome); if (!arq) throw new NotFound('A miniatura ainda não chegou ao Drive (o app do Google leva alguns minutos para sincronizar).');
  return drive.baixar(arq.id);
}
async function filaCriacao(repo, user, { drive, dias = 7, max = 6 } = {}) {
  const itens = [], ras = new Set((await lerRascunhos(repo)).filter(r => r.status !== 'descartado').map(r => r.codigo));
  for (const c of await clientesComDrive(repo)) {
    const pautas = await pautasDaMarca(repo, c.key); let posts = [];
    if (drive) { try { const d = (await F.carregar(repo, user, c.key, { drive })); posts = d.drive.ligado ? d.drive.posts : []; } catch (e) { posts = []; } }
    const temMaterial = new Set(posts.filter(p => (p.midias || []).length).map(p => p.codigo)), ref = await lerReferencias(repo, c.key), cfg = await F.lerConfig(repo, c.key);
    const prox = [...pautas.values()].filter(p => p.status !== 'pub' && p.date >= hoje() && dia(p.date) - dia(hoje()) <= dias && !temMaterial.has(p.code) && !ras.has(p.code)).sort((a, b) => a.date.localeCompare(b.date));
    if (!prox.length) continue;
    const recentes = []; for (const p of posts.filter(x => x.legendaId).slice(0, 3)) { try { recentes.push((await F.legenda(repo, user, c.key, p.legendaId, { drive })).legenda); } catch (e) { /* sem legenda de exemplo */ } }
    prox.slice(0, 3).forEach(p => itens.push({ marca: c.key, slug: c.id, cliente: c.name, setor: c.setor || '', codigo: p.code, titulo: p.title, formato: p.format, data: p.date, perfil: { handle: cfg.perfil.handle, bio: cfg.perfil.bio }, referencias: ref, legendasRecentes: recentes }));
  }
  return itens.sort((a, b) => a.data.localeCompare(b.data)).slice(0, max);
}

/* ---------- exportar para o Drive: pasta do post + legenda (Google Doc) + artes ---------- */
const nomeSeguro = t => String(t || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 90);
function textoDoc(r) {
  const parte = (t, l) => (l && l.length ? `\n${t}\n${l.join('\n')}\n` : '');
  return [`LEGENDA PARA COPIAR\n${r.legenda}\n`, parte('HASHTAGS', r.hashtags && r.hashtags.length ? [r.hashtags.join(' ')] : []), parte('ORDEM DAS ARTES', (r.imagens && r.imagens.length ? r.imagens : r.slides) || []),
    parte('ROTEIRO', r.roteiro), `\nOBSERVAÇÃO INTERNA\nRASCUNHO GERADO POR IA (versão ${r.versao || 1}). Revise antes de publicar; nada foi publicado.\n${r.briefArte ? 'Brief da arte: ' + r.briefArte + '\n' : ''}${r.alertas && r.alertas.length ? 'Alertas:\n- ' + r.alertas.join('\n- ') + '\n' : ''}${r.canvaUrl ? 'Canva: ' + r.canvaUrl + '\n' : ''}`].join('');
}
/* a pasta onde o material do post nasce: a de "em produção" se existir, senão a primeira */
async function raizDe(repo, marca) {
  const cfg = await F.lerConfig(repo, marca), l = cfg.pastas.length ? cfg.pastas : (F.PASTAS_PADRAO[marca] ? [{ id: F.PASTAS_PADRAO[marca], status: 'pronto' }] : []);
  if (!l.length) throw new BadRequest('Nenhuma pasta do Drive foi indicada para esta empresa.'); return (l.find(x => x.status === 'producao') || l[0]).id;
}
async function exportarRascunho(repo, user, marca, codigo, { drive, arte } = {}) {
  if (!drive) throw Object.assign(new Error('O Drive não está ligado (falta GOOGLE_SERVICE_ACCOUNT_JSON).'), { status: 503, expose: true });
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(x => x.chave === keyRas(codigo)); if (!row) throw new BadRequest('Rascunho não encontrado');
  const r = JSON.parse(row.valor); if (r.marca !== marca) throw new Forbidden('Este rascunho é de outra empresa.'); if (r.status === 'descartado') throw new BadRequest('Rascunho descartado.');
  const pauta = (await pautasDaMarca(repo, marca)).get(codigo); if (!pauta) throw new BadRequest('Esta pauta não existe no calendário.');
  const raiz = await raizDe(repo, marca), d = Object.assign({ pastaId: '', docId: '', artes: [], arquivos: {} }, r.drive || {});
  if (!d.pastaId) {
    const existente = (await drive.filhos(raiz)).filter(f => f.mimeType === FOLDER).find(f => { const p = F.parsePasta(f.name); return (p && p.codigo === codigo.toUpperCase()) || achaCodigo(f.name, new Map([[codigo, 1]])) === codigo; });
    const pasta = existente || await drive.criarPasta(nomeCanonico(pauta.date, codigo, pauta.title), raiz); d.pastaId = pasta.id; d.pastaNome = pasta.name; d.criada = !existente;
  }
  const filhos = await drive.filhos(d.pastaId), humano = filhos.find(f => f.mimeType === DOC && /^legenda/i.test(f.name) && f.id !== d.docId);
  if (d.docId) await drive.atualizarDoc(d.docId, textoDoc(r));
  else if (humano) d.avisoDoc = 'Já havia uma legenda feita pela equipe nesta pasta: não mexi nela.';
  else { const doc = await drive.criarDoc(`LEGENDA — ${nomeSeguro(codigo + ' ' + pauta.title)}`, d.pastaId, textoDoc(r)); d.docId = doc.id; }
  /* versão nova com menos artes: a sobra fica como "_substituida_" (o agente renomeia, nunca apaga) */
  if (!arte && (r.imagens || []).length) for (const nome of Object.keys(d.arquivos || {})) if (!r.imagens.includes(nome)) { try { await drive.renomear(d.arquivos[nome], '_substituida_' + nome); } catch (e) { /* sem permissão: segue */ } delete d.arquivos[nome]; d.artes = (d.artes || []).filter(x => x !== nome); }
  if (arte && arte.nome && arte.b64) {
    const nome = String(arte.nome).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80), mime = /\.jpe?g$/i.test(nome) ? 'image/jpeg' : 'image/png', buf = Buffer.from(String(arte.b64), 'base64');
    if (!buf.length || buf.length > 3.2 * 1024 * 1024) throw new BadRequest('Imagem vazia ou grande demais.');
    const ja = d.arquivos[nome] || (filhos.find(f => f.name === nome) || {}).id;
    const salvo = ja ? await drive.trocarArquivo(ja, mime, buf) : await drive.criarArquivo(nome, d.pastaId, mime, buf);
    d.arquivos[nome] = salvo.id; d.artes = [...new Set([...(d.artes || []), nome])];
  }
  d.link = 'https://drive.google.com/drive/folders/' + d.pastaId; d.em = new Date().toISOString();
  r.drive = d; await repo.upsert('Config', { chave: keyRas(codigo), valor: JSON.stringify(r) }, { user });
  return d;
}
/* a equipe pede um ajuste: o agente reescreve (e refaz a arte, se pedido) na próxima rodada */
async function pedirAjuste(repo, user, codigo, { instrucao, refazerArte } = {}) {
  if (!F.podeEditar(user)) throw new Forbidden('Seu acesso é só de leitura.'); const ins = txt(instrucao, 600); if (ins.length < 4) throw new BadRequest('Escreva o que ajustar (ex.: mais curto, tom mais direto).');
  await repo.load(['Config']); const row = repo.cache.Config.rows.find(x => x.chave === keyRas(codigo)); if (!row) throw new BadRequest('Rascunho não encontrado');
  const r = JSON.parse(row.valor); r.status = 'ajustando'; r.ajuste = { instrucao: ins, refazerArte: refazerArte !== false, em: new Date().toISOString(), por: user.email };
  await repo.upsert('Config', { chave: keyRas(codigo), valor: JSON.stringify(r) }, { user }); return r;
}
/* pede ao agente para refazer a arte de rascunhos já criados (ex.: os feitos com o modelo simples, agora que o ChatGPT gera a imagem). Só rascunhos "novo" ou "aprovado" que existem */
async function refazerArtes(repo, user, codigos, instrucao) {
  const feitos = [];
  for (const c of [].concat(codigos || []).map(String).slice(0, 6)) {
    await repo.load(['Config']); const row = repo.cache.Config.rows.find(x => x.chave === keyRas(c)); if (!row) continue;
    let r; try { r = JSON.parse(row.valor); } catch (e) { continue; } if (!['novo', 'aprovado'].includes(r.status)) continue;
    await pedirAjuste(repo, user, c, { instrucao: txt(instrucao || 'Refazer a arte com o ChatGPT no padrão visual da marca (imagem 3D profissional, como as peças já aprovadas), mantendo o texto.', 600), refazerArte: true }); feitos.push(c);
  }
  return feitos;
}
module.exports = { refazerArtes, salvarPreviews, lerPreview, exportarRascunho, pedirAjuste, filaAjustes, textoDoc, raizDe, sincronizar, lerReferencias, salvarReferencias, lerRascunhos, guardarRascunho, decidirRascunho, filaCriacao, limparRef, completo };
