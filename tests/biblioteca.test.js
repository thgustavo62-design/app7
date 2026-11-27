// Biblioteca de referências (artes já aprovadas no Drive e no Downloads), padrão de criação extraído delas e banco de produtos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const grava = (f, kb = 40) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(kb * 1024, 7)); };

test('biblioteca: indexa por categoria, escolhe as peças do assunto e usa o Downloads só quando o nome diz o cliente', () => {
  const drive = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-drive-')), dl = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-dl-')), marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-'));
  process.env.N7_DRIVE_RAIZ = drive; process.env.N7_DOWNLOADS = dl;
  try {
    const M = path.join(drive, 'MINAS FARMA');
    for (let i = 1; i <= 4; i++) grava(path.join(M, 'POSTAGENS FINALIZADAS', '2026-11-05__C-M15__Minas-Club-Como-Participar', `0${i}_Slide.png`), 600);
    for (let i = 1; i <= 4; i++) grava(path.join(M, 'POSTAGENS FINALIZADAS', '2026-11-03__C-M14__Vitamina-D', `0${i}_Slide.png`), 700);
    for (let i = 1; i <= 3; i++) grava(path.join(M, 'carroseis', 'Magnesio', `${i}.png`), 500);
    grava(path.join(M, 'IDENTIDADE VISUAL MINAS CLUB', 'Emblema.png'), 300); grava(path.join(M, 'logos', 'USAR EM DESIGNS', 'logo-principal.png'), 200); grava(path.join(M, 'logos', 'icone.png'), 300); grava(path.join(M, 'FUNDOS PARA CRIAÇÃO E ITENS', 'presente.png'), 300);
    grava(path.join(M, 'POSTAGENS FINALIZADAS', '_preview', 'x.jpg'), 50);            // miniatura: ignorada
    grava(path.join(dl, 'Minas Club story.png'), 800); grava(path.join(dl, '00 (1).png'), 800); grava(path.join(dl, 'Farma e Farma Black Friday.png'), 800); grava(path.join(dl, 'WhatsApp Unknown x', 'Minas.png'), 800); grava(path.join(dl, 'pequena minas.png'), 100);
    const B = require('../scripts/analise-local/biblioteca'); const r = B.indexar({ marcas, raiz: drive });
    assert.equal(r['minas-farma'].porCategoria.finalizado, 8); assert.equal(r['minas-farma'].porCategoria.carrossel, 3); assert.equal(r['minas-farma'].porCategoria.identidade, 1); assert.equal(r['minas-farma'].porCategoria.elemento, 1); assert.equal(r['minas-farma'].porCategoria.logo, 2);
    assert.equal(r['minas-farma'].porCategoria.download, 1, 'Downloads: só a arte grande com "minas" no nome (sem WhatsApp, sem "00 (1)", sem a pequena)'); assert.equal(r['farma-e-farma'].porCategoria.download, 1);
    const lib = B.carregar({ marcas });
    const sel = B.escolherReferencias(lib, 'minas-farma', { formato: 'Carrossel', assunto: 'Minas Club como participar', n: 2 });
    assert.equal(sel.length, 2); assert.ok(sel.every(f => /Como-Participar/.test(f)), 'carrossel do mesmo assunto: capa + um slide do meio do conjunto já feito: ' + sel.join(' | '));
    assert.ok(!B.escolherReferencias(lib, 'minas-farma', { formato: 'Post', assunto: 'x', n: 3 }).some(f => /_preview|logos|FUNDOS|IDENTIDADE/.test(f)), 'logo, identidade, fundos e miniaturas não viram referência de estilo');
    assert.match(B.folhaDeIdentidade(lib, 'minas-farma'), /Emblema/); assert.match(B.melhorLogo(lib, 'minas-farma'), /USAR EM DESIGNS/, 'o logo vem da pasta "usar em designs"');
    assert.equal(B.escolherReferencias(lib, 'campo-forte', {}).length, 0, 'empresa sem peças: nada');
    assert.ok(B.amostraParaPadrao(lib, 'minas-farma', 8).length >= 3);
  } finally { delete process.env.N7_DRIVE_RAIZ; delete process.env.N7_DOWNLOADS; [drive, dl, marcas].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});

test('banco de produtos: acha a foto real pelo nome do produto, uma por consulta, e avisa quando parece remédio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-banco-')); process.env.N7_BANCO_PRODUTOS = dir;
  try {
    grava(path.join(dir, '7891111111111 - PROTETOR SOLAR FPS30 200ML - OAZ.jpg'), 60); grava(path.join(dir, '7892222222222 - PROTETOR SOLAR INFANTIL FPS50 120ML.jpg'), 60); grava(path.join(dir, '7893333333333 - CREATINA PURA 300G - PROBIOTICA.jpg'), 60);
    grava(path.join(dir, '7894444444444 - DIPIRONA XPE 50MG C-100 ML.jpg'), 60); grava(path.join(dir, '7895555555555 - FOTO PEQUENA.jpg'), 2); fs.writeFileSync(path.join(dir, 'indice.csv'), 'ean;descricao\n');
    const BANCO = require('../scripts/analise-local/banco-produtos'); delete require.cache[require.resolve('../scripts/analise-local/banco-produtos')]; const B = require('../scripts/analise-local/banco-produtos');
    const r = B.buscar(['protetor solar', 'creatina', 'dipirona', 'produto que não existe'], { max: 3 });
    assert.deepEqual(r.map(x => x.nome), ['PROTETOR SOLAR FPS30 200ML - OAZ', 'CREATINA PURA 300G - PROBIOTICA', 'DIPIRONA XPE 50MG C-100 ML'], 'uma foto por consulta, a descrição mais enxuta');
    assert.deepEqual(r.map(x => x.remedio), [false, false, true], 'dipirona em xarope é marcada como remédio');
    assert.deepEqual(B.buscar(['solar infantil']).map(x => /INFANTIL/.test(x.nome)), [true], 'todas as palavras da consulta precisam aparecer');
    assert.equal(B.buscar(['foto pequena']).length, 0, 'arquivo minúsculo (imagem quebrada) é ignorado'); assert.equal(B.buscar([]).length, 0);
    assert.ok(BANCO.indice().length === 5);
  } finally { delete process.env.N7_BANCO_PRODUTOS; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('padrão de criação: o ChatGPT descreve o estilo das peças aprovadas e o guia entra no kit da empresa', async () => {
  const marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-')); process.env.N7_MARCAS = marcas;
  try {
    const P = require('../scripts/analise-local/padrao'), M = require('../scripts/analise-local/marca'), { extrairJson } = require('../scripts/analise-local/criativo');
    const kit = M.kit('minas-farma', { marcas }); assert.ok(kit.estiloArte && !kit.padrao, 'antes: só o texto padrão de marcas.json');
    const arqs = []; for (let i = 0; i < 4; i++) { const f = path.join(marcas, 'a' + i + '.png'); grava(f, 30); arqs.push(f); }
    const lib = { raiz: '', empresas: { 'minas-farma': { pastas: [], itens: arqs.map((f, i) => ({ rel: path.basename(f), abs: f, cat: 'finalizado', conjunto: 'c' + i, bytes: 30 * 1024, mtime: i })) } } };
    let pedido = null; const ponte = { pedirConversa: async (msgs, o) => { pedido = { msgs, o }; return { resultados: [{ texto: 'ok', blocos: [JSON.stringify({ resumo: 'Azul royal com bokeh e 3D brilhante', paleta: [{ nome: 'Azul royal', hex: '#0B3FBF', uso: 'fundo' }, { nome: 'ruim', hex: 'azul' }], tipografia: { titulo: 'Sans 3D grossa', apoio: 'Montserrat', tratamento: 'contorno azul' }, elementos: ['presentes 3D'], fundos: ['bokeh'], composicao: 'título no topo', logotipo: 'topo central', receitas: { promocional: 'Fundo azul com etiquetas 3D', educativo: '' }, evitar: ['fotos stock'] })] }] }; } };
    const p = await P.extrair(ponte, Object.assign(kit, { dir: path.join(marcas, 'minas-farma') }), lib, extrairJson, {});
    assert.equal(pedido.msgs[0].anexos.length, 4, 'mandou as peças como anexo'); assert.equal(pedido.o.temporario, true); assert.match(pedido.msgs[0].texto, /JÁ APROVADAS/);
    assert.deepEqual(p.paleta, [{ nome: 'Azul royal', hex: '#0B3FBF', uso: 'fundo' }], 'cor inválida descartada'); assert.equal(p.receitas.promocional, 'Fundo azul com etiquetas 3D');
    const k2 = M.kit('minas-farma', { marcas }); assert.ok(k2.padrao && /Azul royal 0B3FBF|#0B3FBF/.test(k2.estiloArte) && /bokeh/.test(k2.estiloArte), 'o kit passa a usar o padrão extraído: ' + k2.estiloArte);
    assert.equal(P.receitaDe(k2.padrao, 'promocional'), 'Fundo azul com etiquetas 3D'); assert.equal(P.receitaDe(k2.padrao, 'educativo'), '');
    fs.writeFileSync(path.join(marcas, 'minas-farma', 'padrao.json'), JSON.stringify(Object.assign({}, p, { resumo: 'Editado pela agência' }))); assert.match(M.kit('minas-farma', { marcas }).estiloArte, /Editado pela agência/, 'a agência pode editar o padrao.json');
  } finally { delete process.env.N7_MARCAS; fs.rmSync(marcas, { recursive: true, force: true }); }
});
