/* Conversa com o ChatGPT dentro da página (como uma pessoa): escreve a mensagem, anexa imagens (logo, referências, produtos), envia, espera terminar
   e lê a resposta, inclusive as IMAGENS geradas. Só lógica de página, sem chrome.*: assim dá para testar numa página falsa.
   Os "achadores" ficam juntos no topo: se o ChatGPT mudar o visual, é aqui (e só aqui) que se ajusta. */
(function (raiz) {
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const visivel = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);

  const ACHA = {
    /* depois da primeira resposta o ChatGPT deixa DOIS campos na página (um escondido, da tela inicial): vale sempre o visível */
    compositor: () => { const vis = sel => [...document.querySelectorAll(sel)].find(visivel); return vis('#prompt-textarea') || vis('div.ProseMirror[contenteditable="true"]') || vis('textarea[name="prompt-textarea"]') || vis('form textarea') || null; },
    enviar: () => { const b = [...document.querySelectorAll('button[data-testid="send-button"]')].find(visivel) || [...document.querySelectorAll('form button')].find(x => visivel(x) && /send prompt|enviar/i.test(x.getAttribute('aria-label') || '')); return b && !b.disabled ? b : null; },
    parar: () => { const b = document.querySelector('button[data-testid="stop-button"]') || [...document.querySelectorAll('button[aria-label]')].find(x => /^(stop streaming|stop generating|parar|interromper)/i.test(x.getAttribute('aria-label') || '')); return b && visivel(b) ? b : null; },
    /* visual antigo: data-message-author-role; visual atual (conferido em 2026-11-27): cada resposta é uma "unidade" com um título h4[data-conversation-role="assistant"] ("ChatGPT disse:") */
    respostas: () => { const antigo = [...document.querySelectorAll('[data-message-author-role="assistant"]')]; if (antigo.length) return antigo; return [...document.querySelectorAll('h4[data-conversation-role="assistant"]')].map(h => h.closest('[data-chatgpt-search-unit-key]') || h.parentElement).filter((e, i, a) => e && a.indexOf(e) === i); },
    /* o botão de enviar vira "Parar" enquanto o ChatGPT escreve; a vez da resposta também fica "in_progress" */
    escrevendo: () => !!document.querySelector('[data-talvt-turn-state="in_progress"]'),
    /* anexos prontos no campo de mensagem: cada um tem um botão "Remover <arquivo>" */
    anexos: () => [...document.querySelectorAll('form button[aria-label^="Remover"], form button[aria-label^="Remove"]')].filter(visivel).length,
    login: () => !!document.querySelector('[data-testid="login-button"], [data-testid="welcome-login-button"]') || /\/auth\/login|\/log-in/.test(location.pathname),
    verificacao: () => /Verify you are human|Verifique se você é humano|Just a moment/i.test(document.title + ' ' + (document.body ? document.body.innerText.slice(0, 400) : '')),
    /* só avisos e janelas da página (nunca o menu lateral com os títulos dos chats, nem as mensagens) */
    limite: () => /(reached|hit) (our|the|your) (current )?(usage |message |image )?limit|atingiu o limite|limite de (uso|mensagens|imagens)|too many requests|muitas solicita/i.test([...document.querySelectorAll('[role="alert"], [role="dialog"], [role="status"]')].map(x => x.innerText).join(' ')),
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

  const paraBase64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('leitura da imagem')); r.readAsDataURL(blob); });
  const paraArquivo = a => { const bin = atob(a.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], a.nome || 'anexo.png', { type: a.mime || 'image/png' }); };

  /* anexa imagens colando-as no campo (o ChatGPT trata como arquivo anexado) */
  async function anexar(campo, anexos, pulso) {
    const antes = ACHA.anexos(); let bytes = 0;
    for (const a of anexos) { campo.focus(); const f = paraArquivo(a); bytes += f.size; const dt = new DataTransfer(); dt.items.add(f); campo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await dormir(1200); pulso(); }
    if (!(await esperar(() => ACHA.anexos() >= antes + anexos.length, 30000))) throw new Error('Não consegui anexar as imagens (logo/referências) no ChatGPT.');
    await dormir(2500 + Math.round(bytes / 1e6 * 1500));   // o envio dos arquivos termina
  }

  /* imagens GERADAS na resposta (as anexadas ficam na mensagem da pessoa, não aqui) */
  const imagensProntas = el => [...el.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth >= 300 && i.naturalHeight >= 300);
  async function lerImagens(el) {
    const out = [];
    for (const i of imagensProntas(el)) { try { const b = await (await fetch(i.src)).blob(); out.push({ mime: b.type || 'image/png', b64: await paraBase64(b), w: i.naturalWidth, h: i.naturalHeight }); } catch (e) { /* imagem que não deu para ler */ } }
    return out;
  }

  const limpo = t => String(t || '').replace(/^\s*(ChatGPT disse:|ChatGPT said:)\s*/i, '').trim();
  async function lerResposta(el, comImagens) {
    const blocos = [...el.querySelectorAll('pre code')].map(c => c.innerText.trim()).filter(Boolean);
    return { texto: limpo(el.innerText), blocos, imagens: comImagens ? await lerImagens(el) : [] };
  }

  /* uma mensagem: devolve { texto, blocos, imagens } ou lança Error com mensagem para a agência (login, limite, tempo...) */
  async function conversar(prompt, { pulso = () => {}, anexos = [], esperaImagem = false, tempoCampoMs = 40000, tempoEnvioMs = 45000, tempoRespostaMs = esperaImagem ? 5 * 60e3 : 6 * 60e3, estavelMs = esperaImagem ? 4000 : 2500 } = {}) {
    const campo = await esperar(() => { const c = ACHA.compositor(); return c && visivel(c) ? c : null; }, tempoCampoMs);
    if (!campo) {
      if (ACHA.verificacao()) throw new Error('O ChatGPT pediu a verificação "sou humano": abra o chatgpt.com no Chrome e conclua uma vez.');
      if (ACHA.login()) throw new Error('O ChatGPT não está logado neste Chrome: entre na conta da agência em chatgpt.com.');
      throw new Error('Não achei o campo de mensagem do ChatGPT (o visual mudou?). Ajuste "compositor" em conversa.js.');
    }
    const antes = ACHA.respostas().length;
    if (anexos.length) await anexar(campo, anexos, pulso);
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
    /* só dá por terminada quando (1) já vimos o ChatGPT escrevendo ou passaram 25 s, (2) não está mais escrevendo e (3) há texto de verdade
       (ou, para imagem, a imagem pronta), sem contar o título "ChatGPT disse:" (o modelo pode "pensar" vários segundos antes da primeira palavra) */
    let anterior = '', desde = Date.now(), viuEscrever = false; const inicio = Date.now();
    for (;;) {
      pulso(); const rs = ACHA.respostas(); ultimo = rs[rs.length - 1] || ultimo; const t = limpo(ultimo.innerText) + '|' + imagensProntas(ultimo).length;
      if (t !== anterior) { anterior = t; desde = Date.now(); }
      const agora = !!(ACHA.parar() || ACHA.escrevendo()); if (agora) { viuEscrever = true; desde = Date.now(); }
      const temConteudo = esperaImagem ? imagensProntas(ultimo).length > 0 : !!limpo(ultimo.innerText);
      if (!agora && temConteudo && (viuEscrever || Date.now() - inicio > 25000) && Date.now() - desde >= estavelMs) break;
      if (!agora && esperaImagem && !temConteudo && limpo(ultimo.innerText) && (viuEscrever || Date.now() - inicio > 25000) && Date.now() - desde >= 8000) throw new Error('O ChatGPT respondeu sem gerar a imagem: ' + limpo(ultimo.innerText).slice(0, 200));
      if (ACHA.limite()) throw new Error('O ChatGPT está com limite de uso no momento: tente de novo mais tarde.');
      if (Date.now() - inicio > tempoRespostaMs) throw new Error('O ChatGPT demorou demais para terminar a resposta.');
      await dormir(500);
    }
    const r = await lerResposta(ultimo, esperaImagem); if (!r.texto && !r.imagens.length) throw new Error('A resposta do ChatGPT veio vazia.');
    return r;
  }

  /* várias mensagens na MESMA conversa (ex.: os slides de um carrossel, mantendo o estilo). Se uma falha, devolve o que já saiu + o erro */
  async function conversarVarias(mensagens, { pulso = () => {} } = {}) {
    const resultados = [];
    for (let i = 0; i < mensagens.length; i++) {
      const m = mensagens[i];
      try { resultados.push(await conversar(m.texto, { pulso, anexos: m.anexos || [], esperaImagem: !!m.imagem })); }
      catch (e) { return { resultados, erro: `Mensagem ${i + 1} de ${mensagens.length}: ${e.message}` }; }
      await dormir(1500);
    }
    return { resultados };
  }

  raiz.N7Conversa = { conversar, conversarVarias, ACHA, preencher };
})(typeof window !== 'undefined' ? window : globalThis);
