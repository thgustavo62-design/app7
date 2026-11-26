/* Service worker da Central Nova7.
   - Guarda só o "casco" do app (HTML, CSS, JS, ícones) para abrir rápido e funcionar sem internet (mostra "sem conexão").
   - NUNCA guarda nada de /api/: dados dos clientes, estado e login passam sempre direto pela rede.
   - Arquivos de outros domínios (fontes, login do Google) não passam por aqui.
   Para publicar uma versão nova do casco, mude VERSION. */
const VERSION = 'n7-v25';
const SHELL = ['/app', '/assets/css/app.css', '/assets/js/boot.js', '/assets/js/logos.js', '/assets/clientes/minas-farma.png', '/assets/clientes/farma-e-farma.png', '/assets/clientes/campo-forte.png', '/assets/clientes/nova7.png', '/assets/clientes/junior-lopes-contador.png', '/assets/clientes/altus-contabilidade.png', '/assets/js/tema.js', '/assets/js/store.js', '/assets/js/services.js', '/assets/js/playbook.js', '/assets/js/workflow.js',
  '/assets/js/charts.js', '/assets/js/sync.js', '/assets/js/lazy.js', '/assets/js/outbox.js', '/assets/js/ingest.js', '/assets/js/analysis.js', '/assets/js/report.js', '/assets/js/semana.js', '/assets/js/comercial.js', '/assets/js/comercial-mapa.js', '/assets/js/proposta.js', '/assets/js/comercial-ui.js', '/assets/js/authority.js', '/assets/js/autoridade.js', '/assets/js/relatorio.js', '/assets/js/relatorios.js', '/assets/js/promo-ingest.js', '/assets/js/promo-files.js', '/assets/js/promo.js', '/assets/js/promo-ponte.js', '/assets/js/vendas-ponte.js', '/assets/js/analise-vendas.js', '/assets/js/promocoes.js', '/assets/js/feed.js', '/assets/js/settings.js', '/assets/js/cerebro-loader.js',
  '/assets/js/brain/agents/conteudo.mjs', '/assets/js/brain/agents/contexto.mjs', '/assets/js/brain/agents/promocao.mjs', '/assets/js/brain/agents/autoridade.mjs', '/assets/js/brain/agents/estrategia.mjs', '/assets/js/brain/agents/mercado.mjs', '/assets/js/brain/agents/index.mjs', '/assets/js/brain/agents/operacao.mjs', '/assets/js/brain/agents/resultado.mjs', '/assets/js/brain/catalog.mjs', '/assets/js/brain/health.mjs', '/assets/js/brain/index.mjs', '/assets/js/brain/memory.mjs', '/assets/js/brain/synapses.mjs', '/assets/js/brain/util.mjs', '/assets/js/cerebro/3d/graph.mjs', '/assets/js/cerebro/3d/panel.mjs', '/assets/js/cerebro/3d/scene.mjs', '/assets/js/cerebro/index.mjs', '/assets/js/cerebro/kit.mjs', '/assets/js/cerebro/views/agentes.mjs', '/assets/js/cerebro/views/clientes.mjs', '/assets/js/cerebro/views/conexoes.mjs', '/assets/js/cerebro/views/hoje.mjs', '/assets/js/cerebro/views/mapa3d.mjs', '/assets/js/cerebro/views/memoria.mjs', '/assets/js/cerebro/views/radar.mjs', '/assets/js/cerebro/views/regras.mjs', '/assets/js/cerebro/views/servicos.mjs',
  '/assets/js/pwa.js',
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
  if (req.mode === 'navigate') {                                  /* páginas: rede primeiro; sem internet, abre o casco do app guardado */
    e.respondWith(network().catch(() => caches.match('/app').then(r => r || new Response('Sem conexão', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
    return;
  }
  if (HEAVY.test(url.pathname)) {                                 /* ícones, logo e bibliotecas: cache primeiro */
    e.respondWith(caches.match(req).then(r => r || network()));
    return;
  }
  e.respondWith(network().catch(() => caches.match(req)));        /* CSS e JS: sempre a versão nova quando há internet */
});
