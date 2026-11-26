/* Transforma o resultado.json num resumo.md legível. Só formata: nenhuma conta nova aqui. */
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
function montar(r) {
  const L = [], nome = k => r.clientes[k] || k, cb = r.cerebro || {};
  L.push(`# Análise local — ${r.hoje}`, '', `Fonte: ${r.fonte}. Gerado em ${r.geradoEm}.`,
    `Execução: ${r.execucao.tarefas} tarefas em ${r.execucao.nucleosUsados} de ${r.execucao.nucleosDisponiveis} núcleos, ${(r.execucao.tempoTotalMs / 1000).toFixed(2)} s (soma das tarefas ${(r.execucao.somaDasTarefasMs / 1000).toFixed(2)} s). Sem API de IA.`, '');
  L.push('## Decisão do dia (cérebro)', '');
  if (cb.decisao) { const d = cb.decisao; L.push(`**${d.titulo}** — ${nome(d.marca)} · agente ${d.agente} · nota ${d.nota} (${d.urgencia})`, d.evidencia ? `- Por quê: ${d.evidencia}` : '', d.acao ? `- Próxima ação: ${d.acao}` : '', ''); } else L.push('Sem decisão: tudo em ordem.', '');
  if ((cb.tambem || []).length) { L.push('Também hoje:'); cb.tambem.forEach(f => L.push(`- ${f.titulo} (${f.marca ? nome(f.marca) : 'geral'}, nota ${f.nota})`)); L.push(''); }
  L.push('## Saúde dos clientes', '', '| Cliente | Saúde | Nível | Achados | Fortes (nota 60+) |', '| --- | --- | --- | --- | --- |');
  (cb.clientes || []).forEach(c => L.push(`| ${c.nome || nome(c.chave)} | ${c.saude} | ${c.nivel} | ${c.achados} | ${c.fortes} |`)); L.push('');
  L.push(`Achados abertos: ${cb.total} · em risco: ${cb.emRisco} · sinapses disparadas: ${(cb.sinapses || []).length}`, '');
  if ((cb.radar || []).length) { L.push('## Radar (maiores notas depois da decisão)', ''); cb.radar.forEach(f => L.push(`- [${f.nota}] ${f.titulo} — ${f.marca ? nome(f.marca) : 'geral'} · ${f.agente}${f.reincidente ? ' · reincidente' : ''}`)); L.push(''); }
  L.push('## Calendário por cliente', '', '| Cliente | Pautas | Publicadas | Atrasadas | Próx. 14 dias | Sem responsável | Sem aprovação do cliente (a política exige) |', '| --- | --- | --- | --- | --- | --- | --- |');
  Object.entries(r.calendario).forEach(([k, c]) => L.push(`| ${nome(k)} | ${c.total} | ${c.publicadas} | ${c.atrasadas.length} | ${c.proximos14dias} | ${c.semResponsavel} | ${c.aguardandoCliente} |`));
  L.push('');
  Object.entries(r.calendario).forEach(([k, c]) => { if (c.atrasadas.length) { L.push(`Atrasadas de ${nome(k)}: ` + c.atrasadas.slice(0, 8).map(p => `${p.codigo} (${p.data})`).join(', ') + (c.atrasadas.length > 8 ? '…' : '')); } });
  L.push('', '## Qualidade dos dados', '', `Última semana fechada: ${(r.dados || {}).ultimaSemanaFechada}.`, '', '| Cliente | Semanas com números | Última com números | Atraso (dias) |', '| --- | --- | --- | --- |');
  Object.values((r.dados || {}).clientes || {}).forEach(c => L.push(`| ${c.nome} | ${c.semanasComNumeros} | ${c.ultimaComNumeros || '—'} | ${c.diasDeAtrasoParaUltimaSemanaFechada == null ? '—' : c.diasDeAtrasoParaUltimaSemanaFechada} |`));
  L.push('', '## Ideias no quadro', '', '| Cliente | Total | Etapas |', '| --- | --- | --- |');
  Object.entries(r.ideias || {}).forEach(([k, i]) => L.push(`| ${nome(k)} | ${i.total} | ${Object.entries(i.porEtapa).map(([e, n]) => e + ' ' + n).join(', ')} |`));
  L.push('', `## Semanas analisadas (${r.semanas.length})`, '', r.semanas.map(s => s.inicio).join(', ') || 'nenhuma semana fechada com números', '', 'O detalhe de cada semana (classe, confiança e leituras) está em `resultado.json`.', '',
    '## Limites', '', '- A Central de Promoções (estoque e vendas por item) não entra nesta rodada: ela depende de arquivos importados na aba PromoBase.', '- Os números seguem as regras do site; dado ausente é "sem dado", nunca zero.');
  return L.filter(x => x !== undefined).join('\n') + '\n';
}
module.exports = { montar };
