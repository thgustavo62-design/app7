// Agentes de posts e criativo (servidor): sincronizar com o Drive, referências, fila de criação e rascunhos (que nunca publicam).
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/db');
const C = require('../lib/criacao');
const D = require('../lib/drive-org');
const F = require('../lib/feed');

const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';
class DriveFalso {
  constructor(arvore) { this.itens = new Map(); let n = 0; const raiz = { id: 'RAIZ_TESTE_1', name: 'raiz', mimeType: FOLDER, filhos: [] }; this.itens.set(raiz.id, raiz);
    const add = (pai, f) => { const id = f.id || 'x' + (++n), o = { id, name: f.name, mimeType: f.mimeType || FOLDER, filhos: [], texto: f.texto }; this.itens.set(id, o); pai.filhos.push(o); (f.filhos || []).forEach(c => add(o, c)); };
    arvore.forEach(f => add(raiz, f)); }
  get email() { return 'conta@teste'; }
  async filhos(id) { return (this.itens.get(id) || { filhos: [] }).filhos.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, thumbnailLink: 'https://lh3.googleusercontent.com/x=s220' })); }
  async texto(id) { return (this.itens.get(id) || {}).texto || ''; }
}
const adm = { email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] }, leitor = { email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] };

test('posts e criação: sincroniza só o completo, guarda referências, monta a fila só do que falta e o rascunho nunca publica', async () => {
  db._resetMemory(); const repo = db.getRepo(), M = require('../lib/model');
  const hoje = new Date().toISOString().slice(0, 10), pautas = [...(await D.pautasDaMarca(repo, 'M')).values()].filter(p => ['plan', 'prop'].includes(p.status) && p.date >= hoje).sort((a, b) => a.date.localeCompare(b.date));
  assert.ok(pautas.length >= 3, 'o plano embutido tem pautas futuras de M');
  const [completa, incompleta, faltando] = pautas, nome = p => D.nomeCanonico(p.date, p.code, p.title);
  const drive = new DriveFalso([
    { name: nome(completa), filhos: [{ name: '01_a.png', mimeType: 'image/png' }, { name: '02_b.png', mimeType: 'image/png' }, { name: 'LEGENDA — x', mimeType: DOC, id: 'DOC1', texto: 'LEGENDA PARA COPIAR\nTexto de exemplo da casa.\n' }] },
    { name: nome(incompleta), filhos: [{ name: '01_a.png', mimeType: 'image/png' }] }
  ]);
  await F.salvar(repo, adm, 'M', { pastas: [{ id: 'RAIZ_TESTE_1', status: 'pronto' }] });

  /* 1. sincronizar: só a pauta com arte E legenda vai para Aprovação */
  const r = await C.sincronizar(repo, adm, { drive }); assert.deepEqual(r.movidas.filter(x => x.marca === 'M').map(x => x.code), [completa.code]);
  const pa = (await D.pautasDaMarca(repo, 'M')); assert.equal(pa.get(completa.code).status, 'apr'); assert.equal(pa.get(incompleta.code).status, incompleta.status, 'material incompleto não anda');

  /* 2. referências (V4 e estilo): só quem edita salva */
  await assert.rejects(C.salvarReferencias(repo, leitor, 'M', { v4: [{ handle: '@v4company' }] }), /só de leitura/);
  const ref = await C.salvarReferencias(repo, adm, 'M', { v4: [{ handle: '@v4company', notas: 'capas com título grande' }, { handle: '' }], estilo: 'direto e acolhedor', evitar: 'prometer resultado', exemplos: ['legenda de exemplo'] });
  assert.deepEqual(ref.v4, [{ handle: 'v4company', notas: 'capas com título grande' }]); assert.deepEqual(await C.lerReferencias(repo, 'M'), ref);

  /* 3. fila de criação: só o que NÃO tem material e ainda não tem rascunho, com o contexto para a IA */
  let fila = await C.filaCriacao(repo, adm, { drive, dias: 365, max: 50 }); const m = fila.filter(x => x.marca === 'M').map(x => x.codigo);
  assert.ok(m.includes(faltando.code) && !m.includes(completa.code) && !m.includes(incompleta.code), 'a pauta com pasta (mesmo incompleta) não entra na fila: já tem material em produção');
  const item = fila.find(x => x.codigo === faltando.code); assert.equal(item.referencias.estilo, 'direto e acolhedor'); assert.ok(item.legendasRecentes.some(l => /Texto de exemplo/.test(l)), 'legendas recentes da casa vão como exemplo de estilo');

  /* 4. rascunho: grava, adianta a pauta para Em produção, sai da fila, e fica para aprovação (nunca publica) */
  const rasc = await C.guardarRascunho(repo, adm, { codigo: faltando.code, marca: 'M', legenda: 'Legenda criada pelo agente', slides: ['Capa', 'Slide 2'], briefArte: 'fundo claro, título grande', canvaUrl: 'https://www.canva.com/design/abc/edit', modelo: 'teste', alertas: [] });
  assert.equal(rasc.status, 'novo'); assert.equal(rasc.codigo, faltando.code); assert.equal((await D.pautasDaMarca(repo, 'M')).get(faltando.code).status, 'prod');
  assert.ok(!(await C.filaCriacao(repo, adm, { drive, dias: 365, max: 50 })).some(x => x.codigo === faltando.code), 'com rascunho, a pauta sai da fila');
  assert.equal((await C.lerRascunhos(repo, 'M'))[0].canvaUrl, 'https://www.canva.com/design/abc/edit');
  assert.equal((await C.guardarRascunho(repo, adm, { codigo: faltando.code, marca: 'M', legenda: 'x', canvaUrl: 'https://site-estranho.com/x' })).canvaUrl, '', 'link que não é do Canva é descartado');
  await assert.rejects(C.guardarRascunho(repo, adm, { codigo: 'ZZ-99', marca: 'M', legenda: 'x' }), /não existe/); await assert.rejects(C.guardarRascunho(repo, adm, { codigo: faltando.code, marca: 'M' }), /vazio/);
  assert.equal((await C.decidirRascunho(repo, adm, faltando.code, 'aprovado')).status, 'aprovado'); await assert.rejects(C.decidirRascunho(repo, leitor, faltando.code, 'descartado'), /só de leitura/);
  const pubs = (await M.loadState(repo)).overrides; assert.ok(!Object.values(pubs).some(o => o.status === 'pub'), 'nenhum agente marca algo como publicado');
  db._resetMemory();
});
