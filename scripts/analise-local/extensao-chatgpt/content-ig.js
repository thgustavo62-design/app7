/* Dentro do instagram.com: recebe o pedido do background, lê o perfil (instagram.js) e devolve. */
(function () {
  if (window.__n7ContentIg) return; window.__n7ContentIg = true;
  let ocupado = false;
  chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
    if (!msg || msg.tipo !== 'instagram') return false;
    if (ocupado) { responder({ ok: false, motivo: 'ocupado' }); return false; }
    ocupado = true; responder({ ok: true });
    const batida = setInterval(() => { try { chrome.runtime.sendMessage({ tipo: 'pulso', id: msg.id }); } catch (e) { /* recarregada */ } }, 8000);
    window.N7Instagram.coletar({ max: msg.max || 12 }).then(
      r => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, instagram: r, resultados: [], erro: '' }),
      e => chrome.runtime.sendMessage({ tipo: 'resultado', id: msg.id, resultados: [], erro: String(e && e.message || e) })
    ).catch(() => {}).finally(() => { clearInterval(batida); ocupado = false; });
    return false;
  });
})();
