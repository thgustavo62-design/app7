// Fila de leitura no computador da agência: o arquivo vai ao site em pedaços, o agente (processo de verdade) lê e confere, o resultado volta.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const zlib = require('node:zlib'), path = require('node:path');
const db = require('../lib/db');

const TOKEN = 'teste-token-do-computador-da-agencia-0123456789';
const pdfSimples = linhas => {                                   /* PDF mínimo, uma página por 60 linhas, texto em Helvetica/WinAnsi */
  const objs = [], add = s => { objs.push(s); return objs.length; };
  const catalogo = add(''), paginasObj = add(''), fonte = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (let i = 0; i < linhas.length; i += 60) {
    const cont = linhas.slice(i, i + 60).map((l, k) => `BT /F1 6 Tf 1 0 0 1 10 ${780 - k * 12} Tm (${l.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n');
    const c = add(`<< /Length ${Buffer.byteLength(cont, 'latin1')} >>\nstream\n${cont}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${paginasObj} 0 R /MediaBox [0 0 1400 800] /Resources << /Font << /F1 ${fonte} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasObj} 0 R >>`; objs[paginasObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
};
const zip = arqs => {
  const out = [], cen = []; let off = 0;
  for (const [nome, txt] of Object.entries(arqs)) {
    const n = Buffer.from(nome), d = zlib.deflateRawSync(Buffer.from(txt)), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(txt.length, 22); h.writeUInt16LE(n.length, 26); out.push(h, n, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(txt.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42); cen.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(arqs).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...out, cd, e]);
};
const xlsx = linhas => zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="a" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' + linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => `<c r="${'ABCDEFGH'[c]}${r + 1}"${typeof v === 'string' ? ' t="inlineStr"><is><t>' + v + '</t></is>' : '><v>' + v + '</v>'}</c>`).join('')}</row>`).join('') + '</sheetData></worksheet>' });

const cab = (p, n) => [`31/08/2026 07:37 Pag.: ${p}/${n}`, 'Rede Minas Farma', '31689601000349', 'A N A L I T I C O D E V E N D A S', 'Periodo de: 01/08/2026 a 31/08/2026 Horario das 00:00:00 as 23:59:59', '-'.repeat(120), 'Data/Hora Mov. N\xBA Lanc. Usu.ID Barras Descricao do Produto Pre. Un Qtde. Vl. Liquido Oper. Emp. ID Cli. ID N\xBA Cx', '-'.repeat(120)];
const venda = (d, lanc, barras, desc, preco, qtd, valor) => `${d}/08/2026 07:50 ${lanc} 000020 ${barras} ${desc} ${preco} ${qtd} ${valor} A VISTA 000000000 00000000 00002`;
const relatorio = total => [...cab(1, 1), venda('01', 344057, '7896112486787', 'ARADOIS 50MG C/30 CPR', '10,96', 2, '21,92'), venda('02', 344058, '7899095201187', 'SODIX 50MG C/20 CPR', '8,08', 1, '8,08'), '-'.repeat(22), `Total: ${total}`, '='.repeat(120), 'Legenda:', 'Vl. Bruto: valor bruto'];

test('fila de leitura: arquivo enviado ao site é lido e conferido pelo agente (processo separado) e o resultado volta', async () => {
  process.env.LEITURA_TOKEN = TOKEN; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server');
  await require('../lib/model').applyOps(db.getRepo(), [{ t: 'user', op: 'upsert', email: 'c@x.com', nome: 'C', tipo: 'cliente', papel: 'cliente', empresas: ['F'] }, { t: 'user', op: 'upsert', email: 'e2@x.com', nome: 'E2', tipo: 'equipe', papel: 'editor', empresas: [] }], { email: 'dev@local', papel: 'admin', tipo: 'equipe', empresas: [] });
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const ck = u => 'n7_session=' + encodeURIComponent(session.create(u, cfg().sessionSecret, 600));
  const adm = ck({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] });
  const call = async (cookie, acao, { body, raw, params = '', metodo } = {}) => {
    const r = await fetch(`${base}/api/leitura?acao=${acao}${params}`, { method: metodo || (body || raw ? 'POST' : 'GET'), headers: Object.assign({ 'x-n7': '1', cookie }, raw ? { 'content-type': 'application/octet-stream' } : { 'content-type': 'application/json' }), body: raw || (body ? JSON.stringify(body) : undefined) });
    const t = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(t.toString('utf8')); } catch (e) { /* binário */ } return { s: r.status, j, t };
  };
  const enviar = async (tipo, nome, buf, loja = 'M') => {
    const n = await call(adm, 'nova', { body: { loja, tipo, nome, bytes: buf.length, partes: 1 } }); assert.equal(n.s, 200, JSON.stringify(n.j));
    assert.equal((await call(adm, 'parte', { raw: buf, params: `&id=${n.j.id}&n=0` })).s, 200); assert.equal((await call(adm, 'pronto', { body: {}, params: `&id=${n.j.id}` })).s, 200); return n.j.id;
  };
  let agente = null, armazemTmp = null;
  try {
    assert.equal((await call(adm, 'estado')).j.online, false, 'sem agente ligado o site sabe que o computador está desligado');
    assert.equal((await call(adm, 'proximo')).s, 401, 'a fila do computador exige o token');
    assert.equal((await fetch(`${base}/api/leitura?acao=proximo`, { headers: { authorization: 'Bearer token-errado-token-errado-token' } })).status, 401);
    assert.equal((await call(ck({ email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['F'] }), 'estado')).s, 403, 'usuário cliente não usa a fila');
    assert.equal((await call(adm, 'nova', { body: { loja: 'M', tipo: 'vendas', nome: 'x.pdf', bytes: 999999999, partes: 1 } })).s, 400, 'arquivo grande demais');
    assert.equal((await call(adm, 'nova', { body: { loja: 'M', tipo: 'outro', nome: 'x', bytes: 10, partes: 1 } })).s, 400, 'tipo inválido');

    const idOk = await enviar('vendas', 'agosto.pdf', pdfSimples(relatorio('30,00')));
    const idBad = await enviar('vendas', 'total-errado.pdf', pdfSimples(relatorio('29,99')));
    const idEst = await enviar('estoque', 'estoque.xlsx', xlsx([['Barras', 'Descrição', 'Estoque', 'Preço de Venda', 'Últ. Prc. Entrada'], ['7896112486787', 'ARADOIS', 5, 12.5, 7], ['7899095201187', 'SODIX', 0, 9, 5]]));
    const outro = ck({ email: 'e2@x.com', nome: 'E2', papel: 'editor', tipo: 'equipe', empresas: [] });
    assert.equal((await call(outro, 'status', { params: `&id=${idOk}` })).s, 404, 'o arquivo de outra pessoa não aparece');
    assert.equal((await call(adm, 'status', { params: `&id=${idOk}` })).j.estado, 'aguardando');

    armazemTmp = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'n7-arm-fila-'));
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2', '--nome', 'PC-teste'], { stdio: 'pipe', env: Object.assign({}, process.env, { N7_ARMAZEM: armazemTmp }) });   /* nunca grava no armazém real */
    let saida = ''; agente.stdout.on('data', d => { saida += d; }); agente.stderr.on('data', d => { saida += d; });
    const espera = async id => { for (let i = 0; i < 80; i++) { const st = await call(adm, 'status', { params: `&id=${id}` }); if (['pronto', 'erro'].includes(st.j.estado)) return st.j; await new Promise(r => setTimeout(r, 500)); } throw new Error('não terminou: ' + saida); };
    const resultado = async st => { const bufs = []; for (let n = 0; n < st.resultadoPartes; n++) bufs.push((await call(adm, 'resultado', { params: `&id=${st.id}&n=${n}` })).t); return JSON.parse(Buffer.concat(bufs).toString('utf8')); };

    const a = await espera(idOk), ra = await resultado(a);
    assert.equal(a.estado, 'pronto', saida); assert.equal(ra.ok, true, JSON.stringify(ra.checks.filter(c => !c.ok)));
    assert.equal(ra.linhas, 2); assert.equal(ra.somaCentavos, 3000); assert.equal(ra.totalRodapeCentavos, 3000); assert.equal(ra.nProdutos, 2);
    const b = await resultado(await espera(idBad)); assert.equal(b.ok, false, 'total do rodapé diferente de 1 centavo: recusado'); assert.ok(b.checks.find(c => c.id === 'total' && !c.ok)); assert.deepEqual(b.produtos, {});
    const e = await resultado(await espera(idEst)); assert.equal(e.ok, true); assert.equal(e.items.length, 2);
    const est = await call(adm, 'estado'); assert.equal(est.j.online, true); assert.equal(est.j.computador, 'PC-teste'); assert.equal(est.j.nucleos, 2);
    assert.equal((await call(adm, 'limpar', { body: {}, params: `&id=${idOk}` })).s, 200); assert.equal((await call(adm, 'status', { params: `&id=${idOk}` })).s, 404);
  } finally { if (agente) agente.kill(); if (armazemTmp) require('node:fs').rmSync(armazemTmp, { recursive: true, force: true }); srv.close(); delete process.env.LEITURA_TOKEN; db._resetMemory(); require('../lib/fila').reset(); }
});
