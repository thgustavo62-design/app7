/* Leitura de arquivos no Node (sem dependências): PDF "Analítico de vendas" via pdf.js do próprio projeto e estoque .xlsx via zlib.
   Mesma lógica de agrupar linhas do navegador (public/assets/js/promo-files.js), para o texto sair igual. */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { pathToFileURL } = require('url');
const VENDOR = path.join(__dirname, '..', '..', 'public', 'assets', 'vendor', 'pdfjs');

let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) {
    const w = console.warn, lg = console.log, er = console.error; console.warn = console.log = console.error = () => {};                              /* o pdf.js avisa do canvas, que só serve para desenhar (não usamos) */
    pdfjsP = import(pathToFileURL(path.join(VENDOR, 'pdf.min.mjs')).href).then(m => { m.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(VENDOR, 'pdf.worker.min.mjs')).href; return m; }).finally(() => { console.warn = w; console.log = lg; console.error = er; });
  }
  return pdfjsP;
}

/* Extrai os pedaços de texto de cada página (texto, x, y), sem montar linhas: assim o agrupamento pode ser feito de mais de um jeito e conferido. */
async function extrairPdf(arquivo) {
  const pdfjs = await loadPdfjs();
  const buf = Buffer.isBuffer(arquivo) ? arquivo : fs.readFileSync(arquivo);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent();
    paginas.push(tc.items.filter(i => i.str && i.str.trim() !== '').map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] })));
    page.cleanup();
  }
  const n = doc.numPages; await doc.destroy();
  return { paginas, numPaginas: n, bytes: buf.length };
}
/* tol: tolerância (em pontos) para dois pedaços de texto contarem como a mesma linha. 2 é o valor que o navegador usa. */
function agrupar(paginas, tol = 2) {
  const lines = [], porPagina = [];
  for (const itens of paginas) {
    const items = itens.slice().sort((a, b) => (Math.abs(b.y - a.y) > tol ? b.y - a.y : a.x - b.x));
    let line = [], cy = null, n = 0;
    const flush = () => { if (line.length) { line.sort((a, b) => a.x - b.x); lines.push(line.map(i => i.s).join(' ')); n++; } line = []; };
    for (const it of items) { if (cy === null || Math.abs(it.y - cy) > tol) { flush(); cy = it.y; } line.push(it); }
    flush(); porPagina.push(n);
  }
  return { lines, linhasPorPagina: porPagina };
}
async function lerPdf(arquivo, { tol = 2 } = {}) {
  const e = await extrairPdf(arquivo);
  return Object.assign({ paginas: e.numPaginas, bytes: e.bytes }, agrupar(e.paginas, tol));
}

/* ---------- .xlsx: primeira planilha como matriz (zip lido à mão, sem biblioteca) ---------- */
function entradasZip(buf) {
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Não parece um .xlsx (zip sem diretório central). Salve a exportação como .xlsx.');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Arquivo .xlsx corrompido (diretório do zip).');
    const metodo = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nome = buf.toString('utf8', p + 46, p + 46 + buf.readUInt16LE(p + 28)), loc = buf.readUInt32LE(p + 42);
    out.set(nome, { metodo, csize, loc }); p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}
function lerEntrada(buf, ent) {
  if (!ent) return null;
  const l = ent.loc, dados = buf.subarray(l + 30 + buf.readUInt16LE(l + 26) + buf.readUInt16LE(l + 28), l + 30 + buf.readUInt16LE(l + 26) + buf.readUInt16LE(l + 28) + ent.csize);
  return (ent.metodo === 0 ? dados : zlib.inflateRawSync(dados)).toString('utf8');
}
const ent = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const textosDe = x => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => ent(m[1])).join('');

function lerXlsx(arquivo) {
  const buf = Buffer.isBuffer(arquivo) ? arquivo : fs.readFileSync(arquivo), z = entradasZip(buf), ler = n => lerEntrada(buf, z.get(n));
  const wb = ler('xl/workbook.xml'); if (!wb) throw new Error('Não achei xl/workbook.xml: o arquivo não parece um .xlsx.');
  const first = wb.match(/<sheet\b[^>]*>/); const rid = first && (first[0].match(/r:id="([^"]+)"/) || [])[1];
  let alvo = 'worksheets/sheet1.xml'; const rels = ler('xl/_rels/workbook.xml.rels') || '';
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { if ((m[0].match(/\bId="([^"]+)"/) || [])[1] === rid) alvo = (m[0].match(/\bTarget="([^"]+)"/) || [])[1] || alvo; }
  const xml = ler('xl/' + alvo.replace(/^\/?(xl\/)?/, '')); if (!xml) throw new Error('Não achei a primeira planilha do arquivo.');
  const sst = ler('xl/sharedStrings.xml'), strings = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textosDe(m[1])) : [];
  const grid = []; let celulas = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number((rm[1].match(/\br="(\d+)"/) || [])[1]) - 1 || grid.length, cells = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = cm[1], inner = cm[2] || '', t = (at.match(/\bt="([^"]+)"/) || [])[1], ref = (at.match(/\br="([A-Z]+\d+)"/) || [])[1] || 'A1';
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; let val = null;
      if (t === 's') val = v != null ? strings[Number(v)] : null;
      else if (t === 'inlineStr') val = textosDe(inner);
      else if (t === 'str' || t === 'e') val = v != null ? ent(v) : null;
      else if (t === 'b') val = v != null ? v === '1' : null;
      else val = v != null && v !== '' ? Number(v) : null;
      cells[colIndex(ref)] = val; celulas++;
    }
    grid[r] = cells;
  }
  return { grid: grid.map(r => r || []), linhasNoArquivo: (xml.match(/<row\b/g) || []).length, celulas };
}

module.exports = { extrairPdf, agrupar, lerPdf, lerXlsx };
