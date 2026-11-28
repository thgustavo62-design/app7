// Pasta do post no Drive: slides de uma versão anterior não ficam misturados com os da versão nova (vão para _versoes_anteriores, nunca são apagados).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const C = require('../scripts/analise-local/criativo');

const pasta = nomes => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-versoes-')); for (const n of nomes) fs.writeFileSync(path.join(d, n), 'x'); return d; };

test('versões anteriores: capa nova + 7 slides velhos → os velhos vão para _versoes_anteriores, a capa e a legenda ficam', () => {
  const d = pasta(['01_capa.png', '02_slide.png', '03_slide.png', '08_fechamento.png', 'LEGENDA.txt']);
  try {
    assert.equal(C.guardarVersoesAnteriores(d, ['01_capa.png']), 3);
    assert.deepEqual(fs.readdirSync(d).filter(n => n !== '_versoes_anteriores').sort(), ['01_capa.png', 'LEGENDA.txt']);
    const sub = fs.readdirSync(path.join(d, '_versoes_anteriores')); assert.equal(sub.length, 1);
    assert.deepEqual(fs.readdirSync(path.join(d, '_versoes_anteriores', sub[0])).sort(), ['02_slide.png', '03_slide.png', '08_fechamento.png'], 'nada foi apagado');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('versões anteriores: versão completa igual à da pasta, sem imagens atuais ou pasta inexistente → não mexe em nada', () => {
  const d = pasta(['01_capa.png', '02_slide.png']);
  try {
    assert.equal(C.guardarVersoesAnteriores(d, ['01_capa.png', '02_slide.png']), 0);
    assert.equal(C.guardarVersoesAnteriores(d, []), 0, 'sem imagens da versão atual não arquiva nada');
    assert.equal(C.guardarVersoesAnteriores(path.join(d, 'nao-existe'), ['01_capa.png']), 0);
    assert.deepEqual(fs.readdirSync(d).sort(), ['01_capa.png', '02_slide.png']);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
