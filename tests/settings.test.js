// Serviços e ajudantes da tela de Configurações (sem navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/assets/js/services.js');
require('../public/assets/js/settings.js');
const SV = globalThis.N7Services, ST = globalThis.N7Settings;

test('serviços: lista ordenada e válida a partir do texto da planilha', () => {
  assert.deepEqual(SV.parse('varejo, redes;xyz trafego'), ['redes', 'trafego', 'varejo']);
  assert.deepEqual(SV.parse(''), []);
  const c = { services: ['trafego', 'criativos'] };
  assert.ok(SV.has(c, 'trafego') && !SV.has(c, 'redes')); assert.equal(SV.label(c), 'Tráfego + Criativos');
  assert.equal(SV.label({ services: [] }), 'sem serviço');
  assert.equal(SV.COLORS.length, 8);
});
test('configurações: endereço e chave da empresa nova', () => {
  assert.equal(ST._slug('Padaria Bom Pão & Cia!'), 'padaria-bom-pao-cia');
  assert.equal(ST._newKey('Padaria Bom Pão', ['M', 'F']), 'PBP');
  assert.equal(ST._newKey('Padaria Bom Pão', ['PBP']), 'PBP2');
  assert.equal(ST._newKey('Casa da Maria', []), 'CM');          /* "da" não entra na sigla */
  assert.match(ST._newKey('7 Mares', []), /^[A-Z][A-Z0-9]{0,3}$/, 'sempre começa por letra');
  assert.ok(ST._newKey('Minas Farma Aliança', ['MFA', 'MFA2']).length <= 4);
});
