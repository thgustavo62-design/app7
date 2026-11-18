// PWA: manifesto, ícones, service worker (nunca guarda /api/), cabeçalhos e ligação no app.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const pub = p => path.join(__dirname, '..', 'public', p);
const read = p => fs.readFileSync(pub(p), 'utf8');

test('manifesto: instalável, em português, com ícones de verdade (inclusive maskable) e atalhos', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'pt-BR'); assert.equal(m.scope, '/'); assert.match(m.start_url, /^\//);
  assert.ok(m.name && m.short_name && m.short_name.length <= 12);
  const need = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']];
  need.forEach(([s, p]) => assert.ok(m.icons.some(i => i.sizes === s && i.purpose === p), `ícone ${s} ${p}`));
  m.icons.forEach(i => {
    const buf = fs.readFileSync(pub(i.src.replace(/^\//, ''))); const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, i.sizes, `${i.src} tem as dimensões declaradas`);
  });
  assert.ok(m.shortcuts.length >= 3);
  const apple = fs.readFileSync(pub('assets/icons/apple-touch-icon.png')); assert.equal(apple.readUInt32BE(16), 180);
});
test('service worker: dados privados nunca passam pelo cache e todo o casco listado existe', () => {
  const sw = read('sw.js');
  assert.match(sw, /startsWith\('\/api\/'\)\) return;/, 'rotas /api/ passam direto pela rede');
  assert.match(sw, /url\.origin !== self\.location\.origin\) return;/, 'outros domínios não são interceptados');
  assert.match(sw, /req\.method !== 'GET'/, 'só GET');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  assert.ok(!shell.some(u => u.startsWith('/api/')));
  shell.forEach(u => assert.ok(fs.existsSync(pub(u === '/app' ? 'app.html' : u.replace(/^\//, ''))), `${u} existe`));
  assert.ok(shell.includes('/assets/js/pwa.js') && shell.includes('/assets/js/settings.js'));
});
test('app.html: manifesto, ícone do iPhone, cor do tema, barra de abas e pwa.js antes do boot', () => {
  const h = read('app.html');
  ['rel="manifest"', 'rel="apple-touch-icon"', 'name="theme-color"', 'apple-mobile-web-app-capable', 'id="tabbar"', 'id="install-btn"', 'viewport-fit=cover'].forEach(t => assert.ok(h.includes(t), t));
  assert.ok(h.indexOf('pwa.js') > 0 && h.indexOf('pwa.js') < h.indexOf('boot.js'));
});
test('vercel.json: service worker sem cache e manifesto com o tipo certo; CSP continua sem scripts de fora', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const sw = v.headers.find(x => x.source === '/sw.js'); assert.ok(sw);
  assert.match(sw.headers.find(h => h.key === 'Cache-Control').value, /no-cache/);
  assert.match(v.headers.find(x => x.source === '/manifest.webmanifest').headers.find(h => h.key === 'Content-Type').value, /manifest\+json/);
  const csp = v.headers.find(x => x.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client;/); assert.doesNotMatch(csp, /unsafe-eval/);
});
