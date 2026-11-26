/* Agente do computador da agência (Central Nova7): busca no SITE os arquivos que alguém soltou na Central de Promoções,
   de qualquer aparelho, lê e CONFERE cada um com o processador deste computador e devolve o resultado ao site.
   Não abre porta nenhuma: é este computador que liga para o site (HTTPS), então funciona atrás de qualquer roteador.
   Não lê pasta nem arquivo do disco: só os bytes que o site entrega.
   Configuração: %USERPROFILE%\.nova7\agente.json  {"url":"https://...","token":"..."}  (ou --url e --token, ou N7_URL e LEITURA_TOKEN).
   Uso: node agente.js [--url ...] [--token ...] [--nucleos N] [--nome MeuPC]   (o Agente.ps1 cuida de tudo isso) */
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const VERSAO = 2;

/* ---------- trabalhador: lê e confere UM arquivo que chegou como bytes ---------- */
if (!isMainThread) {
  parentPort.on('message', async t => {
    const t0 = Date.now();
    try {
      const A = require('./arquivos'), L = require('./leitura'); require('../../public/assets/js/promo-ingest.js'); const I = globalThis.N7PromoIngest;
      const buf = Buffer.from(t.bytes), sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      if (t.tipo === 'vendas') {
        const e = await A.extrairPdf(buf), a = A.agrupar(e.paginas, 2), b = A.agrupar(e.paginas, 1);
        const v = L.validarVendas({ lines: a.lines, linesB: b.lines, numPaginas: e.numPaginas, bytes: e.bytes, sha256 });
        const drop = I.partialDay(v.header), cov = I.coverage(v.rows, drop), produtos = I.aggregate(v.rows, { dropDay: drop });
        const totalProdutos = v.rows.filter(r => !I.isNaoProduto(r) && r.data !== drop).reduce((s, r) => s + Math.round(r.valor * 100), 0);
        parentPort.postMessage({ id: t.id, ok: true, dados: {
          ok: v.ok, tipo: 'vendas', nome: t.nome, sha256, checks: v.checks, header: v.header, paginas: v.paginas, linhas: v.rows.length, ajustes: v.ajustes.length,
          totalRodapeCentavos: v.totalRodape, somaCentavos: v.somaCentavos, diaParcial: drop || '', cobertura: cov, produtos: v.ok ? produtos : {}, nProdutos: Object.keys(produtos).length, totalProdutosCentavos: totalProdutos, ms: Date.now() - t0 } });
      } else {
        const x = A.lerXlsx(buf), v = L.validarEstoque({ grid: x.grid, linhasNoArquivo: x.linhasNoArquivo, bytes: buf.length, sha256 });
        /* a importação do site aceita até 20.000 produtos e ~4 MB. Acima de 19.000, mandam-se só os itens com estoque (promoção só usa esses) e o resto é contado */
        let items = v.items, omitidos = 0;
        if (items.length > 19000) { const com = items.filter(i => i.estoque > 0); omitidos = items.length - com.length; items = com; }
        parentPort.postMessage({ id: t.id, ok: true, dados: { ok: v.ok, tipo: 'estoque', nome: t.nome, sha256, checks: v.checks, stats: v.stats, produtosNoArquivo: v.items.length, omitidosSemEstoque: omitidos, items: v.ok ? items : [], ms: Date.now() - t0 } });
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
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

/* ---------- pool de trabalhadores (um por núcleo) ---------- */
const livres = [], fila = [], pend = new Map(); let seq = 0;
function criar() {
  const w = new Worker(__filename);
  w.on('message', m => { const p = pend.get(m.id); pend.delete(m.id); livres.push(w); rodar(); if (p) (m.ok ? p.ok(m.dados) : p.falha(new Error(m.erro))); });
  w.on('error', e => { for (const [id, p] of pend) { pend.delete(id); p.falha(e); } const i = livres.indexOf(w); if (i >= 0) livres.splice(i, 1); livres.push(criar()); });
  return w;
}
for (let i = 0; i < nuc; i++) livres.push(criar());
function rodar() { while (livres.length && fila.length) { const w = livres.shift(), t = fila.shift(); pend.set(t.id, t.p); w.postMessage({ id: t.id, tipo: t.tipo, nome: t.nome, bytes: t.bytes }); } }
const ler = (tipo, nome, bytes) => new Promise((ok, falha) => { fila.push({ id: ++seq, tipo, nome, bytes, p: { ok, falha } }); rodar(); });

/* ---------- conversa com o site ---------- */
const H = { authorization: 'Bearer ' + TOKEN };
async function chamar(acao, params = {}, { metodo = 'GET', corpo, bin = false } = {}) {
  const u = new URL(URL_BASE + '/api/leitura'); u.searchParams.set('acao', acao); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { method: metodo, headers: Object.assign({}, H, corpo ? { 'content-type': Buffer.isBuffer(corpo) ? 'application/octet-stream' : 'application/json' } : {}), body: corpo ? (Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo)) : undefined, signal: AbortSignal.timeout(90000) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status }); }
  return bin ? Buffer.from(await r.arrayBuffer()) : r.json();
}

let ativos = 0, ultimaAtividade = 0, parar = false;
async function processar(job) {
  const t0 = Date.now(), bat = setInterval(() => chamar('batida', { id: job.id }, { metodo: 'POST' }).catch(() => {}), 60000);
  try {
    log(`Recebi ${job.tipo === 'vendas' ? 'PDF de vendas' : 'estoque'} "${job.nome}" (${(job.bytes / 1048576).toFixed(1)} MB, loja ${job.loja}). Baixando…`);
    const partes = []; for (let n = 0; n < job.partes; n++) partes.push(await chamar('baixar', { id: job.id, n }, { bin: true }));
    const bytes = Buffer.concat(partes); if (bytes.length !== job.bytes) throw new Error(`O arquivo chegou com ${bytes.length} bytes, o esperado era ${job.bytes}.`);
    log(`Lendo "${job.nome}" com o processador deste computador…`);
    const dados = await ler(job.tipo, job.nome, bytes), json = Buffer.from(JSON.stringify(dados));
    const n = Math.max(1, Math.ceil(json.length / PARTE));
    for (let i = 0; i < n; i++) await chamar('enviar', { id: job.id, n: i }, { metodo: 'POST', corpo: json.subarray(i * PARTE, (i + 1) * PARTE) });
    await chamar('concluir', { id: job.id }, { metodo: 'POST', corpo: { partes: n } });
    log(`Pronto: "${job.nome}" em ${((Date.now() - t0) / 1000).toFixed(1)} s — ${dados.ok ? 'conferido, fechou ao centavo' : 'RECUSADO pela conferência'}.`);
  } catch (e) {
    log(`FALHOU "${job.nome}": ${e.message}`);
    await chamar('falhar', { id: job.id }, { metodo: 'POST', corpo: { erro: e.message } }).catch(() => {});
  } finally { clearInterval(bat); ativos--; ultimaAtividade = Date.now(); }
}

const dorme = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  log(`Agente Nova7 v${VERSAO} ligado: ${nuc} núcleo(s), buscando arquivos em ${URL_BASE}. Deixe esta janela aberta; Ctrl+C desliga.`);
  let falhasSeguidas = 0, avisouOffline = false;
  while (!parar) {
    try {
      if (ativos >= nuc) { await dorme(1000); continue; }
      const r = await chamar('proximo', { nome: NOME, nucleos: nuc });
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
