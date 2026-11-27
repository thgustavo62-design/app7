/* Nova7 ↔ ChatGPT: a cada 30 s (e quando o Chrome abre) pergunta ao agente deste computador se há pedido de rascunho.
   Se houver, usa uma aba do ChatGPT (a conta já logada), manda a mensagem, lê a resposta e devolve ao agente.
   Nunca publica nada e não guarda nada: só leva texto de ida e volta. */
const VERSAO = chrome.runtime.getManifest().version;
const SITE = 'https://chatgpt.com/';
let ocupado = false;
const esperas = new Map();   // id do pedido -> { resolver }

async function config() {
  try { const r = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' }); const c = await r.json(); if (c.porta && c.token) return c; } catch (e) { /* o agente ainda não escreveu */ }
  return null;
}
async function ponte(c, caminho, opcoes = {}) {
  return fetch('http://127.0.0.1:' + c.porta + caminho, Object.assign({}, opcoes, { headers: Object.assign({ 'x-n7-token': c.token, 'x-n7-versao': VERSAO, 'content-type': 'application/json' }, opcoes.headers || {}) }));
}
function selo(texto, cor) { try { chrome.action.setBadgeText({ text: texto }); chrome.action.setBadgeBackgroundColor({ color: cor }); } catch (e) { /* sem selo */ } }

/* abre (ou reaproveita) uma aba do ChatGPT em conversa nova, sem tirar o foco do que a pessoa está fazendo */
/* texto: conversa temporária (não suja o histórico). Imagem: o ChatGPT não gera imagem em conversa temporária, então usa conversa normal */
async function abrirAba(temporario = true) {
  const url = typeof temporario === 'string' ? temporario : SITE + (temporario ? '?temporary-chat=true&n7=' + Date.now() : '?n7=' + Date.now());
  const guardada = (await chrome.storage.session.get('aba')).aba; let aba = null;
  if (guardada) { try { aba = await chrome.tabs.get(guardada); } catch (e) { aba = null; } }
  aba = aba ? await chrome.tabs.update(aba.id, { url }) : await chrome.tabs.create({ url, active: false });
  await chrome.storage.session.set({ aba: aba.id });
  await new Promise(res => { const fim = setTimeout(res, 45000), f = (id, info) => { if (id === aba.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(f); clearTimeout(fim); res(); } }; chrome.tabs.onUpdated.addListener(f); });
  return aba.id;
}
async function fecharAba() { try { const a = (await chrome.storage.session.get('aba')).aba; if (a) { await chrome.tabs.remove(a); await chrome.storage.session.remove('aba'); } } catch (e) { /* já fechada */ } }

/* manda o pedido à página e espera a resposta (que chega por mensagem) */
async function conversar(job) {
  const aba = await abrirAba(job.instagram ? 'https://www.instagram.com/' + encodeURIComponent(String(job.instagram.handle || '').replace(/^@/, '')) + '/' : job.temporario !== false);
  const resposta = new Promise(resolver => { esperas.set(job.id, { resolver }); });
  let entregue = false;
  for (let i = 0; i < 40 && !entregue; i++) {   // o script da página demora um pouco para subir
    try { const r = await chrome.tabs.sendMessage(aba, job.instagram ? { tipo: 'instagram', id: job.id, max: job.instagram.max } : { tipo: 'executar', id: job.id, prompt: job.prompt, mensagens: job.mensagens }); entregue = !!(r && r.ok); } catch (e) { /* ainda não pronto */ }
    if (!entregue) await new Promise(r => setTimeout(r, 1000));
  }
  if (!entregue) { esperas.delete(job.id); return { erro: 'A página do site (ChatGPT ou Instagram) não respondeu à extensão (está aberta e logada?).' }; }
  const limite = setTimeout(() => { const e = esperas.get(job.id); if (e) e.resolver({ erro: 'Tempo esgotado esperando o ChatGPT.' }); }, (Number(job.limiteMs) || 7 * 60e3) + 60e3);
  const r = await resposta; clearTimeout(limite); esperas.delete(job.id); return r;
}

chrome.runtime.onMessage.addListener((msg, remetente) => {
  if (!msg) return;
  if (msg.tipo === 'resultado') { const e = esperas.get(msg.id); if (e) e.resolver({ resultados: msg.resultados || [], instagram: msg.instagram, erro: msg.erro || '' }); }
  /* 'pulso' e 'pronto' não fazem nada: receber a mensagem já mantém este serviço acordado durante a conversa */
});

async function ciclo() {
  if (ocupado) return; ocupado = true;
  const mantem = setInterval(() => { try { chrome.runtime.getPlatformInfo(); } catch (e) { /* nada */ } }, 20000);
  try {
    const c = await config(); if (!c) { selo('?', '#999999'); return; }
    let trabalhou = false;
    for (let n = 0; n < 12; n++) {
      let r; try { r = await ponte(c, '/job?espera=20'); } catch (e) { selo('—', '#999999'); return; }
      if (r.status === 401) { selo('!', '#cc0000'); return; }
      if (r.status !== 200) { if (r.status === 204) selo('ok', '#1a9b4b'); break; }
      const job = await r.json(); trabalhou = true; selo('...', '#d98a00');
      const res = await conversar(job);
      try { await ponte(c, '/resultado', { method: 'POST', body: JSON.stringify(Object.assign({ id: job.id }, res)) }); } catch (e) { /* o agente caiu: ele recusa por tempo */ }
      selo(res.erro ? '!' : 'ok', res.erro ? '#cc0000' : '#1a9b4b');
    }
    if (trabalhou) await fecharAba();
  } finally { clearInterval(mantem); ocupado = false; }
}

chrome.alarms.create('n7-ciclo', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'n7-ciclo') ciclo(); });
chrome.runtime.onStartup.addListener(ciclo);
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('n7-ciclo', { periodInMinutes: 0.5 }); ciclo(); });
chrome.action.onClicked.addListener(() => { try { chrome.runtime.openOptionsPage(); } catch (e) { ciclo(); } });
ciclo();
