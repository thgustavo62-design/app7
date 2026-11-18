/* Service worker da Central Nova7.
   - Guarda só o "casco" do app (HTML, CSS, JS, ícones) para abrir rápido e funcionar sem internet (mostra "sem conexão").
   - NUNCA guarda nada de /api/: dados dos clientes, estado e login passam sempre direto pela rede.
   - Arquivos de outros domínios (fontes, login do Google) não passam por aqui.
   Para publicar uma versão nova do casco, mude VERSION. */
const VERSION = 'n7-v1';
const SHELL = ['/', '/assets/css/app.css', '/assets/js/boot.js', '/assets/js/store.js', '/assets/js/services.js', '/assets/js/playbook.js', '/assets/js/workflow.js',
  '/assets/js/charts.js', '/assets/js/sync.js', '/assets/js/ingest.js', '/assets/js/analysis.js', '/assets/js/report.js', '/assets/js/semana.js', '/assets/js/settings.js', '/assets/js/pwa.js',
  '/assets/js/app.js', '/assets/brand/nova7-simbolo.png', '/assets/icons/icon-192.png', '/assets/icons/apple-touch-icon.png', '/manifest.webmanifest'];
const HEAVY = /\/assets\/(vendor|icons|brand)\//;                 /* quase nunca mudam: cache primeiro */

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* um arquivo ausente não impede a instalação */ })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;                   /* dados privados: sempre rede, nunca cache */
  if (url.pathname === '/sw.js') return;
  const network = () => fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; });
  if (req.mode === 'navigate') {                                  /* páginas: rede primeiro; sem internet, abre o casco guardado */
    e.respondWith(network().catch(() => caches.match('/').then(r => r || new Response('Sem conexão', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
    return;
  }
  if (HEAVY.test(url.pathname)) {                                 /* ícones, logo e bibliotecas: cache primeiro */
    e.respondWith(caches.match(req).then(r => r || network()));
    return;
  }
  e.respondWith(network().catch(() => caches.match(req)));        /* CSS e JS: sempre a versão nova quando há internet */
});
