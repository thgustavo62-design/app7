// 2026-11-28: carrossel parava na 2ª/4ª mensagem com "O ChatGPT não começou a responder" mesmo com a mensagem enviada.
// Causa (diagnóstico da extensão 1.2.4: campo vazio, mensagem enviada, nenhuma resposta nova contada): a extensão decidia "começou a responder" só pela CONTAGEM de blocos de resposta.
// O ChatGPT descarrega turnos antigos da página (a contagem não sobe) e, na imagem, o bloco da resposta só aparece no fim (~4 min). Agora: enviada = campo vazio/mensagem nova; bloco novo vale mesmo com a mesma contagem.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ARTE = require('../scripts/analise-local/arte');

const CONVERSA = path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'conversa.js');
const SKIP = ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador';

/* a página: ao enviar, o campo esvazia e a mensagem aparece; a resposta só chega depois de "demora" ms (sem botão Parar nem turno em andamento durante a espera).
   Com "descarrega": já havia uma resposta antiga, que sai da página quando a nova entra (a contagem de respostas não muda). */
const pagina = (demora, descarrega) => `<!doctype html><title>ChatGPT</title><body><main id="chat">${descarrega ? '<div data-chatgpt-search-unit-key="velha"><h4 data-conversation-role="assistant"><span>ChatGPT disse:</span></h4><div>resposta antiga</div></div>' : ''}</main>
<form><div class="ProseMirror" contenteditable="true" aria-label="Pergunte ao ChatGPT"></div><button type="button" id="b" aria-label="Enviar" disabled>Enviar</button></form><script>
const campo = document.querySelector('.ProseMirror'), b = document.getElementById('b'), chat = document.getElementById('chat');
campo.addEventListener('paste', e => { e.preventDefault(); campo.innerText = e.clipboardData.getData('text/plain'); b.disabled = false; });
b.addEventListener('click', () => {
  const pedido = campo.innerText; campo.innerText = ''; b.disabled = true; window.__pedidos = (window.__pedidos || []).concat(pedido);
  chat.insertAdjacentHTML('beforeend', '<div data-chatgpt-search-unit-key="u"><h4 data-conversation-role="user"><span>Você disse:</span></h4><div>' + pedido + '</div></div>');
  setTimeout(() => {
    ${descarrega ? "chat.querySelector('[data-chatgpt-search-unit-key=velha]').remove();" : ''}
    chat.insertAdjacentHTML('beforeend', '<div data-talvt-turn-state="in_progress"><div data-chatgpt-search-unit-key="a"><h4 data-conversation-role="assistant"><span>ChatGPT disse:</span></h4><div class="r">{"ok":true}</div></div></div>');
    setTimeout(() => chat.lastElementChild.setAttribute('data-talvt-turn-state', 'complete'), 1200);
  }, ${demora});
});
</script></body>`;

async function conversar(html, opcoes) {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  try {
    await pg.setContent(html); await pg.addScriptTag({ path: CONVERSA });
    return await pg.evaluate(async o => { const r = await window.N7Conversa.conversar('Mensagem 1', o); return { texto: r.texto, pedidos: window.__pedidos }; }, opcoes);
  } finally { await b.close(); }
}

test('conversa: resposta que demora a aparecer (mensagem já enviada, nenhum sinal de atividade) não vira "não começou a responder"', { skip: SKIP, timeout: 150000 }, async () => {
  /* a resposta chega aos 47 s; o limite antigo era 45 s depois do envio */
  const r = await conversar(pagina(47000, false), { estavelMs: 600, tempoEnvioMs: 0 });
  assert.deepEqual(r.pedidos, ['Mensagem 1']); assert.equal(r.texto, '{"ok":true}');
});

test('conversa: o ChatGPT descarrega a resposta antiga ao mostrar a nova (a contagem de respostas não sobe) e a resposta nova é lida', { skip: SKIP, timeout: 150000 }, async () => {
  const r = await conversar(pagina(2000, true), { estavelMs: 600, tempoEnvioMs: 0 });
  assert.deepEqual(r.pedidos, ['Mensagem 1']); assert.equal(r.texto, '{"ok":true}', 'leu a resposta nova, não a antiga');
});

test('conversa: mensagem que NÃO saiu (texto ainda no campo) falha com o motivo certo, sem esperar minutos', { skip: SKIP, timeout: 60000 }, async () => {
  /* botão de enviar que nunca age: o texto fica no campo */
  const html = `<!doctype html><title>ChatGPT</title><body><main id="chat"></main><form><div class="ProseMirror" contenteditable="true" aria-label="Pergunte ao ChatGPT"></div><button type="button" id="b" aria-label="Enviar" disabled>Enviar</button></form><script>
    const campo = document.querySelector('.ProseMirror'), b = document.getElementById('b'); campo.addEventListener('paste', e => { e.preventDefault(); campo.innerText = e.clipboardData.getData('text/plain'); b.disabled = false; });</script></body>`;
  const { chromium } = require('playwright-core'); const nav = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await nav.newPage();
  try {
    await pg.setContent(html); await pg.addScriptTag({ path: CONVERSA });
    const msg = await pg.evaluate(async () => { try { await window.N7Conversa.conversar('Mensagem 1', { tempoEnvioMs: 500, folgaEnvioMs: 500 }); return 'sem erro'; } catch (e) { return e.message; } });
    assert.match(msg, /não foi enviada/); assert.match(msg, /campo \d+ car/);
  } finally { await nav.close(); }
});
