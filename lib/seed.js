/* Dados iniciais da cópia em memória (testes e servidor local). Reaproveita os padrões do site,
   os mesmos que foram gravados na planilha-banco. */
const { WEEKS, GENS } = require('./seed-weeks');
const cellOf = v => (v == null ? '' : String(v));
const weekRow = (w, at) => {
  const row = { tipo: w.tipo, inicio: w.inicio, fim: w.fim, marca: w.marca, vendas: cellOf(w.vendas), compras: cellOf(w.compras), c100_n: cellOf(w.c100n), c100_rs: cellOf(w.c100rs), janela: w.janela, fonte: w.fonte, obs: w.obs, versao: '1', atualizado_em: at, atualizado_por: 'seed' };
  w.dias.forEach((d, i) => { row[`dia${i + 1}`] = cellOf(d); });
  ['ig', 'fb', 'ads'].forEach(p => Object.keys(w[p]).forEach(f => { row[`${p}_${f}`] = cellOf(w[p][f]); }));
  return row;
};
function build(c) {
  require('../public/assets/js/store.js');
  require('../public/assets/js/workflow.js');
  const F = globalThis.N7Flow; F._reset();
  const ideas = F.getIdeas(), flow = F.getFlow(); F._reset();
  const at = '2026-11-18T00:00:00.000Z';
  return {
    Ideias: ideas.map(i => ({ id: i.id, marca: i.b, formato: i.format, titulo: i.title, observacao: i.note, etapa: i.stage, origem: i.src, criada_em: i.at, pauta_codigo: '', versao: '1', atualizado_em: at, atualizado_por: 'seed' })),
    Politicas: Object.entries(flow.policy).map(([m, p]) => ({ marca: m, politica: p, atualizado_em: at, atualizado_por: 'seed' })),
    Horarios: Object.entries(flow.slots).flatMap(([m, l]) => l.map((s, n) => ({ id: `H-${m}${String(n + 1).padStart(2, '0')}`, marca: m, dia_semana: String(s.dow), hora: s.time, formato: s.format, atualizado_em: at, atualizado_por: 'seed' }))),
    Semanas: WEEKS.map(w => weekRow(w, at)),
    SemanasGeral: GENS.map(g => ({ tipo: g.tipo, inicio: g.inicio, promocao: g.promocao, concorrencia: g.concorrencia, decisao: g.decisao, rumo: g.rumo || '', notas: g.notas, versao: '1', atualizado_em: at, atualizado_por: 'seed' })),
    Clientes: require('./clients').defaults(at),
    Usuarios: [{ email: (c.devEmail || 'dev@local').toLowerCase(), nome: 'Desenvolvimento', tipo: 'equipe', papel: 'admin', empresas: '', ativo: 'sim' }]
  };
}
module.exports = { build };
