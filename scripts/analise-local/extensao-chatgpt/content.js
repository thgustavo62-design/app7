/* Dentro do chatgpt.com: recebe o pedido do background, conversa (conversa.js) e devolve a resposta. */
(function () {
  if (window.__n7Content) return; window.__n7Content = true;
  let ocupado = false;
  chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
    if (!msg || msg.tipo !== 'executar') return false;
    if (ocupado) { responder({ ok: false, motivo: 'ocupado' }); return false; }
    ocupado = true; responder({ ok: true });
    const pulso = () => { try { chrome.runtime.sendMessage({ tipo: 'pulso', id: msg.id }); } catch (e) { /* extensão recarregada */ } };
    const batida = setInterval(pulso, 8000);
    window.N7Conversa.conversar(msg.prompt, { pulso: () => {} }).then(
      r => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, texto: r.texto, blocos: r.blocos }),
      e => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, erro: String(e && e.message || e) })
    ).catch(() => {}).finally(() => { clearInterval(batida); ocupado = false; });
    return false;
  });
  try { chrome.runtime.sendMessage({ tipo: 'pronto' }); } catch (e) { /* nada */ }
})();
