// Armazém de vendas: o agente guarda cada relatório conferido, só entra o que é novo, junta pedaços sem contar nada duas vezes e publica a análise no site.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const db = require('../lib/db');
const Z = require('../scripts/analise-local/armazem');

const pdfSimples = linhas => {
  const objs = [], add = s => { objs.push(s); return objs.length; };
  const catalogo = add(''), paginasObj = add(''), fonte = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), kids = [];
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
/* relatório de dias [d1..d2] de agosto, emitido em 'emit' (dd/mm hh:mm); 1 cupom por dia, 2 itens */
const relatorio = (d1, d2, emit) => {
  const dias = []; for (let d = d1; d <= d2; d++) dias.push(String(d).padStart(2, '0'));
  const vendas = dias.flatMap((d, i) => [`${d}/08/2026 10:0${i % 9} 5000${i} 000020 7896112486787 ARADOIS 50MG C/30 CPR 10,00 2 20,00 A VISTA 000000000 00000000 00001`, `${d}/08/2026 10:0${i % 9} 5000${i} 000020 7899095201187 SODIX 50MG C/20 CPR 5,00 1 5,00 A VISTA 000000000 00000000 00001`]);
  const total = (dias.length * 25).toFixed(2).replace('.', ',');
  return [`${emit} Pag.: 1/1`, 'Rede Minas Farma', '31689601000349', 'A N A L I T I C O D E V E N D A S', `Periodo de: ${dias[0]}/08/2026 a ${dias[dias.length - 1]}/08/2026 Horario das 00:00:00 as 23:59:59`, '-'.repeat(120), 'Data/Hora Mov. Lanc. Usu.ID Barras Descricao do Produto Pre. Un Qtde. Vl. Liquido Oper. Emp. ID Cli. ID Cx', '-'.repeat(120), ...vendas, '-'.repeat(22), `Total: ${total}`, '='.repeat(120), 'Legenda:', 'Vl. Bruto: valor bruto'];
};

test('armazém: relatórios fracionados entram aos poucos, o repetido não conta de novo, o mais novo vence e a análise é publicada no site', async () => {
  const TOKEN = 'teste-token-armazem-da-agencia-0123456789ab', armazem = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-armazem-'));
  process.env.LEITURA_TOKEN = TOKEN; process.env.N7_ARMAZEM = armazem; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server');
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const adm = 'n7_session=' + encodeURIComponent(session.create({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] }, cfg().sessionSecret, 600));
  const call = async (acao, { body, raw, params = '' } = {}) => { const r = await fetch(`${base}/api/leitura?acao=${acao}${params}`, { method: body || raw ? 'POST' : 'GET', headers: Object.assign({ 'x-n7': '1', cookie: adm }, raw ? { 'content-type': 'application/octet-stream' } : { 'content-type': 'application/json' }), body: raw || (body ? JSON.stringify(body) : undefined) }); const t = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(t.toString('utf8')); } catch (e) { /* binário */ } return { s: r.status, j, t }; };
  const enviar = async (nome, buf) => { const n = await call('nova', { body: { loja: 'M', tipo: 'vendas', nome, bytes: buf.length, partes: 1 } }); await call('parte', { raw: buf, params: `&id=${n.j.id}&n=0` }); await call('pronto', { body: {}, params: `&id=${n.j.id}` }); return n.j.id; };
  let agente = null;
  try {
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2', '--nome', 'PC-teste'], { stdio: 'pipe', env: process.env });
    let saida = ''; agente.stdout.on('data', d => { saida += d; });
    const resultado = async id => { for (let i = 0; i < 90; i++) { const st = await call('status', { params: `&id=${id}` }); if (st.j.estado === 'erro') throw new Error(st.j.erro + saida); if (st.j.estado === 'pronto') { const bufs = []; for (let n = 0; n < st.j.resultadoPartes; n++) bufs.push((await call('resultado', { params: `&id=${id}&n=${n}` })).t); return JSON.parse(Buffer.concat(bufs).toString('utf8')); } await new Promise(r => setTimeout(r, 400)); } throw new Error('não terminou ' + saida); };

    /* 1. primeiro pedaço: 1 a 3 de agosto (emitido no dia 5, depois do fechamento: nenhum dia cortado) */
    const a = await resultado(await enviar('dias-1-a-3.pdf', pdfSimples(relatorio(1, 3, '05/08/2026 09:00'))));
    assert.equal(a.ok, true, JSON.stringify(a.checks.filter(c => !c.ok))); assert.deepEqual([a.armazem.novos, a.armazem.iguais, a.armazem.substituidos], [3, 0, 0]);
    /* 2. o MESMO pedaço de novo: nada é contado duas vezes */
    const b = await resultado(await enviar('dias-1-a-3-de-novo.pdf', pdfSimples(relatorio(1, 3, '05/08/2026 09:00'))));
    assert.deepEqual([b.armazem.novos, b.armazem.iguais, b.armazem.substituidos], [0, 3, 0], 'relatório repetido é reconhecido como igual');
    /* 3. pedaço seguinte, com 1 dia de sobreposição: só os 3 dias novos entram */
    const c = await resultado(await enviar('dias-3-a-6.pdf', pdfSimples(relatorio(3, 6, '07/08/2026 09:00'))));
    assert.deepEqual([c.armazem.novos, c.armazem.iguais], [3, 1]);
    const w = Z.carregar('M'); assert.equal(w.dias.size, 6); assert.equal(w.rows.length, 12, '6 dias x 2 linhas: nenhum dia duplicado');
    /* 4. relatório mais ANTIGO nunca sobrescreve um dia que veio de um mais novo */
    const d = await resultado(await enviar('antigo.pdf', pdfSimples(relatorio(4, 5, '04/08/2026 09:00'))));
    assert.equal(d.armazem.ignoradosMaisAntigos, 2, 'o dia 4 e o 5 já vieram de relatórios mais novos');

    /* 5. a análise completa da loja é publicada no site e só aparece para quem pode abrir a loja */
    let pub = null; for (let i = 0; i < 40 && !pub; i++) { const r = await call('analise'); if (r.j && r.j.lojas && r.j.lojas.M && r.j.lojas.M.cobertura && r.j.lojas.M.cobertura.dias === 6) pub = r.j.lojas.M; else await new Promise(r2 => setTimeout(r2, 500)); }
    assert.ok(pub, 'análise publicada com 6 dias: ' + saida); assert.equal(pub.geral.cupons, 6); assert.equal(pub.geral.vendasCentavos, 15000);
    assert.ok(pub.foco && pub.horas.length && pub.oportunidades.length >= 0 && !('top' in pub.clientes), 'sem identificadores de clientes no que é publicado');
    assert.equal((await fetch(`${base}/api/leitura?acao=analise`)).status, 401);
  } finally { if (agente) agente.kill(); srv.close(); delete process.env.LEITURA_TOKEN; delete process.env.N7_ARMAZEM; db._resetMemory(); require('../lib/fila').reset(); fs.rmSync(armazem, { recursive: true, force: true }); }
});

test('rotina automática: com o armazém já cheio, o agente recalcula, publica no site e grava o relatório HTML sozinho, sem ninguém pedir', async () => {
  const TOKEN = 'teste-token-rotina-da-agencia-0123456789abcd', armazem = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-arm-rot-')), relat = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-rel-rot-'));
  process.env.LEITURA_TOKEN = TOKEN; process.env.N7_ARMAZEM = armazem; db._resetMemory(); require('../lib/fila').reset();
  const linha = (d, n, b, desc, v) => ({ data: d, hora: '10:15', lanc: String(n), usu: '000020', barras: b, desc, preco: v, qtd: 1, valor: v, oper: 'A VISTA', emp: '000000000', cli: '00000000', cx: '00001' });
  const rows = [1, 2, 3].flatMap(i => [linha(`2026-08-0${i}`, 100 + i, '7896112486787', 'ARADOIS 50MG C/30 CPR', 20), linha(`2026-08-0${i}`, 100 + i, '7899095201187', 'SODIX 50MG C/20 CPR', 5)]);
  Z.guardar('M', { rows, ajustes: [], cobertura: { inicio: '2026-08-01', fim: '2026-08-03' }, emissao: { data: '2026-08-05', hora: '09:00' }, arquivo: 'pre-existente.pdf' });
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server');
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const adm = 'n7_session=' + encodeURIComponent(session.create({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] }, cfg().sessionSecret, 600));
  let agente = null;
  try {
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2'], { stdio: 'pipe', env: Object.assign({}, process.env, { N7_ROTINA_INICIO_MS: '300', N7_RELATORIOS: relat }) });
    let saida = ''; agente.stdout.on('data', d => { saida += d; });
    let pub = null; for (let i = 0; i < 60 && !pub; i++) { const r = await fetch(`${base}/api/leitura?acao=analise`, { headers: { cookie: adm, 'x-n7': '1' } }); const j = await r.json(); if (j.lojas && j.lojas.M) pub = j.lojas.M; else await new Promise(r2 => setTimeout(r2, 400)); }
    assert.ok(pub, 'a rotina publicou sem ninguém enviar arquivo: ' + saida); assert.equal(pub.geral.cupons, 3);
    const html = path.join(relat, 'M', 'relatorio-M.html'); for (let i = 0; i < 20 && !fs.existsSync(html); i++) await new Promise(r => setTimeout(r, 200));
    assert.ok(fs.existsSync(html), 'relatório HTML gravado'); assert.match(fs.readFileSync(html, 'utf8'), /Resumo executivo/); assert.ok(fs.readdirSync(path.join(relat, 'M')).some(n => /relatorio-M-\d{4}-\d{2}-\d{2}\.html/.test(n)), 'cópia com a data');
  } finally { if (agente) agente.kill(); srv.close(); delete process.env.LEITURA_TOKEN; delete process.env.N7_ARMAZEM; db._resetMemory(); require('../lib/fila').reset(); fs.rmSync(armazem, { recursive: true, force: true }); fs.rmSync(relat, { recursive: true, force: true }); }
});
