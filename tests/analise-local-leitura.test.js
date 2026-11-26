// Leitura estrita dos relatórios (scripts/analise-local/leitura.js): só vale se fechar com o total do rodapé, ao centavo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const L = require('../scripts/analise-local/leitura');
const A = require('../scripts/analise-local/arquivos');

const cab = (p, n) => [`31/08/2026 07:37 Pag.: ${p}/${n}`, 'Rede Minas Farma', '31689601000349', 'A N A L I T I C O D E V E N D A S', 'Periodo de: 01/08/2026 a 31/08/2026 Horario das 00:00:00 as 23:59:59', '-'.repeat(120), 'Data/Hora Mov. Nº Lanc. Usu.ID Barras Descricao do Produto Pre. Un Qtde. Vl. Liquido Oper. Emp. ID Cli. ID Nº Cx', '-'.repeat(120)];
const venda = (d, h, lanc, barras, desc, preco, qtd, valor) => `${d}/08/2026 ${h} ${lanc} 000020 ${barras} ${desc} ${preco} ${qtd} ${valor} A VISTA 000000000 00000000 00002`;
const rodape = total => ['-'.repeat(22), `Total: ${total}`, '='.repeat(120), 'Legenda:', 'Vl. Bruto: valor bruto'];
const arred = '02/08/2026 18:06 344970 000006 0000000772921 ARREDONDAMENTO -0,11 0 -0,11 A VISTA 000000000 00000000 00001';
const bom = (extra = [], total = '29,89') => [...cab(1, 1), venda('01', '07:50', 344057, '7896112486787', 'ARADOIS 50MG C/30 CPR', '10,96', 2, '21,92'), venda('02', '08:10', 344058, '7899095201187', 'SODIX 50MG C/20 CPR', '8,08', 1, '8,08'), arred, ...extra, ...rodape(total)];
const rodar = (lines, linesB = lines, numPaginas = 1) => L.validarVendas({ lines, linesB, numPaginas });
const falhou = (r, id) => r.checks.find(c => c.id === id && !c.ok);

test('leitura estrita: relatório correto fecha ao centavo (vendas + arredondamento = total do rodapé)', () => {
  const r = rodar(bom());
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter(c => !c.ok)));
  assert.equal(r.rows.length, 2); assert.equal(r.ajustes.length, 1); assert.equal(r.somaCentavos, 2989);
});

test('leitura estrita: total do rodapé diferente de 1 centavo recusa o arquivo', () => {
  const r = rodar(bom([], '29,90'));
  assert.equal(r.ok, false); assert.ok(falhou(r, 'total'));
});

test('leitura estrita: linha de venda que o leitor não consegue ler recusa o arquivo (não aceita "99,9%")', () => {
  const quebrada = '03/08/2026 09:00 344059 000020 7896112486787 PRODUTO SEM PRECO 1 8,08 A VISTA 000000000 00000000 00002';
  const r = rodar(bom([quebrada]));
  assert.equal(r.ok, false); assert.ok(falhou(r, 'rejeitadas'));
});

test('leitura estrita: linha desconhecida e página faltando são recusadas', () => {
  assert.ok(falhou(rodar(bom(['LINHA ESTRANHA QUE NAO E VENDA'])), 'classificacao'));
  assert.ok(falhou(rodar(bom(), bom(), 2), 'paginas'));                       /* o PDF tem 2 páginas, o texto só marca 1 */
});

test('leitura estrita: duas leituras diferentes do mesmo PDF recusam o arquivo', () => {
  const b = bom().map(l => l.includes('SODIX') ? l.replace('8,08 1 8,08', '8,08 1 8,07') : l);
  assert.ok(falhou(rodar(bom(), b), 'dupla-leitura'));
});

test('leitura estrita: venda fora do período do cabeçalho é recusada', () => {
  const fora = venda('01', '07:50', 344060, '7896112486787', 'FORA', '1,00', 1, '1,00').replace('/08/2026', '/09/2026');
  assert.ok(falhou(rodar(bom([fora], '30,89')), 'datas'));
});

test('estoque estrito: toda linha é contada, duplicados e sem custo avisam, coluna e número ruins recusam', () => {
  const grid = [['Barras', 'Descrição', 'Estoque', 'Preço de Venda', 'Últ. Prc. Entrada'], ['7891', 'A', 5, 10, 6], ['7892', 'B', 0, 9, null], ['7891', 'A de novo', 3, 10, 6], [null, 'sem código', 1, 2, 1]];
  const r = L.validarEstoque({ grid, linhasNoArquivo: 5 });
  assert.equal(r.ok, true); assert.equal(r.items.length, 2);
  assert.ok(r.checks.find(c => c.id === 'linhas' && c.ok));
  assert.ok(r.checks.find(c => c.id === 'duplicados' && c.aviso));
  assert.ok(r.checks.find(c => c.id === 'sem-custo' && c.aviso));
  assert.equal(L.validarEstoque({ grid: [['x', 'y']], linhasNoArquivo: 1 }).ok, false, 'sem coluna Barras');
  assert.equal(L.validarEstoque({ grid: [...grid, ['7893', 'C', 'abc', 5, 1]], linhasNoArquivo: 6 }).ok, false, 'estoque não numérico');
});

test('leitor de .xlsx (sem biblioteca): lê textos compartilhados, números e a posição das colunas', () => {
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-x-')), arq = path.join(dir, 't.xlsx');
  fs.writeFileSync(arq, zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="a" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Barras</t></si><si><t>A &amp; B</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>12.5</v></c><c r="B2" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>'
  }));
  const g = A.lerXlsx(arq);
  assert.equal(g.grid[0][0], 'Barras'); assert.equal(g.grid[0][2], 'A & B'); assert.equal(g.grid[0][1], undefined);
  assert.deepEqual(g.grid[1], [12.5, 'x']); assert.equal(g.linhasNoArquivo, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
