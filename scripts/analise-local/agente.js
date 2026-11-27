/* Agente do computador da agência (Central Nova7): busca no SITE os arquivos que alguém soltou na Central de Promoções,
   de qualquer aparelho, lê e CONFERE cada um com o processador deste computador e devolve o resultado ao site.
   Não abre porta nenhuma: é este computador que liga para o site (HTTPS), então funciona atrás de qualquer roteador.
   Não lê pasta nem arquivo do disco: só os bytes que o site entrega.
   Configuração: %USERPROFILE%\.nova7\agente.json  {"url":"https://...","token":"..."}  (ou --url e --token, ou N7_URL e LEITURA_TOKEN).
   Uso: node agente.js [--url ...] [--token ...] [--nucleos N] [--nome MeuPC]   (o Agente.ps1 cuida de tudo isso) */
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawn } = require('node:child_process');
const VERSAO = 2;

/* ---------- trabalhador: lê e confere UM arquivo que chegou como bytes ---------- */
if (!isMainThread) {
  parentPort.on('message', async t => {
    const t0 = Date.now();
    try {
      const A = require('./arquivos'), L = require('./leitura'), J = require('./janela'); require('../../public/assets/js/promo-ingest.js'); const I = globalThis.N7PromoIngest;
      const buf = Buffer.from(t.bytes || []), sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      if (t.tipo === 'calcular') {
        const C = require('./calcular'), r = C.calcularLoja(t.nome, t.nome); parentPort.postMessage({ id: t.id, ok: true, dados: C.compactar(r) }); return;
      }
      if (t.tipo === 'vendas') {
        const e = await A.extrairPdf(buf), a = A.agrupar(e.paginas, 2), b = A.agrupar(e.paginas, 1);
        const v = L.validarVendas({ lines: a.lines, linesB: b.lines, numPaginas: e.numPaginas, bytes: e.bytes, sha256 });
        const drop = I.partialDay(v.header), cov = I.coverage(v.rows, drop), produtos = I.aggregate(v.rows, { dropDay: drop });
        const janela = J.analisarJanela({ rows: v.rows, ajustes: v.ajustes, cobertura: cov, diaParcial: drop }), cj = J.conferirJanela(v, janela); v.checks.push(cj); v.ok = v.ok && cj.ok;
        const totalProdutos = v.rows.filter(r => !I.isNaoProduto(r) && r.data !== drop).reduce((s, r) => s + Math.round(r.valor * 100), 0);
        parentPort.postMessage({ id: t.id, ok: true, extra: v.ok ? { rows: v.rows.filter(r => r.data !== drop), ajustes: v.ajustes.filter(a => a.data !== drop), header: v.header, cobertura: cov } : null, dados: {
          ok: v.ok, tipo: 'vendas', nome: t.nome, sha256, checks: v.checks, header: v.header, paginas: v.paginas, linhas: v.rows.length, ajustes: v.ajustes.length,
          totalRodapeCentavos: v.totalRodape, somaCentavos: v.somaCentavos, diaParcial: drop || '', cobertura: cov, janela, produtos: v.ok ? produtos : {}, nProdutos: Object.keys(produtos).length, totalProdutosCentavos: totalProdutos, ms: Date.now() - t0 } });
      } else {
        const x = A.lerXlsx(buf), v = L.validarEstoque({ grid: x.grid, linhasNoArquivo: x.linhasNoArquivo, bytes: buf.length, sha256 });
        /* a importação do site aceita até 20.000 produtos e ~4 MB. Acima de 19.000, mandam-se só os itens com estoque (promoção só usa esses) e o resto é contado */
        let items = v.items, omitidos = 0;
        if (items.length > 19000) { const com = items.filter(i => i.estoque > 0); omitidos = items.length - com.length; items = com; }
        parentPort.postMessage({ id: t.id, ok: true, extra: v.ok ? { items: v.items } : null, dados: { ok: v.ok, tipo: 'estoque', nome: t.nome, sha256, checks: v.checks, stats: v.stats, produtosNoArquivo: v.items.length, omitidosSemEstoque: omitidos, items: v.ok ? items : [], ms: Date.now() - t0 } });
      }
    } catch (e) { parentPort.postMessage({ id: t.id, ok: false, erro: String(e && e.message || e) }); }
  });
  return;
}

/* ---------- configuração ---------- */
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
let cfgArq = {}; try { cfgArq = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.nova7', 'agente.json'), 'utf8')); } catch (e) { /* sem arquivo */ }
const URL_BASE = String(arg('--url') || process.env.N7_URL || cfgArq.url || 'https://app7-eight.vercel.app').replace(/\/$/, '');
const TOKEN = arg('--token') || process.env.LEITURA_TOKEN || cfgArq.token || '';
const NOME = String(arg('--nome') || os.hostname()).slice(0, 60);
const nuc = Math.max(1, Math.min(Number(arg('--nucleos')) || os.availableParallelism(), 16));
const PARTE = 3500000;
if (!TOKEN || TOKEN.length < 24) { console.error('Falta o token do computador. Rode  .\\Agente.ps1 -Configurar  (ou crie %USERPROFILE%\\.nova7\\agente.json).'); process.exit(2); }
const LOG = process.env.N7_LOG || (process.env.N7_ARMAZEM ? path.join(process.env.N7_ARMAZEM, 'agente.log') : path.join(os.homedir(), '.nova7', 'agente.log'));   /* testes (armazém isolado) não sujam o log real */
const log = (...a) => {
  const linha = new Date().toLocaleString('pt-BR') + ' ' + a.join(' ');
  console.log(new Date().toLocaleTimeString('pt-BR'), ...a);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); if (fs.existsSync(LOG) && fs.statSync(LOG).size > 2e6) fs.renameSync(LOG, LOG + '.1'); fs.appendFileSync(LOG, linha + '\n'); } catch (e) { /* sem log em arquivo */ }
};
/* uma gravação por vez em cada loja: dois arquivos da mesma loja ao mesmo tempo não podem se atropelar no manifesto */
const trava = new Map(); const comTrava = (k, fn) => { const ant = trava.get(k) || Promise.resolve(), p = ant.then(fn, fn); trava.set(k, p.catch(() => {})); return p; };

/* ---------- pool de trabalhadores (um por núcleo) ---------- */
const livres = [], fila = [], pend = new Map(); let seq = 0;
function criar() {
  const w = new Worker(__filename);
  w.on('message', m => { const p = pend.get(m.id); pend.delete(m.id); livres.push(w); rodar(); if (p) (m.ok ? p.ok({ dados: m.dados, extra: m.extra }) : p.falha(new Error(m.erro))); });
  w.on('error', e => { for (const [id, p] of pend) { pend.delete(id); p.falha(e); } const i = livres.indexOf(w); if (i >= 0) livres.splice(i, 1); livres.push(criar()); });
  return w;
}
for (let i = 0; i < nuc; i++) livres.push(criar());
function rodar() { while (livres.length && fila.length) { const w = livres.shift(), t = fila.shift(); pend.set(t.id, t.p); w.postMessage({ id: t.id, tipo: t.tipo, nome: t.nome, bytes: t.bytes }); } }
const ler = (tipo, nome, bytes) => new Promise((ok, falha) => { fila.push({ id: ++seq, tipo, nome, bytes, p: { ok, falha } }); rodar(); });

/* ---------- conversa com o site ---------- */
const H = { authorization: 'Bearer ' + TOKEN };
/* queda de rede (fetch failed, tempo esgotado, conexão derrubada) não é erro do sistema: tenta de novo 3 vezes, esperando 2, 6 e 15 segundos. Erro do site (HTTP 4xx/5xx) não é repetido. */
const ehQuedaDeRede = e => !e.status && /fetch failed|timeout|aborted|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket|network/i.test(String(e && (e.message + ' ' + (e.cause && e.cause.code || ''))));
async function chamar(acao, params = {}, opcoes = {}) {
  const esperas = opcoes.semRepetir ? [] : [2000, 6000, 15000]; let ultimo;
  for (let i = 0; i <= esperas.length; i++) {
    try { return await chamarUmaVez(acao, params, opcoes); } catch (e) { ultimo = e; if (!ehQuedaDeRede(e) || i === esperas.length) throw e; await new Promise(r => setTimeout(r, esperas[i])); }
  }
  throw ultimo;
}
async function chamarUmaVez(acao, params = {}, { metodo = 'GET', corpo, bin = false } = {}) {
  const u = new URL(URL_BASE + '/api/leitura'); u.searchParams.set('acao', acao); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { method: metodo, headers: Object.assign({}, H, corpo ? { 'content-type': Buffer.isBuffer(corpo) ? 'application/octet-stream' : 'application/json' } : {}), body: corpo ? (Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo)) : undefined, signal: AbortSignal.timeout(90000) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status }); }
  return bin ? Buffer.from(await r.arrayBuffer()) : r.json();
}

let ativos = 0, ultimaAtividade = 0, parar = false; const esperaCalc = new Map();
/* pasta dos relatórios HTML: Documentos\\Nova7 Relatórios (ou N7_RELATORIOS) */
const REL_DIR = process.env.N7_RELATORIOS || path.join(fs.existsSync(path.join(os.homedir(), 'Documents')) ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), '.nova7'), 'Nova7 Relatórios');
const MARCA = String(cfgArq.marca || 'Nova7');
/* recalcula a loja inteira a partir do armazém, publica no site e grava o relatório executivo em HTML (o mais novo e uma cópia com a data) */
async function calcularEPublicar(loja, motivo) {
  const t0 = Date.now(), dados = (await ler('calcular', loja, Buffer.alloc(0))).dados;
  if (!dados) { log(`Loja ${loja}: ainda sem vendas no armazém para analisar.`); return; }
  await chamar('publicar', { loja }, { metodo: 'POST', corpo: Buffer.from(JSON.stringify(dados)) });
  let arq = '';
  try {
    const RH = require('./relatorio-html'), dir = path.join(REL_DIR, String(loja).replace(/[^A-Za-z0-9_-]/g, '_')), html = RH.gerar(dados, { marca: MARCA }), hoje = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(dir, { recursive: true }); arq = path.join(dir, `relatorio-${loja}.html`); fs.writeFileSync(arq, html); fs.writeFileSync(path.join(dir, `relatorio-${loja}-${hoje}.html`), html);
  } catch (e) { log(`Relatório HTML da loja ${loja} não gravado: ${e.message}`); }
  agendarCerebro();
  log(`Análise completa da loja ${loja} ${motivo || 'recalculada'} em ${((Date.now() - t0) / 1000).toFixed(1)} s e publicada no site (${dados.cobertura.dias} dias, ${dados.geral.cupons} cupons).${arq ? ' Relatório: ' + arq : ''}`);
}
function recalcular(loja) {
  clearTimeout(esperaCalc.get(loja));
  esperaCalc.set(loja, setTimeout(async () => {
    try { await calcularEPublicar(loja, 'recalculada (relatório novo)'); } catch (e) { log(`Não consegui publicar a análise da loja ${loja}: ${e.message}`); }
  }, 4000));
}
async function processar(job) {
  const t0 = Date.now(), bat = setInterval(() => chamar('batida', { id: job.id }, { metodo: 'POST' }).catch(() => {}), 60000);
  try {
    log(`Recebi ${job.tipo === 'vendas' ? 'PDF de vendas' : 'estoque'} "${job.nome}" (${(job.bytes / 1048576).toFixed(1)} MB, loja ${job.loja}). Baixando…`);
    const partes = []; for (let n = 0; n < job.partes; n++) partes.push(await chamar('baixar', { id: job.id, n }, { bin: true }));
    const bytes = Buffer.concat(partes); if (bytes.length !== job.bytes) throw new Error(`O arquivo chegou com ${bytes.length} bytes, o esperado era ${job.bytes}.`);
    log(`Lendo "${job.nome}" com o processador deste computador…`);
    const lido = await ler(job.tipo, job.nome, bytes), dados = lido.dados;
    /* guarda no armazém só o que fechou: relatório novo entra, dia que já estava igual é reconhecido, dia diferente é substituído pelo mais novo */
    if (dados.ok && job.tipo === 'vendas' && dados.header && dados.header.cnpj) {
      const c = await chamar('loja', { loja: job.loja, cnpj: dados.header.cnpj });
      if (!c.ok) { dados.ok = false; dados.checks.push({ id: 'loja', ok: false, aviso: false, msg: c.motivo, detalhe: { loja: job.loja, cnpj: dados.header.cnpj, dono: c.dono || null } }); dados.produtos = {}; dados.janela = null; log(`RECUSADO "${job.nome}": ${c.motivo}`); }
    }
    if (dados.ok && lido.extra) {
      const Z = require('./armazem');
      if (job.tipo === 'vendas') { dados.armazem = await comTrava(job.loja, async () => Z.guardar(job.loja, { rows: lido.extra.rows, ajustes: lido.extra.ajustes, cobertura: lido.extra.cobertura, emissao: lido.extra.header.emissao, arquivo: job.nome, sha256: dados.sha256 })); log(`Armazém da loja ${job.loja}: ${dados.armazem.novos} dia(s) novo(s), ${dados.armazem.iguais} já igual(is), ${dados.armazem.substituidos} substituído(s)${dados.armazem.ignoradosMaisAntigos ? ', ' + dados.armazem.ignoradosMaisAntigos + ' ignorado(s) por já haver relatório mais novo' : ''}.`); }
      else { await comTrava(job.loja, async () => Z.guardarEstoque(job.loja, lido.extra.items, job.nome, dados.sha256)); dados.armazem = { estoqueGuardado: lido.extra.items.length }; }
    }
    const json = Buffer.from(JSON.stringify(dados));
    const n = Math.max(1, Math.ceil(json.length / PARTE));
    for (let i = 0; i < n; i++) await chamar('enviar', { id: job.id, n: i }, { metodo: 'POST', corpo: json.subarray(i * PARTE, (i + 1) * PARTE) });
    await chamar('concluir', { id: job.id }, { metodo: 'POST', corpo: { partes: n } });
    log(`Pronto: "${job.nome}" em ${((Date.now() - t0) / 1000).toFixed(1)} s — ${dados.ok ? 'conferido, fechou ao centavo' : 'RECUSADO pela conferência'}.`);
    if (dados.ok && dados.armazem) recalcular(job.loja);
  } catch (e) {
    log(`FALHOU "${job.nome}": ${e.message}`);
    await chamar('falhar', { id: job.id }, { metodo: 'POST', corpo: { erro: e.message } }).catch(() => {});
  } finally { clearInterval(bat); ativos--; ultimaAtividade = Date.now(); }
}

const dorme = ms => new Promise(r => setTimeout(r, ms));
/* rotina automática: ao ligar e de tempos em tempos, refaz a análise e o relatório de cada loja do armazém, sem ninguém pedir */
async function rotina() {
  const Z = require('./armazem');
  const minhas = Z.lojas();
  for (const loja of minhas) { try { await calcularEPublicar(loja, 'atualizada pela rotina automática'); } catch (e) { log(`Rotina automática, loja ${loja}: ${e.message}`); } }
  try { const pub = (await chamar('publicadas')).lojas || []; for (const l of pub) if (l !== '_cerebro' && !minhas.includes(l)) { await chamar('despublicar', { loja: l }, { metodo: 'POST', corpo: { x: 1 } }); log(`Análise da loja ${l} retirada do site: ela não está mais no armazém deste computador.`); } } catch (e) { log('Rotina: ' + e.message); }
}
/* o cérebro inteiro (26 agentes, um por núcleo, com Promoções e Mercado do armazém) roda aqui e o resultado vai para a Central de Inteligência do site */
/* aviso no Windows (balão do sistema), sem instalar nada: só quando a decisão do dia muda para algo urgente */
const aspas = t => String(t).replace(/'/g, "''").replace(/[\r\n]+/g, ' ').slice(0, 180);
function avisar(titulo, texto) {
  const ps = `[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; $t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $n = $t.GetElementsByTagName('text'); [void]$n.Item(0).AppendChild($t.CreateTextNode('${aspas(titulo)}')); [void]$n.Item(1).AppendChild($t.CreateTextNode('${aspas(texto)}')); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Nova7').Show([Windows.UI.Notifications.ToastNotification]::new($t))`;
  try { spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'ignore', windowsHide: true }).on('error', () => {}); } catch (e) { /* sem aviso */ }
}
const ESTADO = path.join(os.homedir(), '.nova7', 'estado.json');
const lerEstado = () => { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return {}; } };
const gravarEstado = o => { try { fs.mkdirSync(path.dirname(ESTADO), { recursive: true }); fs.writeFileSync(ESTADO, JSON.stringify(o)); } catch (e) { /* sem estado */ } };
const semana = () => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = d.getUTCFullYear(), n = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return y + '-W' + String(n).padStart(2, '0'); };
const slug = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
/* ideias de conteúdo a partir das análises de Mercado: no máximo 3 por rodada, uma por categoria e semana */
async function criarIdeias(cerebro) {
  const lista = [...(cerebro.radar || []), ...(cerebro.ganhos || [])].filter(f => ['categorias', 'cesta', 'foco'].includes(f.agente) && f.marca).slice(0, 3);
  const ideias = lista.map(f => ({ id: `auto-${f.marca}-${f.agente}-${slug(f.titulo).slice(0, 22)}-${semana()}`.slice(0, 58), b: f.marca, format: f.agente === 'cesta' ? 'Reels' : 'Carrossel', title: f.titulo, note: [f.evidencia, f.acao].filter(Boolean).join(' — '), src: f.agente }));
  if (!ideias.length) return;
  const r = await chamar('ideias', {}, { metodo: 'POST', corpo: { ideias } });
  if (r.criadas && r.criadas.length) log(`Criei ${r.criadas.length} ideia(s) de conteúdo no banco de ideias do site a partir das análises.`);
}
/* Agente Criativo: com as chaves em agente.json, escreve rascunhos (ChatGPT) e cria o design (Canva) das pautas sem material. Nunca publica. */
const CRI = require('./criativo'), CRIC = CRI.config(cfgArq);
const PASTA_CRIATIVOS = process.env.N7_CRIATIVOS || path.join(fs.existsSync(path.join(os.homedir(), 'Documents')) ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), '.nova7'), 'Nova7 Criativos');
let criativoRodando = false, exportarAte = 0, ultimoErroExport = '';
/* ChatGPT pelo Chrome: sobe a ponte local (127.0.0.1) que a extensão "Nova7 ↔ ChatGPT" consulta. Sem API, sem chave. */
let PONTE = null, pausaCriativoAte = 0, chromeAte = 0, avisoSemExtensaoAte = 0;
if (CRIC.ligado && CRIC.modo === 'extensao') {
  const P = require('./ponte'), portaEnv = process.env.N7_PONTE_PORTA;
  PONTE = P.criar({ porta: portaEnv !== undefined ? Number(portaEnv) : (CRIC.porta || P.PORTA_PADRAO), log, persistir: true });
  PONTE.ligar().then(p => { CRIC.ponte = PONTE; log(`Ponte com o Chrome ligada em 127.0.0.1:${p}. Extensão (instale uma vez em chrome://extensions > Carregar sem compactação): ${PONTE.pastaExtensao}`); }).catch(e => log('Ponte com o Chrome: ' + e.message));
}
/* manda a legenda (Google Doc) e as artes do rascunho para a pasta do post no Drive. Se falta a permissão de Editor, espera 20 minutos e avisa uma vez */
/* Conta de serviço do Google não tem espaço para IMAGENS no "Meu Drive" de uma pessoa. Solução: com o app Google Drive para computador instalado, o agente
   copia as artes para uma pasta do Drive no PC (ARTES\<empresa>\<código>) e o próprio Google envia. Pasta: agente.json "driveLocal", env N7_DRIVE_LOCAL ou achada sozinha. */
function pastaDriveLocal() {
  /* testes (armazém isolado) nunca mexem no Drive de verdade; "off" desliga */
  if (process.env.N7_ARMAZEM && !process.env.N7_DRIVE_LOCAL) return '';
  const cfgDir = process.env.N7_DRIVE_LOCAL || cfgArq.driveLocal; if (cfgDir === 'off') return ''; if (cfgDir) return fs.existsSync(cfgDir) || fs.existsSync(path.dirname(cfgDir)) ? cfgDir : '';
  const cands = []; for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') for (const n of ['Meu Drive', 'My Drive']) cands.push(L + ':\\' + n);
  for (const n of ['Google Drive', 'Meu Drive', 'My Drive']) cands.push(path.join(os.homedir(), n));
  const raiz = cands.find(c => { try { return fs.statSync(c).isDirectory(); } catch (e) { return false; } }); return raiz ? path.join(raiz, 'ARTES') : '';
}
const NOMES_PASTA = { M: 'Minas Farma', F: 'Farma e Farma', C: 'Campo Forte', N: 'Nova7' };
let driveLocalAvisado = false;
function copiarParaDriveLocal(marca, codigo, imagens) {
  const base = pastaDriveLocal(); if (!base) return 0;
  const origem = path.join(PASTA_CRIATIVOS, CRI.slug(marca), codigo), destino = path.join(base, NOMES_PASTA[marca] || CRI.slug(marca), codigo); let n = 0;
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of imagens || []) { const f = path.join(origem, nome); if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(destino, nome)); n++; } }
  /* miniaturas do preview do site: o site as lê do Drive (ARTES/<empresa>/<código>/_preview) */
  const prev = path.join(origem, '_preview'); if (fs.existsSync(prev)) { fs.mkdirSync(path.join(destino, '_preview'), { recursive: true }); for (const n2 of fs.readdirSync(prev)) fs.copyFileSync(path.join(prev, n2), path.join(destino, '_preview', n2)); }
  if (n && !driveLocalAvisado) { driveLocalAvisado = true; log('Artes copiadas para o Drive do computador (' + base + '): o app do Google envia sozinho.'); }
  return n;
}
async function exportarParaDrive(marca, codigo, imagens) {
  let noDriveLocal = 0; try { noDriveLocal = copiarParaDriveLocal(marca, codigo, imagens); } catch (e) { log('Drive local, ' + codigo + ': ' + e.message); }
  if (Date.now() < exportarAte) return noDriveLocal > 0;
  try {
    await chamar('exportar', {}, { metodo: 'POST', corpo: { marca, codigo } });
    const pasta = path.join(PASTA_CRIATIVOS, CRI.slug(marca), codigo); let n = 0;
    for (const nome of noDriveLocal ? [] : imagens || []) { const f = path.join(pasta, nome); if (!fs.existsSync(f)) continue; await chamar('exportar', {}, { metodo: 'POST', corpo: { marca, codigo, arte: { nome, b64: fs.readFileSync(f).toString('base64') } } }); n++; }
    ultimoErroExport = ''; log(`Drive: ${codigo} enviado para a pasta do post (legenda${n ? ' + ' + n + ' arte(s)' : noDriveLocal ? '; ' + noDriveLocal + ' arte(s) pelo Drive do computador' : ''}).`); return true;
  } catch (e) { exportarAte = Date.now() + 20 * 60e3; if (e.message !== ultimoErroExport) { ultimoErroExport = e.message; log(`Drive, ${codigo}: ${e.message}`); } return false; }
}
const nomePastaArtes = (marca, codigo) => (NOMES_PASTA[marca] || CRI.slug(marca)) + '/' + codigo;
/* rascunhos feitos antes do preview: gera as miniaturas das artes que estão no computador, copia para o Drive e avisa o site */
async function refazerPreviews(lista) {
  const ARTE = require('./arte');
  for (const p of lista || []) {
    try {
      const pasta = path.join(PASTA_CRIATIVOS, CRI.slug(p.marca), p.codigo); if (!(p.imagens || []).some(n => fs.existsSync(path.join(pasta, n)))) continue;
      const nomes = await ARTE.miniaturas(pasta, p.imagens); if (!nomes.length) continue;
      try { copiarParaDriveLocal(p.marca, p.codigo, p.imagens); } catch (e) { /* sem Drive local */ }
      await chamar('previews', {}, { metodo: 'POST', corpo: { codigo: p.codigo, previews: nomes, pastaArtes: nomePastaArtes(p.marca, p.codigo) } }); log(`Preview: ${nomes.length} miniatura(s) de ${p.codigo} no site.`);
    } catch (e) { log(`Preview, ${p.codigo}: ${e.message}`); }
  }
}
async function rodarCriativo(soAjustes) {
  if (!CRIC.ligado || criativoRodando) return;
  if (CRIC.modo === 'extensao' && (!CRIC.ponte || Date.now() < pausaCriativoAte)) return;
  criativoRodando = true;
  try {
    const resp = await chamar(soAjustes ? 'criativo-ajustes' : 'criativo-fila'); let fila = resp.itens || []; const pendentes = resp.exportar || [];
    /* extensão desconectada: acorda o Chrome (no máximo a cada 15 min) e espera até 90 s; sem ela não há como escrever, mas o envio ao Drive segue */
    if (CRIC.modo === 'extensao' && fila.length && !PONTE.conectada()) {
      if (CRIC.abrirChrome && PONTE.jaViu() && Date.now() > chromeAte) { chromeAte = Date.now() + 15 * 60e3; log('Extensão do Chrome fora do ar: abrindo o Chrome no ChatGPT para ela voltar.'); require('./ponte').abrirChrome(); }
      if (!(await PONTE.aguardarConexao(90000))) { if (Date.now() > avisoSemExtensaoAte) { avisoSemExtensaoAte = Date.now() + 30 * 60e3; log(`Criativo: ${fila.length} pauta(s) esperando, mas a extensão "Nova7 ↔ ChatGPT" não está conectada. Abra o Chrome (logado no ChatGPT) com a extensão instalada: pasta ${PONTE.pastaExtensao}.`); } fila = []; }
    }
    const estado = lerEstado(); const hoje = new Date().toISOString().slice(0, 10); estado.criativo = estado.criativo && estado.criativo.dia === hoje ? estado.criativo : { dia: hoje, rascunhos: 0, imagens: 0 };
    let n = 0; const feitos = new Set();
    for (const item of fila) {
      if (!item.ajuste && (n >= CRIC.maxPorRodada || estado.criativo.rascunhos >= CRIC.maxPorDia)) continue;
      try {
        const r = await CRI.rascunhoDe(item, CRIC, { pastaBase: PASTA_CRIATIVOS, estado, log }), { artes, pasta, kit, ...limpo } = r; limpo.pastaArtes = nomePastaArtes(item.marca, item.codigo);
        await chamar('rascunho', {}, { metodo: 'POST', corpo: limpo }); n++; feitos.add(item.codigo);
        log(`${item.ajuste ? 'Rascunho ajustado' : 'Rascunho criado'} para ${item.codigo} (${item.cliente}): "${item.titulo}"${r.canvaUrl ? ' + design no Canva' : ''}${r.imagens.length ? ' + ' + r.imagens.length + ' arte(s) da marca' : ''}${r.alertas.length ? ' · ' + r.alertas.length + ' alerta(s) para revisar' : ''}. Aguarda a sua aprovação.`);
        await exportarParaDrive(item.marca, item.codigo, r.imagens);
      } catch (e) {
        log(`Criativo, ${item.codigo}: ${e.message}`);
        if (e.codigo) { pausaCriativoAte = Date.now() + (Number(process.env.N7_CRIATIVO_PAUSA_MS) || 5 * 60e3); break; }   // ChatGPT sem login/limite/fora do ar: não insiste em cada pauta, tenta de novo em 5 min
      }
    }
    for (const p of pendentes) { if (feitos.has(p.codigo)) continue; await exportarParaDrive(p.marca, p.codigo, p.imagens); }
    await refazerPreviews((resp.semPreview || []).filter(p => !feitos.has(p.codigo)));
    gravarEstado(Object.assign(lerEstado(), { criativo: estado.criativo }));
  } catch (e) { log('Criativo: ' + e.message); } finally { criativoRodando = false; }
}
const CRIATIVO_MS = Number(process.env.N7_CRIATIVO_MS) || 20 * 60e3, AJUSTES_MS = Number(process.env.N7_AJUSTES_MS) || 60e3;
if (CRIC.ligado) { setTimeout(() => rodarCriativo(false), Number(process.env.N7_CRIATIVO_INICIO_MS) || 60000); setInterval(() => rodarCriativo(false), CRIATIVO_MS); setInterval(() => rodarCriativo(true), AJUSTES_MS); }
let cerebroRodando = false;
async function rodarCerebro() {
  if (cerebroRodando) return; cerebroRodando = true; const t0 = Date.now(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-cerebro-'));
  try {
    try { const sy = await chamar('sincronizar', {}, { metodo: 'POST', corpo: { x: 1 } }); if (sy.movidas && sy.movidas.length) log(`Posts: ${sy.movidas.length} pauta(s) com arte e legenda completas no Drive foram para Aprovação (${sy.movidas.map(m => m.code).join(', ')}).`); } catch (e) { log('Sincronizar posts: ' + e.message); }
    const snap = await chamar('snapshot'); snap.fonte = 'computador da agência (dados do site)'; const arq = path.join(dir, 'snapshot.json'); fs.writeFileSync(arq, JSON.stringify(snap));
    const cod = await new Promise(res => { const p = spawn(process.execPath, [path.join(__dirname, 'analisar.js'), arq, dir, '--armazem', '--marca', MARCA, '--nucleos', String(nuc)], { stdio: 'ignore', env: process.env }); p.on('exit', res); p.on('error', () => res(-1)); });
    if (!fs.existsSync(path.join(dir, 'resultado.json'))) throw new Error('a análise não gerou resultado (código ' + cod + ')');
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'resultado.json'), 'utf8'));
    await chamar('publicar', { loja: '_cerebro' }, { metodo: 'POST', corpo: Buffer.from(JSON.stringify({ geradoEm: r.geradoEm, hoje: r.hoje, computador: NOME, execucao: r.execucao, agentes: r.agentes, cerebro: r.cerebro, lojas: r.lojas })) });
    try { await criarIdeias(r.cerebro); } catch (e) { log('Ideias automáticas: ' + e.message); }
    try { const est = lerEstado(), d = r.cerebro.decisao; if (d && d.nota >= 80 && est.ultimaDecisao !== d.titulo) { avisar('Nova7: decisão do dia', d.titulo); log('Aviso no Windows: ' + d.titulo); } gravarEstado(Object.assign(est, { ultimaDecisao: d ? d.titulo : '', em: new Date().toISOString() })); } catch (e) { /* sem aviso */ }
    log(`Cérebro rodado no computador da agência: ${r.agentes.length} agentes em até ${r.execucao.nucleosUsados} núcleo(s), ${(r.execucao.tempoTotalMs / 1000).toFixed(1)} s, ${r.cerebro.total} achado(s)${r.cerebro.decisao ? '; decisão: ' + r.cerebro.decisao.titulo : ''}. Publicado no site (${((Date.now() - t0) / 1000).toFixed(1)} s no total).`);
  } catch (e) { log('Cérebro: ' + e.message); } finally { cerebroRodando = false; fs.rmSync(dir, { recursive: true, force: true }); }
}
const CEREBRO_MS = Number(process.env.N7_CEREBRO_MS) || 30 * 60e3;
setTimeout(rodarCerebro, Number(process.env.N7_CEREBRO_INICIO_MS) || 40000); setInterval(rodarCerebro, CEREBRO_MS);
let esperaCerebro = null; const agendarCerebro = () => { clearTimeout(esperaCerebro); esperaCerebro = setTimeout(rodarCerebro, 8000); };
const ROTINA_MS = Number(process.env.N7_ROTINA_MS) || 6 * 3600e3;
setTimeout(rotina, Number(process.env.N7_ROTINA_INICIO_MS) || 20000); setInterval(rotina, ROTINA_MS);
(async () => {
  log(`Agente Nova7 v${VERSAO} ligado: ${nuc} núcleo(s), buscando arquivos em ${URL_BASE}. Deixe esta janela aberta; Ctrl+C desliga.`);
  let falhasSeguidas = 0, avisouOffline = false;
  while (!parar) {
    try {
      if (ativos >= nuc) { await dorme(1000); continue; }
      const r = await chamar('proximo', { nome: NOME, nucleos: nuc, criativo: CRIC.ligado ? 1 : 0 }, { semRepetir: true });
      falhasSeguidas = 0; if (avisouOffline) { log('Conexão com o site restabelecida.'); avisouOffline = false; }
      if (r.job) { ativos++; ultimaAtividade = Date.now(); processar(r.job); continue; }   /* sem esperar: pode haver mais arquivos */
      await dorme(Date.now() - ultimaAtividade < 120000 ? 2000 : 8000);                  /* logo depois de um arquivo, olha mais seguido */
    } catch (e) {
      if (e.status === 401) { console.error('O site recusou o token deste computador. Rode  .\\Agente.ps1 -Configurar  de novo.'); process.exit(3); }
      if (!avisouOffline || ++falhasSeguidas % 10 === 0) { log('Sem conexão com o site (' + e.message + '). Tentando de novo…'); avisouOffline = true; }
      await dorme(Math.min(30000, 3000 * (1 + falhasSeguidas)));
    }
  }
})();
process.on('SIGINT', () => { parar = true; log('Desligando o agente…'); setTimeout(() => process.exit(0), 300); });
