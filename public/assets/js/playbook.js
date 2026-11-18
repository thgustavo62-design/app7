/* =====================================================================
   Playbook da agência
   Adaptado (licença MIT) de indranilbanerjee/digital-marketing-pro,
   skills/context-engine: agency-operations-guide, scoring-rubrics,
   approval-framework, reporting-cadence, monthly-report-template,
   platform-specs, industry-profiles e compliance-rules.
   Ajustado à Nova7: sem dados de mídia paga, conteúdo orgânico,
   farmácias (saúde) e agro. Regras dos EUA foram retiradas.
   ===================================================================== */
window.N7_PLAYBOOK = {
  source: "https://github.com/indranilbanerjee/digital-marketing-pro",

  /* Nota de saúde do cliente: dimensões adaptadas. "Ritmo do orçamento"
     do original virou "Conformidade", porque a Nova7 não tem dados de verba. */
  health: [
    { id: "pub", name: "Ritmo de publicação", weight: 25, how: "Pautas publicadas ÷ pautas com data até hoje." },
    { id: "pipe", name: "Pipeline de conteúdo", weight: 15, how: "Pautas dos próximos 14 dias já em produção ou além. −25 se nada estiver em aprovação ou pronto para os próximos 7 dias." },
    { id: "res", name: "Resultados", weight: 25, how: "Média de vendas (ter–dom) e visualizações no Instagram contra a semana anterior. 70 = estável; cada 1% de variação vale 1,5 ponto." },
    { id: "eng", name: "Engajamento", weight: 10, how: "Interações por mil visualizações contra a janela anterior." },
    { id: "comp", name: "Conformidade", weight: 25, how: "100 − 25 por alerta P0 − 10 por P1 − 4 por P2 em aberto." }
  ],
  lights: [
    { min: 80, name: "Saudável", tone: "green", action: "Manter a estratégia. Olhar qualquer dimensão abaixo de 70." },
    { min: 60, name: "Atenção", tone: "amber", action: "Atacar a dimensão mais fraca com plano em 48 h e conversar com o cliente." },
    { min: 0, name: "Crítico", tone: "red", action: "Plano de recuperação em 24 h; escalar para a direção da agência." }
  ],

  /* Rubrica de post social (0–100) */
  rubric: [
    { id: "native", name: "Nativo da plataforma", weight: 25, hint: "Parece feito para o Instagram, no formato e no tom." },
    { id: "hook", name: "Gancho", weight: 20, hint: "A primeira linha ou os 2 primeiros segundos param a rolagem." },
    { id: "value", name: "Entrega de valor", weight: 20, hint: "Educa, informa, diverte ou inspira de forma clara." },
    { id: "prompt", name: "Convite à interação", weight: 15, hint: "Pergunta, enquete, opinião ou motivo para salvar e enviar." },
    { id: "voice", name: "Voz da marca", weight: 10, hint: "Combina com o manual de identidade do cliente." },
    { id: "visual", name: "Qualidade visual", weight: 10, hint: "Imagem e vídeo no padrão certo para o formato." }
  ],
  levels: [["0", "Falha"], ["40", "Fraco"], ["75", "Bom"], ["100", "Excelente"]],
  verdicts: [
    { min: 85, name: "Pronto para publicar", tone: "green" },
    { min: 70, name: "Ajustes leves", tone: "amber" },
    { min: 50, name: "Revisão grande", tone: "amber" },
    { min: 0, name: "Refazer", tone: "red" }
  ],
  /* checklist de conformidade por setor (critérios da Diretoria de Marketing e da auditoria Nova7) */
  checks: {
    saude: [
      "Revisão do farmacêutico responsável feita",
      "Sem alegação terapêutica para cosmético ou suplemento",
      "Sem incentivo à automedicação ou dose individual",
      "Regras do clube ou sorteio conferidas (datas, elegibilidade)",
      "Preço, vigência, EAN e estoque conferidos",
      "Arroba, telefone e link corretos",
      "Dados pessoais de clientes ocultos (LGPD)"
    ],
    agro: [
      "Revisão agronômica feita",
      "Fotos reais, autorizadas e da propriedade certa",
      "Sem diagnóstico por foto isolada",
      "Sem promessa de produtividade, rentabilidade ou controle de praga",
      "Só serviços que a Campo Forte confirma oferecer"
    ],
    agencia: [
      "Autorização expressa do cliente para usar o case",
      "Métricas citadas medidas e documentadas",
      "Nenhum dado de outro cliente exposto"
    ]
  },

  /* Níveis de risco e aprovação */
  risk: [
    { level: "Baixo", tone: "", who: "Sem aprovação", what: "Leitura de métricas, rascunhos, pesquisa de concorrência e notas internas.", nova7: "Relatórios internos, análise de insights." },
    { level: "Médio", tone: "st-prod", who: "Revisão + aprovação do cliente", what: "Post orgânico, Stories, atualização do calendário, envio de relatório ao cliente.", nova7: "Carrosséis e Reels institucionais e educativos sem tema de saúde." },
    { level: "Alto", tone: "st-apr", who: "Aprovação com escopo confirmado (valor, prazo)", what: "Impulsionamento e anúncios, encartes com preço, sorteios e regras de clube.", nova7: "Black Friday, Corta Preço, Minas Club e Farma Club." },
    { level: "Crítico", tone: "late", who: "Dupla confirmação + revisão técnica", what: "Setores regulados (saúde, medicamentos, suplementos) e ações irreversíveis.", nova7: "Qualquer peça sobre medicamento, suplemento, GLP-1, melatonina ou diagnóstico agronômico." }
  ],

  /* Cadência de revisão */
  cadence: [
    { when: "Diário", who: "Equipe interna", what: "Posts que foram ao ar, comentários e direct sem resposta, anomalias (perfil sem cliques, post removido).", rule: "Investigar se uma métrica zerar de um dia para o outro (como os cliques do Facebook da Farma após 30/10). Não reagir a ruído de um dia só." },
    { when: "Semanal", who: "Equipe interna", what: "Vendas da semana, Instagram e Facebook por marca, desempenho de cada peça, pautas da semana seguinte.", rule: "Segunda: fechar a semana anterior com PDF de vendas e Meta. Peça abaixo da média por 2 semanas seguidas: revisar formato ou tema." },
    { when: "Mensal", who: "Cliente", what: "Relatório de decisão: KPIs contra a meta, 3 vitórias, 3 preocupações, aprendizados e plano do mês seguinte.", rule: "KPI em vermelho vira pauta da próxima reunião. Explicar o porquê, não só o número." },
    { when: "Trimestral", who: "Cliente", what: "Posicionamento, concorrência, buscas pela marca, evolução do clube de fidelidade.", rule: "Revisar estratégia e redistribuir esforço com base na tendência de 3 meses." },
    { when: "Anual", who: "Cliente + direção", what: "Ano em revisão, metas do ano seguinte, calendário sazonal e direção criativa.", rule: "Novo plano de crescimento e calendário anual." }
  ],

  /* Modelo de relatório mensal (9 seções) */
  report: [
    ["Resumo executivo", "3 a 5 frases: o que aconteceu, se estamos no rumo e a coisa mais importante que o cliente precisa saber. Legível em 15 segundos."],
    ["Painel de KPIs", "Cada indicador contra a meta, com verde, amarelo ou vermelho, seta de tendência e uma linha de contexto."],
    ["Desempenho por canal", "Instagram, Facebook e lojas: número, meta, tendência e por que o resultado foi esse."],
    ["Desempenho criativo", "Melhores e piores peças com imagem, o que aprendemos e o plano de renovação."],
    ["Aprendizados", "3 a 5 aprendizados do mês, o que surpreendeu e hipóteses para testar."],
    ["Conformidade e qualidade", "Problemas encontrados e corrigidos, notas de qualidade e gargalos de aprovação."],
    ["Recomendação de investimento", "Onde mais esforço ou verba gera retorno comprovado, com a conta."],
    ["Plano do próximo mês", "Campanhas, testes, otimizações e riscos monitorados."],
    ["Pedidos ao cliente", "Aprovações, materiais e decisões pendentes, com prazo. Se não houver, dizer."]
  ],

  /* Especificações de formato */
  specs: [
    { net: "Instagram", fmt: "Carrossel", size: "1080 × 1350 (4:5) ou 1080 × 1080", rules: "2 a 20 slides, todos na mesma proporção. Legenda até 2.200 caracteres; cerca de 125 aparecem antes do \"mais\". 3 a 5 hashtags.", signals: "Deslizes até o fim, salvamentos, compartilhamentos e tempo por slide." },
    { net: "Instagram", fmt: "Reels", size: "1080 × 1920 (9:16)", rules: "Até 3 minutos para ser recomendado a quem não segue. Capa 1080 × 1920. 3 a 5 hashtags.", signals: "Assistir até o fim, repetições, compartilhamentos, áudio e originalidade." },
    { net: "Instagram", fmt: "Post", size: "1080 × 1350 (4:5) ou 1080 × 1080", rules: "Manter o assunto no centro 3:4, que é o recorte da grade do perfil.", signals: "Salvamentos, compartilhamentos, comentários e proximidade com quem vê." },
    { net: "Instagram", fmt: "Stories", size: "1080 × 1920 (9:16)", rules: "Texto e preço dentro do centro 1080 × 1420 (evitar 250 px em cima e embaixo). 1 figurinha de link por story. Dura 24 h, salvo em Destaques.", signals: "Respostas, toques para avançar e cliques no link." },
    { net: "Facebook", fmt: "Post", size: "1080 × 1080 ou 1200 × 630", rules: "Texto curto: 40 a 80 caracteres engajam mais. Imagem até 10 MB.", signals: "Comentários e compartilhamentos, tempo de vídeo e engajamento em grupos." },
    { net: "Facebook", fmt: "Reels e Stories", size: "1080 × 1920 (9:16)", rules: "Todo vídeo vira reel. Story com texto curto e zona segura central.", signals: "Originalidade, conclusão e compartilhamentos." }
  ],

  /* Onboarding de cliente novo */
  onboarding: [
    ["Perfil da marca", "Voz, público, canais, concorrentes, metas e regras do setor. Base: manual de identidade no Drive."],
    ["Acessos", "Meta Business Suite, Instagram, Google Business e sistema de vendas, um acesso por cliente, nunca compartilhado."],
    ["Linha de base", "Exportar 90 dias de Instagram e Facebook e as vendas das últimas 4 semanas antes de propor qualquer ação."],
    ["Auditoria inicial", "Ler o perfil inteiro: bio, links, telefones, destaques, regras de promoções. Classificar em saudável, ganho rápido, lacuna ou alerta."],
    ["Fluxo e responsáveis", "Quem roteiriza, grava, edita, aprova e agenda; quem faz a revisão técnica (farmacêutico, agrônomo)."],
    ["Calendário e cadência", "Plano de 60 dias na Central, janela de gravação da semana e data do relatório mensal."],
    ["Pasta no Drive", "Roteiros, agenda de gravações, calendário, insights e artes finais em subpastas padronizadas."]
  ],

  /* Notas por setor (só o que vale para o Brasil e para a Nova7) */
  sectors: {
    saude: {
      name: "Farmácia e saúde", clients: ["M", "F"],
      funnel: "Confiança antes da compra: o cliente pesquisa e compara. Atendimento e reputação local pesam mais que alcance.",
      channels: ["Google Business Profile e buscas \"perto de mim\"", "Conteúdo educativo revisado pelo farmacêutico", "Clube de fidelidade e WhatsApp", "Avaliações no Google e no Reclame Aqui", "Instagram e Facebook para comunidade e ofertas"],
      formats: ["Explicações curtas de sintomas, dúvidas e cuidados", "Vídeos com a equipe real da loja", "Perguntas frequentes do balcão", "Comparações de custo por uso"],
      seasons: ["Janeiro: metas de saúde do ano novo", "Outono: alergias e gripe", "Novembro: Black Friday", "Verão: protetor solar, repelente, viagem"],
      pitfalls: ["Publicar saúde sem revisão profissional", "Usar banco de imagens no lugar da equipe e da loja", "Ignorar avaliações: uma ruim pode dominar a busca", "Alegações absolutas como \"o mais barato\" sem comprovação"]
    },
    agro: {
      name: "Agro e assistência técnica", clients: ["C"],
      funnel: "Ciclo sazonal: a decisão de insumo e manejo acontece semanas antes de cada fase da lavoura. Relação de confiança com o técnico decide.",
      channels: ["Visitas e dias de campo", "Indicação de produtor para produtor", "Conteúdo técnico e de manejo", "WhatsApp com o técnico", "Vídeos curtos de lavoura real no Instagram e Facebook"],
      formats: ["Registro de campo e antes e depois documentado", "Vídeo do técnico explicando na lavoura", "Guias por fase do café", "Conta de custo e retorno de uma decisão"],
      seasons: ["Planejamento de safra e análise de solo", "Floração e pegamento", "Monitoramento de pragas e doenças", "Colheita e pós-colheita"],
      pitfalls: ["Achar que o produtor não pesquisa online", "Jargão técnico sem benefício prático", "Comunicar fora da janela de decisão", "Pouco vídeo em condição real de campo"]
    }
  },

  brasil: [
    ["LGPD", "Cadastro de clube, sorteio e lista de WhatsApp precisam de consentimento livre e informado ou interesse legítimo documentado; descadastro fácil; cookies de anúncio exigem consentimento."],
    ["Tom no Brasil", "Calor humano, humor e senso de comunidade funcionam. Prova social local (Reclame Aqui, avaliações, indicação) pesa na decisão."],
    ["Canal", "No Brasil o WhatsApp é canal principal de marketing e de pedido: a bio precisa levar a ele de forma clara."]
  ]
};
