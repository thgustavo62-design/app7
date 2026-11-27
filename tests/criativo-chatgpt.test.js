// Agente criativo com o ChatGPT PELO CHROME (sem API): o agente (processo separado) sobe a ponte, uma "extensão" simulada busca o pedido,
// responde como o ChatGPT (JSON dentro de bloco de código) e o agente monta a arte da marca, entrega o rascunho e manda ao Drive. Nada publica.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
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

test('agente criativo pelo Chrome: pedido vai à extensão, o ChatGPT responde, a arte da marca sai e o Drive recebe; erro de login pausa e volta; ajuste refaz', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 240000 }, async () => {
  const TOKEN = 'teste-token-chrome-da-agencia-0123456789abc', casa = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-casa-')), arm = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-arm-chr-')), cri = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-cri-')), marcas = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-marcas-')), extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ext-'));
  fs.mkdirSync(path.join(casa, '.nova7')); fs.writeFileSync(path.join(casa, '.nova7', 'agente.json'), JSON.stringify({ chatgpt: { modo: 'extensao', abrirChrome: false } }));
  process.env.LEITURA_TOKEN = TOKEN; process.env.N7_FILA_DIAS = '400'; db._resetMemory(); require('../lib/fila').reset();
  const session = require('../lib/session'), { cfg } = require('../lib/config'), { createServer } = require('../dev-server'), D = require('../lib/drive-org'), F = require('../lib/feed');
  const drive = new DriveFalso(); D._trocarDrive(() => drive);
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const usuario = { email: 'dev@local', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
  const adm = 'n7_session=' + encodeURIComponent(session.create(usuario, cfg().sessionSecret, 600));
  const J = async (u, o = {}) => { const r = await fetch(base + u, Object.assign({ headers: { cookie: adm, 'x-n7': '1', 'content-type': 'application/json' } }, o)); return { s: r.status, j: await r.json().catch(() => null) }; };
  let agente = null, extensaoViva = true; const pedidos = [];
  try {
    for (const m of ['M', 'F', 'C', 'N']) { assert.equal((await J('/api/drive', { method: 'POST', body: JSON.stringify({ acao: 'referencias', marca: m, v4: [{ handle: '@v4company', notas: 'capas com título grande' }], estilo: 'direto e acolhedor', evitar: 'prometer resultado' }) })).s, 200); await F.salvar(db.getRepo(), usuario, m, { pastas: [{ id: 'RAIZ_CRIACAO', status: 'producao' }] }); }
    agente = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'analise-local', 'agente.js'), '--url', base, '--token', TOKEN, '--nucleos', '2'], { stdio: 'pipe', env: Object.assign({}, process.env, { USERPROFILE: casa, HOME: casa, N7_PONTE_PORTA: '0', N7_EXTENSAO_DIR: extDir, N7_ARMAZEM: arm, N7_CRIATIVOS: cri, N7_MARCAS: marcas, N7_AJUSTES_MS: '1500', N7_CRIATIVO_INICIO_MS: '300', N7_CRIATIVO_PAUSA_MS: '1500', N7_CRIATIVO_MS: '3000', N7_CEREBRO_INICIO_MS: '999999', N7_ROTINA_INICIO_MS: '999999' }) });
    let saida = ''; agente.stdout.on('data', d => { saida += d; }); agente.stderr.on('data', d => { saida += '[err] ' + d; }); agente.on('exit', c => { saida += '[exit ' + c + ']'; });
    const rascunhos = async () => { const rs = []; for (const m of ['M', 'F', 'C', 'N']) rs.push(...((await J('/api/drive?marca=' + m + '&acao=rascunhos')).j.rascunhos || [])); return rs; };
    const esperarAte = async (fn, n = 240, ms = 500) => { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, ms)); } return null; };
    /* a extensão aparece: lê config.json (porta e token), como a de verdade, e busca pedidos */
    const cfgExt = await esperarAte(() => { try { const c = JSON.parse(fs.readFileSync(path.join(extDir, 'config.json'), 'utf8')); return c.porta ? c : null; } catch (e) { return null; } }, 120);
    assert.ok(cfgExt, 'o agente subiu a ponte e escreveu config.json da extensão: ' + saida);
    const ponte = (caminho, o = {}) => fetch('http://127.0.0.1:' + cfgExt.porta + caminho, Object.assign({}, o, { headers: { 'x-n7-token': cfgExt.token, origin: 'chrome-extension://teste' } }));
    let primeira = true, parar = false;
    const laco = (async () => {
      while (!parar) {
        if (!extensaoViva) { await new Promise(r => setTimeout(r, 200)); continue; }
        let r; try { r = await ponte('/job?espera=2'); } catch (e) { break; }
        if (r.status !== 200) continue; const job = await r.json(); pedidos.push(job.prompt); let corpo;
        if (primeira) { primeira = false; corpo = { id: job.id, erro: 'O ChatGPT não está logado neste Chrome: entre na conta da agência em chatgpt.com.' }; }
        else if (/Seu rascunho anterior/.test(job.prompt)) corpo = { id: job.id, texto: 'Pronto, ajustei.', blocos: [JSON.stringify({ legenda: 'Versão ajustada e mais curta.', arte: { tag: 'Dica', titulo: 'Título ajustado', slides: [{ titulo: 'Só um passo', texto: 'Simples assim.' }] }, hashtags: [], alertas: [] })] };
        else corpo = { id: job.id, texto: 'Claro! Aqui está o rascunho:', blocos: [JSON.stringify({ legenda: 'Resultado garantido para quem participar!', arte: { tag: 'Dica da farmácia', titulo: 'Como cuidar bem', subtitulo: 'Três passos simples', cta: 'Fale com a gente', slides: [{ titulo: 'Passo um', texto: 'Separe o que precisa.' }, { titulo: 'Passo dois', texto: 'Confira com calma.' }] }, briefArte: 'balcão de farmácia com luz natural', hashtags: ['#teste'], alertas: [] })] };
        await ponte('/resultado', { method: 'POST', body: JSON.stringify(corpo) });
      }
    })();
    /* 1) o primeiro pedido volta com erro de login: o agente avisa, pausa e tenta de novo; 2) o segundo dá certo */
    let rs = await esperarAte(async () => { const x = await rascunhos(); return x.length ? x : null; }); assert.ok(rs, 'o agente entregou rascunho: ' + saida);
    assert.match(saida, /não está logado/, 'o erro do ChatGPT aparece no log do agente'); assert.match(saida, /Ponte com o Chrome ligada/);
    let r = rs[0]; assert.equal(r.status, 'novo', 'rascunho espera aprovação'); assert.equal(r.modelo, 'ChatGPT (Chrome)'); assert.equal(r.arte.titulo, 'Como cuidar bem');
    assert.deepEqual(r.imagens, ['01_capa.png', '02_slide.png', '03_slide.png', '04_fechamento.png']);
    assert.ok(r.alertas.some(a => /garantia/.test(a)), 'a conformidade pega a promessa de garantia: ' + JSON.stringify(r.alertas));
    assert.ok(pedidos.length >= 2 && /Nunca prometa/.test(pedidos[1]) && /v4company/.test(pedidos[1]) && /SOMENTE com o JSON/.test(pedidos[1]), 'o pedido levou as regras, as referências da V4 e a exigência de JSON');
    const M = require('../lib/model'), over = (await M.loadState(db.getRepo())).overrides; assert.equal(over[r.codigo].status, 'prod'); assert.ok(!Object.values(over).some(o => o.status === 'pub' || o.status === 'agd'), 'nada vira publicado sozinho');
    const pasta1 = await esperarAte(() => { const p = drive.pastas().find(x => x.name.includes('__' + r.codigo + '__')); return p && p.filhos.length >= 5 ? p : null; }, 120);
    assert.ok(pasta1, 'a pasta do post nasceu no Drive com a legenda e as 4 artes: ' + saida);
    /* 3) ajuste pelo site: o agente manda o rascunho anterior + o pedido ao ChatGPT e atualiza o mesmo Doc */
    assert.equal((await J('/api/drive', { method: 'POST', body: JSON.stringify({ acao: 'ajustar', codigo: r.codigo, instrucao: 'deixe mais curto' }) })).s, 200);
    const r2 = await esperarAte(async () => { const x = (await rascunhos()).find(y => y.codigo === r.codigo); return x && x.versao === 2 && x.status === 'novo' ? x : null; });
    assert.ok(r2, 'o agente refez o rascunho pelo ChatGPT: ' + saida); assert.equal(r2.legenda, 'Versão ajustada e mais curta.'); assert.match(pedidos[pedidos.length - 1], /deixe mais curto/); assert.match(pedidos[pedidos.length - 1], /Resultado garantido/);
    /* 4) extensão some (Chrome fechado): o agente não trava, avisa e não perde nada */
    extensaoViva = false; parar = true; await laco.catch(() => {});
  } finally { if (agente) agente.kill(); srv.close(); D._trocarDrive(null); for (const k of ['LEITURA_TOKEN', 'N7_FILA_DIAS']) delete process.env[k]; db._resetMemory(); require('../lib/fila').reset(); [casa, arm, cri, marcas, extDir].forEach(d => fs.rmSync(d, { recursive: true, force: true })); }
});
