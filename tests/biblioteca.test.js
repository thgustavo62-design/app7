// Biblioteca de referências (artes já aprovadas no Drive e no Downloads), padrão de criação extraído delas e banco de produtos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const grava = (f, kb = 40) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.alloc(kb * 1024, 7)); };

test('biblioteca: indexa por categoria, escolhe as peças do assunto e usa o Downloads só quando o nome diz o cliente', () => {
  const drive = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-drive-')), dl = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-dl-')), marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-'));
  process.env.N7_DRIVE_RAIZ = drive; process.env.N7_DOWNLOADS = dl; process.env.N7_MKT_RAIZ = path.join(drive, '__sem_marketing__');
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
    assert.ok(B.amostraParaPadrao(lib, 'minas-farma', '', 8).length >= 3);
  } finally { delete process.env.N7_DRIVE_RAIZ; delete process.env.N7_DOWNLOADS; delete process.env.N7_MKT_RAIZ; [drive, dl, marcas].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
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

test('regra das linhas: clube e farmácia não se misturam (logo, referências, identidade, Instagram e padrão)', () => {
  const mkt = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mkt-')), dl = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-dl-')), marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-'));
  process.env.N7_MKT_RAIZ = mkt; process.env.N7_DOWNLOADS = dl; process.env.N7_DRIVE_RAIZ = path.join(mkt, '__x__');
  try {
    const F = path.join(mkt, 'FARMA E FARMA MARKETING');
    grava(path.join(F, 'Logos', 'logo_farma_oficial.png.png'), 40); grava(path.join(F, 'Logos', 'Emblema 3D Corta Preço.png'), 60); grava(path.join(F, 'IDENTIDADE VISUAL FARMA CLUB', '04_Logo_Compacta_Com_Seta.png'), 90); grava(path.join(F, 'IDENTIDADE VISUAL FARMA CLUB', 'Kit_Completo_Farma_Club_Transparente.png'), 90);
    for (let i = 1; i <= 3; i++) grava(path.join(F, 'Artes di farma club', 'carrosel 1', `${i}.png`), 300); for (let i = 1; i <= 3; i++) grava(path.join(F, 'Carroseis', 'PROTETOR', `${i}.png`), 300);
    grava(path.join(F, 'produtos recortados', 'x', 'creatina.png'), 100); grava(path.join(F, 'video farma fest', 'capa.png'), 300); grava(path.join(dl, 'icone farma club.png'), 100);
    const B = require('../scripts/analise-local/biblioteca'); const r = B.indexar({ marcas, raiz: '' });
    assert.equal(r['farma-e-farma'].origem, 'marketing', 'a pasta MARKETING GUSTAVO vale mais que Drive e Downloads'); assert.equal(r['farma-e-farma'].porCategoria.recorte, 1, 'recortes de produto não viram referência de estilo'); assert.ok(!r['farma-e-farma'].porCategoria.download || r['farma-e-farma'].porCategoria.download === undefined);
    const lib = B.carregar({ marcas });
    assert.ok(lib.empresas['farma-e-farma'].itens.every(i => !/video/i.test(i.rel)), 'pastas de vídeo ficam de fora');
    assert.match(B.melhorLogo(lib, 'farma-e-farma', 'farmacia'), /logo_farma_oficial/, 'a farmácia usa o logo da farmácia (nunca o do clube nem etiqueta de campanha)'); assert.match(B.melhorLogo(lib, 'farma-e-farma', 'club'), /Logo_Compacta/, 'o clube usa o logo do clube');
    const cl = B.escolherReferencias(lib, 'farma-e-farma', { formato: 'Carrossel', assunto: 'x', n: 2, linha: 'club' }), fa = B.escolherReferencias(lib, 'farma-e-farma', { formato: 'Carrossel', assunto: 'x', n: 2, linha: 'farmacia' });
    assert.ok(cl.length && cl.every(f => /club/i.test(f)), 'referência de clube só do clube: ' + cl.join('|')); assert.ok(fa.length && fa.every(f => !/club/i.test(f)), 'referência da farmácia nunca é do clube: ' + fa.join('|'));
    assert.match(B.folhaDeIdentidade(lib, 'farma-e-farma', 'club'), /Kit_Completo/); assert.equal(B.folhaDeIdentidade(lib, 'farma-e-farma', 'farmacia'), '', 'a identidade do clube não serve para a farmácia');
    assert.ok(B.amostraParaPadrao(lib, 'farma-e-farma', 'club', 6).every(f => /club/i.test(f))); assert.ok(B.amostraParaPadrao(lib, 'farma-e-farma', 'farmacia', 6).every(f => !/club/i.test(f)));
    /* Instagram por linha */
    const IG = require('../scripts/analise-local/instagram'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ig-')); try {
      fs.writeFileSync(path.join(dir, 'a.jpg'), 'x'); fs.writeFileSync(path.join(dir, 'b.jpg'), 'x'); const d = { posts: [{ arquivo: 'a.jpg', legenda: 'Sorteio do Farma Club!', alt: '' }, { arquivo: 'b.jpg', legenda: 'Protetor solar no verão', alt: '' }] };
      assert.deepEqual(IG.imagensDe(d, dir, 2, { linha: 'club' }).map(f => path.basename(f)), ['a.jpg']); assert.deepEqual(IG.imagensDe(d, dir, 2, { linha: 'farmacia' }).map(f => path.basename(f)), ['b.jpg']); assert.equal(IG.imagensDe(d, dir, 2).length, 2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    /* decisão da linha e pedido da arte */
    const C = require('../scripts/analise-local/criativo'), M = require('../scripts/analise-local/marca'), kit = M.kit('farma-e-farma', { marcas });
    assert.equal(kit.clube, 'Farma Club'); assert.equal(C.decidirLinha({ titulo: 'Farma Club: como resgatar' }, { arte: {} }, kit), 'club'); assert.equal(C.decidirLinha({ titulo: 'Protetor solar' }, { arte: { titulo: 'Sol' }, linha: 'farmacia' }, kit), 'farmacia'); assert.equal(C.decidirLinha({ titulo: 'x' }, { arte: {}, linha: 'club' }, kit), 'club');
    assert.equal(C.decidirLinha({ titulo: 'Farma Club' }, { arte: {} }, M.kit('campo-forte', { marcas })), 'geral', 'empresa sem clube não tem linhas');
    const plano = [{ tipo: 'capa', titulo: 'T' }], rr = { arte: { titulo: 'T' }, tipoPeca: 'promocional', produtos: [] };
    const m1 = C.mensagensDeArte({ titulo: 'T' }, rr, kit, plano, false, [], 'nenhum', [], '', 'farmacia')[0].texto, m2 = C.mensagensDeArte({ titulo: 'T' }, rr, kit, plano, false, [], 'nenhum', [], '', 'club')[0].texto;
    assert.match(m1, /ARTE NORMAL DA FARMÁCIA/); assert.match(m1, /NÃO use logotipo, emblema, coroa[^.]*Farma Club/); assert.ok(!/LINHA: CLUBE/.test(m1)); assert.ok(m2.includes('LINHA: CLUBE DE BENEFÍCIOS (Farma Club)')); assert.match(m2, /SÓ sobre o Farma Club/);
    assert.ok(m2.includes('PADRÃO DA MARCA (CLUBE)'), 'o clube usa o estilo do clube'); assert.ok(!m1.includes('PADRÃO DA MARCA (CLUBE)')); assert.match(m1, /NÃO usar elementos do Farma Club/, 'o estilo da farmácia proíbe elementos do clube');
  } finally { delete process.env.N7_MKT_RAIZ; delete process.env.N7_DOWNLOADS; delete process.env.N7_DRIVE_RAIZ; [mkt, dl, marcas].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});
