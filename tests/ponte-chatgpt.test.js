// ChatGPT pelo Chrome (sem API): a ponte local, a leitura da resposta e a conversa dentro da página (num ChatGPT falso).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../scripts/analise-local/ponte');
const C = require('../scripts/analise-local/criativo');
const ARTE = require('../scripts/analise-local/arte');

const novaPonte = async (extra = {}) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ext-')); const p = P.criar(Object.assign({ porta: 0, token: 'tok-' + 'x'.repeat(30), pastaExtensao: dir, vivaMs: 3000 }, extra)); await p.ligar(); return { p, dir, fim: () => { p.parar(); fs.rmSync(dir, { recursive: true, force: true }); } }; };
const chamar = (p, caminho, o = {}) => fetch('http://127.0.0.1:' + p.porta + caminho, Object.assign({}, o, { headers: Object.assign({ 'x-n7-token': p.token }, o.headers || {}) }));

test('ponte: grava a configuração da extensão e só atende quem tem o token, vindo da extensão', async () => {
  const { p, dir, fim } = await novaPonte(); try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')); assert.equal(cfg.porta, p.porta); assert.equal(cfg.token, p.token);
    assert.equal((await fetch('http://127.0.0.1:' + p.porta + '/ping')).status, 401, 'sem token não entra');
    assert.equal((await chamar(p, '/ping', { headers: { origin: 'https://site-malicioso.com' } })).status, 403, 'página da internet não entra');
    assert.equal((await chamar(p, '/ping', { headers: { origin: 'chrome-extension://abcdef' } })).status, 200, 'a extensão entra');
    const st = await new Promise(ok => { const rq = require('node:http').request({ host: '127.0.0.1', port: p.porta, path: '/ping', headers: { host: 'evil.com', 'x-n7-token': p.token } }, r => { r.resume(); ok(r.statusCode); }); rq.end(); });
    assert.equal(st, 403, 'nome de site estranho (DNS rebinding) não entra');
  } finally { fim(); }
});

test('ponte: o agente pede, a extensão busca, responde, e o agente recebe — e sem extensão o pedido falha logo', async () => {
  const { p, fim } = await novaPonte(); try {
    await assert.rejects(p.pedir('oi'), e => e.codigo === 'SEM_EXTENSAO', 'sem extensão conectada, falha na hora (não trava a fila)');
    assert.equal((await chamar(p, '/job?espera=0')).status, 204); assert.equal(p.conectada(), true, 'buscar pedido conta como "extensão viva"');
    const pedido = p.pedir('escreva um post', { tempoMs: 5000 });
    const job = await (await chamar(p, '/job?espera=5')).json(); assert.equal(job.prompt, 'escreva um post');
    assert.equal((await chamar(p, '/resultado', { method: 'POST', body: JSON.stringify({ id: job.id, texto: 'Aqui: {"legenda":"ok"}', blocos: ['{"legenda":"ok"}'] }) })).status, 200);
    const r = await pedido; assert.deepEqual(r.blocos, ['{"legenda":"ok"}']);
    /* a extensão conta um erro (ex.: ChatGPT sem login) */
    const ruim = p.pedir('de novo', { tempoMs: 5000 }), ruimOk = assert.rejects(ruim, e => e.codigo === 'CHATGPT' && /logado/.test(e.message)); const j2 = await (await chamar(p, '/job?espera=5')).json();
    await chamar(p, '/resultado', { method: 'POST', body: JSON.stringify({ id: j2.id, erro: 'O ChatGPT não está logado neste Chrome' }) });
    await ruimOk;
    /* a extensão pega o pedido e some: o agente desiste no prazo */
    const mudo = p.pedir('x', { tempoMs: 400 }), mudoOk = assert.rejects(mudo, e => e.codigo === 'TEMPO'); await chamar(p, '/job?espera=5'); await mudoOk;
    assert.equal(p.estado().feitos, 1);
  } finally { fim(); }
});

test('ponte: a espera longa devolve o pedido assim que ele chega', async () => {
  const { p, fim } = await novaPonte(); try {
    await chamar(p, '/ping'); const busca = chamar(p, '/job?espera=10'); await new Promise(r => setTimeout(r, 300));
    const pedido = p.pedir('rápido', { tempoMs: 5000 }); const t0 = Date.now(); const r = await busca; assert.equal(r.status, 200); assert.ok(Date.now() - t0 < 3000, 'não esperou os 10 s inteiros');
    const job = await r.json(); await chamar(p, '/resultado', { method: 'POST', body: JSON.stringify({ id: job.id, texto: 'ok' }) }); assert.equal((await pedido).texto, 'ok');
  } finally { fim(); }
});

test('extrairJson: aceita bloco de código, texto em volta e quebras de linha; recusa lixo', () => {
  assert.equal(C.extrairJson({ blocos: ['json\n{"legenda":"a"}'], texto: '' }).legenda, 'a');
  assert.equal(C.extrairJson({ blocos: [], texto: 'Claro! Aqui está:\n```json\n{"legenda":"b","arte":{"titulo":"T"}}\n```\nQualquer ajuste, avise.' }).arte.titulo, 'T');
  assert.equal(C.extrairJson({ blocos: [], texto: '{"legenda":"linha 1\nlinha 2"}' }).legenda, 'linha 1 linha 2', 'quebra solta dentro do texto não derruba');
  assert.equal(C.extrairJson({ blocos: ['não é json {'], texto: 'texto {"legenda":"c"} fim' }).legenda, 'c', 'se o bloco não presta, tenta o texto inteiro');
  assert.throws(() => C.extrairJson({ blocos: [], texto: 'não consigo ajudar com isso' }), /JSON válido/);
  const r = C.normalizar({ legenda: 'x'.repeat(5000), arte: { titulo: 'T', slides: [{ titulo: 'a', texto: 'b' }] }, hashtags: '#um' });
  assert.equal(r.legenda.length, 2200); assert.deepEqual(r.hashtags, ['#um']); assert.equal(r.slides[0], 'a: b');
});

test('promptWeb: vira uma mensagem só, com o pedido de ajuste e a regra de responder só o JSON', () => {
  const item = { cliente: 'Minas Farma', setor: 'saúde', codigo: 'M-1', titulo: 'Dica', formato: 'Carrossel', marca: 'M', kit: {} };
  const t = C.promptWeb(item); assert.match(t, /Nunca prometa/); assert.match(t, /Minas Farma/); assert.match(t, /SOMENTE com o JSON/); assert.ok(!/Seu rascunho anterior/.test(t));
  const a = C.promptWeb(Object.assign({}, item, { ajuste: 'deixe mais curto', anterior: { legenda: 'antes' } })); assert.match(a, /Seu rascunho anterior:\n\{"legenda":"antes"\}/); assert.match(a, /deixe mais curto/);
  assert.equal(C.config({ chatgpt: { modo: 'extensao' } }).ligado, true, 'o modo extensão liga o criativo sem chave'); assert.equal(C.config({}).ligado, false);
});

/* a conversa dentro da página: um ChatGPT falso com o mesmo jeito de funcionar (editor, botão de enviar, parar, resposta em partes) */
const PAGINA = `<!doctype html><title>ChatGPT</title><body><main id="chat"></main><form><div id="prompt-textarea" contenteditable="true"></div><button type="button" data-testid="send-button" id="enviar" disabled>Enviar</button><button type="button" data-testid="stop-button" id="parar" style="display:none">Parar</button></form>
<script>
const campo = document.getElementById('prompt-textarea'), env = document.getElementById('enviar'), par = document.getElementById('parar'), chat = document.getElementById('chat');
campo.addEventListener('paste', e => { e.preventDefault(); const t = e.clipboardData.getData('text/plain'); campo.innerText = t; campo.dispatchEvent(new Event('input')); });
campo.addEventListener('input', () => { env.disabled = !campo.innerText.trim(); });
env.addEventListener('click', () => {
  const pedido = campo.innerText; campo.innerText = ''; env.disabled = true; window.__pedidos = (window.__pedidos || []).concat(pedido);
  const u = document.createElement('div'); u.setAttribute('data-message-author-role', 'user'); u.textContent = pedido; chat.appendChild(u);
  if (window.__modo === 'limite') { document.body.append('You have reached the current usage limit'); return; }
  par.style.display = ''; const a = document.createElement('div'); a.setAttribute('data-message-author-role', 'assistant'); chat.appendChild(a);
  const resposta = window.__resposta || 'Claro! Aqui está o rascunho:\\n';
  setTimeout(() => { a.innerHTML = '<p>' + resposta.split('\\n')[0] + '</p>'; }, 150);
  setTimeout(() => { a.innerHTML += '<pre><code>{"legenda":"Texto do ChatGPT","arte":{"titulo":"Título"}}</code></pre>'; }, 500);
  setTimeout(() => { par.style.display = 'none'; }, 900);
});
</script></body>`;

const PAGINA_NOVA = `<!doctype html><title>ChatGPT</title><body><main id="chat"></main><form><div class="ProseMirror" contenteditable="true" aria-label="Pergunte ao ChatGPT"></div><button type="button" aria-label="Enviar" id="b" disabled>Enviar</button></form><script>
const campo = document.querySelector('.ProseMirror'), b = document.getElementById('b'), chat = document.getElementById('chat');
campo.addEventListener('paste', e => { e.preventDefault(); campo.innerText = e.clipboardData.getData('text/plain'); b.disabled = false; });
b.addEventListener('click', () => { if (b.getAttribute('aria-label') === 'Parar') return; const pedido = campo.innerText; campo.innerText = ''; window.__pedidos = (window.__pedidos || []).concat(pedido);
  chat.insertAdjacentHTML('beforeend', '<div data-chatgpt-search-unit-key="u"><h4 data-conversation-role="user"><span>Você disse:</span></h4><div>' + pedido + '</div></div>');
  chat.insertAdjacentHTML('beforeend', '<div data-talvt-turn-state="idle"><div data-chatgpt-search-unit-key="a"><h4 data-conversation-role="assistant"><span>ChatGPT disse:</span></h4><div id="r"></div></div></div>');
  setTimeout(() => { b.setAttribute('aria-label', 'Parar'); b.disabled = false; document.querySelector('[data-talvt-turn-state]').setAttribute('data-talvt-turn-state', 'in_progress'); }, 1500);
  setTimeout(() => { document.getElementById('r').textContent = '{"legenda":"Texto novo"}'; }, 2200);
  setTimeout(() => { b.setAttribute('aria-label', 'Enviar'); b.disabled = true; document.querySelector('[data-talvt-turn-state]').setAttribute('data-talvt-turn-state', 'complete'); }, 2700); });
</script></body>`;

test('conversa no visual atual do ChatGPT (o ChatGPT "pensa" 1,5 s antes de escrever: não pode dar a resposta por vazia)', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 60000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(PAGINA_NOVA); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const r = await pg.evaluate(() => window.N7Conversa.conversar('Escreva um post', { estavelMs: 600 }));
    assert.equal(r.texto, '{"legenda":"Texto novo"}', 'sem o título "ChatGPT disse:"'); assert.equal(C.extrairJson(r).legenda, 'Texto novo');
  } finally { await b.close(); }
});

/* ChatGPT falso com anexo por colagem e geração de imagem (as imagens vêm de um canvas, como a imagem real: PNG em blob/dados com mais de 300 px) */
const PAGINA_IMG = `<!doctype html><title>ChatGPT</title><body><main id="chat"></main><form style="display:none" id="decoy"><div class="ProseMirror" contenteditable="true"></div><button type="button" aria-label="Parar">Parar</button><button type="button" aria-label="Enviar">Enviar</button></form><form><div class="ProseMirror" contenteditable="true" id="real"></div><div id="chips"></div><button type="button" aria-label="Enviar" id="b" disabled>Enviar</button></form><script>
const campo = document.getElementById('real'), b = document.getElementById('b'), chat = document.getElementById('chat'), chips = document.getElementById('chips'); window.__anexos = [];
campo.addEventListener('paste', e => { e.preventDefault(); const fs = e.clipboardData.files; if (fs && fs.length) { for (const f of fs) { window.__anexos.push({ nome: f.name, tam: f.size, tipo: f.type }); const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Remover ' + f.name); chips.appendChild(x); } return; } campo.innerText = e.clipboardData.getData('text/plain'); b.disabled = false; });
b.addEventListener('click', () => { const pedido = campo.innerText; campo.innerText = ''; b.disabled = true; chips.innerHTML = ''; window.__pedidos = (window.__pedidos || []).concat(pedido);
  chat.insertAdjacentHTML('beforeend', '<div data-chatgpt-search-unit-key="u"><h4 data-conversation-role="user"><span>Você disse:</span></h4><div>' + pedido.slice(0, 40) + '</div></div>');
  b.setAttribute('aria-label', 'Parar'); chat.insertAdjacentHTML('beforeend', '<div data-talvt-turn-state="in_progress"><div data-chatgpt-search-unit-key="a"><h4 data-conversation-role="assistant"><span>ChatGPT disse:</span></h4><div class="r"></div></div></div>');
  const turno = chat.lastElementChild, alvo = chat;
  if (/Confira esta arte/.test(pedido)) { window.__conferencias = (window.__conferencias || 0) + 1; const aprovada = window.__conferencias > 1 || window.__sempreAprova; setTimeout(() => { turno.querySelector('.r').textContent = JSON.stringify(aprovada ? { aprovada: true, problemas: [], textoLido: 'Título' } : { aprovada: false, problemas: ['a palavra propaganda está escrita propagnda'], textoLido: 'x' }); }, 300); setTimeout(() => { b.setAttribute('aria-label', 'Enviar'); turno.setAttribute('data-talvt-turn-state', 'complete'); }, 900); return; }
  setTimeout(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 500; const x = c.getContext('2d'); x.fillStyle = 'rgb(' + Math.floor(Math.random() * 255) + ',40,' + Math.floor(Math.random() * 255) + ')'; x.fillRect(0, 0, 400, 500); x.fillStyle = '#fff'; x.fillText(String(Math.random()), 10, 20); const im = new Image(); im.alt = 'Imagem 1 gerada'; im.onload = () => { alvo.appendChild(im); }; im.src = c.toDataURL('image/png'); }, 700);
  setTimeout(() => { b.setAttribute('aria-label', 'Enviar'); turno.setAttribute('data-talvt-turn-state', 'complete'); }, 1500); });
</script></body>`;

test('portão de qualidade: o ChatGPT confere a imagem; reprovou → refaz corrigindo os problemas e confere de novo', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 120000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(PAGINA_IMG); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const r = await pg.evaluate(() => window.N7Conversa.conversarVarias([{ texto: 'Gere a imagem 1', imagem: true, verificar: { texto: 'Confira esta arte (imagem 1 de 1)', corrigir: 'Imagem 1 não passou. Problemas: {{problemas}}. Gere de novo.', max: 2 } }]));
    assert.ok(!r.erro, r.erro); const v = r.resultados[0].verificacao; assert.equal(v.aprovada, true); assert.equal(v.tentativas, 1, 'reprovou uma vez, corrigiu e passou'); assert.equal(r.resultados[0].imagens.length, 1, 'entrega a imagem corrigida');
    const pedidos = await pg.evaluate(() => window.__pedidos); assert.equal(pedidos.length, 4, 'gerar, conferir, corrigir, conferir'); assert.match(pedidos[2], /propagnda/, 'a correção leva o problema que o revisor achou');
    assert.deepEqual((await pg.evaluate(() => window.__anexos)).map(a => a.nome), ['arte-para-conferir.png', 'arte-para-conferir.png'], 'a arte vai anexada para conferir');
    /* nunca aprova: para depois do limite e devolve os problemas */
    const pg2 = await b.newPage(); await pg2.setContent(PAGINA_IMG.replace('window.__conferencias > 1 || window.__sempreAprova', 'false')); await pg2.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const r2 = await pg2.evaluate(() => window.N7Conversa.conversarVarias([{ texto: 'Gere a imagem 1', imagem: true, verificar: { texto: 'Confira esta arte', corrigir: 'Corrija: {{problemas}}', max: 1 } }]));
    assert.equal(r2.resultados[0].verificacao.aprovada, false); assert.equal(r2.resultados[0].verificacao.tentativas, 1); assert.match(r2.resultados[0].verificacao.problemas[0], /propagnda/);
  } finally { await b.close(); }
});

test('conversa com imagens: anexa logo e referências, gera a imagem e devolve em base64; várias mensagens na mesma conversa', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 90000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(PAGINA_IMG); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await pg.evaluate(async png => window.N7Conversa.conversarVarias([{ texto: 'Gere a imagem 1', imagem: true, anexos: [{ nome: 'logo.png', mime: 'image/png', b64: png }, { nome: 'referencia.png', mime: 'image/png', b64: png }] }, { texto: 'Agora a imagem 2', imagem: true }]), png);
    assert.ok(!r.erro, r.erro); assert.equal(r.resultados.length, 2, 'uma imagem por mensagem');
    for (const x of r.resultados) { assert.equal(x.imagens.length, 1); assert.equal(x.imagens[0].mime, 'image/png'); assert.equal(Buffer.from(x.imagens[0].b64, 'base64').toString('latin1', 1, 4), 'PNG'); assert.equal(x.imagens[0].w, 400); }
    assert.deepEqual((await pg.evaluate(() => window.__anexos)).map(a => a.nome), ['logo.png', 'referencia.png'], 'logo e referência foram anexados, só na primeira mensagem');
    assert.equal((await pg.evaluate(() => window.__pedidos)).length, 2);
  } finally { await b.close(); }
});

test('conversa na página: escreve, envia, espera terminar e devolve a resposta (com o JSON do bloco de código)', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 60000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(PAGINA); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const r = await pg.evaluate(() => window.N7Conversa.conversar('Escreva um post\ncom duas linhas', { estavelMs: 700 }));
    assert.deepEqual(await pg.evaluate(() => window.__pedidos), ['Escreva um post\ncom duas linhas'], 'a mensagem foi inteira, com a quebra de linha');
    assert.match(r.texto, /Claro! Aqui está o rascunho/); assert.deepEqual(r.blocos, ['{"legenda":"Texto do ChatGPT","arte":{"titulo":"Título"}}']);
    assert.equal(C.extrairJson(r).legenda, 'Texto do ChatGPT', 'o agente consegue ler o JSON da resposta');
    /* sem o campo de mensagem e com tela de login */
    await pg.setContent('<body><button data-testid="login-button">Log in</button></body>'); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const falha = await pg.evaluate(async () => { try { await window.N7Conversa.conversar('x', { tempoCampoMs: 500 }); return 'sem erro'; } catch (e) { return e.message; } });
    assert.match(falha, /não está logado/);
  } finally { await b.close(); }
});

/* 2026-11-28: a 2ª mensagem de um carrossel falhava ("não começou a responder"). Hipótese: o ChatGPT ainda terminava a resposta anterior e o envio era ignorado.
   Esta página tem vários turnos e volta a ficar ocupada (turno em andamento) pouco DEPOIS de a resposta ser dada por completa; o botão "Enviar" continua visível e habilitado, mas o clique é IGNORADO enquanto ocupada.
   A extensão agora espera a página ficar ociosa antes de escrever. A causa real só se confirma na próxima falha: o erro traz o retrato da página (botão Parar, turno em andamento, avisos, última resposta). */
const PAGINA_OCUPADA = `<!doctype html><title>ChatGPT</title><body><main id="chat"></main><form><div class="ProseMirror" contenteditable="true" aria-label="Pergunte ao ChatGPT"></div><button type="button" id="b" aria-label="Enviar" disabled>Enviar</button></form><script>
const campo = document.querySelector('.ProseMirror'), b = document.getElementById('b'), chat = document.getElementById('chat');
campo.addEventListener('paste', e => { e.preventDefault(); campo.innerText = e.clipboardData.getData('text/plain'); b.disabled = false; });
b.addEventListener('click', () => { if (chat.querySelector('[data-talvt-turn-state="in_progress"]')) return; const pedido = campo.innerText; campo.innerText = ''; b.disabled = true; window.__pedidos = (window.__pedidos || []).concat(pedido);
  chat.insertAdjacentHTML('beforeend', '<div data-chatgpt-search-unit-key="u"><h4 data-conversation-role="user"><span>Você disse:</span></h4><div>' + pedido + '</div></div>');
  chat.insertAdjacentHTML('beforeend', '<div data-talvt-turn-state="idle"><div data-chatgpt-search-unit-key="a"><h4 data-conversation-role="assistant"><span>ChatGPT disse:</span></h4><div class="r"></div></div></div>');
  const turno = chat.lastElementChild, st = x => turno.setAttribute('data-talvt-turn-state', x);
  setTimeout(() => st('in_progress'), 1000); setTimeout(() => { turno.querySelector('.r').textContent = '{"legenda":"Texto novo"}'; }, 1600); setTimeout(() => st('complete'), 2000);
  setTimeout(() => st('in_progress'), 3600); setTimeout(() => st('complete'), 7500); });
</script></body>`;
test('conversa: espera o ChatGPT ficar ocioso antes da mensagem seguinte (o clique durante o turno em andamento é ignorado)', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 150000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(PAGINA_OCUPADA); await pg.addScriptTag({ path: path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js') });
    const r = await pg.evaluate(async () => { const a = await window.N7Conversa.conversar('Mensagem 1', { estavelMs: 600 }); await new Promise(x => setTimeout(x, 1200)); const c = await window.N7Conversa.conversar('Mensagem 2', { estavelMs: 600, tempoEnvioMs: 3000 }); return { a: a.texto, c: c.texto, pedidos: window.__pedidos }; });
    assert.deepEqual(r.pedidos, ['Mensagem 1', 'Mensagem 2'], 'as duas mensagens foram enviadas, a segunda só depois de a página ficar ociosa'); assert.equal(r.a, '{"legenda":"Texto novo"}'); assert.equal(r.c, '{"legenda":"Texto novo"}');
  } finally { await b.close(); }
});

/* 2026-11-28: extensão recarregada no meio de um pedido: ela perde o pedido e volta a buscar. Antes o agente esperava até o limite (até 98 min); agora falha na hora. */
test('ponte: extensão que volta a buscar pedido com um ainda em andamento (foi recarregada) faz o pedido falhar na hora', async () => {
  const { p, fim } = await novaPonte(); try {
    assert.equal((await chamar(p, '/job?espera=0')).status, 204);
    const pedido = p.pedir('x', { tempoMs: 60000 }), falha = assert.rejects(pedido, e => e.codigo === 'EXTENSAO_REINICIOU');
    const job = await (await chamar(p, '/job?espera=5')).json(); assert.equal(job.prompt, 'x');
    await new Promise(r => setTimeout(r, 3200));
    assert.equal((await chamar(p, '/job?espera=0')).status, 204, 'a extensão nova busca de novo, sem devolver o anterior');
    await falha; assert.equal(p.estado().emAndamento, 0);
    /* e o que veio depois funciona normalmente */
    const outro = p.pedir('y', { tempoMs: 5000 }); const j2 = await (await chamar(p, '/job?espera=5')).json();
    await chamar(p, '/resultado', { method: 'POST', body: JSON.stringify({ id: j2.id, texto: 'ok', blocos: [] }) }); assert.equal((await outro).texto, 'ok');
  } finally { fim(); }
});
