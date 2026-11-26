/* Transforma promocoes.json em promocoes.md. Só formata: as contas já vêm prontas (centavos inteiros). */
const n = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const brl = c => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dm = iso => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—');
function montar(o) {
  const L = [`# Central de Promoções — análise local`, '', `Gerado em ${o.geradoEm}. A conferência da leitura de cada arquivo está em \`leitura.md\`; só entraram arquivos que fecharam com o total do relatório.`, ''];
  if (o.recusados.length) { L.push('## ⚠ Arquivos recusados (não entraram na análise)', ''); o.recusados.forEach(r => L.push(`- **${r.arquivo}**: ${r.motivo}`)); L.push(''); }
  Object.entries(o.lojas).forEach(([k, l]) => {
    L.push(`## ${l.nome}`, '');
    l.avisos.forEach(a => L.push(`> ⚠ ${a}`)); if (l.avisos.length) L.push('');
    if (l.estoque) L.push(`**Estoque:** ${l.estoque.arquivo} — ${n(l.estoque.produtos, 0)} produtos, ${n(l.estoque.estoqueTotal, 0)} unidades, ${n(l.estoque.semCusto, 0)} sem custo, ${n(l.estoque.duplicados, 0)} repetidos.`, '');
    l.vendas.forEach(v => L.push(`**Vendas:** ${v.arquivo} — ${dm(v.periodo.inicio)} a ${dm(v.periodo.fim)} (cobertura ${dm(v.cobertura.inicio)} a ${dm(v.cobertura.fim)}${v.diaDescartado ? `, dia ${dm(v.diaDescartado)} fora por estar cortado` : ''}), ${n(v.vendas, 0)} lançamentos + ${v.ajustes} ajuste(s); total do rodapé ${brl(v.totalRodapeCentavos)}.`));
    L.push('');
    (l.cruzado || []).forEach(x => L.push(`**Teste cruzado entre PDFs:** "${x.a}" e "${x.b}" se sobrepõem de ${dm(x.de)} a ${dm(x.ate)} (${x.dias} dias): ${x.iguais} dia(s) com o MESMO total ao centavo${x.diferentes.length ? `, ${x.diferentes.length} diferente(s)` : ''}.`)); if ((l.cruzado || []).length) L.push('');
    const e = l.exato;
    if (e) {
      L.push('### Vendas (contas exatas, em centavos)', '', `| Indicador | Valor |`, `| --- | --- |`, `| Vendas de produto | ${brl(e.vendasProdutoCentavos)} |`, `| Taxa de entrega (não é produto) | ${brl(e.taxaEntregaCentavos)} |`, `| "Diversos" (venda sem cadastro) | ${brl(e.diversosCentavos)} |`, ...(e.outrosCodigosCentavos ? ['| Outros códigos internos (não são produto) | '+brl(e.outrosCodigosCentavos)+' |'] : []),
        `| Cupons distintos | ${n(e.cuponsDistintos, 0)} |`, `| Ticket médio por cupom | ${brl(e.ticketMedioCentavos)} |`, `| Dias com venda | ${e.diasComVenda} |`, `| Média por dia | ${brl(e.mediaPorDiaCentavos)} |`, '');
      L.push('Por dia da semana: ' + e.porDiaDaSemana.map(d => `${d.dia} ${brl(d.valorCentavos)}`).join(' · '), '');
      const top = e.porHora.slice().sort((a, b) => b.valorCentavos - a.valorCentavos).slice(0, 3); L.push('Horas de maior venda: ' + top.map(h => `${h.hora}h (${brl(h.valorCentavos)})`).join(', '), '');
      L.push('### 20 produtos que mais faturaram', '', '| # | Produto | Qtde | Valor |', '| --- | --- | --- | --- |'); e.topProdutosPorValor.forEach((p, i) => L.push(`| ${i + 1} | ${p.desc} | ${n(p.qtd, 0)} | ${brl(p.valorCentavos)} |`)); L.push('');
    }
    const jn = l.janela;
    if (jn) {
      const R = c => (c == null ? '—' : brl(c));
      L.push('### Janela analisada, dia a dia e semana a semana', '', `De ${dm(jn.inicio)} a ${dm(jn.fim)}: ${jn.nDias} dias, ${R(jn.vendasCentavos)} no total. Semanas de segunda a domingo; "completa" = os 7 dias estão cobertos pelos relatórios.`, '',
        '| Semana | Situação | Vendas | Cupons | Ticket | Cestas > R$ 100 |', '| --- | --- | --- | --- | --- | --- |');
      jn.semanas.forEach(w => L.push(`| ${dm(w.inicio)} a ${dm(w.fim)} | ${w.completa ? 'completa' : 'parcial (' + w.diasCobertos + ' dias)'} | ${R(w.vendasCentavos)} | ${n(w.cupons, 0)} | ${R(w.ticketCentavos)} | ${w.c100n} (${w.cupons ? n(w.c100n / w.cupons * 100, 1) : '—'}%) |`));
      L.push('', 'Mês a mês: ' + jn.meses.map(m => `${m.mes.split('-').reverse().join('/')} ${R(m.vendasCentavos)}${m.completo ? '' : ' (parcial)'}`).join(' · '), '');
      L.push('Média por dia da semana: ' + jn.porDiaDaSemana.map(d => `${d.dia} ${R(d.mediaCentavos)}`).join(' · '), '');
      if (jn.diasSemVenda.length) L.push(`> ⚠ Dias dentro da janela SEM nenhuma venda: ${jn.diasSemVenda.map(dm).join(', ')}. Pode ser loja fechada ou relatório incompleto.`, '');
      if (jn.diasAtipicos.length) { L.push('Dias fora do padrão (comparados à mediana do mesmo dia da semana):', ''); jn.diasAtipicos.slice(0, 12).forEach(a => L.push(`- ${dm(a.d)} (${a.dia}): ${R(a.vendasCentavos)} contra mediana ${R(a.medianaDoDiaCentavos)}, ${a.motivo}`)); L.push(''); }
      L.push('Arquivos para o Excel: `' + k + '-dias.csv`, `' + k + '-semanas.csv` (no formato da tela Semana), `' + k + '-meses.csv`.', '');
    }
    const r = l.analise && l.analise.resumo;
    if (r) {
      L.push('### Estoque e giro (mesmas regras da Central de Promoções)', '', `| Indicador | Valor |`, `| --- | --- |`, `| Dinheiro em estoque (custo) | ${brl(Math.round(r.capitalCusto * 100))} |`, `| Parado em 90 dias | ${brl(Math.round(r.capitalParado * 100))} (${n(r.parados, 0)} itens) |`, `| Encalhados (6 meses ou mais de estoque) | ${n(r.queima, 0)} itens, ${brl(Math.round(r.capitalQueima * 100))} |`,
        `| Risco de ruptura (A e B) | ${n(r.ruptura, 0)} itens |`, `| Margem média ponderada | ${r.margemMedia == null ? '—' : n(r.margemMedia * 100, 1) + '%'} |`, `| Itens sem custo (com estoque) | ${n(r.semCusto, 0)} de ${n(r.comEstoque, 0)} |`, `| Curva ABC | A ${r.abcA} · B ${r.abcB} · C ${r.abcC} |`, `| Cobertura do histórico | ${r.cobertura.dias} dias (${r.cobertura.completa60 ? '' : 'giro de 60 dias parcial; '}${r.cobertura.completa90 ? '' : 'giro de 90 dias parcial'}) |`, '');
      (l.analise.avisos || []).forEach(a => L.push(`> ⚠ ${a}`)); L.push('');
      if (l.listas) L.push('Listas de trabalho (CSV, abrem no Excel): ' + Object.entries(l.listas).map(([k2, v]) => `${k}-${k2}.csv (${v})`).join(' · '), '');
      const b = l.analise.brain; if (b && !b.vazio) {
        if (b.topQueima.length) { L.push('**Maiores candidatos a queima:**', ''); b.topQueima.forEach(i => L.push(`- ${i.desc}: ${n(i.estoque, 0)} un, ${brl(Math.round(i.capital * 100))} parados → sugestão ${brl(Math.round(i.por * 100))} (${n(i.desconto * 100, 0)}% de desconto, sem furar o piso)`)); L.push(''); }
        if (b.topRuptura.length) { L.push('**Risco de ruptura:**', ''); b.topRuptura.forEach(i => L.push(`- ${i.desc}: ${n(i.estoque, 0)} un para ${n(i.dias, 0)} dia(s), curva ${i.abc}`)); L.push(''); }
        if (b.margemBaixa.n) { L.push(`**Margem baixa (abaixo de 12%):** ${b.margemBaixa.n} itens, ${b.margemBaixa.abaixoCusto} vendendo no custo ou abaixo.`, ''); }
      }
    }
  });
  L.push('## Limites', '', '- Análise só dos arquivos desta pasta; não lê nem grava a base da produção.', '- Giro e "parado" valem para o período coberto pelos PDFs. Com menos de 90 dias, o giro de 90 dias é parcial.', '- Promoção sugerida nunca fura o piso de margem; preço termina em ,90.', '- É indício, não prova: clima, feriado, concorrência e outras campanhas não entram.');
  return L.join('\n') + '\n';
}
module.exports = { montar };
