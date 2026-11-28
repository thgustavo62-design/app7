// Inteligência de vendas da semana (fase 1): movimento por produto e categoria, dias, horário, cesta e foco com R$ medido. Só produto e categoria: o cliente nem é lido.
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../scripts/analise-local/janela');
const INT = require('../scripts/analise-local/inteligencia');

const linha = (data, hora, lanc, barras, desc, preco, qtd, extra = {}) => Object.assign({ data, hora, lanc: String(lanc), usu: '000020', barras, desc, preco, qtd, valor: Math.round(preco * qtd * 100) / 100, oper: 'A VISTA', emp: '000000000', cli: '00001234', cx: '1' }, extra);

/* 5 semanas completas começando numa segunda. Semanas 0 a 3 = base; semana 4 = a de referência.
   Dipirona: R$ 100/dia sempre. Fralda: R$ 100/dia, cai para R$ 40 na semana de referência. Shampoo: R$ 100/dia, sobe para R$ 160.
   Omeprazol: R$ 30/dia só na base (parou). Vitamina C: R$ 60/dia só na semana de referência (novo). Sabonetes A e B saem juntos 1 vez por dia.
   Chiclete: um cupom por hora das 8h às 19h (R$ 10; só R$ 1 entre 15h e 17h) para dar o expediente e o vale. */
function serie({ semanas = 5 } = {}) {
  const seg = J.segunda('2026-10-05'), rows = []; let n = 1;
  for (let i = 0; i < semanas * 7; i++) {
    const d = J.mais(seg, i), ref = i >= (semanas - 1) * 7;
    rows.push(linha(d, '10:15', n++, '7891000000011', 'DIPIRONA 500MG C/10 CPR', 10, 10));
    rows.push(linha(d, '11:05', n++, '7891000000028', 'FRALDA PERSONAL HIPER G C/60 UND', 50, ref ? 0.8 : 2));
    rows.push(linha(d, '12:20', n++, '7891000000035', 'SHAMPOO ELSEVE 400ML', 20, ref ? 8 : 5));
    if (!ref) rows.push(linha(d, '13:10', n++, '7891000000059', 'OMEPRAZOL 20MG C/28 CPS', 30, 1));
    if (ref) rows.push(linha(d, '13:40', n++, '7891000000066', 'VITAMINA C 1G EFERVESCENTE', 20, 3));
    const k = n++; rows.push(linha(d, '09:00', k, '7891000000073', 'SABONETE DOVE', 4, 1)); rows.push(linha(d, '09:00', k, '7891000000080', 'PROTETOR SOLAR FPS50 200ML', 4, 1));
    for (let h = 8; h < 20; h++) rows.push(linha(d, String(h).padStart(2, '0') + ':30', n++, '7891000000097', 'CHICLETE TRIDENT', h >= 15 && h <= 17 ? 1 : 10, 1, { cli: '000000' }));
    rows.push(linha(d, '14:00', n++, '0000000000012', 'TAXA DE ENTREGA', 5, 1));            /* não é produto: tem que ficar de fora */
  }
  return rows;
}

test('semana: referência é a última completa, compara com a anterior e com a média da base', () => {
  const a = INT.analisarSemana({ rows: serie() });
  assert.equal(a.ok, true); assert.equal(a.confianca, 'alta'); assert.equal(a.base.n, 4);
  assert.equal(a.semana.inicio, J.mais(J.segunda('2026-10-05'), 28)); assert.equal(a.semana.fim, J.mais(a.semana.inicio, 6));
  assert.ok(a.total.semanaCentavos > 0 && a.total.baseMediaCentavos > 0 && typeof a.total.varBase === 'number');
  assert.equal(a.dias.length, 7); assert.ok(a.dias.every(d => d.vendasCentavos > 0 && d.esperadoCentavos > 0));
});

test('movimento: o que subiu, caiu, parou e é novo, por produto e por categoria, relativo ao ritmo da loja', () => {
  const m = INT.analisarSemana({ rows: serie() }).movimento;
  assert.equal(m.topValor[0].desc, 'SHAMPOO ELSEVE 400ML', 'o shampoo foi o que mais vendeu em R$');
  assert.equal(m.subiram[0].desc, 'SHAMPOO ELSEVE 400ML'); assert.ok(m.subiram[0].difCentavos > 30000);
  assert.match(m.cairam[0].desc, /FRALDA/); assert.ok(m.cairam[0].difCentavos < -30000);
  assert.deepEqual(m.pararam.map(p => p.desc), ['OMEPRAZOL 20MG C/28 CPS'], 'vendia toda semana e não vendeu nada');
  assert.deepEqual(m.novos.map(p => p.desc), ['VITAMINA C 1G EFERVESCENTE']);
  const cat = n => m.categorias.find(c => c.categoria === n);
  assert.ok(cat('Cabelo, beleza e perfumaria').relativaALoja > 0.1); assert.ok(cat('Bebê: fraldas').relativaALoja < -0.1);
  assert.ok(!m.topValor.concat(m.topQtd).some(p => /TAXA/.test(p.desc)), 'taxa de entrega não é produto');
});

test('horário e cesta: o vale e o par que sai junto aparecem', () => {
  const a = INT.analisarSemana({ rows: serie() });
  assert.deepEqual([a.horario.vale.de, a.horario.vale.ate], [15, 18], 'vale = 15h às 18h'); assert.ok(a.horario.pico.parte > a.horario.vale.parte);
  assert.equal(a.horario.expediente[0], 8);
  const p = a.cesta[0]; assert.match(p.descA + p.descB, /SABONETE DOVE/); assert.match(p.descA + p.descB, /PROTETOR SOLAR/); assert.ok(p.juntos >= 28 && p.lift > 3);
});

test('foco da semana: até 3, ordenados pelo R$ em jogo medido, um de cada tipo', () => {
  const f = INT.analisarSemana({ rows: serie() }).foco;
  assert.ok(f.length >= 2 && f.length <= 3); assert.equal(new Set(f.map(x => x.tipo)).size, f.length);
  const por = t => f.find(x => x.tipo === t);
  assert.equal(por('defender').alvo, 'Bebê: fraldas'); assert.ok(por('defender').rsEmJogoCentavos > 30000);
  assert.equal(por('acelerar').alvo, 'Cabelo, beleza e perfumaria');
  const mudou = x => ['defender', 'acelerar', 'produto'].includes(x.tipo), g1 = f.filter(mudou), g2 = f.filter(x => !mudou(x));
  assert.deepEqual(f, [...g1, ...g2], 'o que mudou na semana vem antes do que é estrutural (horário, combo)');
  [g1, g2].forEach(g => { const rs = g.map(x => x.rsEmJogoCentavos || 0); assert.deepEqual(rs, rs.slice().sort((a, b) => b - a), 'dentro do grupo, o maior R$ em jogo primeiro'); });
  f.forEach(x => { assert.ok(x.titulo && x.detalhe && x.acao && x.evidencia.length); });
});

test('poucas semanas: não inventa comparação; e o código do cliente nunca sai na análise', () => {
  const a = INT.analisarSemana({ rows: serie({ semanas: 1 }) }); assert.equal(a.ok, false); assert.match(a.nota, /2 semanas completas/);
  assert.equal(INT.analisarSemana({ rows: serie({ semanas: 2 }) }).confianca, 'baixa');
  const txt = JSON.stringify(INT.analisarSemana({ rows: serie() })); assert.ok(!txt.includes('00001234'), 'o cliente não aparece');
});

test('semana pedida: dá para analisar uma semana antiga; a mais antiga não tem com o que comparar', () => {
  const rows = serie({ semanas: 6 }), seg = J.segunda('2026-10-05');
  assert.equal(INT.analisarSemana({ rows, semana: J.mais(seg, 28) }).semana.inicio, J.mais(seg, 28));
  assert.equal(INT.analisarSemana({ rows, semana: seg }).ok, false);
});

test('cérebro: o agente Movimento vira achados (foco, produtos que pararam, ganho) a partir da análise da semana', () => {
  require('../public/assets/js/analysis.js');
  const B = require('../public/assets/js/brain/index.mjs').default, i = INT.analisarSemana({ rows: serie() });
  const vendas = { key: 'M', nome: 'Minas Farma', cobertura: { inicio: '2026-10-05', fim: '2026-11-08', dias: 35 }, geral: { cupons: 1000, ticketMedioCentavos: 5000 }, inteligencia: i };
  const r = B.run({ today: '2026-11-10', clients: [{ key: 'M', name: 'Minas Farma', services: ['promocoes'] }], posts: [], weeks: [], gens: [], planSource: { source: 'central' }, needsClient: () => false, vendas: { M: vendas } });
  const f = [r.decision, ...r.also, ...r.radar, ...r.wins].filter(Boolean).filter(x => x.agente === 'movimento');
  const foco = f.find(x => /mov-foco/.test(x.chave)); assert.ok(foco, 'achado de foco da semana'); assert.match(foco.titulo, /foco da semana de 02\/11 a 08\/11/); assert.ok(foco.evidencia.some(e => /R\$ em jogo/.test(e)) && foco.acao);
  assert.ok(!JSON.stringify(f).includes('00001234'), 'sem cliente');
  assert.ok(r.wins.some(x => x.agente === 'movimento' && /SHAMPOO/.test(x.titulo)), 'o produto que subiu vira ganho');
  const semBase = B.run({ today: '2026-11-10', clients: [{ key: 'M', name: 'Minas Farma', services: ['promocoes'] }], posts: [], weeks: [], gens: [], planSource: { source: 'central' }, needsClient: () => false, vendas: { M: Object.assign({}, vendas, { inteligencia: { ok: false } }) } });
  assert.ok(![semBase.decision, ...semBase.also, ...semBase.radar, ...semBase.wins].filter(Boolean).some(x => x.agente === 'movimento'), 'sem semanas para comparar, o agente fica quieto');
});

test('ruído que não vira notícia: quem zerou não é "caiu", sabor do mesmo produto não é combo, e a parte sem categoria é informada', () => {
  const seg = J.segunda('2026-10-05'), rows = []; let n = 1;
  for (let i = 0; i < 35; i++) { const d = J.mais(seg, i), ref = i >= 28;
    rows.push(linha(d, '10:00', n++, '7891000000011', 'DIPIRONA 500MG C/10 CPR', 10, 10));
    rows.push(linha(d, '10:10', n++, '7891000000155', 'ARTIGO DIVERSO SEM CATEGORIA', 100, 3));                          /* cai em "Outros" */
    if (!ref && i % 7 === 0) rows.push(linha(d, '11:00', n++, '7891000000124', 'EXFORGE 160MG C/28 CPR', 100, 3));          /* compra picada: vendeu nas semanas anteriores e zerou */
    const k = n++; rows.push(linha(d, '09:00', k, '7891000000131', 'PROFIG SABOR BOLDO C/1', 5, 1)); rows.push(linha(d, '09:00', k, '7891000000148', 'PROFIG SABOR ABACAXI C/1', 5, 1));
    for (let h = 8; h < 20; h++) rows.push(linha(d, String(h).padStart(2, '0') + ':30', n++, '7891000000097', 'CHICLETE TRIDENT', 10, 1));
  }
  const a = INT.analisarSemana({ rows });
  assert.ok(!a.movimento.cairam.some(p => /EXFORGE/.test(p.desc)), 'zerou: não é "caiu"'); assert.ok(!a.foco.some(f => /EXFORGE/.test(f.titulo)));
  assert.equal(a.cesta.length, 0, 'sabores do mesmo produto não formam combo'); assert.ok(!a.foco.some(f => f.tipo === 'combo'));
  assert.ok(a.qualidade.semCategoriaEspecifica > 0.3, 'quase tudo caiu em "Outros": a tela precisa avisar');
});

test('relatório da semana (Markdown): foco, listas e aviso de categoria, sem cliente', () => {
  const i = INT.analisarSemana({ rows: serie() }), md = INT.markdown('Loja Teste', i);
  for (const t of ['# Inteligência de vendas — Loja Teste', '## Foco da semana', '## O que mais vendeu', '## Subiu', '## Caiu', '## Novos na semana', '## Pararam de vender', '## Categorias', '## Dia a dia', '## Horário']) assert.ok(md.includes(t), t);
  assert.match(md, /Defender Bebê: fraldas\*\* — R\$\s[\d.]+ em jogo/); assert.match(md, /OMEPRAZOL 20MG C\/28 CPS: vendia/); assert.ok(!md.includes('00001234'));
  assert.match(INT.markdown('X', { ok: false, nota: 'Poucas semanas' }), /Poucas semanas/);
});

test('tela: mostra o foco e as listas, escapa nome de produto e explica quando não há análise', () => {
  const UI = require('../public/assets/js/inteligencia-ui.js'), c = { name: 'Minas Farma' };
  const i = INT.analisarSemana({ rows: serie() }); i.movimento.topValor[0].desc = '<img src=x onerror=alert(1)>';
  const h = UI.pagina(c, { inteligencia: i, publicadoEm: '2026-11-27T12:00:00Z' }, {});
  assert.ok(!h.includes('<img src=x'), 'HTML do nome do produto é escapado'); assert.match(h, /&lt;img src=x/);
  for (const t of ['Foco da semana', 'O que mais vendeu', 'Pararam de vender', 'Dia a dia', 'Compram junto', 'Defender Bebê: fraldas', 'em jogo']) assert.ok(h.includes(t), t);
  assert.ok(!/cliente identificado|CPF/i.test(h), 'nada de cliente na tela');
  assert.match(UI.pagina(c, null, {}), /Ainda não há análise publicada de <b>Minas Farma<\/b>/);
  assert.match(UI.pagina(c, { geral: {} }, {}), /antes da Inteligência de vendas existir/);
  assert.match(UI.pagina(c, { inteligencia: { ok: false, nota: 'Precisa de ao menos 2 semanas completas' } }, {}), /2 semanas completas/);
  const pobre = INT.analisarSemana({ rows: serie({ semanas: 2 }) }); assert.match(UI.pagina(c, { inteligencia: pobre }, {}), /Confiança <b>baixa<\/b>/);
});

test('PowerShell/CLI: analisa as lojas do armazém em paralelo e grava o relatório; sem armazém sai com código 4', () => {
  const { spawnSync } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-int-')), saida = path.join(dir, 'out'), env = Object.assign({}, process.env, { N7_ARMAZEM: path.join(dir, 'arm') }), cli = path.join(__dirname, '..', 'scripts', 'analise-local', 'inteligencia-cli.js');
  try {
    let r = spawnSync(process.execPath, [cli, '--saida', saida], { env, encoding: 'utf8' }); assert.equal(r.status, 4, 'sem armazém: código 4');
    process.env.N7_ARMAZEM = env.N7_ARMAZEM; const Z = require('../scripts/analise-local/armazem'), rows = serie(), ini = rows[0].data, fim = rows[rows.length - 1].data;
    ['T1', 'T2'].forEach(l => Z.guardar(l, { rows, ajustes: [], cobertura: { inicio: ini, fim }, emissao: { data: '2026-12-01', hora: '10:00' }, arquivo: 'x.pdf' }));
    r = spawnSync(process.execPath, [cli, '--saida', saida, '--nome', 'T1=Loja Um'], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Loja Um: semana de/); assert.match(r.stdout, /2 de 2 loja\(s\) analisada\(s\)/);
    const md = fs.readFileSync(path.join(saida, 'T1', 'ultima.md'), 'utf8'); assert.match(md, /Inteligência de vendas — Loja Um/); assert.ok(fs.existsSync(path.join(saida, 'T2', 'ultima.md')));
    const js = JSON.parse(fs.readFileSync(path.join(saida, 'T1', fs.readdirSync(path.join(saida, 'T1')).find(n => /^semana-.*\.json$/.test(n))), 'utf8')); assert.equal(js.ok, true);
    r = spawnSync(process.execPath, [cli, '--saida', saida, '--loja', 'T2', '--semana', ini], { env, encoding: 'utf8' }); assert.equal(r.status, 4, 'a semana mais antiga não tem com o que comparar: código 4');
  } finally { delete process.env.N7_ARMAZEM; fs.rmSync(dir, { recursive: true, force: true }); }
});
