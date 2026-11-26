// Landing page pública: estrutura, links, segurança (CSP), privacidade dos clientes e roteamento do app em /app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const pub = p => path.join(__dirname, '..', 'public', p);
const read = p => fs.readFileSync(pub(p), 'utf8');
const html = read('index.html');

test('landing: título, descrição, um único h1, idioma e imagem de compartilhamento com o tamanho certo', () => {
  assert.match(html, /<html lang="pt-BR">/); assert.match(html, /<title>[^<]{20,80}<\/title>/); assert.match(html, /<meta name="description" content="[^"]{80,165}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /name="robots" content="index, follow"/);
  const og = fs.readFileSync(pub('assets/brand/og-nova7.png')); assert.equal(og.readUInt32BE(16), 1200); assert.equal(og.readUInt32BE(20), 630);
  assert.match(html, /property="og:image" content="https:\/\/[^"]+\/assets\/brand\/og-nova7\.png"/);
});
test('landing: âncoras do menu existem, imagens têm alt, e tudo o que é carregado de dentro do site existe', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  [...html.matchAll(/href="#([^"]+)"/g)].forEach(m => assert.ok(ids.has(m[1]), `#${m[1]} existe`));
  [...html.matchAll(/<img\b[^>]*>/g)].forEach(m => assert.match(m[0], /\salt="/));
  [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map(m => m[1]).filter(u => u !== '/app').forEach(u => assert.ok(fs.existsSync(pub(u.replace(/^\//, ''))), `${u} existe`));
  assert.ok(html.includes('href="/app"'), 'link para a área do cliente');
});
test('landing: nenhum script dentro do HTML (a política de segurança do site proíbe), só o arquivo próprio e o JSON-LD', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  scripts.forEach(a => assert.ok(/src="\/assets\/js\/landing\.js"/.test(a) || /type="application\/ld\+json"/.test(a), `script permitido: ${a}`));
  assert.ok(!/\son[a-z]+="/i.test(html), 'sem manipuladores de evento inline');
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
});
test('landing: só cita cliente que autorizou (Altus) e não promete números', () => {
  ['Minas Farma', 'Farma e Farma', 'Campo Forte', 'Minas Club', 'Farma Club'].forEach(n => assert.ok(!html.includes(n), `não cita ${n}`));
  assert.ok(/Altus Contabilidade/.test(html), 'a Altus autorizou aparecer no portfólio');
  assert.equal((html.match(/<article class="case">/g) || []).length, 1, 'só quem autorizou aparece (hoje, só a Altus)');
  assert.ok(!/\d+\s?%/.test(html.replace(/<[^>]+>/g, ' ')), 'sem percentuais de resultado inventados');
});
test('landing: contato configurável em um só lugar e com plano B (WhatsApp, e-mail, Instagram)', () => {
  const js = read('assets/js/landing.js');
  assert.match(js, /const CONTACT = \{[\s\S]*whatsapp:[\s\S]*email:[\s\S]*instagram: "nova7\.produtora"/);
  assert.match(js, /wa\.me/); assert.match(js, /mailto:/); assert.match(js, /instagram\.com/);
  assert.ok(html.includes('data-contact'));
});
test('roteamento: o app fica em /app (sem indexação) e a raiz é pública; robots.txt protege /app e /api', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.deepEqual(v.rewrites, [{ source: '/app', destination: '/app.html' }]);
  assert.match(v.headers.find(h => h.source === '/app(.*)').headers[0].value, /noindex/);
  assert.ok(fs.existsSync(pub('app.html'))); assert.match(read('app.html'), /name="robots" content="noindex, nofollow"/);
  const robots = read('robots.txt'); assert.match(robots, /Disallow: \/app/); assert.match(robots, /Disallow: \/api\//);
  const m = JSON.parse(read('manifest.webmanifest')); assert.equal(m.start_url.split('?')[0], '/app'); assert.ok(m.shortcuts.every(s => s.url.startsWith('/app')));
});

test('landing: WhatsApp configurado com DDI 55 e DDD 27, e o mesmo número no dado estruturado', () => {
  const js = read('assets/js/landing.js'); assert.match(js, /whatsapp: "5527997010954"/);
  assert.equal(JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).telephone, '+5527997010954');
});

test('landing: segue o manual (Montserrat, assinatura, cores) e a galeria de fotos só aceita arquivos que existem', () => {
  const css = read('assets/css/landing.css');
  ['#0b0c11', '#171927', '#38bcd8', '#7443d8'].forEach(c => assert.ok(css.toLowerCase().includes(c), `cor do manual ${c}`));
  assert.match(html, /family=Montserrat/); assert.match(html, /Mais que posts,/); assert.match(html, /direção\./);
  assert.match(html, /Estratégia · Marketing · Produção audiovisual/);
  const list = JSON.parse(read('assets/photos/photos.json')); assert.ok(Array.isArray(list));
  list.forEach(p => { assert.match(p.src, /^[\w./-]+\.(jpe?g|png|webp|avif)$/i); assert.ok(fs.existsSync(pub('assets/photos/' + p.src)), `${p.src} existe`); });
  assert.ok(/id="bastidores"[^>]*\shidden/.test(html), 'a seção de fotos começa escondida');
  assert.ok(html.includes('<symbol id="n7"'), 'o 7 da marca em vetor');
});

test('arquivos públicos de texto não têm BOM (um BOM no início do robots.txt invalida a primeira regra)', () => {
  ['robots.txt', 'manifest.webmanifest', 'assets/photos/photos.json', 'sw.js', 'index.html', 'app.html'].forEach(f => {
    const b = fs.readFileSync(pub(f)); assert.ok(!(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF), `${f} sem BOM`);
  });
  assert.match(read('robots.txt'), /^User-agent: \*/);
});
