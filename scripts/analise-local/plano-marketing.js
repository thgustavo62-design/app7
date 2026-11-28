/* PLANO DE MARKETING DA SEMANA: transforma a leitura de vendas (inteligencia.js) em decisões para a equipe de marketing da farmácia.
   Só produto e categoria (nunca cliente). Cada decisão diz o que fazer, por quê (com o número), em qual formato e em qual dia e hora, e vira uma
   ideia rascunho no banco de ideias (a equipe aprova ou descarta; nada é publicado sozinho).
   Regra de segurança de publicidade (classificação automática por categoria, a confirmar com o farmacêutico responsável):
     liberado = pode anunciar; cuidado = anunciar só com revisão farmacêutica e sem promessa de cura; nao = não anunciar ao público
     (medicamento de receita ou regra especial: vira conteúdo educativo sem marca, ou serviço); verificar = categoria não identificada. */
const { R$, pct } = require('./inteligencia');
const { categoriaFina } = require('./profunda');

const MIN_RS = 10000;                                                  /* R$ 100: abaixo disso é ruído */
const NOME_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DIA_LONGO = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', 'sáb': 'sábado', dom: 'domingo' };
const H = h => String(h).padStart(2, '0') + 'h';
const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
const corta = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1).trim() + '…' : String(t));

const REVISAO = 'Passa por revisão farmacêutica: sem promessa de cura ou de resultado e com os avisos legais.';
const ELEGIBILIDADE = {
  'Bebê: fraldas': ['liberado'], 'Cabelo, beleza e perfumaria': ['liberado'], 'Higiene pessoal': ['liberado'], 'Limpeza e casa': ['liberado'], 'Conveniência e alimentos': ['liberado'], 'Pet': ['liberado'], 'Primeiros socorros e aparelhos': ['liberado'],
  'Dermatológicos e pele': ['cuidado', 'Mistura cosmético com pomada medicinal: ' + REVISAO],
  'Suplementos e vitaminas': ['cuidado', 'Suplemento não trata nem previne doença: ' + REVISAO],
  'Dor e febre': ['cuidado', 'Medicamento sem receita: ' + REVISAO], 'Gripe, tosse e alergia': ['cuidado', 'Medicamento sem receita: ' + REVISAO], 'Estômago e digestão': ['cuidado', 'Medicamento sem receita: ' + REVISAO], 'Olhos e ouvidos': ['cuidado', 'Medicamento sem receita: ' + REVISAO],
  'Bebê: higiene e cuidados': ['cuidado', 'Inclui mamadeira e chupeta, com regra própria de publicidade: ' + REVISAO],
  'Leite e fórmulas': ['nao', 'Fórmula infantil tem proibição de publicidade comercial (NBCAL). Não anunciar.'],
  'Pressão e coração': ['nao', 'Medicamento de receita: não anunciar ao público.'], 'Diabetes': ['nao', 'Medicamento de receita: não anunciar ao público.'], 'Saúde mental e sono': ['nao', 'Medicamento de receita (controlado): não anunciar ao público.'],
  'Antibióticos e antimicrobianos': ['nao', 'Medicamento de receita: não anunciar ao público.'], 'Hormônios e contraceptivos': ['nao', 'Medicamento de receita: não anunciar ao público.'], 'Sexual e próstata': ['nao', 'Medicamento de receita: não anunciar ao público.']
};
const ELEGIVEL = c => ['liberado', 'cuidado'].includes((ELEGIBILIDADE[c] || ['verificar'])[0]);
const eleg = c => { const e = ELEGIBILIDADE[c]; return e ? { nivel: e[0], regra: e[1] || '' } : { nivel: 'verificar', regra: 'Categoria não identificada pelo nome do produto: confirme com o farmacêutico antes de anunciar.' }; };

/* quando publicar: o dia mais forte das vendas, uma hora antes do pico da loja, a partir de 3 dias depois de hoje (tempo de aprovar e produzir) */
function quando(i, hoje) {
  const forte = i.dias.slice().sort((a, b) => (b.vendasCentavos + b.esperadoCentavos) - (a.vendasCentavos + a.esperadoCentavos))[0], dow = NOME_DIA.indexOf(forte.dia);
  let d = new Date(Date.parse(hoje + 'T12:00:00Z') + 3 * 864e5); while ((d.getUTCDay() + 6) % 7 !== dow) d = new Date(d.getTime() + 864e5);
  const h = i.horario ? Math.max(7, Math.min(20, i.horario.pico.de - 1)) : 12;
  return { data: d.toISOString().slice(0, 10), dia: forte.dia, hora: H(h), motivo: `${DIA_LONGO[forte.dia]} é o dia mais forte das vendas${i.horario ? ` e o pico é das ${H(i.horario.pico.de)} às ${H(i.horario.pico.ate)}: publique uma hora antes` : ''}. É uma sugestão, ajuste ao calendário.` };
}
const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function montar({ inteligencia: i, hoje, temEstoque = false }) {
  if (!i || !i.ok) return { ok: false, nota: (i && i.nota) || 'Sem leitura da semana para montar o plano.' };
  const q = quando(i, hoje), an = i.andamento, rotulo = an ? `semana em andamento (${dm(an.semana.inicio)} a ${dm(an.semana.ate)})` : `semana de ${dm(i.semana.inicio)}`;
  const ideiaDe = (grupo, titulo, motivo, ev, alvo, tipo, nivel, regra, formato) => {
    const note = [`Por quê: ${motivo}`, ev.length ? `Evidência: ${ev.slice(0, 2).join('; ')}` : '', `Sugestão: ${formato}, ${DIA_LONGO[q.dia]} ${dm(q.data)} às ${q.hora}.`, `Anuncia: ${alvo} (${tipo})`, regra ? `Atenção: ${regra}` : '', 'Rascunho do plano de marketing: a equipe aprova ou descarta.'].filter(Boolean).join(' — ');
    return { title: corta(`${grupo}: ${alvo}`, 120), note: corta(note, 480), format: formato };
  };
  const base = (grupo, rot, alvo, tipo, categoria, dif, motivo, ev, formato) => {
    const e = eleg(categoria);
    return { id: `${slug(grupo)}-${slug(alvo)}`, grupo, tipo, alvo, categoria, elegibilidade: e.nivel, regra: e.regra, difCentavos: dif, titulo: `${rot}: ${corta(alvo, 70)}`, porque: motivo, evidencia: ev, formato, quando: q, ideia: ideiaDe(rot, '', motivo, ev, alvo, tipo, e.nivel, e.regra, formato) };
  };

  /* candidatos que SOBEM: produtos (semana fechada e semana aberta) e categorias, o de maior R$ de cada categoria */
  const sobem = [];
  (i.movimento.subiram || []).forEach(p => sobem.push({ tipo: 'produto', alvo: p.desc, categoria: p.categoria, dif: p.difCentavos, ev: `${R$(p.semanaCentavos)} na semana, ${R$(p.difCentavos)} acima do esperado` }));
  if (an) (an.acima || []).forEach(p => sobem.push({ tipo: 'produto', alvo: p.desc, categoria: p.categoria, dif: p.difCentavos, ev: `${R$(p.vendeuCentavos)} nos ${an.semana.dias} dia(s) desta semana, ${R$(p.difCentavos)} acima do ritmo` }));
  (i.movimento.categorias || []).forEach(c => { if (c.difCentavos >= MIN_RS && c.relativaALoja >= 0.10) sobem.push({ tipo: 'categoria', alvo: c.categoria, categoria: c.categoria, dif: c.difCentavos, ev: `${c.categoria}: ${pct(c.relativaALoja)} contra o ritmo da loja` }); });
  /* candidatos que CAEM */
  const caem = [];
  (i.movimento.cairam || []).forEach(p => caem.push({ tipo: 'produto', alvo: p.desc, categoria: p.categoria, dif: p.difCentavos, ev: `${R$(p.semanaCentavos)} na semana, ${R$(-p.difCentavos)} abaixo do esperado` }));
  if (an) (an.abaixo || []).forEach(p => caem.push({ tipo: 'produto', alvo: p.desc, categoria: p.categoria, dif: p.difCentavos, ev: `${R$(p.vendeuCentavos)} nos ${an.semana.dias} dia(s) desta semana, ${R$(-p.difCentavos)} abaixo do ritmo` }));
  (i.movimento.categorias || []).forEach(c => { if (c.difCentavos <= -MIN_RS && c.relativaALoja <= -0.08) caem.push({ tipo: 'categoria', alvo: c.categoria, categoria: c.categoria, dif: c.difCentavos, ev: `${c.categoria}: ${pct(c.relativaALoja)} contra o ritmo da loja` }); });

  const quem = (cat, sinal) => { const todos = [...(i.movimento.subiram || []), ...(i.movimento.novos || []), ...(i.movimento.topValor || []), ...(i.movimento.cairam || []), ...(an ? [...(an.acima || []), ...(an.abaixo || [])] : [])].filter(p => p.categoria === cat && p.difCentavos * sinal > 0 && ELEGIVEL(p.categoria)); const vistos = new Set(); return todos.sort((a, b) => Math.abs(b.difCentavos) - Math.abs(a.difCentavos)).filter(p => !vistos.has(p.desc) && vistos.add(p.desc)).slice(0, 2).map(p => corta(p.desc, 42)); };
  const semAnuncio = [], visto = new Set(), usadas = new Set(), ja = new Set();
  const escolher = (lista, sinal, max, grupo, rot, formato, motivoDe) => {
    const out = [];
    lista.filter(c => c.dif * sinal > 0 && Math.abs(c.dif) >= MIN_RS).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).forEach(c => {
      const chave = c.tipo + '|' + c.alvo; if (ja.has(chave)) return;
      const e = eleg(c.categoria);
      if (e.nivel === 'nao' || e.nivel === 'verificar') { ja.add(chave); if (Math.abs(c.dif) >= 15000 && !visto.has(c.alvo)) { visto.add(c.alvo); semAnuncio.push({ alvo: c.alvo, tipo: c.tipo, categoria: c.categoria, elegibilidade: e.nivel, difCentavos: c.dif, motivo: e.regra }); } return; }
      if (out.length >= max || usadas.has(c.categoria)) return;
      usadas.add(c.categoria); ja.add(chave);
      const mot = motivoDe(c), q2 = c.tipo === 'categoria' ? quem(c.categoria, sinal) : [];
      out.push(base(grupo, rot, c.alvo, c.tipo, c.categoria, c.dif, mot, [c.ev, ...(q2.length ? [`${sinal > 0 ? 'Puxado por' : 'Derrubado por'}: ${q2.join(', ')}`] : []), `Contexto: ${rotulo}`], formato));
    });
    return out;
  };
  const anunciar = escolher(sobem, 1, 3, 'anunciar', 'Anunciar', 'Carrossel', c => `${c.tipo === 'categoria' ? 'a categoria' : 'o produto'} está com tração real: ${R$(c.dif)} acima do esperado pelo ritmo da loja. Dar espaço agora aproveita a demanda que já existe.`);
  const defender = escolher(caem, -1, 2, 'defender', 'Defender', 'Carrossel', c => `${c.tipo === 'categoria' ? 'a categoria' : 'o produto'} vendeu ${R$(-c.dif)} abaixo do esperado. Conferir estoque e preço, e usar conteúdo e oferta para reanimar.`);

  /* o que já vende bem e firme: prioridade baixa de anúncio */
  const naoPrecisa = (i.movimento.topValor || []).filter(p => !ja.has('produto|' + p.desc) && p.varBase != null && p.varBase >= -0.10 && p.varBase <= 0.25 && p.relativaALoja >= -0.20 && ['liberado', 'cuidado'].includes(eleg(p.categoria).nivel)).slice(0, 3)
    .map(p => ({ id: 'nao-precisa-' + slug(p.desc), grupo: 'nao-precisa', tipo: 'produto', alvo: p.desc, categoria: p.categoria, elegibilidade: eleg(p.categoria).nivel, difCentavos: p.difCentavos, titulo: corta(p.desc, 70), porque: `Já é um dos mais vendidos (${R$(p.semanaCentavos)} na semana) e está estável (${pct(p.varBase)} contra a média das semanas anteriores): prioridade baixa para anúncio. Use o espaço nos itens que precisam.`, evidencia: [`${R$(p.semanaCentavos)} na semana`] }));

  const hor = i.horario && i.horario.vale && i.horario.mediaJanelaCentavos - i.horario.vale.vendasCentavos >= MIN_RS && i.horario.vale.vendasCentavos < i.horario.mediaJanelaCentavos * 0.8 ? i.horario : null;
  const horario = hor ? { id: 'horario-vale', grupo: 'horario', tipo: 'horario', alvo: `${H(hor.vale.de)} às ${H(hor.vale.ate)}`, categoria: '', elegibilidade: 'liberado', regra: '', difCentavos: hor.mediaJanelaCentavos - hor.vale.vendasCentavos, titulo: `Movimentar o vale das ${H(hor.vale.de)} às ${H(hor.vale.ate)}`,
    porque: `A janela vendeu ${R$(hor.vale.vendasCentavos)}; uma janela média do expediente vende ${R$(hor.mediaJanelaCentavos)}. Promoção relâmpago, entrega grátis ou aviso no WhatsApp nesse horário, comparando com a semana sem ação.`, evidencia: [`Pico ${H(hor.pico.de)}–${H(hor.pico.ate)} com ${Math.round(hor.pico.parte * 100)}% das vendas`, `Vale ${H(hor.vale.de)}–${H(hor.vale.ate)} com ${Math.round(hor.vale.parte * 100)}%`], formato: 'Reels', quando: q,
    ideia: ideiaDe('Horário', '', 'o vale do dia pede uma ação de venda', [`Vale ${H(hor.vale.de)}–${H(hor.vale.ate)}`], `promoção relâmpago às ${H(hor.vale.de)}`, 'horário', 'liberado', '', 'Reels') } : null;

  const par = (i.cesta || []).find(p => ['liberado', 'cuidado'].includes(eleg(categoriaFina(p.descA)).nivel) && ['liberado', 'cuidado'].includes(eleg(categoriaFina(p.descB)).nivel));
  const combo = par ? { id: 'combo-' + slug(par.descA + par.descB), grupo: 'combo', tipo: 'combo', alvo: `${corta(par.descA, 40)} + ${corta(par.descB, 40)}`, categoria: '', elegibilidade: 'cuidado', regra: REVISAO, difCentavos: null, titulo: `Combo: ${corta(par.descA, 40)} + ${corta(par.descB, 40)}`,
    porque: `Saem juntos em ${par.juntos} cupons, ${par.lift.toFixed(0)} vezes mais que o acaso. Teste uma semana e meça.`, evidencia: [`${par.juntos} cupons nas últimas semanas`], formato: 'Reels', quando: q,
    ideia: ideiaDe('Combo', '', `saem juntos em ${par.juntos} cupons`, [`${par.juntos} cupons`], `${corta(par.descA, 40)} + ${corta(par.descB, 40)}`, 'combo', 'cuidado', REVISAO, 'Reels') } : null;

  /* até 3 ideias rascunho por rodada, na ordem de prioridade */
  const ordem = [...anunciar, ...defender, ...(combo ? [combo] : []), ...(horario ? [horario] : [])]; ordem.forEach((it, k) => { it.virarIdeia = k < 3; });

  return { ok: true, geradoEm: hoje, semana: i.semana, confianca: i.confianca, quando: q, anunciar, defender, naoPrecisa, horario, combo, semAnuncio: semAnuncio.sort((a, b) => Math.abs(b.difCentavos) - Math.abs(a.difCentavos)).slice(0, 5),
    promover: { ativo: false, itens: [], nota: temEstoque ? 'Estoque carregado: a lista do que dar saída entra na próxima etapa.' : 'Para listar o que dar saída (estoque parado, giro e margem) preciso do estoque (.xlsx) na pasta de estoque.' },
    aviso: 'Classificação de publicidade feita por categoria do produto, automaticamente. Confirme com o farmacêutico responsável antes de publicar.',
    resumo: `${anunciar.length} para anunciar, ${defender.length} para defender, ${naoPrecisa.length} que vendem sozinhos, ${semAnuncio.length} que mudaram mas não podem ser anunciados.` };
}

/* ideias rascunho do plano para o banco de ideias do site: id estável por marca, semana e item (a mesma ideia nunca é criada duas vezes) */
function ideiasDoPlano(plano, marca, semanaIso) {
  if (!plano || !plano.ok) return [];
  return [...plano.anunciar, ...plano.defender, ...(plano.combo ? [plano.combo] : []), ...(plano.horario ? [plano.horario] : [])].filter(x => x.virarIdeia)
    .map(x => ({ id: `auto-${marca}-plano-${semanaIso}-${x.id}`.slice(0, 58), b: marca, format: x.ideia.format, title: x.ideia.title, note: x.ideia.note, src: 'plano de marketing da semana' }));
}

module.exports = { montar, ideiasDoPlano, eleg, quando, ELEGIBILIDADE };
