// O roteiro COMPLETO de slides, a sequência da semana (stories, Reels) e a direção de arte de designer chegam ao ChatGPT; o padrão extraído é mais rico.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const A = require('../scripts/analise-local/arte');
const C = require('../scripts/analise-local/criativo');
const M = require('../scripts/analise-local/marca');

const SLIDES = ['Comprou na Black? E agora?: Confira como organizar os produtos.', 'De olho na validade: Confira as datas.', 'O banheiro nem sempre é o lugar certo: Calor e umidade.', 'Abriu? Redobre a atenção.: Prazo após a abertura.', 'A embalagem também importa: Mantenha nas originais.', 'Cuidar também é saber guardar: Fora do alcance das crianças.'];

test('plano de imagens: o roteiro completo (todos os slides) manda; stories viram sequência; Reels é só a capa', () => {
  const r = { arte: { tag: 'Pós-Black', titulo: 'Comprou na Black?', cta: 'Fale com o farmacêutico', slides: [{ titulo: 'Só um', texto: 'x' }] }, slides: SLIDES, roteiro: [] };
  const p = A.planoDeSlides(r, { formato: 'Carrossel', titulo: 'T' });
  assert.deepEqual(p.map(x => x.tipo), ['capa', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'fechamento'], 'uma imagem por slide do roteiro (6) + capa + fechamento');
  assert.equal(p[1].titulo, 'Comprou na Black? E agora?'); assert.equal(p[6].titulo, 'Cuidar também é saber guardar');
  const st = A.planoDeSlides({ arte: { titulo: 'Dia de loja' }, slides: [], roteiro: ['Abertura: a loja acordando', 'Produto do dia: protetor', 'Chamada: venha hoje'] }, { formato: 'Stories', titulo: 'S' });
  assert.deepEqual(st.map(x => x.tipo), ['capa', 'conteudo', 'conteudo', 'conteudo'], 'sequência de stories a partir do roteiro de cenas'); assert.equal(st[2].titulo, 'Produto do dia');
  assert.deepEqual(A.planoDeSlides({ arte: { titulo: 'x' }, slides: [], roteiro: ['a: b', 'c: d'] }, { formato: 'Reels', titulo: 'R' }).map(x => x.tipo), ['capa'], 'Reels: capa (o vídeo é feito à parte)');
  /* arte mais completa que o roteiro: vale a arte */
  assert.equal(A.planoDeSlides({ arte: { titulo: 'x', slides: [{ titulo: 'a', texto: '' }, { titulo: 'b', texto: '' }, { titulo: 'c', texto: '' }] }, slides: ['um: dois'] }, { formato: 'Carrossel' }).length, 4);
});

test('pedido de arte: roteiro completo em todas as mensagens, sequência da semana, direção de designer e conferência de design/continuidade', () => {
  const marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-')); try {
    const kit = M.kit('minas-farma', { marcas }), r = { arte: { tag: 'Pós-Black', titulo: 'Comprou na Black?', cta: 'Fale com o farmacêutico', slides: [] }, slides: SLIDES, roteiro: ['Cena 1: mãos guardando caixas', 'Cena 2: gaveta organizada'], tipoPeca: 'educativo', produtos: [] };
    const item = { titulo: 'Pós-Black', formato: 'Carrossel', sequencia: [{ codigo: 'R-M09', titulo: 'Creatina para todos?', formato: 'Reels', data: '2026-12-02', antes: false }, { codigo: 'C-M08', titulo: 'Black Friday: ofertas', formato: 'Carrossel', data: '2026-11-26', antes: true }], perfil: {} };
    const plano = A.planoDeSlides(r, item), msgs = C.mensagensDeArte(item, r, kit, plano, false, [], 'nenhum', [], '', 'farmacia');
    assert.equal(msgs.length, 8);
    for (const m of msgs) { assert.match(m.texto, /ROTEIRO COMPLETO DO CARROSSEL/); assert.match(m.texto, /7\) SLIDE: Cuidar também é saber guardar/); assert.match(m.texto, /1\) CAPA \(gancho\)/); assert.match(m.texto, /8\) FECHAMENTO/); }
    assert.match(msgs[0].texto, /DIREÇÃO DE ARTE \(trabalhe como um designer sênior/); assert.match(msgs[0].texto, /SEQUÊNCIA DA SEMANA/); assert.match(msgs[0].texto, /02\/12 Reels: Creatina para todos\?/); assert.match(msgs[0].texto, /26\/11 Carrossel: Black Friday: ofertas \(já foi\)/);
    assert.match(msgs[3].texto, /Esta imagem vem depois de "De olho na validade" e antes de "Abriu\? Redobre a atenção\."/, 'cada imagem sabe o que veio antes e vem depois'); assert.match(msgs[7].texto, /encerra o carrossel/);
    const reels = C.mensagensDeArte({ titulo: 'R', formato: 'Reels', perfil: {} }, r, kit, [{ tipo: 'capa', titulo: 'T' }], true, [], 'x', [], '', 'farmacia')[0].texto; assert.match(reels, /ROTEIRO DO VÍDEO[^\n]*\n1\) Cena 1: mãos guardando caixas/, 'Reels: o roteiro das cenas vai junto');
  } finally { fs.rmSync(marcas, { recursive: true, force: true }); }
});

test('servidor: a sequência da semana traz pautas vizinhas (7 dias antes a 10 depois), sem a própria', () => {
  const { sequenciaDe } = require('../lib/criacao');
  const pautas = new Map(['A-1|2026-11-20', 'A-2|2026-11-26', 'A-3|2026-12-01', 'A-4|2026-12-02', 'A-5|2026-12-20'].map(x => { const [code, date] = x.split('|'); return [code, { code, date, title: 'Pauta ' + code, format: 'Reels', status: 'plan' }]; }));
  const s = sequenciaDe(pautas, 'A-3', '2026-12-01'); assert.deepEqual(s.map(x => x.codigo), ['A-2', 'A-4']); assert.equal(s[0].antes, true); assert.equal(s[1].antes, false); assert.deepEqual(sequenciaDe(pautas, 'A-3', ''), []);
});

test('padrão de criação v2: escala, grade, layouts, carrossel, stories e assinatura entram no texto do pedido; padrão antigo é refeito', async () => {
  const marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-mar-')); process.env.N7_MARCAS = marcas;
  try {
    const P = require('../scripts/analise-local/padrao'), kit = Object.assign(M.kit('campo-forte', { marcas }), { dir: path.join(marcas, 'campo-forte') }); const arqs = [];
    for (let i = 0; i < 4; i++) { const f = path.join(marcas, 'a' + i + '.png'); fs.writeFileSync(f, Buffer.alloc(30 * 1024, 1)); arqs.push(f); }
    const lib = { raiz: '', empresas: { 'campo-forte': { pastas: [], itens: arqs.map((f, i) => ({ rel: path.basename(f), abs: f, cat: 'finalizado', conjunto: 'c' + i, bytes: 30 * 1024, mtime: i, linha: 'geral' })) } } };
    const json = { resumo: 'Campo limpo e forte', paleta: [{ nome: 'Verde', hex: '#01896D', uso: 'marca' }], tipografia: { titulo: 'Sans', apoio: 'Sans', tratamento: 'caixa alta' }, elementos: ['talhão'], fundos: [], composicao: 'título no topo', logotipo: 'base', escalaTipografica: 'título 3x o apoio', grade: '2 colunas, margem 64px', layouts: [{ nome: 'Capa de safra', quando: 'abertura', estrutura: 'foto cheia, título embaixo' }], carrossel: 'capa forte, slides com número, fecha com CTA', stories: 'gancho, dado, CTA com enquete', assinatura: ['faixa verde'], receitas: {}, evitar: [] };
    const ponte = { pedirConversa: async (m) => { assert.match(m[0].texto, /escalaTipografica/); assert.match(m[0].texto, /layouts/); assert.match(m[0].texto, /stories/); return { resultados: [{ blocos: [JSON.stringify(json)] }] }; } };
    const p = await P.extrair(ponte, kit, lib, C.extrairJson, {}); assert.equal(p.versao, 2); assert.equal(p.layouts[0].nome, 'Capa de safra'); assert.equal(p.grade, '2 colunas, margem 64px');
    const t = P.textoDoPadrao(p); assert.match(t, /Grade: 2 colunas/); assert.match(t, /Escala tipográfica: título 3x/); assert.match(t, /Layouts: Capa de safra \(foto cheia/); assert.match(t, /Stories: gancho, dado/); assert.match(t, /Assinatura da marca: faixa verde/);
    /* padrão antigo (sem versão) é guardado de lado e extraído de novo */
    fs.writeFileSync(path.join(kit.dir, 'padrao.json'), JSON.stringify({ resumo: 'velho', paleta: [] })); const kit2 = Object.assign(M.kit('campo-forte', { marcas }), { dir: kit.dir }); assert.equal(kit2.padrao.resumo, 'velho');
    let extraiu = 0; const c = { ponte: { conectada: () => true, pedirConversa: async () => { extraiu++; return { resultados: [{ blocos: [JSON.stringify(json)] }] }; } } };
    process.env.N7_MKT_RAIZ = path.join(marcas, 'zz'); process.env.N7_DRIVE_RAIZ = path.join(marcas, 'yy'); process.env.N7_DOWNLOADS = path.join(marcas, 'xx');
    fs.writeFileSync(path.join(marcas, 'biblioteca.json'), JSON.stringify({ geradoEm: new Date().toISOString(), raiz: '', empresas: lib.empresas }));
    await C.garantirPadroes(c, { max: 6 }); assert.ok(extraiu >= 1, 'refez o padrão antigo'); assert.ok(fs.existsSync(path.join(kit.dir, 'padrao.v1.json')), 'o antigo ficou guardado'); assert.equal(JSON.parse(fs.readFileSync(path.join(kit.dir, 'padrao.json'), 'utf8')).versao, 2);
  } finally { for (const k of ['N7_MARCAS', 'N7_MKT_RAIZ', 'N7_DRIVE_RAIZ', 'N7_DOWNLOADS']) delete process.env[k]; fs.rmSync(marcas, { recursive: true, force: true }); }
});
