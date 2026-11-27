/* Lê o perfil público do Instagram de um cliente, dentro da página (Chrome já logado): bio, últimas publicações (imagem, tipo) e a legenda de cada uma.
   Serve para o agente criativo seguir o padrão visual e o tom que o cliente já usa. Só lê; nunca curte, comenta nem publica.
   Lógica de página (sem chrome.*) para testar numa página falsa. Se o Instagram mudar o visual, o ajuste é aqui. */
(function (raiz) {
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const esperar = async (fn, ms) => { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) return null; await dormir(300); } };
  const paraBase64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('leitura')); r.readAsDataURL(blob); });
  const decodificar = s => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; };
  const LINKS = 'a[href*="/p/"], a[href*="/reel/"]';

  async function coletar({ max = 12, comLegenda = 6, comImagem = 6, tamanhoMaxImagem = 900000 } = {}) {
    const grade = await esperar(() => document.querySelector(LINKS + ' img') || document.querySelector(LINKS), 25000);
    if (!grade) {
      if (document.querySelector('input[name="username"]') || /accounts\/login/.test(location.pathname)) throw new Error('O Instagram não está logado neste Chrome: entre na conta em instagram.com.');
      throw new Error('Não achei as publicações do perfil (perfil privado, inexistente ou o visual do Instagram mudou).');
    }
    const cab = document.querySelector('header'), meta = document.querySelector('meta[name="description"]');
    const bio = (cab ? cab.innerText : '').replace(/\n{2,}/g, '\n').slice(0, 700), resumo = decodificar(meta && meta.content).slice(0, 300);
    const vistos = new Set(), posts = [];
    for (let rolagem = 0; rolagem < 4 && posts.length < max; rolagem++) {
      for (const a of document.querySelectorAll(LINKS)) {
        const m = /\/(p|reel)\/([\w-]+)/.exec(a.getAttribute('href') || ''); if (!m || vistos.has(m[2])) continue;
        const img = a.querySelector('img'); if (!img || !img.src) continue; vistos.add(m[2]);
        posts.push({ codigo: m[2], tipo: m[1] === 'reel' ? 'reel' : 'post', href: a.getAttribute('href'), alt: decodificar(img.alt).slice(0, 300), src: img.src }); if (posts.length >= max) break;
      }
      if (posts.length < max) { window.scrollBy(0, 900); await dormir(1200); }
    }
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      if (i < comImagem) { try { const b = await (await fetch(p.src)).blob(); if (b.size && b.size <= tamanhoMaxImagem) p.imagem = { mime: b.type || 'image/jpeg', b64: await paraBase64(b) }; } catch (e) { /* sem a imagem */ } }
      if (i < comLegenda) {
        try { const t = await (await fetch(p.href, { credentials: 'include' })).text(), m = /<meta property="og:description" content="([^"]*)"/.exec(t); if (m) { const d = decodificar(m[1]), q = /: "([\s\S]*)"\s*$/.exec(d); p.legenda = (q ? q[1] : d).slice(0, 700); } } catch (e) { /* sem a legenda */ }
        await dormir(500);
      }
      delete p.src; delete p.href;
    }
    return { bio, resumo, posts };
  }
  raiz.N7Instagram = { coletar };
})(typeof window !== 'undefined' ? window : globalThis);
