/* Auditoria de fluxos: confere se os mesmos números batem em telas diferentes (atrasadas no Painel, Assistente, menu, Kanban e Central),
   se os ícones aparecem em todos os lugares e se uma ficha atravessa o sistema (fechamento, cliente, menu, carteira, mapa, contrato).
   Uso: node scripts/auditoria/fluxos.js   (mesmos requisitos de paginas.js) */
process.env.AUTH_DEV_EMAIL = 'dev@local'; delete process.env.VERCEL;
const { chromium } = require('playwright-core');
const { createServer } = require('../../dev-server');
const ok = (c, m) => { console.log(c ? 'ok:' : 'FALHA:', m); if (!c) process.exitCode = 1; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const srv = createServer(); await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch({ channel: process.env.NAVEGADOR || 'msedge' }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await p.goto(base + 'app'); await p.click('#dev-login'); await p.waitForSelector('#nav a[href^="#"]', { state: 'attached' }); await p.waitForTimeout(900);
  const num = s => Number(String(s).replace(/\D/g, ''));
  /* ---- 1. os mesmos números em telas diferentes ---- */
  await p.goto(base + 'app#painel'); await p.reload(); await p.waitForSelector('#pcal'); await p.waitForTimeout(1000);
  const kpiAtras = num(await p.locator('.bento .kpi:has-text("Pautas publicadas") b').first().textContent());
  const assAtras = num((await p.locator('.asst.t-red b').first().textContent()).split(' ')[0]);
  const badges = await p.locator('#nav a.nav-item[href^="#"] .nav-count').allTextContents(); const somaMenu = badges.filter(t => /^\d+$/.test(t.trim())).reduce((t, x) => t + num(x), 0);
  ok(kpiAtras > 0 && kpiAtras === assAtras, `atrasadas: cartão do Painel (${kpiAtras}) = Assistente (${assAtras})`);
  ok(somaMenu === kpiAtras, `atrasadas: soma dos números dos clientes no menu (${somaMenu}) = Painel (${kpiAtras})`);
  const totalPlano = num((await p.locator('.bento .kpi:has-text("Pautas publicadas") strong').textContent()).split('de')[1]);
  await p.goto(base + 'app#calendario'); await p.reload(); await p.waitForSelector('.kcol'); await p.waitForTimeout(800);
  const cab = await p.locator('#view').first().innerText(); const kAtras = num((cab.match(/Atrasadas\s+(\d+)/) || [])[1]), kTotal = num((cab.match(/(\d+)\s+pautas/) || [])[1]);
  ok(kAtras === kpiAtras, `atrasadas: Kanban (${kAtras}) = Painel (${kpiAtras})`); ok(kTotal === totalPlano, `total de pautas: Kanban (${kTotal}) = plano do Painel (${totalPlano})`);
  await p.goto(base + 'app#cerebro/clientes'); await p.reload(); await p.waitForSelector('#view .page-head'); await p.waitForTimeout(1200);
  const txt = await p.locator('#view').innerText(); const cerebroAtras = [...txt.matchAll(/Produção:\s*(\d+) pautas? atrasadas?/g)].reduce((t, m) => t + num(m[1]), 0);
  ok(cerebroAtras === kpiAtras, `atrasadas: Central de Inteligência soma ${cerebroAtras} = Painel (${kpiAtras})`);
  /* ---- 2. ícones das empresas em todos os lugares ---- */
  await p.goto(base + 'app#painel'); await p.reload(); await p.waitForSelector('#pcal'); await p.waitForTimeout(800);
  ok(await p.locator('#nav img.nav-logo').count() === 4, 'menu: as 4 empresas mostram o ícone'); ok(await p.evaluate(() => [...document.querySelectorAll('#nav img.nav-logo')].every(i => i.naturalWidth > 0)), 'menu: os ícones carregaram');
  ok(await p.locator('.client-card .client-avatar.has-logo img').count() === 4, 'Painel: os 4 cartões de cliente mostram o ícone');
  await p.goto(base + 'app#minas-farma'); await p.reload(); await p.waitForSelector('.hero'); ok(await p.locator('.hero .client-avatar.has-logo img').count() === 1, 'página do cliente: cabeçalho com o ícone');
  await p.goto(base + 'app#config/clientes'); await p.reload(); await p.waitForSelector('table'); ok(await p.locator('table .client-avatar.has-logo img').count() === 4, 'Configurações: lista de clientes com o ícone');
  /* ---- 3. fluxo comercial inteiro ---- */
  const mut = ops => p.evaluate(async ops => { const r = await fetch('/api/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-N7': '1' }, body: JSON.stringify({ ops }) }); return [r.status, await r.text()]; }, ops);
  const r1 = await mut([{ t: 'prospect', op: 'upsert', id: 'p-zzzzzz09', nome: 'Padaria Aurora', setor: 'varejo', segmento: 'padaria', cidade: 'Baixo Guandu', servicos: ['redes', 'criativos'], etapa: 'proposta', valor_estimado: 2200, endereco: 'Rua das Flores, 12', bairro: 'Centro', lat: -19.52, lng: -41.01, raio_km: 4 },
    { t: 'contract', op: 'upsert', id: 'ct-zzzzzz09', cliente_tipo: 'prospect', cliente_ref: 'p-zzzzzz09', cliente_nome: 'Padaria Aurora', servicos: ['redes', 'criativos'], valores: { redes: 1500, criativos: 700 }, inicio: '2026-12-01', meses: 12, vencimento: 10, reajuste: 'ipca', dados: {}, texto: 'x', status: 'assinado' }]);
  ok(r1[0] === 200, 'ficha e contrato gravados');
  await p.goto(base + 'app#comercial'); await p.reload(); await p.waitForSelector('.kpis'); const kc = await p.locator('.kpis').innerText();
  ok(/Clientes ativos\s*4/i.test(kc) && /sem dado/i.test(kc), 'Carteira antes: 4 clientes e receita ainda "sem dado" (contrato é de ficha, não de cliente)');
  await p.goto(base + 'app#comercial/mapa'); await p.reload(); await p.waitForSelector('.mp-leg'); await p.waitForSelector('#mp-box .mp-pin'); ok(/1 no mapa/.test(await p.textContent('#cm-body')), 'Mapa: a ficha com ponto aparece');
  await p.goto(base + 'app#comercial/funil'); await p.reload(); await p.waitForSelector('.fn-board');
  await p.selectOption('.fn-card[data-id="p-zzzzzz09"] .fn-move', 'fechado'); await p.waitForSelector('#fn-conv'); await p.click('#fn-conv'); await p.waitForSelector('#cv-form'); await p.click('#cv-ok'); await p.waitForSelector('#cv-form', { state: 'detached', timeout: 10000 }); await p.waitForTimeout(1800);
  const estado = await p.evaluate(async () => await (await fetch('/api/state')).json()); const cli = estado.registry.clients.find(c => c.id === 'padaria-aurora');
  ok(!!cli, 'cliente criado no cadastro: ' + (cli && cli.key)); ok(cli && cli.local.lat === -19.52 && cli.local.endereco === 'Rua das Flores, 12' && cli.local.raio === 4, 'o local da ficha foi junto para o cliente');
  const ct = estado.state.contracts.find(c => c.id === 'ct-zzzzzz09'); ok(ct.cliente_tipo === 'cliente' && ct.cliente_ref === cli.key, 'o contrato passou a ser do cliente');
  ok(estado.state.prospects.find(x => x.id === 'p-zzzzzz09').cliente_chave === cli.key, 'a ficha guarda a chave do cliente criado');
  await p.goto(base + 'app#painel'); await p.reload(); await p.waitForSelector('#pcal'); await p.waitForTimeout(900);
  ok(await p.locator('#nav a.nav-item[href="#padaria-aurora"]').count() === 1, 'menu: o cliente novo aparece'); ok(await p.locator('#nav a[href="#padaria-aurora"] .nav-dot').count() === 1, 'menu: sem arquivo de logo, usa a bolinha colorida');
  ok(await p.locator('.client-card .client-avatar:not(.has-logo)').count() === 1, 'Painel: cartão do cliente novo usa a inicial colorida'); ok(await p.locator('.bento .kpi:has-text("Clientes ativos") strong').textContent().then(t => t.trim() === '5'), 'Painel: clientes ativos passou para 5');
  await p.goto(base + 'app#comercial'); await p.reload(); await p.waitForSelector('.kpis'); const kc2 = await p.locator('.kpis').innerText(); ok(/Clientes ativos\s*5/i.test(kc2) && /R\$\s?2\.200/.test(kc2), 'Carteira depois: 5 clientes e receita recorrente R$ 2.200 (1.500 + 700)');
  await p.goto(base + 'app#comercial/mapa'); await p.reload(); await p.waitForSelector('.mp-leg'); await p.waitForSelector('#mp-box .mp-pin'); ok(await p.locator('#mp-box .mp-pin').count() === 1 && /Cliente \(1\)/.test(await p.textContent('.mp-leg')), 'Mapa: agora é um cliente (verde-água) e a ficha não aparece repetida');
  await p.goto(base + 'app#padaria-aurora'); await p.reload(); await p.waitForSelector('.hero'); ok(/Padaria Aurora/.test(await p.textContent('.hero h1')), 'a página do cliente novo abre');
  await p.goto(base + 'app#comercial/contratos'); await p.reload(); await p.waitForSelector('#ct-origem'); ok(/Padaria Aurora/.test(await p.textContent('#cm-body table')) , 'Contratos: o contrato do cliente aparece na lista');
  ok(errs.length === 0, 'sem erros de script ' + JSON.stringify(errs.slice(0, 2)));
  await b.close(); srv.close();
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
