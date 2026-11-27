/* Conversa com o ChatGPT dentro da página (como uma pessoa): escreve a mensagem, envia, espera terminar e lê a resposta.
   Só lógica de página, sem chrome.*: assim dá para testar numa página falsa. Os "achadores" ficam juntos no topo:
   se o ChatGPT mudar o visual, é aqui (e só aqui) que se ajusta. */
(function (raiz) {
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const visivel = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);

  const ACHA = {
    compositor: () => document.querySelector('#prompt-textarea') || document.querySelector('div.ProseMirror[contenteditable="true"]') || document.querySelector('textarea[name="prompt-textarea"]') || document.querySelector('form textarea'),
    enviar: () => { const b = document.querySelector('button[data-testid="send-button"]') || [...document.querySelectorAll('form button')].find(x => /send prompt|enviar/i.test(x.getAttribute('aria-label') || '')); return b && !b.disabled ? b : null; },
    parar: () => { const b = document.querySelector('button[data-testid="stop-button"]') || [...document.querySelectorAll('button[aria-label]')].find(x => /^(stop streaming|stop generating|parar|interromper)/i.test(x.getAttribute('aria-label') || '')); return b && visivel(b) ? b : null; },
    /* visual antigo: data-message-author-role; visual atual (conferido em 2026-11-27): cada resposta é uma "unidade" com um título h4[data-conversation-role="assistant"] ("ChatGPT disse:") */
    respostas: () => { const antigo = [...document.querySelectorAll('[data-message-author-role="assistant"]')]; if (antigo.length) return antigo; return [...document.querySelectorAll('h4[data-conversation-role="assistant"]')].map(h => h.closest('[data-chatgpt-search-unit-key]') || h.parentElement).filter((e, i, a) => e && a.indexOf(e) === i); },
    /* o botão de enviar vira "Parar" enquanto o ChatGPT escreve; a vez da resposta também fica "in_progress" */
    escrevendo: () => !!document.querySelector('[data-talvt-turn-state="in_progress"]'),
    login: () => !!document.querySelector('[data-testid="login-button"], [data-testid="welcome-login-button"]') || /\/auth\/login|\/log-in/.test(location.pathname),
    verificacao: () => /Verify you are human|Verifique se você é humano|Just a moment/i.test(document.title + ' ' + (document.body ? document.body.innerText.slice(0, 400) : '')),
    /* só avisos e janelas da página (nunca o menu lateral com os títulos dos chats, nem as mensagens) */
    limite: () => /(reached|hit) (our|the|your) (current )?(usage |message )?limit|atingiu o limite|limite de (uso|mensagens)|too many requests|muitas solicita/i.test([...document.querySelectorAll('[role="alert"], [role="dialog"], [role="status"]')].map(x => x.innerText).join(' ')),
  };

  async function esperar(fn, ms, passo = 250) { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) return null; await dormir(passo); } }

  /* escreve no campo de mensagem. O campo é um editor (ProseMirror): colar é o jeito que ele aceita bem, com várias linhas */
  function preencher(el, texto) {
    el.focus();
    if (el.tagName === 'TEXTAREA') { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, texto); el.dispatchEvent(new Event('input', { bubbles: true })); return; }
    try { document.execCommand('selectAll', false); document.execCommand('delete', false); } catch (e) { /* campo vazio */ }
    try { const dt = new DataTransfer(); dt.setData('text/plain', texto); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) { /* tenta o plano B */ }
    if (!(el.innerText || '').trim()) { try { document.execCommand('insertText', false, texto); } catch (e) { /* sem plano C */ } }
  }
  const textoDoCampo = el => String(el.tagName === 'TEXTAREA' ? el.value : el.innerText || '').trim();

  function lerResposta(el) {
    const blocos = [...el.querySelectorAll('pre code')].map(c => c.innerText.trim()).filter(Boolean);
    return { texto: String(el.innerText || '').replace(/^s*(ChatGPT disse:|ChatGPT said:)s*/i, '').trim(), blocos };
  }

  /* conversa: devolve { texto, blocos } ou lança Error com mensagem para a agência (login, limite, tempo...) */
  async function conversar(prompt, { pulso = () => {}, tempoCampoMs = 40000, tempoEnvioMs = 45000, tempoRespostaMs = 6 * 60e3, estavelMs = 2500 } = {}) {
    const campo = await esperar(() => { const c = ACHA.compositor(); return c && visivel(c) ? c : null; }, tempoCampoMs);
    if (!campo) {
      if (ACHA.verificacao()) throw new Error('O ChatGPT pediu a verificação "sou humano": abra o chatgpt.com no Chrome e conclua uma vez.');
      if (ACHA.login()) throw new Error('O ChatGPT não está logado neste Chrome: entre na conta da agência em chatgpt.com.');
      throw new Error('Não achei o campo de mensagem do ChatGPT (o visual mudou?). Ajuste "compositor" em conversa.js.');
    }
    const antes = ACHA.respostas().length;
    preencher(campo, prompt);
    const enviar = await esperar(() => ACHA.enviar(), 15000, 200);
    if (!enviar) {
      if (!textoDoCampo(campo)) throw new Error('Não consegui escrever a mensagem no campo do ChatGPT.');
      campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    } else enviar.click();
    /* a resposta nova aparece */
    const t0 = Date.now(); let ultimo = null;
    for (;;) {
      pulso(); const rs = ACHA.respostas(); if (rs.length > antes) { ultimo = rs[rs.length - 1]; break; }
      if (ACHA.limite()) throw new Error('O ChatGPT está com limite de uso no momento: tente de novo mais tarde.');
      if (Date.now() - t0 > tempoEnvioMs + 45000) throw new Error('O ChatGPT não começou a responder.');
      await dormir(500);
    }
    /* espera terminar: sem botão de parar e texto parado por um instante */
    let anterior = '', desde = Date.now(); const inicio = Date.now();
    for (;;) {
      pulso(); const rs = ACHA.respostas(); ultimo = rs[rs.length - 1] || ultimo; const t = String(ultimo.innerText || '');
      if (t !== anterior) { anterior = t; desde = Date.now(); }
      if (!ACHA.parar() && !ACHA.escrevendo() && t.trim() && Date.now() - desde >= estavelMs) break;
      if (Date.now() - inicio > tempoRespostaMs) throw new Error('O ChatGPT demorou demais para terminar a resposta.');
      await dormir(500);
    }
    const r = lerResposta(ultimo); if (!r.texto) throw new Error('A resposta do ChatGPT veio vazia.');
    return r;
  }

  raiz.N7Conversa = { conversar, ACHA, preencher };
})(typeof window !== 'undefined' ? window : globalThis);
