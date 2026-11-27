// Identidade visual: kit de cada empresa (cores medidas, logo aparado, fotos reais, avisos) e o plano de slides da arte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const M = require('../scripts/analise-local/marca');
const A = require('../scripts/analise-local/arte');

test('kit de marca: cada cliente tem cores válidas, logo e tema compatível com o logo', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-marcas-')); try {
    const kits = M.todas({ marcas: vazio }); assert.equal(kits.length, 6);
    for (const k of kits) {
      assert.ok(k.existe, k.key);
      for (const c of ['primaria', 'secundaria', 'destaque', 'escuro', 'claro']) assert.match(k.cores[c], /^#[0-9a-f]{6}$/i, `${k.key} ${c}`);
      for (const q of ['capa', 'conteudo', 'cta']) assert.ok(A.escolherTema(k, q, false).nome && k.logo.temas.includes(A.escolherTema(k, q, false).nome), `${k.key}: o tema de ${q} funciona com o logo`);
      const t = A.escolherTema(k, 'conteudo', false); assert.ok(A.contraste(t.fg, t.bg) >= 7, `${k.key}: texto legível`); assert.ok(A.contraste(t.ac, t.bg) >= 3, `${k.key}: acento visível`);
    }
    const minas = kits.find(k => k.key === 'minas-farma'); assert.ok(minas.logoRecorte && minas.logoRecorte.w < minas.logoW, 'o logo transparente da Minas Farma é aparado (sem a margem vazia)');
    assert.ok(Math.abs(minas.logoRecorte.w - minas.logoRecorte.h) <= 3, 'e fica quadrado, sem corte no círculo');
    assert.ok(kits.every(k => k.avisos.some(a => /fotos reais/.test(a))), 'avisa que faltam fotos reais');
    assert.ok(kits.find(k => k.key === 'junior-lopes-contador').avisos.some(a => /não tem logo/.test(a)), 'avisa quem não tem logo');
  } finally { fs.rmSync(vazio, { recursive: true, force: true }); }
});

test('kit de marca: o que a agência põe na pasta de marcas vale mais que o padrão (kit.json, logo próprio, fotos)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-marcas-')); try {
    fs.mkdirSync(path.join(dir, 'campo-forte', 'fotos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'campo-forte', 'kit.json'), JSON.stringify({ cores: { primaria: '#112233' }, tom: 'novo tom' }));
    fs.writeFileSync(path.join(dir, 'campo-forte', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'); fs.writeFileSync(path.join(dir, 'campo-forte', 'fotos', 'a.jpg'), 'x');
    const k = M.kit('campo-forte', { marcas: dir }); assert.equal(k.cores.primaria, '#112233'); assert.equal(k.cores.secundaria, '#A1D01E', 'o resto do padrão continua'); assert.equal(k.tom, 'novo tom');
    assert.equal(path.basename(k.logoArquivo), 'logo.svg'); assert.equal(k.fotos.length, 1); assert.ok(!k.avisos.some(a => /fotos reais/.test(a)));
    fs.writeFileSync(path.join(dir, 'campo-forte', 'kit.json'), '{ quebrado'); const k2 = M.kit('campo-forte', { marcas: dir }); assert.ok(k2.avisos.some(a => /inválido/.test(a)), 'kit.json quebrado é ignorado com aviso'); assert.equal(k2.cores.primaria, '#01896D');
    fs.writeFileSync(path.join(dir, 'campo-forte', 'kit.json'), JSON.stringify({ cores: { primaria: 'vermelho' } })); assert.equal(M.kit('campo-forte', { marcas: dir }).cores.primaria, '#01896D', 'cor inválida volta ao padrão');
    assert.equal(M.kit('empresa-que-nao-existe', { marcas: dir }).existe, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plano de slides: capa; carrossel vira conteúdo + fechamento; Reels/Story ficam verticais', () => {
  const r = { arte: { tag: 'Dica', titulo: 'Título', cta: 'Fale com a gente', slides: [{ titulo: 'A', texto: 'a' }, { titulo: 'B', texto: 'b' }] }, slides: [] };
  assert.deepEqual(A.planoDeSlides(r, { formato: 'Carrossel' }).map(s => s.tipo), ['capa', 'conteudo', 'conteudo', 'fechamento']);
  assert.deepEqual(A.planoDeSlides({ arte: { titulo: 'Só um' } }, { formato: 'Post', titulo: 'x' }).map(s => s.tipo), ['capa'], 'post simples: só a capa');
  const antigo = A.planoDeSlides({ arte: {}, slides: ['Passo 1: separe os documentos', 'Sem dois pontos'] }, { formato: 'Carrossel', titulo: 'T' }); assert.equal(antigo[1].titulo, 'Passo 1'); assert.equal(antigo[1].texto, 'separe os documentos'); assert.equal(antigo[2].titulo, 'Sem dois pontos');
});
