// Agente Criativo ponta a ponta: o agente (processo separado) busca a fila no site, escreve com a "OpenAI", monta a arte com a identidade da empresa (logo, cores, fontes),
// cria o design no "Canva", manda legenda + artes para a pasta do post no Drive (falso) e entrega RASCUNHOS (nada publica). Pede ajuste e vê o rascunho ser refeito.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'), { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const db = require('../lib/db');
const ARTE = require('../scripts/analise-local/arte');

class DriveFalso {
  constructor() { this.n = 0; this.itens = new Map([['RAIZ_CRIACAO', { id: 'RAIZ_CRIACAO', name: 'raiz', mimeType: 'application/vnd.google-apps.folder', filhos: [] }]]); }
  add(pai, o) { const id = 'X' + (++this.n); this.itens.set(id, Object.assign({ id, filhos: [] }, o)); this.itens.get(pai).filhos.push(id); return id; }
  async filhos(id) { return this.itens.get(id).filhos.map(i => { const o = this.itens.get(i); return { id: i, name: o.name, mimeType: o.mimeType }; }); }
  async criarPasta(nome, pai) { return { id: this.add(pai, { name: nome, mimeType: 'application/vnd.google-apps.folder' }), name: nome }; }
  async criarDoc(nome, pai, texto) { return { id: this.add(pai, { name: nome, mimeType: 'application/vnd.google-apps.document', texto }) }; }
  async atualizarDoc(id, texto) { this.itens.get(id).texto = texto; return { id }; }
  async criarArquivo(nome, pai, mime, buf) { return { id: this.add(pai, { name: nome, mimeType: mime, tam: buf.length }) }; }
  async trocarArquivo(id, mime, buf) { this.itens.get(id).tam = buf.length; return { id }; }
  async renomear(id, nome) { this.itens.get(id).name = nome; return { id, name: nome }; }
  async capacidades() { return { nome: 'raiz', driveCompartilhado: false, podeCriar: true }; }
  pastas() { return this.itens.get('RAIZ_CRIACAO').filhos.map(i => this.itens.get(i)); }
}

test('agente criativo: escreve com a IA, monta a arte da marca, manda ao Drive, refaz quando pedem ajuste e nunca publica', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 240000 }, async () => {
  const TOKEN = 'teste-token-criativo-da-agencia-0123456789abc', casa = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-casa-')), arm = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-arm-cri-')), cri = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-cri-')), marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-marcas-'));
  fs.mkdirSync(path.join(casa, '.nova7')); fs.writeFileSync(path.join(casa, '.nova7', 'agente.json'), JSON.stringify({ openai: { apiKey: 'sk-teste-falso-0123456789', modeloTexto: 'gpt-teste' }, canva: { accessToken: 'canva-token-falso' } }));
  const vistos = []; const falso = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
    vistos.push({ url: req.url, auth: req.headers.authorization, corpo: b ? JSON.parse(b) : null }); res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/chat/completions') {
      const ajuste = /Ajuste o rascunho acima/.test(b);
      return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ajuste
        ? { legenda: 'Versão ajustada e mais curta.', arte: { tag: 'Dica', titulo: 'Título ajustado', slides: [{ titulo: 'Só um passo', texto: 'Simples assim.' }, { titulo: 'Outro passo', texto: 'Sem rodeio.' }] }, slides: [], roteiro: [], briefArte: 'cena simples', hashtags: [], alertas: [] }
        : { legenda: 'Resultado garantido para quem participar!', arte: { tag: 'Dica da farmácia', titulo: 'Como cuidar bem', subtitulo: 'Três passos simples', cta: 'Fale com a gente', slides: [{ titulo: 'Passo um', texto: 'Separe o que precisa.' }, { titulo: 'Passo dois', texto: 'Confira com calma.' }] }, slides: [], roteiro: [], briefArte: 'balcão de farmácia com luz natural', hashtags: ['#teste'], alertas: [] }) } }] }));
    }
    if (req.url === '/rest/v1/designs') return res.end(JSON.stringify({ design: { id: 'D1', urls: { edit_url: 'https://www.canva.com/design/D1/edit' } } }));
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => falso.listen(0, r)); const urlFalso = 'http://127.0.0.1:' + falso.address().port;
  process.env.LEITURA_TOKEN = TOKEN; process.env.N7_FILA_DIAS = '400'; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server'), D = require('../lib/drive-org'), F = require('../lib/feed');
  const drive = new DriveFalso(); D._trocarDrive(() => drive);
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const usuario = { email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
  const adm = 'n7_session=' + encodeURIComponent(session.create(usuario, cfg().sessionSecret, 600));
  const J = async (u, o = {}) => { const r = await fetch(base + u, Object.assign({ headers: { cookie: adm, 'x-n7': '1', 'content-type': 'application/json' } }, o)); return { s: r.status, j: await r.json().catch(() => null) }; };
  let agente = null;
  try {
    for (const m of ['M', 'F', 'C', 'N']) { assert.equal((await J('/api/drive', { method: 'POST', body: JSON.stringify({ acao: 'referencias', marca: m, v4: [{ handle: '@v4company', notas: 'capas com título grande' }], estilo: 'direto e acolhedor', evitar: 'prometer resultado' }) })).s, 200); await F.salvar(db.getRepo(), usuario, m, { pastas: [{ id: 'RAIZ_CRIACAO', status: 'producao' }] }); }
    const perm = (await J('/api/drive?marca=M&acao=permissao')).j; assert.equal(perm.podeCriar, true, 'a tela consegue perguntar se a conta é Editora');
    assert.equal((await J('/api/leitura?acao=estado')).j.criativo, false);
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2'], { stdio: 'pipe', env: Object.assign({}, process.env, { USERPROFILE: casa, HOME: casa, N7_OPENAI_URL: urlFalso, N7_CANVA_URL: urlFalso, N7_ARMAZEM: arm, N7_CRIATIVOS: cri, N7_MARCAS: marcas, N7_AJUSTES_MS: '1500', N7_CRIATIVO_INICIO_MS: '300', N7_CEREBRO_INICIO_MS: '999999', N7_ROTINA_INICIO_MS: '999999' }) });
    let saida = ''; agente.stdout.on('data', d => { saida += d; });
    const rascunhos = async () => { const rs = []; for (const m of ['M', 'F', 'C', 'N']) rs.push(...((await J('/api/drive?marca=' + m + '&acao=rascunhos')).j.rascunhos || [])); return rs; };
    let rs = []; for (let i = 0; i < 200 && !rs.length; i++) { rs = await rascunhos(); if (!rs.length) await new Promise(r => setTimeout(r, 500)); }
    assert.ok(rs.length >= 1, 'o agente entregou rascunhos: ' + saida); let r = rs[0];
    assert.equal(r.status, 'novo', 'rascunho espera aprovação'); assert.ok(r.legenda && r.slides.length === 2 && r.briefArte); assert.equal(r.canvaUrl, 'https://www.canva.com/design/D1/edit'); assert.equal(r.modelo, 'gpt-teste');
    assert.deepEqual(r.imagens, ['01_capa.png', '02_slide.png', '03_slide.png', '04_fechamento.png'], 'a arte da marca: capa, 2 slides e fechamento');
    assert.equal(r.arte.titulo, 'Como cuidar bem');
    assert.ok(r.alertas.some(a => /garantia/.test(a)), 'a conformidade apontou a promessa de garantia: ' + JSON.stringify(r.alertas));
    assert.ok(r.alertas.some(a => /fotos reais/.test(a)), 'avisa que falta foto real da empresa: ' + JSON.stringify(r.alertas));
    const pasta = path.join(cri, r.marca.toLowerCase(), r.codigo); for (const n of r.imagens) { const f = path.join(pasta, n), b = fs.readFileSync(f); assert.equal(b.toString('latin1', 1, 4), 'PNG'); assert.equal(b.readUInt32BE(16), 1080); assert.equal(b.readUInt32BE(20), 1350, 'formato 4:5 do feed'); }
    const chat = vistos.find(v => v.url === '/v1/chat/completions'); assert.equal(chat.auth, 'Bearer sk-teste-falso-0123456789'); assert.equal(chat.corpo.model, 'gpt-teste');
    const pedido = JSON.stringify(chat.corpo.messages); assert.match(pedido, /v4company/); assert.match(pedido, /direto e acolhedor/); assert.match(pedido, /Nunca prometa/); assert.match(pedido, /identidade/); assert.ok(!vistos.some(v => v.url === '/v1/images/generations'), 'não pede imagem à IA: a arte é montada com a marca');
    assert.equal(vistos.find(v => v.url === '/rest/v1/designs').auth, 'Bearer canva-token-falso');
    assert.equal((await J('/api/leitura?acao=estado')).j.criativo, true, 'o site sabe que o agente criativo está ligado');
    const M = require('../lib/model'), over = (await M.loadState(db.getRepo())).overrides; assert.equal(over[r.codigo].status, 'prod', 'a pauta vai para Em produção'); assert.ok(!Object.values(over).some(o => o.status === 'pub' || o.status === 'agd'), 'nada vira pronto nem publicado sozinho');
    assert.ok(/Aguarda a sua aprovação/.test(saida));
    /* Drive: pasta do post com legenda (Doc) e as 4 artes */
    let pasta1 = null; for (let i = 0; i < 120 && !(pasta1 && pasta1.filhos.length >= 5); i++) { pasta1 = drive.pastas().find(p => p.name.includes('__' + r.codigo + '__')); if (!(pasta1 && pasta1.filhos.length >= 5)) await new Promise(x => setTimeout(x, 500)); }
    assert.ok(pasta1, 'a pasta do post nasceu no Drive: ' + saida); const filhos = pasta1.filhos.map(i => drive.itens.get(i)), doc = filhos.find(f => /^LEGENDA — /.test(f.name));
    assert.ok(doc && /LEGENDA PARA COPIAR\nResultado garantido/.test(doc.texto) && /RASCUNHO GERADO POR IA/.test(doc.texto) && /Alertas:/.test(doc.texto), 'a legenda foi para o Doc, com a observação de rascunho de IA e os alertas');
    assert.deepEqual(filhos.filter(f => /^image\//.test(f.mimeType)).map(f => f.name).sort(), r.imagens.slice().sort()); assert.ok(filhos.every(f => !f.tam || f.tam > 1000), 'as imagens foram inteiras');
    assert.match(F.parsePasta(pasta1.name).codigo, new RegExp('^' + r.codigo.toUpperCase() + '$'), 'o nome da pasta segue o padrão AAAA-MM-DD__CÓDIGO__Título');
    r = (await rascunhos()).find(x => x.codigo === r.codigo); assert.ok(r.drive && r.drive.docId && r.drive.artes.length === 4 && /folders\//.test(r.drive.link), 'o rascunho guarda onde está no Drive');
    /* ajuste: a equipe pede, o agente refaz, o Doc é atualizado e nada vira outra pasta */
    assert.equal((await J('/api/drive', { method: 'POST', body: JSON.stringify({ acao: 'ajustar', codigo: r.codigo, instrucao: 'deixe mais curto' }) })).s, 200);
    let r2 = null; for (let i = 0; i < 500 && !(r2 && r2.versao === 2 && r2.status === 'novo'); i++) { r2 = (await rascunhos()).find(x => x.codigo === r.codigo); if (!(r2 && r2.versao === 2 && r2.status === 'novo')) await new Promise(x => setTimeout(x, 500)); }
    assert.ok(r2 && r2.versao === 2, 'o agente refez o rascunho: ' + saida); assert.equal(r2.legenda, 'Versão ajustada e mais curta.'); assert.equal(r2.ajustes[0].instrucao, 'deixe mais curto'); assert.deepEqual(r2.imagens, ['01_capa.png', '02_slide.png', '03_slide.png']);
    const pedidoAjuste = JSON.stringify(vistos.filter(v => v.url === '/v1/chat/completions').pop().corpo.messages); assert.match(pedidoAjuste, /deixe mais curto/); assert.match(pedidoAjuste, /Resultado garantido/, 'a IA recebeu o rascunho anterior para ajustar');
    for (let i = 0; i < 60 && !/Versão ajustada/.test(drive.itens.get(doc.id).texto); i++) await new Promise(x => setTimeout(x, 500));
    assert.match(drive.itens.get(doc.id).texto, /Versão ajustada e mais curta/, 'o mesmo Doc foi atualizado'); assert.equal(drive.pastas().filter(p => p.name.includes('__' + r.codigo + '__')).length, 1, 'continua uma pasta só');
  } finally { if (agente) agente.kill(); srv.close(); falso.close(); D._trocarDrive(null); for (const k of ['LEITURA_TOKEN', 'N7_FILA_DIAS']) delete process.env[k]; db._resetMemory(); require('../lib/fila').reset(); [casa, arm, cri, marcas].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});
