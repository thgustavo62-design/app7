/* Catálogo do cérebro: áreas, agentes, conexões (sinapses) e quais serviços cada agente atende.
   É só descrição (sem código de análise): a tela usa isto para montar o mapa, as abas e a explicação das regras. */
export const AREAS = {
  operacao: { id: "operacao", name: "Operação", does: "Prazos, fila de trabalho e aprovações" },
  conteudo: { id: "conteudo", name: "Conteúdo", does: "Ritmo editorial, qualidade e criativos" },
  resultado: { id: "resultado", name: "Resultado", does: "Vendas, anúncios e redes sociais" },
  estrategia: { id: "estrategia", name: "Estratégia", does: "Visão por cliente e oportunidades" },
  contexto: { id: "contexto", name: "Contexto", does: "Datas, feriados e qualidade dos dados" }
};
export const AREA_ORDER = ["operacao", "conteudo", "resultado", "estrategia", "contexto"];

export const AGENTS = {
  producao: { id: "producao", area: "operacao", name: "Produção", icon: "list", does: "Vigia o calendário: pautas atrasadas, pautas que vencem em até 2 dias sem ter começado e clientes sem pauta nos próximos 7 dias.", rules: ["Atrasada: nota sobe com os dias de atraso e a quantidade", "Vence em até 1 dia e nem começou: nota 90", "Cliente de redes sem pauta nos próximos 7 dias: nota 62"] },
  pipeline: { id: "pipeline", area: "operacao", name: "Etapas da produção", icon: "layers", does: "Confere os prazos de cada etapa (roteiro, gravação, edição, aprovação, agendamento) contra o status da pauta, antes de ela atrasar.", rules: ["Etapa com prazo vencido e status que ainda não avançou: nota 48 a 80 (sobe quanto mais perto da publicação)", "Prazo de etapa caindo em feriado nos próximos 5 dias: nota 50"] },
  capacidade: { id: "capacidade", area: "operacao", name: "Capacidade da equipe", icon: "users", does: "Soma as etapas que vencem em cada dia dos próximos 7 e avisa quando a equipe vai ser pedida demais num dia só.", rules: ["3 ou mais gravações no mesmo dia, 4 ou mais edições ou 7 etapas no total: nota 55 a 80", "Dia com feriado pesa mais"] },
  aprovacao: { id: "aprovacao", area: "operacao", name: "Aprovações", icon: "bell", does: "Procura peças que vão ao ar em até 3 dias e ainda esperam a aprovação do cliente.", rules: ["Publica em até 3 dias sem aprovação do cliente: nota 72", "Publica hoje ou amanhã: nota 86"] },
  editorial: { id: "editorial", area: "conteudo", name: "Ritmo editorial", icon: "cal", does: "Compara o que está planejado com os horários fixos combinados, olha a variedade de formatos e as ideias aprovadas paradas.", rules: ["Menos da metade dos horários fixos da semana preenchidos: nota 54", "4 ou mais pautas em 14 dias, todas do mesmo formato: nota 40", "Ideias aprovadas há mais de 7 dias sem data: nota 46 a 56", "Duas pautas do mesmo formato no mesmo dia: nota 44"] },
  qualidade: { id: "qualidade", area: "conteudo", name: "Qualidade", icon: "shield", does: "Procura peças prontas para ir ao ar em até 2 dias sem a checagem de qualidade feita.", rules: ["Peça em aprovação ou agendada, publica em até 2 dias, sem checagem: nota 58", "Publica hoje ou amanhã: nota 66"] },
  criativo: { id: "criativo", area: "conteudo", name: "Criativos", icon: "spark", does: "Nasce da conversa entre Mídia e Redes: quando frequência alta, custo subindo e queda de cliques ou visualizações aparecem juntos, as peças estão desgastadas.", rules: ["Dois ou mais sinais de desgaste no mesmo cliente: nota do mais forte + 8", "Os achados de origem perdem 15 pontos para não aparecerem em duplicidade"] },
  midia: { id: "midia", area: "resultado", name: "Mídia paga", icon: "target", does: "Lê os anúncios da última semana com números: frequência, saturação, gasto sem resultado e custo por resultado.", rules: ["Frequência acima de 1,5 ou alcance maior que a cidade: corrigir", "Gasto sem nenhum resultado: corrigir", "Custo por resultado 20% maior ou menor que a semana anterior"] },
  redes: { id: "redes", area: "resultado", name: "Redes sociais", icon: "ig", does: "Lê Instagram e Facebook: cliques no link, interação por mil visualizações e queda de distribuição.", rules: ["Cliques no link caindo 20% ou mais: testar", "Facebook com queda forte ou zero cliques: corrigir", "Visualizações caindo 25% ou mais: testar"] },
  vendas: { id: "vendas", area: "resultado", name: "Vendas", icon: "money", does: "Compara as vendas da semana com a anterior nos mesmos dias, avisando feriado antes de concluir queda.", rules: ["Variação de 10% ou mais, nos mesmos dias da semana", "Com feriado no período, a queda vira 'inconclusiva'"] },
  cliente: { id: "cliente", area: "estrategia", name: "Gestão de contas", icon: "home", does: "Junta tudo o que os outros agentes disseram sobre cada cliente numa nota de saúde de 0 a 100 e avisa quando várias frentes pioram juntas.", rules: ["Cada achado aberto tira pontos da saúde, conforme a nota dele (com teto: a nota nunca zera de vez)", "3 ou mais achados com nota 60+ ou saúde abaixo de 60: nota 60 a 78", "Saúde: 80+ em ordem, 60 a 79 atenção, abaixo de 60 em risco"] },
  oportunidades: { id: "oportunidades", area: "estrategia", name: "Oportunidades", icon: "bulb", does: "Procura onde o resultado está bom e dá para propor mais: orgânico forte em cliente sem tráfego pago.", rules: ["Instagram ou Facebook subindo (classe manter) em cliente sem o serviço de tráfego pago: nota 44"] },
  dados: { id: "dados", area: "contexto", name: "Qualidade dos dados", icon: "file", does: "Avisa o que falta para a análise ser confiável: semana sem números, decisão da semana em branco e calendário fora da Central.", rules: ["Cliente com serviço e sem número na última semana", "Semana com dados e sem decisão registrada", "Calendário usando a cópia em vez da Central"] },
  calendario: { id: "calendario", area: "contexto", name: "Datas e feriados", icon: "clock", does: "Olha os próximos 10 dias atrás de feriado ou data atípica que mude o conteúdo e o horário das publicações.", rules: ["Feriado em até 3 dias: nota 70", "Feriado em até 7 dias: nota 57"] }
};
export const AGENT_ORDER = ["aprovacao", "producao", "pipeline", "capacidade", "midia", "criativo", "vendas", "redes", "qualidade", "editorial", "cliente", "oportunidades", "dados", "calendario"];

export const SYNAPSES = [
  { id: "apr-prod", nome: "Aprovação trava a produção", de: ["aprovacao"], para: ["producao", "pipeline"], texto: "Cliente com peça esperando aprovação e pauta apertada ao mesmo tempo: a causa mais provável é a aprovação. O achado de aprovação ganha 8 pontos." },
  { id: "dados-confianca", nome: "Dado velho, confiança menor", de: ["dados"], para: ["vendas", "midia", "redes"], texto: "Se a última semana fechada está sem números, as conclusões vêm de uma semana mais antiga. Os achados desse cliente perdem 15% da nota e avisam disso." },
  { id: "feriado-prazo", nome: "Feriado aperta o prazo", de: ["calendario"], para: ["producao", "pipeline"], texto: "Feriado em até 3 dias e pauta apertada do mesmo cliente: sobem 6 pontos, porque falta dia útil para recuperar." },
  { id: "midia-redes-criativo", nome: "Anúncio cansado + redes em queda = criativo desgastado", de: ["midia", "redes"], para: ["criativo"], texto: "Frequência alta ou custo subindo junto com queda de cliques ou visualizações vira um achado novo de Criativos, e os dois originais perdem 15 pontos." },
  { id: "producao-redes", nome: "Falta de publicação e queda de alcance", de: ["producao", "pipeline", "editorial"], para: ["redes"], texto: "Cliente com atraso ou sem pauta e visualizações em queda na mesma época: o achado de produção ganha 8 pontos. É um indício, não uma prova." },
  { id: "vendas-midia", nome: "Vendas caindo com anúncio com problema", de: ["vendas"], para: ["midia"], texto: "Queda de vendas e problema nos anúncios do mesmo cliente: investigue o anúncio antes da loja. O achado de vendas ganha 6 pontos." },
  { id: "capacidade-atraso", nome: "Sobrecarga com atraso acumulado", de: ["producao"], para: ["capacidade"], texto: "Dia sobrecarregado numa semana que já tem pauta atrasada: o achado de capacidade ganha 6 pontos." },
  { id: "ideias-vazio", nome: "Calendário vazio, ideias paradas", de: ["editorial"], para: ["producao"], texto: "Cliente sem pauta na semana e com ideia aprovada esperando data: a ação passa a ser agendar a ideia, e o aviso de ideias parada é absorvido." },
  { id: "memoria", nome: "Memória: o que voltou", de: ["memoria"], para: ["todos"], texto: "Se foi marcado como feito (ou adiado, ou ignorado) e o problema continua, o achado volta com a marca de reincidente e ganha de 4 a 10 pontos." }
];

/* quais agentes trabalham para cada serviço que a agência presta (ids de services.js) */
export const SERVICE_AGENTS = {
  redes: ["aprovacao", "producao", "pipeline", "editorial", "qualidade", "redes", "calendario", "dados", "cliente", "oportunidades"],
  trafego: ["midia", "criativo", "redes", "dados", "cliente"],
  criativos: ["producao", "pipeline", "capacidade", "aprovacao", "qualidade", "criativo"],
  varejo: ["vendas", "midia", "calendario", "dados", "cliente"]
};
/* serviços que um agente atende (inverso de SERVICE_AGENTS) */
export const servicesOf = agentId => Object.keys(SERVICE_AGENTS).filter(s => SERVICE_AGENTS[s].includes(agentId));
