// Agente Criativo ponta a ponta: o agente (processo separado) busca a fila no site, escreve com a "OpenAI", cria o design no "Canva" e entrega RASCUNHOS (nada publica).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'), { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const db = require('../lib/db');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('agente criativo: escreve rascunho com a IA, cria o design no Canva, avisa o que revisar, usa as referências e nunca publica', async () => {
  const TOKEN = 'teste-token-criativo-da-agencia-0123456789abc', casa = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-casa-')), arm = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-arm-cri-')), cri = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-cri-'));
  fs.mkdirSync(path.join(casa, '.nova7')); fs.writeFileSync(path.join(casa, '.nova7', 'agente.json'), JSON.stringify({ openai: { apiKey: 'sk-teste-falso-0123456789', imagens: true, modeloTexto: 'gpt-teste' }, canva: { accessToken: 'canva-token-falso' } }));
  const vistos = []; const falso = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => {
    vistos.push({ url: req.url, auth: req.headers.authorization, corpo: b ? JSON.parse(b) : null }); res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ legenda: 'Resultado garantido para quem participar!', slides: ['Capa forte', 'Como funciona'], roteiro: [], briefArte: 'fundo claro, título grande', hashtags: ['#teste'], alertas: [] }) } }] }));
    if (req.url === '/v1/images/generations') return res.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
    if (req.url === '/rest/v1/designs') return res.end(JSON.stringify({ design: { id: 'D1', urls: { edit_url: 'https://www.canva.com/design/D1/edit' } } }));
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => falso.listen(0, r)); const urlFalso = 'http://127.0.0.1:' + falso.address().port;
  process.env.LEITURA_TOKEN = TOKEN; process.env.N7_FILA_DIAS = '400'; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server');
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const adm = 'n7_session=' + encodeURIComponent(session.create({ email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] }, cfg().sessionSecret, 600));
  const J = async (u, o = {}) => { const r = await fetch(base + u, Object.assign({ headers: { cookie: adm, 'x-n7': '1', 'content-type': 'application/json' } }, o)); return { s: r.status, j: await r.json().catch(() => null) }; };
  let agente = null;
  try {
    for (const m of ['M', 'F', 'C', 'N']) assert.equal((await J('/api/drive', { method: 'POST', body: JSON.stringify({ acao: 'referencias', marca: m, v4: [{ handle: '@v4company', notas: 'capas com título grande' }], estilo: 'direto e acolhedor', evitar: 'prometer resultado' }) })).s, 200);
    const antes = (await J('/api/leitura?acao=estado')).j; assert.equal(antes.criativo, false);
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2'], { stdio: 'pipe', env: Object.assign({}, process.env, { USERPROFILE: casa, HOME: casa, N7_OPENAI_URL: urlFalso, N7_CANVA_URL: urlFalso, N7_ARMAZEM: arm, N7_CRIATIVOS: cri, N7_CRIATIVO_INICIO_MS: '300', N7_CEREBRO_INICIO_MS: '999999', N7_ROTINA_INICIO_MS: '999999' }) });
    let saida = ''; agente.stdout.on('data', d => { saida += d; });
    let rs = []; for (let i = 0; i < 80 && !rs.length; i++) { for (const m of ['M', 'F', 'C', 'N']) rs.push(...((await J('/api/drive?marca=' + m + '&acao=rascunhos')).j.rascunhos || [])); if (!rs.length) await new Promise(r => setTimeout(r, 500)); }
    assert.ok(rs.length >= 1, 'o agente entregou rascunhos: ' + saida); const r = rs[0];
    assert.equal(r.status, 'novo', 'rascunho espera aprovação'); assert.ok(r.legenda && r.slides.length === 2 && r.briefArte); assert.equal(r.canvaUrl, 'https://www.canva.com/design/D1/edit'); assert.deepEqual(r.imagens, ['arte-1.png']); assert.equal(r.modelo, 'gpt-teste');
    assert.ok(r.alertas.some(a => /garantia/.test(a)), 'a conformidade apontou a promessa de garantia: ' + JSON.stringify(r.alertas));
    assert.ok(fs.existsSync(path.join(cri, r.marca.toLowerCase(), r.codigo, 'arte-1.png')), 'a arte foi salva no computador');
    const chat = vistos.find(v => v.url === '/v1/chat/completions'); assert.equal(chat.auth, 'Bearer sk-teste-falso-0123456789'); assert.equal(chat.corpo.model, 'gpt-teste');
    const pedido = JSON.stringify(chat.corpo.messages); assert.match(pedido, /v4company/); assert.match(pedido, /direto e acolhedor/); assert.match(pedido, /prometa resultado|Nunca prometa/);
    assert.equal(vistos.find(v => v.url === '/rest/v1/designs').auth, 'Bearer canva-token-falso');
    assert.equal((await J('/api/leitura?acao=estado')).j.criativo, true, 'o site sabe que o agente criativo está ligado');
    const M = require('../lib/model'), over = (await M.loadState(db.getRepo())).overrides; assert.equal(over[r.codigo].status, 'prod', 'a pauta vai para Em produção'); assert.ok(!Object.values(over).some(o => o.status === 'pub' || o.status === 'agd'), 'nada vira pronto nem publicado sozinho');
    assert.ok(/Aguarda a sua aprovação/.test(saida));
  } finally { if (agente) agente.kill(); srv.close(); falso.close(); for (const k of ['LEITURA_TOKEN', 'N7_FILA_DIAS']) delete process.env[k]; db._resetMemory(); require('../lib/fila').reset(); [casa, arm, cri].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});
