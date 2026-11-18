/* Dados iniciais da cópia em memória (testes e servidor local). Reaproveita os padrões do site,
   os mesmos que foram gravados na planilha-banco. */
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
    Usuarios: [{ email: (c.devEmail || 'dev@local').toLowerCase(), nome: 'Desenvolvimento', papel: 'admin', ativo: 'sim' }]
  };
}
module.exports = { build };
