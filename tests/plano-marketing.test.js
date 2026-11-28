// Plano de marketing da semana: decisões (anunciar, defender, o que vende sozinho) a partir da leitura de vendas, com a regra de segurança de publicidade
// (remédio de receita e fórmula infantil NÃO viram anúncio) e ideias rascunho com id estável.
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../scripts/analise-local/janela');
const INT = require('../scripts/analise-local/inteligencia');
const PM = require('../scripts/analise-local/plano-marketing');

const linha = (data, hora, lanc, barras, desc, preco, qtd) => ({ data, hora, lanc: String(lanc), usu: '000020', barras, desc, preco, qtd, valor: Math.round(preco * qtd * 100) / 100, oper: 'A VISTA', emp: '000000000', cli: '00001234', cx: '1' });
/* 5 semanas completas. Shampoo sobe (liberado), fralda cai (liberado), Jardiance sobe e Ninho cai (receita e fórmula infantil: não anunciar),
   dipirona firme (medicamento sem receita), sabonete + protetor saem juntos (combo), chiclete a cada hora para dar expediente e vale. */
function serie() {
  const seg = J.segunda('2026-10-05'), rows = []; let n = 1;
  for (let i = 0; i < 35; i++) {
    const d = J.mais(seg, i), ref = i >= 28;
    rows.push(linha(d, '10:15', n++, '7891000000011', 'DIPIRONA 500MG C/10 CPR', 10, 10));
    rows.push(linha(d, '11:05', n++, '7891000000028', 'FRALDA PERSONAL HIPER G C/60 UND', 50, ref ? 0.8 : 2));
    rows.push(linha(d, '12:20', n++, '7891000000035', 'SHAMPOO ELSEVE 400ML', 20, ref ? 8 : 5));
    rows.push(linha(d, '12:40', n++, '7891000000042', 'JARDIANCE 25MG C/30 CPR', 20, ref ? 6 : 2));
    rows.push(linha(d, '13:00', n++, '7891000000059', 'LEITE NINHO FASES 1+ 800GR', 20, ref ? 2 : 5));
    const k = n++; rows.push(linha(d, '09:00', k, '7891000000073', 'SABONETE DOVE', 4, 1)); rows.push(linha(d, '09:00', k, '7891000000080', 'PROTETOR SOLAR FPS50 200ML', 4, 1));
    for (let h = 8; h < 20; h++) rows.push(linha(d, String(h).padStart(2, '0') + ':30', n++, '7891000000097', 'CHICLETE TRIDENT', h >= 15 && h <= 17 ? 1 : 10, 1));
  }
  return rows;
}
const plano = () => PM.montar({ inteligencia: INT.analisarSemana({ rows: serie() }), hoje: '2026-11-12', temEstoque: false });

test('anunciar e defender só o que pode ser anunciado; receita e fórmula infantil ficam fora e viram aviso', () => {
  const p = plano();
  assert.equal(p.ok, true);
  assert.ok(p.anunciar.some(x => x.categoria === 'Cabelo, beleza e perfumaria' && x.elegibilidade === 'liberado'), 'o shampoo sobe e pode ser anunciado');
  assert.ok(p.defender.some(x => x.categoria === 'Bebê: fraldas'), 'a fralda cai: defender');
  const tudo = [...p.anunciar, ...p.defender, ...p.naoPrecisa].map(x => x.alvo + ' ' + x.categoria).join(' | ');
  assert.ok(!/JARDIANCE|Diabetes|NINHO|Leite e fórmulas/.test(tudo), 'remédio de receita e fórmula infantil nunca entram no plano de anúncio: ' + tudo);
  const sem = p.semAnuncio.map(x => x.alvo); assert.ok(sem.some(a => /JARDIANCE|Diabetes/.test(a)), 'a alta do Jardiance aparece como "mudou, mas não pode ser anunciado"');
  assert.ok(p.semAnuncio.every(x => ['nao', 'verificar'].includes(x.elegibilidade) && x.motivo));
  assert.ok(p.anunciar.length <= 3 && p.defender.length <= 2);
});

test('o que já vende firme tem prioridade baixa de anúncio, e medicamento sem receita pede revisão', () => {
  const p = plano();
  assert.ok(p.naoPrecisa.some(x => /DIPIRONA/.test(x.alvo) && x.elegibilidade === 'cuidado'), 'dipirona firme: não precisa de empurrão');
  assert.ok(!p.naoPrecisa.some(x => /SHAMPOO|FRALDA/.test(x.alvo)), 'quem subiu ou caiu não é "vende sozinho"');
  assert.match(PM.eleg('Dor e febre').regra, /revisão farmacêutica/); assert.equal(PM.eleg('Diabetes').nivel, 'nao'); assert.equal(PM.eleg('Leite e fórmulas').nivel, 'nao'); assert.equal(PM.eleg('Outros').nivel, 'verificar'); assert.equal(PM.eleg('Medicamentos (demais)').nivel, 'verificar');
});

test('cada decisão traz o porquê com número, o formato e o dia e a hora sugeridos', () => {
  const p = plano(), q = p.quando;
  assert.ok(q.data >= '2026-11-15', 'a data sugerida deixa 3 dias para aprovar e produzir'); assert.equal(NOMES(q.data), q.dia); assert.match(q.hora, /^\d\dh$/); assert.match(q.motivo, /sugestão/);
  [...p.anunciar, ...p.defender].forEach(x => { assert.match(x.porque, /R\$/); assert.ok(x.evidencia.length >= 1 && ['Carrossel', 'Reels'].includes(x.formato) && x.quando.data === q.data); assert.ok(x.ideia.title && x.ideia.note); });
  assert.ok(p.horario && /^\d\dh às \d\dh$/.test(p.horario.alvo), 'o vale do dia vira ação de horário'); assert.ok(p.combo && /SABONETE/.test(p.combo.alvo) && /PROTETOR/.test(p.combo.alvo), 'o par vira combo');
  assert.equal(p.promover.ativo, false); assert.match(p.promover.nota, /estoque/); assert.match(p.aviso, /farmacêutico/);
});
const NOMES = iso => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(iso + 'T12:00:00Z').getUTCDay()];

test('ideias rascunho: no máximo 3, id estável por marca e semana, sem cliente e só do que pode ser anunciado', () => {
  const p = plano(), a = PM.ideiasDoPlano(p, 'M', '2026-W46'), b = PM.ideiasDoPlano(plano(), 'M', '2026-W46');
  assert.ok(a.length >= 1 && a.length <= 3); assert.deepEqual(a.map(x => x.id), b.map(x => x.id), 'mesmo plano, mesmos ids: a ideia nunca é criada duas vezes');
  a.forEach(x => { assert.match(x.id, /^auto-M-plano-2026-W46-[a-z0-9-]+$/); assert.ok(x.id.length <= 58); assert.ok(['Reels', 'Carrossel'].includes(x.format)); assert.ok(x.note.length <= 480, 'o banco de ideias recusa observação acima de 500 caracteres'); assert.match(x.note, /Por quê:/); assert.match(x.note, /Sugestão:/); assert.match(x.note, /Anuncia:/); assert.equal(x.src, 'plano de marketing da semana'); });
  assert.ok(!/JARDIANCE|NINHO/.test(JSON.stringify(a)), 'receita e fórmula infantil não viram ideia'); assert.ok(!JSON.stringify(p).includes('00001234'), 'sem cliente');
  assert.deepEqual(PM.ideiasDoPlano({ ok: false }, 'M', '2026-W46'), []);
});

test('sem leitura da semana não há plano', () => {
  assert.equal(PM.montar({ inteligencia: { ok: false, nota: 'Poucas semanas' }, hoje: '2026-11-12' }).ok, false);
  assert.match(PM.montar({ inteligencia: null, hoje: '2026-11-12' }).nota, /Sem leitura/);
});

test('tela em 4 passos: decidir mostra o plano com a regra de publicidade, criar lista as ideias do plano, medir não inventa resultado', () => {
  const UI = require('../public/assets/js/inteligencia-ui.js'), c = { key: 'M', name: 'Minas Farma' };
  const a = { plano: plano(), inteligencia: INT.analisarSemana({ rows: serie() }) };
  const d = UI.decidir(c, a);
  for (const t of ['Plano de marketing da semana', 'Anunciar', 'Defender', 'Combo e horário', 'Já vende sozinho', 'Mudou, mas não vira anúncio', 'Dar saída', 'Pode anunciar', 'Com revisão farmacêutica', 'vira ideia rascunho', 'farmacêutico']) assert.ok(d.includes(t), t);
  assert.ok(/JARDIANCE|Diabetes/.test(d) && /Não anunciar|receita/.test(d), 'o remédio de receita aparece só no bloco "não vira anúncio"'); assert.ok(!/Anunciar: JARDIANCE/.test(d));
  assert.match(UI.decidir(c, null), /Ainda não há análise publicada/); assert.match(UI.decidir(c, { plano: { ok: false, nota: 'Poucas semanas' } }), /Poucas semanas/); assert.match(UI.decidir(c, {}), /próxima atualização do agente/);
  const ideias = PM.ideiasDoPlano(a.plano, 'M', '2026-W48').map((x, k) => ({ id: x.id, b: 'M', format: x.format, title: x.title, note: x.note, stage: ['nova', 'aprovada', 'agendada'][k] || 'nova', at: '2026-11-28', promoted: k === 2 ? 'I-M01' : undefined }));
  const H = { ideas: () => ideias.concat([{ id: 'auto-F-plano-2026-W48-x', b: 'F', title: 'de outra loja', stage: 'nova', format: 'Reels', note: '' }, { id: 'manual-1', b: 'M', title: 'ideia manual', stage: 'nova', format: 'Reels', note: '' }]), custom: () => [{ code: 'I-M01', b: 'M', date: '2026-12-02', time: '16:00', status: 'plan' }] };
  const k = UI.criar(c, a, H); assert.match(k, /Nova ideia/); assert.match(k, /Pauta no calendário:<\/b> I-M01 · 02\/12 às 16:00/); assert.ok(!k.includes('de outra loja') && !k.includes('ideia manual'), 'só as ideias do plano desta farmácia'); assert.match(k, /data-go="calendario" data-ideias="1"/);
  assert.match(UI.criar(c, a, { ideias: () => [], ideas: () => [] }), /Ainda não há ideias do plano para <b>Minas Farma<\/b>/);
  const m = UI.medir(c, a, H); assert.match(m, /Ainda não há peça do plano publicada com 7 dias de vendas depois/); assert.match(m, /correlação com controle, não prova de causa/); assert.match(m, /Aguardando publicação/);
  assert.ok(!/funcionou: |\+\d+% de vendas|vendeu \d+% mais/i.test(m), 'sem resultado inventado');
  const esc = UI.decidir(c, { plano: Object.assign({}, a.plano, { anunciar: [Object.assign({}, a.plano.anunciar[0], { titulo: '<img src=x onerror=alert(1)>' })] }) }); assert.ok(!esc.includes('<img src=x') && esc.includes('&lt;img'), 'HTML do plano é escapado');
});

test('tela: "já vende sozinho" mostra o nome do produto', () => {
  const UI = require('../public/assets/js/inteligencia-ui.js'), p = plano(), d = UI.decidir({ key: 'M', name: 'Minas Farma' }, { plano: p });
  assert.ok(p.naoPrecisa.length >= 1); p.naoPrecisa.forEach(x => assert.ok(d.includes(x.alvo), 'nome do produto na tabela: ' + x.alvo));
});
