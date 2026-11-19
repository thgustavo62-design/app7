// Cérebro modular: imports, cache do app, grafo 3D (sem Three.js) e telas das subabas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../public/assets/js/analysis.js');
require('../public/assets/js/services.js');
const { WEEKS, GENS } = require('../lib/seed-weeks');

const JS = path.join(__dirname, '..', 'public', 'assets', 'js');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mods = ['brain', 'cerebro'].flatMap(d => walk(path.join(JS, d))).filter(f => f.endsWith('.mjs'));
const read = f => fs.readFileSync(f, 'utf8');

test('todo import dos módulos aponta para um arquivo que existe e nada vem de outro domínio', () => {
  assert.ok(mods.length >= 20);
  mods.forEach(f => {
    const src = read(f);
    assert.ok(!/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f + ' referencia outro domínio');
    for (const m of src.matchAll(/(?:from|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)) assert.ok(fs.existsSync(path.resolve(path.dirname(f), m[1])), `${path.basename(f)} importa ${m[1]}, que não existe`);
  });
  assert.ok(fs.existsSync(path.join(JS, '..', 'vendor', 'three.module.min.js')) && fs.existsSync(path.join(JS, '..', 'vendor', 'three-LICENSE.txt')), 'Three.js e a licença dele no projeto');
});
test('o cache do app instalado lista todos os módulos do cérebro e não o arquivo antigo', () => {
  const sw = read(path.join(__dirname, '..', 'public', 'sw.js'));
  mods.forEach(f => { const url = '/' + path.relative(path.join(__dirname, '..', 'public'), f).split(path.sep).join('/'); assert.ok(sw.includes(`'${url}'`), url + ' falta em SHELL (public/sw.js)'); });
  assert.ok(sw.includes("'/assets/js/cerebro-loader.js'")); assert.ok(!/assets\/js\/(brain|cerebro)\.js/.test(sw));
});
test('o app carrega só o carregador; o cérebro entra por módulos e o servidor entrega .mjs como JavaScript', () => {
  const html = read(path.join(__dirname, '..', 'public', 'app.html')), app = read(path.join(JS, 'app.js'));
  assert.ok(html.includes('cerebro-loader.js') && !/brain\.js|cerebro\.js"/.test(html));
  assert.ok(app.includes('window.N7Cerebro.render(v, sub, brainHelpers())') && app.includes('window.N7Cerebro.mini('));
  assert.match(read(path.join(__dirname, '..', 'dev-server.js')), /'\.mjs': 'text\/javascript/);
  assert.match(read(path.join(__dirname, '..', 'vercel.json')), /\.mjs/);
  assert.ok(!fs.existsSync(path.join(JS, 'brain.js')) && !fs.existsSync(path.join(JS, 'cerebro.js')), 'arquivos antigos removidos');
});

/* ---------- dados de exemplo ---------- */
const B = require('../public/assets/js/brain/index.mjs').default;
const G = require('../public/assets/js/cerebro/3d/graph.mjs');
const clients = [{ key: 'M', id: 'minas-farma', name: 'Minas Farma', services: ['redes', 'trafego', 'varejo'] }, { key: 'F', id: 'farma-e-farma', name: 'Farma e Farma', services: ['redes', 'trafego', 'varejo'] },
  { key: 'C', id: 'campo-forte', name: 'Campo Forte', services: ['redes'] }, { key: 'X', id: 'x', name: '<img src=x onerror=alert(1)>', services: ['criativos'] }];
const post = (code, b, date, status) => ({ code, b, title: 'T ' + code, format: 'Reels', date, status, steps: {} });
const input = { today: '2026-11-18', clients, posts: [post('R-M01', 'M', '2026-11-10', 'plan'), post('R-F01', 'F', '2026-11-19', 'plan'), post('CF-01', 'C', '2026-11-20', 'apr')], weeks: WEEKS, gens: GENS, needsClient: p => p.code === 'CF-01', planSource: { source: 'central' } };
const r = B.run(input);
const svcs = globalThis.N7Services.ORDER.map(id => ({ id, name: globalThis.N7Services.SERVICES[id].name, short: globalThis.N7Services.SERVICES[id].short }));

test('grafo (agentes): 1 maestro, 18 agentes, serviços ao redor, sem nós sobrepostos e ligações válidas', () => {
  const g = G.buildGraph({ r, clients, services: svcs, mode: 'agentes' });
  assert.equal(g.nodes.filter(n => n.type === 'hub').length, 1); assert.equal(g.nodes.filter(n => n.type === 'agent').length, 18); assert.equal(g.nodes.filter(n => n.type === 'service').length, svcs.length);
  assert.equal(g.nodes.filter(n => n.type === 'client').length, 0);
  g.nodes.forEach(n => { assert.equal(n.pos.length, 3); n.pos.forEach(v => assert.ok(Number.isFinite(v))); assert.ok(Number.isFinite(n.color)); });
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) { const a = g.nodes[i].pos, b = g.nodes[j].pos; assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1.1, `${g.nodes[i].id} e ${g.nodes[j].id} muito perto`); }
  g.edges.forEach(e => { assert.ok(g.by[e.a] && g.by[e.b], `${e.a} -> ${e.b}`); assert.notEqual(e.a, e.b); });
  assert.equal(g.edges.filter(e => e.kind === 'spoke').length, 18);
  const fired = r.sinapses.reduce((n, s) => n + s.de.reduce((m, d) => m + s.para.filter(p => p !== d && B.AGENTS[d] && B.AGENTS[p]).length, 0), 0);
  assert.equal(g.edges.filter(e => e.kind === 'synapse').length, fired, 'uma ligação por par de agentes de cada conexão que disparou');
  assert.equal(g.edges.filter(e => e.kind === 'service-agent').length, svcs.reduce((n, s) => n + B.SERVICE_AGENTS[s.id].length, 0));
  const a = g.by['a:aprovacao']; assert.equal(a.count, r.byAgent.aprovacao.filter(f => f.kind === 'acao').length); assert.ok(a.findings.length <= 6);
});
test('grafo (serviços): serviços no centro, clientes ligados ao que contratam com a cor da saúde', () => {
  const g = G.buildGraph({ r, clients, services: svcs, mode: 'servicos' });
  assert.equal(g.nodes.filter(n => n.type === 'client').length, clients.length);
  const sc = g.edges.filter(e => e.kind === 'service-client'); assert.equal(sc.length, clients.reduce((n, c) => n + c.services.length, 0));
  assert.ok(sc.some(e => e.a === 'c:C' && e.b === 's:redes')); assert.ok(!sc.some(e => e.a === 'c:C' && e.b === 's:trafego'));
  clients.forEach(c => { const h = r.clientes.find(x => x.key === c.key); assert.equal(g.by['c:' + c.key].color, G.LEVEL_COLOR[h.nivel]); });
  const dist = n => Math.hypot(...n.pos); assert.ok(Math.max(...g.nodes.filter(n => n.type === 'service').map(dist)) < Math.min(...g.nodes.filter(n => n.type === 'client').map(dist)), 'serviços mais perto do centro que os clientes');
  assert.equal(g.edges.filter(e => e.kind === 'synapse').length, 0, 'conexões entre agentes ficam na outra aba');
});
test('catálogo: todo agente de SERVICE_AGENTS existe, todo agente atende ao menos um serviço (menos Maestro/Memória)', () => {
  Object.entries(B.SERVICE_AGENTS).forEach(([s, ids]) => { assert.ok(globalThis.N7Services.SERVICES[s], 'serviço ' + s); ids.forEach(id => assert.ok(B.AGENTS[id], id)); });
  B.AGENT_ORDER.forEach(id => assert.ok(B.servicesOf(id).length >= 1, id + ' não atende nenhum serviço'));
});

/* ---------- telas ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { esc, ico: n => `<svg data-i="${n}"></svg>`, banner: (i, t, s) => `<div class="panel-banner">${esc(t)} ${esc(s)}</div>`, input: () => input, store: { get: (k, fb) => fb, set() {} }, today: input.today, canWrite: true, toast() {}, go() {} };
const stub = () => ({ innerHTML: '', querySelectorAll: () => [], querySelector: () => null });
const clean = (html, name) => { assert.ok(html.length > 50, name + ' vazio'); assert.ok(!/undefined|NaN|\[object/.test(html), name + ' com valor quebrado'); assert.ok(!html.includes('<img src=x onerror'), name + ': nome de cliente sem escapar'); };

test('subabas: cada uma monta sua tela sem valores quebrados e com os textos escapados', async () => {
  const { TABS } = require('../public/assets/js/cerebro/index.mjs'), { makeKit } = require('../public/assets/js/cerebro/kit.mjs');
  assert.deepEqual(TABS.map(t => t[0]), ['hoje', 'clientes', 'radar', 'agentes', 'servicos', 'conexoes', 'memoria', 'regras']);
  const k = makeKit(H, () => {});
  for (const [id, , load] of TABS) {
    const mod = await load(); assert.ok(mod.title.h1 && mod.title.lead && typeof mod.render === 'function', id);
    if (id === 'agentes' || id === 'servicos') continue;                             /* usam WebGL: o painel é testado abaixo */
    const host = stub(); await mod.render(host, k); clean(host.innerHTML, id);
  }
});
test('painel do 3D: agente, serviço, cliente e maestro explicam o que são e a quem se ligam', () => {
  const { panelFor } = require('../public/assets/js/cerebro/3d/panel.mjs'), { makeKit } = require('../public/assets/js/cerebro/kit.mjs');
  const k = makeKit(H, () => {}), g = G.buildGraph({ r: k.r, clients, services: svcs, mode: 'servicos' });
  assert.match(panelFor(k, null), /Escolha um ponto/);
  g.nodes.forEach(n => clean(panelFor(k, n), n.id));
  const ap = panelFor(k, g.by['a:midia']); assert.match(ap, /Regras/); assert.match(ap, /data-pick="service:trafego"/); assert.match(ap, /Conversa com/);
  const sp = panelFor(k, g.by['s:redes']); assert.match(sp, /Calendário Kanban/); assert.match(sp, /data-pick="client:C"/); assert.match(sp, /data-pick="agent:aprovacao"/);
  const cp = panelFor(k, g.by['c:F']); assert.match(cp, /Serviços contratados/); assert.match(cp, /data-go="farma-e-farma"/);
});
