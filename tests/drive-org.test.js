// Agente do Drive: propõe, aplica só o aprovado (só renomear), nunca apaga e desfaz. Com um Drive de mentira em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/drive-org');
const db = require('../lib/db');

const FOLDER = 'application/vnd.google-apps.folder', DOC = 'application/vnd.google-apps.document';
class DriveFalso {
  constructor(arvore) { this.itens = new Map(); this.renomeados = []; this.apagados = 0; let n = 0; const raiz = { id: 'RAIZ', name: 'raiz', mimeType: FOLDER, filhos: [] }; this.itens.set('RAIZ', raiz); this.itens.set('RAIZ_TESTE_1', raiz);
    const add = (pai, f) => { const id = f.id || 'x' + (++n), o = { id, name: f.name, mimeType: f.mimeType || FOLDER, filhos: [] }; this.itens.set(id, o); pai.filhos.push(o); (f.filhos || []).forEach(c => add(o, c)); };
    arvore.forEach(f => add(raiz, f)); }
  get email() { return 'conta@teste'; }
  async filhos(id) { return (this.itens.get(id) || { filhos: [] }).filhos.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })); }
  async renomear(id, nome) { const o = this.itens.get(id); if (!o) throw Object.assign(new Error('x'), { expose: true }); this.renomeados.push([o.name, nome]); o.name = nome; return { id, name: nome }; }
  async get(url) { const id = decodeURIComponent((url.match(/files\/([^?/]+)/) || [])[1]); const o = this.itens.get(id); return { id, name: o.name }; }
}
const pautas = new Map([['C-M15', { code: 'C-M15', title: 'Minas Club: como participar', date: '2026-11-05', status: 'prod' }], ['R-M08', { code: 'R-M08', title: 'Oferta de fraldas', date: '2026-11-12', status: 'plan' }], ['C-M20', { code: 'C-M20', title: 'Dicas de verão', date: '2026-11-20', status: 'plan' }]]);
const arvore = () => [
  { id: 'p1', name: '2026-11-05__C-M15__Minas-Club-Como-Participar', filhos: [{ name: '01_capa.png', mimeType: 'image/png' }, { name: '02_slide.png', mimeType: 'image/png' }, { name: 'LEGENDA — Minas Club', mimeType: DOC }] },
  { id: 'p2', name: '2026-11-10__R-M08__Oferta-De-Fraldas', filhos: [{ name: 'a.png', mimeType: 'image/png' }, { name: 'b.png', mimeType: 'image/png' }, { name: 'texto da legenda', mimeType: DOC }] },
  { id: 'p3', name: 'post C-M20 dicas verao', filhos: [{ name: 'img.png', mimeType: 'image/png' }] },
  { id: 'p4', name: 'pasta qualquer sem nada', filhos: [] },
  { id: 'p5', name: '2026-11-25__X-99__Codigo-Inexistente', filhos: [{ name: '01.png', mimeType: 'image/png' }, { name: 'LEGENDA — x', mimeType: DOC }] },
  { name: 'arquivo-solto.png', mimeType: 'image/png' }
];

test('planejador: nome fora do padrão, data diferente do calendário, legenda e artes sem número viram propostas; o resto vira aviso', async () => {
  const d = new DriveFalso(arvore()), plano = D.planejar(await D.lerArvore(d, 'RAIZ'), pautas), por = t => plano.acoes.filter(a => a.alvoTipo === t);
  assert.ok(por('pasta').some(a => a.de === 'post C-M20 dicas verao' && a.para === '2026-11-20__C-M20__Dicas-De-Ver-o'.replace('Ver-o', 'Ver-o') || /^2026-11-20__C-M20__/.test(a.para)), 'acha o código dentro do nome e usa a data da pauta');
  assert.ok(por('pasta').some(a => a.de.startsWith('2026-11-10__R-M08') && a.para.startsWith('2026-11-12__R-M08')), 'alinha a data da pasta com a do calendário');
  assert.ok(por('legenda').some(a => a.de === 'texto da legenda' && /^LEGENDA — /.test(a.para)), 'documento de legenda vira LEGENDA — ...');
  assert.equal(por('arte').filter(a => /^0[12]_/.test(a.para)).length, 2, 'artes sem número ganham 01_, 02_');
  assert.ok(!por('arte').some(a => /capa|slide/.test(a.de)), 'artes que já têm número não são mexidas');
  const tipos = plano.avisos.map(a => a.tipo); ['sem-pauta', 'sem-legenda', 'sem-arte', 'solto'].forEach(t => assert.ok(tipos.includes(t), 'aviso ' + t));
  assert.equal(plano.acoes.filter(a => a.tipo !== 'renomear').length, 0, 'o agente só propõe renomear: nunca apagar nem mover');
  assert.equal(new Set(plano.acoes.map(a => a.id)).size, plano.acoes.length, 'cada proposta tem um id próprio e estável');
  assert.deepEqual(plano.acoes.map(a => a.id), D.planejar(await D.lerArvore(new DriveFalso(arvore()), 'RAIZ'), pautas).acoes.map(a => a.id), 'o mesmo Drive gera os mesmos ids');
});

test('aplicar: só o que foi aprovado muda, nada é apagado, e desfazer volta os nomes (pulando o que mudou depois)', async () => {
  const d = new DriveFalso(arvore()), plano = D.planejar(await D.lerArvore(d, 'RAIZ'), pautas), alvo = plano.acoes.find(a => a.alvoTipo === 'pasta' && a.de === 'post C-M20 dicas verao'), outra = plano.acoes.find(a => a.alvoTipo === 'legenda');
  const feitos = await D.aplicar(d, [alvo, outra]);
  assert.equal(feitos.filter(f => f.ok).length, 2); assert.equal(d.itens.get(alvo.alvoId).name, alvo.para); assert.equal(d.apagados, 0);
  const naoAprovada = plano.acoes.find(a => a.alvoTipo === 'arte'); assert.equal(d.itens.get(naoAprovada.alvoId).name, naoAprovada.de, 'o que não foi aprovado não muda');
  d.itens.get(outra.alvoId).name = 'alguém mudou à mão';                                   /* mudança depois: o desfazer não pode passar por cima */
  const r = await D.desfazer(d, feitos);
  assert.equal(d.itens.get(alvo.alvoId).name, alvo.de, 'a pasta volta ao nome antigo'); assert.equal(d.itens.get(outra.alvoId).name, 'alguém mudou à mão', 'o que mudou depois não é desfeito');
  assert.ok(r.some(x => !x.ok && /mudou depois/.test(x.erro)));
});

test('rota: só administrador ou editor; o servidor refaz o plano e ignora id que não existe; guarda o log e desfaz', async () => {
  db._resetMemory(); const repo = db.getRepo(), M = require('../lib/model');
  const adm = { email: 'dev@local', papel: 'admin', tipo: 'equipe', empresas: [] }, leitor = { email: 'l@x.com', papel: 'leitura', tipo: 'equipe', empresas: [] }, cliente = { email: 'c@x.com', papel: 'cliente', tipo: 'cliente', empresas: ['M'] };
  const falso = new DriveFalso(arvore()); D._trocarDrive(() => falso); await require('../lib/feed').salvar(repo, adm, 'M', { pastas: [{ id: 'RAIZ_TESTE_1', status: 'pronto' }] });
  try {
    /* calendário: usa as pautas da marca M do plano embutido; para este teste vale o que o servidor tem */
    const plano = await D.propor(repo, adm, 'M', { drive: falso }); assert.equal(plano.resumo.pastas, 5, '5 pastas de post e 1 arquivo solto');
    await assert.rejects(D.propor(repo, leitor, 'M', { drive: falso }), /administrador ou editor/); await assert.rejects(D.propor(repo, cliente, 'M', { drive: falso }), /administrador ou editor/);
    await assert.rejects(D.aplicarAprovadas(repo, adm, 'M', ['id-que-nao-existe'], { drive: falso }), /existe mais/);
    if (plano.acoes.length) {
      const um = plano.acoes[0], r = await D.aplicarAprovadas(repo, adm, 'M', [um.id, 'inventado'], { drive: falso });
      assert.equal(r.ok, 1); assert.match(r.log, /^drivelog:\d{14}-[0-9a-f]{6}$/); assert.equal((await D.logs(repo, adm, 'M'))[0].renomeados, 1);
      const d = await D.desfazerLog(repo, adm, 'M', r.log, { drive: falso }); assert.equal(d.desfeitas, 1); assert.ok((await D.logs(repo, adm, 'M'))[0].desfeitoEm);
    }
  } finally { D._trocarDrive(null); db._resetMemory(); }
});
