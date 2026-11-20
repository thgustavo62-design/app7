/* Central de Promoções: leitura de arquivos no navegador. O PDF vai para o pdf.js (carregado sob demanda) e o .xlsx é aberto
   com o JSZip que já vem no pacote do PowerPoint. Nada é enviado para fora: só o resultado (linhas lidas) segue para a tela. */
(function (root) {
  const PDFJS = "/assets/vendor/pdfjs/pdf.min.mjs", WORKER = "/assets/vendor/pdfjs/pdf.worker.min.mjs";
  let pdfjsP = null;
  const loadPdfjs = () => pdfjsP || (pdfjsP = import(PDFJS).then(m => { m.GlobalWorkerOptions.workerSrc = WORKER; return m; }));

  /* uma linha de texto por linha visual da página: junta os pedaços de texto pela altura (y) e ordena pela posição (x) */
  async function readPdfLines(buffer, onProgress) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p), tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim() !== "").map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
      items.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
      let line = [], cy = null;
      const flush = () => { if (line.length) { line.sort((a, b) => a.x - b.x); out.push(line.map(i => i.s).join(" ")); } line = []; };
      for (const it of items) { if (cy === null || Math.abs(it.y - cy) > 2) { flush(); cy = it.y; } line.push(it); }
      flush();
      page.cleanup();
      if (onProgress && (p % 5 === 0 || p === doc.numPages)) onProgress(p, doc.numPages);
    }
    await doc.destroy();
    return { lines: out, paginas: doc.numPages };
  }

  /* ---------- .xlsx: primeira planilha como matriz ---------- */
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  async function readXlsxGrid(buffer) {
    if (!root.JSZip && root.N7Lazy) await root.N7Lazy.pptx();                       /* o JSZip vem dentro do pacote do PowerPoint, que só é baixado quando preciso */
    const JSZip = root.JSZip; if (!JSZip) throw new Error("Leitor de planilha não carregou. Recarregue a página.");
    const zip = await JSZip.loadAsync(buffer);
    const read = async p => { const f = zip.file(p); return f ? f.async("string") : null; };
    const wb = await read("xl/workbook.xml"); if (!wb) throw new Error("Este arquivo não parece um .xlsx (Excel). Salve a exportação como .xlsx.");
    const rels = xml(await read("xl/_rels/workbook.xml.rels") || "<r/>"), first = xml(wb).querySelector("sheet");
    const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    let target = "worksheets/sheet1.xml";
    [...rels.querySelectorAll("Relationship")].forEach(r => { if (r.getAttribute("Id") === rid) target = r.getAttribute("Target"); });
    const path = "xl/" + target.replace(/^\/?(xl\/)?/, "");
    const sheetXml = await read(path); if (!sheetXml) throw new Error("Não achei a primeira planilha do arquivo.");
    const sst = await read("xl/sharedStrings.xml"), strings = sst ? [...xml(sst).querySelectorAll("si")].map(si => [...si.querySelectorAll("t")].map(t => t.textContent).join("")) : [];
    const grid = [];
    xml(sheetXml).querySelectorAll("sheetData > row").forEach(row => {
      const r = Number(row.getAttribute("r")) - 1 || grid.length, cells = [];
      row.querySelectorAll("c").forEach(c => {
        const t = c.getAttribute("t"), v = c.querySelector("v"), i = colIndex(c.getAttribute("r") || "A1");
        let val = null;
        if (t === "s") val = v ? strings[Number(v.textContent)] : null;
        else if (t === "inlineStr") val = [...c.querySelectorAll("t")].map(x => x.textContent).join("");
        else if (t === "str" || t === "e") val = v ? v.textContent : null;
        else if (t === "b") val = v ? v.textContent === "1" : null;
        else val = v && v.textContent !== "" ? Number(v.textContent) : null;
        cells[i] = val;
      });
      grid[r] = cells;
    });
    return grid.map(r => r || []);
  }
  /* .csv ou texto colado: ; , ou tabulação */
  function readCsvGrid(text) {
    const lines = String(text).replace(/\r/g, "").split("\n").filter(l => l.trim() !== ""), sample = lines.slice(0, 5).join("\n");
    const n = ch => (sample.match(new RegExp(ch === "\t" ? "\t" : "\\" + ch, "g")) || []).length;
    const d = n("\t") ? "\t" : n(";") >= n(",") ? ";" : ",";
    return lines.map(l => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === d && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; });
  }
  async function readStockFile(file) {
    const name = String(file.name || "").toLowerCase();
    if (/\.xlsx$/.test(name) || /\.xlsm$/.test(name)) return readXlsxGrid(await file.arrayBuffer());
    if (/\.(csv|txt)$/.test(name)) return readCsvGrid(await file.text());
    throw new Error("Use a exportação de estoque em .xlsx (ou .csv). Arquivo .xls antigo: abra no Excel e salve como .xlsx.");
  }
  root.N7PromoFiles = { readPdfLines, readXlsxGrid, readCsvGrid, readStockFile };
})(typeof window !== "undefined" ? window : globalThis);
