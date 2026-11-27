// Instagram do cliente (só leitura) pelo Chrome: a extensão lê o perfil, o agente guarda bio/legendas/imagens por 7 dias e usa como referência.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../scripts/analise-local/ponte');
const IG = require('../scripts/analise-local/instagram');
const ARTE = require('../scripts/analise-local/arte');

const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const chamar = (p, caminho, o = {}) => fetch('http://127.0.0.1:' + p.porta + caminho, Object.assign({}, o, { headers: Object.assign({ 'x-n7-token': p.token }, o.headers || {}) }));

test('instagram: pedido pela extensão (1.2+), extensão antiga é avisada, dados ficam em cache por 7 dias', async () => {
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ext-')), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-ig-'));
  const p = P.criar({ porta: 0, token: 'tok-' + 'x'.repeat(30), pastaExtensao: ext, vivaMs: 5000 }); await p.ligar();
  try {
    await chamar(p, '/ping', { headers: { 'x-n7-versao': '1.0.0' } });
    await assert.rejects(p.pedirInstagram('farmaefarmabg'), e => e.codigo === 'EXTENSAO_ANTIGA' && /recarregue/.test(e.message));
    await chamar(p, '/ping', { headers: { 'x-n7-versao': '1.2.0' } });
    /* a "extensão": busca o pedido e responde com o perfil */
    const dados = { bio: 'Farmácia Farma e Farma\nBom Jesus', resumo: '1 mil seguidores', posts: [{ codigo: 'AAA1', tipo: 'post', alt: 'Foto de texto', legenda: 'Temos ganhadoras! Sorteio do Farma Club.', imagem: { mime: 'image/jpeg', b64: PNG1 } }, { codigo: 'BBB2', tipo: 'reel', alt: 'Reel', legenda: '' }] };
    let visto = null; const laco = (async () => { const r = await chamar(p, '/job?espera=5', { headers: { 'x-n7-versao': '1.2.0' } }); visto = await r.json(); await chamar(p, '/resultado', { method: 'POST', body: JSON.stringify({ id: visto.id, resultados: [], instagram: dados }) }); })();
    const d = await IG.dadosDoInstagram(p, '@farmaefarmabg', dir, { max: 3 }); await laco;
    assert.equal(visto.instagram.handle, 'farmaefarmabg', 'a extensão recebeu o perfil sem o @'); assert.equal(visto.instagram.max, 3);
    assert.equal(d.posts.length, 2); assert.ok(fs.existsSync(path.join(dir, d.posts[0].arquivo)), 'a imagem foi salva'); assert.equal(d.posts[1].arquivo, '', 'post sem imagem fica sem arquivo');
    const resumo = IG.resumoParaIA(d); assert.match(resumo.ultimasLegendas[0], /Farma Club/); assert.match(resumo.perfil, /Farma e Farma/); assert.equal(IG.imagensDe(d, dir, 2).length, 1);
    /* segunda leitura: vem do cache, não pergunta de novo */
    const de = await IG.dadosDoInstagram({ pedirInstagram: async () => { throw new Error('não devia pedir de novo'); } }, 'farmaefarmabg', dir); assert.equal(de.posts.length, 2);
    /* cache vencido ou outro perfil: pede de novo */
    await assert.rejects(IG.dadosDoInstagram({ pedirInstagram: async () => { throw new Error('pediu'); } }, 'outroperfil', dir), /pediu/);
  } finally { p.parar(); fs.rmSync(ext, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); }
});

const PAGINA_IG = `<!doctype html><title>Instagram</title><meta name="description" content="1 mil Followers"><body><header><h2>farmaefarmabg</h2><div>Farmácia Bom Jesus</div></header><main id="g"></main><script>
const orig = window.fetch.bind(window);
window.fetch = async (u, o) => { if (/\\/(p|reel)\\//.test(u)) return new Response('<meta property="og:description" content="14 likes, 1 comments - farmaefarmabg on November 26, 2026: &quot;Legenda de teste&quot;">'); return orig(u, o); };
const c = document.createElement('canvas'); c.width = 400; c.height = 400; const png = c.toDataURL('image/png');
for (let i = 0; i < 5; i++) { const a = document.createElement('a'); a.href = '/farmaefarmabg/' + (i % 2 ? 'reel' : 'p') + '/COD' + i + '/'; const im = new Image(); im.alt = 'Photo ' + i; im.src = png; a.appendChild(im); document.getElementById('g').appendChild(a); }
</script></body>`;

test('instagram na página: lê bio, posts, imagens e legendas (só leitura)', { skip: ARTE.acharEdge() ? false : 'sem Edge/Chrome neste computador', timeout: 60000 }, async () => {
  const { chromium } = require('playwright-core'); const b = await chromium.launch({ channel: 'msedge', headless: true }); const pg = await b.newPage();
  const lib = path.join(__dirname, '..', 'scripts', 'analise-local', 'extensao-chatgpt', 'instagram.js');
  try {
    await pg.setContent(PAGINA_IG); await pg.addScriptTag({ path: lib });
    const r = await pg.evaluate(() => window.N7Instagram.coletar({ max: 4, comLegenda: 2, comImagem: 2 }));
    assert.match(r.bio, /Farmácia/); assert.equal(r.posts.length, 4); assert.deepEqual(r.posts.map(p => p.codigo), ['COD0', 'COD1', 'COD2', 'COD3']); assert.equal(r.posts[1].tipo, 'reel');
    assert.ok(r.posts[0].imagem && r.posts[0].imagem.b64.length > 50 && !r.posts[3].imagem, 'só as 2 primeiras vêm com imagem');
    assert.match(r.posts[0].legenda, /^Legenda de teste/); assert.ok(!r.posts[3].legenda, 'só as 2 primeiras vêm com legenda'); assert.ok(!('src' in r.posts[0]) && !('href' in r.posts[0]));
    await pg.setContent('<body><input name="username"></body>'); await pg.addScriptTag({ path: lib });
    const e = await pg.evaluate(async () => { try { await window.N7Instagram.coletar({}); } catch (x) { return x.message; } }); assert.match(e, /não está logado/);
  } finally { await b.close(); }
});
