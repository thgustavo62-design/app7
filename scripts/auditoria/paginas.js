/* Auditoria de páginas: abre TODAS as páginas e subpáginas do menu e procura erro de script, requisição falhando,
   imagem quebrada, texto "undefined"/"NaN", rolagem lateral e botão sem nome. Uso: node scripts/auditoria/paginas.js [light|dark] [largura]
   Precisa de: npm i --no-save playwright-core  e do Microsoft Edge (ou NAVEGADOR=chrome). Roda no servidor local (dev-server), sem tocar na produção. */
// Uso: node audit-smoke.js <tema light|dark> <largura>
process.env.AUTH_DEV_EMAIL = 'dev@local'; delete process.env.VERCEL;
const { chromium } = require('playwright-core');
const { createServer } = require('../../dev-server');
const tema = process.argv[2] || 'light', largura = Number(process.argv[3] || 1440);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch({ channel: process.env.NAVEGADOR || 'msedge' }); const ctx = await b.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 } }); const p = await ctx.newPage();
  const achados = []; let pagina = '(entrada)';
  const anota = (tipo, msg) => { if (pagina === '(entrada)') return; achados.push({ pagina, tipo, msg: String(msg).slice(0, 200) }); };
  p.on('pageerror', e => anota('erro de script', e.message));
  p.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/tile\.openstreetmap|Failed to load resource: net::ERR_(FAILED|BLOCKED)/.test(t)) anota('console', t); } });
  p.on('response', r => { const u = r.url(); if (u.startsWith(base) && r.status() >= 400) anota('requisição ' + r.status(), u.replace(base, '/')); });
  p.on('requestfailed', r => { const u = r.url(), f = (r.failure() || {}).errorText || ''; if (u.startsWith(base) && !/ERR_ABORTED/.test(f)) anota('requisição falhou', u.replace(base, '/') + ' (' + f + ')'); });
  await p.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await p.goto(base + 'app'); await p.click('#dev-login'); await p.waitForSelector('#nav a[href^="#"]', { state: 'attached', timeout: 20000 }); await p.waitForLoadState('load'); await p.waitForTimeout(800);
  if (tema === 'dark') { await p.evaluate(() => { localStorage.setItem('nova7-tema', 'escuro'); }); await p.reload(); await p.waitForSelector('#nav a[href^="#"]', { state: 'attached', timeout: 20000 }); await p.waitForTimeout(600); }
  const vistos = new Set(), fila = []; const empilha = async () => { const hs = await p.evaluate(() => [...document.querySelectorAll('#nav a[href^="#"]')].map(a => a.getAttribute('href').slice(1))); hs.forEach(h => { if (!vistos.has(h)) { vistos.add(h); fila.push(h); } }); };
  await empilha();
  let n = 0;
  while (fila.length && n < 80) {
    const h = fila.shift(); n++; pagina = '#' + h;
    try {
      await p.goto(base + 'app#' + h); await p.reload(); await p.waitForSelector('#view .panel, #view .kpis, #view .page-head, #view .hero, #view .brain-hero, #view .alert, #view .kcol, #view .empty, #view .month', { timeout: 15000 }); await p.waitForTimeout(1100);
      const r = await p.evaluate(() => {
        const txt = document.querySelector('#view').innerText, ruins = [...txt.matchAll(/undefined|NaN|\[object|\bnull\b/g)].map(m => m[0]);
        const semImg = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map(i => i.src.split('/').slice(-2).join('/'));
        const botoesSemNome = [...document.querySelectorAll('button, a[href]')].filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.title && !e.querySelector('img[alt]:not([alt=""])') && e.offsetParent !== null).length;
        return { tam: txt.trim().length, ruins, semImg, larg: document.documentElement.scrollWidth, janela: innerWidth, botoesSemNome, titulo: (document.querySelector('#view h1, #view .hero h1') || {}).innerText || '' };
      });
      if (r.tam < 40) anota('página vazia', r.tam + ' caracteres');
      if (r.ruins.length) anota('texto estranho', [...new Set(r.ruins)].join(', '));
      if (r.semImg.length) anota('imagem quebrada', r.semImg.join(', '));
      if (r.larg > r.janela + 2) anota('rolagem lateral', `${r.larg}px numa janela de ${r.janela}px`);
      if (r.botoesSemNome) anota('botão sem nome acessível', r.botoesSemNome + ' elemento(s)');
      await empilha();
    } catch (e) { anota('não abriu', e.message.split('\n')[0]); }
  }
  console.log(`tema=${tema} largura=${largura}: ${vistos.size} páginas visitadas`);
  const porTipo = {}; achados.forEach(a => { (porTipo[a.tipo + ' | ' + a.msg] = porTipo[a.tipo + ' | ' + a.msg] || new Set()).add(a.pagina); });
  Object.entries(porTipo).forEach(([k, v]) => console.log(' -', k, '=>', [...v].slice(0, 6).join(' ')));
  if (!achados.length) console.log(' sem achados');
  await b.close(); srv.close();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
