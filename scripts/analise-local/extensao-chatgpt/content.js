/* Dentro do chatgpt.com: recebe o pedido do background, conversa (conversa.js) e devolve a resposta (texto e imagens). */
(function () {
  if (window.__n7Content) return; window.__n7Content = true;
  let ocupado = false;
  chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
    if (!msg || msg.tipo !== 'executar') return false;
    if (ocupado) { responder({ ok: false, motivo: 'ocupado' }); return false; }
    ocupado = true; responder({ ok: true });
    const pulso = () => { try { chrome.runtime.sendMessage({ tipo: 'pulso', id: msg.id }); } catch (e) { /* extensão recarregada */ } };
    const batida = setInterval(pulso, 8000);
    /* pedido de texto ({prompt}) ou de conversa com várias mensagens ({mensagens}) */
    const mensagens = Array.isArray(msg.mensagens) && msg.mensagens.length ? msg.mensagens : [{ texto: msg.prompt }];
    window.N7Conversa.conversarVarias(mensagens, { pulso: () => {} }).then(
      r => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, resultados: r.resultados, erro: r.erro || '' }),
      e => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, resultados: [], erro: String(e && e.message || e) })
    ).catch(() => {}).finally(() => { clearInterval(batida); ocupado = false; });
    return false;
  });
  try { chrome.runtime.sendMessage({ tipo: 'pronto' }); } catch (e) { /* nada */ }
})();
