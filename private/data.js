/* =====================================================================
   Central Nova7 · base de dados
   Extraída do Google Drive da agência em 18/11/2026:
   - NOVA7 | CENTRAL EDITORIAL E PRODUÇÃO | 2026 (abas PRODUÇÃO CENTRAL,
     08 RELATÓRIOS SEMANAIS, 10 EVOLUÇÃO HISTÓRICA)
   - Insights_3_Meses_Minas_Farma / Insights_3_Meses_Farma_e_Farma (14/08–14/11)
   - AUDITORIA DE PUBLICAÇÕES — NOVA7 | 4 marcas | 10.11.2026
   - NOVA7 | DIRETORIA DE MARKETING — Diagnóstico e plano de ação 2026
   Regra herdada das planilhas: campo vazio (null) = sem dado, nunca zero.
   ===================================================================== */
window.N7 = (function () {
  const TODAY = "2026-11-18";
  const CENTRAL = "https://docs.google.com/spreadsheets/d/1PavnCDHRz0ck9p9o9McQKVtuZwdfwUyX75I-UjGTpEU/edit";

  const CLIENTS = [
    {
      id: "minas-farma", key: "M", name: "Minas Farma", short: "Minas", color: "--c1",
      segment: "Farmácia · Baixo Guandu-ES", handle: "@minasfarmabg", ig: "https://www.instagram.com/minasfarmabg/",
      club: "Minas Club", postsProfile: 2089,
      about: "Rede de farmácia com clube de pontos (Minas Club), encartes de Black Friday por lote e conteúdo educativo de saúde revisado pelo farmacêutico.",
      docs: [
        ["Pasta do cliente", "https://drive.google.com/drive/folders/1VngCqpbEFZIKbX_7mdh5vsz6wQkr1SBs"],
        ["Calendário Out–Dez (Excel)", "https://drive.google.com/file/d/1M7dQIyFb_4JUZf-7gkCrDvLddofxEmVP/view"],
        ["Roteiros de Reels", "https://docs.google.com/document/d/1_6xeWfQ4Axr2asWy8BodZe87I7hw8IRiws0GSYZccpo/edit"],
        ["Roteiros de carrosséis", "https://docs.google.com/document/d/182Zxju54AEBmIjmk5eejOI9W9eGNR7aFIAuyiStKE2c/edit"],
        ["Agenda de gravações", "https://docs.google.com/document/d/1Y8JYBPJTjAeVeIuaaRgzA41McH5wrAuV-57a0fNB5Fc/edit"],
        ["Insights 3 meses", "https://drive.google.com/file/d/1Vmr2MsWXSBlgjM7wyLsncY2QbKhva32U/view"],
        ["Guia Minas Club (PDF)", "https://drive.google.com/file/d/18YDN0Ei7zEyxv_E0jdeQbMepBH5c0EI2/view"]
      ]
    },
    {
      id: "farma-e-farma", key: "F", name: "Farma e Farma", short: "Farma", color: "--c2",
      segment: "Farmácia · Baixo Guandu-ES", handle: "@farmaefarmabg", ig: "https://www.instagram.com/farmaefarmabg/",
      club: "Farma Club", postsProfile: 468,
      about: "Farmácia com programa Farma Club (pontos e sorteio no dia 22), ofertas Black até 30/11 e linha de dermocosméticos.",
      docs: [
        ["Pasta do cliente", "https://drive.google.com/drive/folders/1rfxE9-S9YMIa9PPudad0vvOI35OFNQSb"],
        ["Calendário Out–Dez (Excel)", "https://drive.google.com/file/d/1X59VY2f9E4s5Uvh3nXBFy5NYxZk7iCc8/view"],
        ["Roteiros de Reels", "https://docs.google.com/document/d/1B-j4d6A0EqCMUiCrDaYkiXtA3FD-lsYgkYawc6L8NAY/edit"],
        ["Roteiros de carrosséis", "https://docs.google.com/document/d/1PORQ1-2o-pQ5hM0KnZREGpg-78dSuPG-hvC9svUGleE/edit"],
        ["Agenda de gravações", "https://docs.google.com/document/d/1khmPiG4RAL_Q832Mv45sX8BIgXrA007-v6fc88fTsqc/edit"],
        ["Insights 3 meses", "https://drive.google.com/file/d/1KFgQeWT6F2uL5ZtmtdctFVoJZx6ke6P0/view"],
        ["Artes C-F19 Farma Club", "https://drive.google.com/drive/folders/13LSts6VN6liFbsKEQLzk3ce-yW7bB4Yo"]
      ]
    },
    {
      id: "campo-forte", key: "C", name: "Campo Forte", short: "Campo Forte", color: "--c3",
      segment: "Soluções agrícolas · café e solo", handle: "@campofortesolucao", ig: "https://www.instagram.com/campofortesolucao/",
      club: null, postsProfile: null,
      about: "Assistência técnica para produtores de café. Série de Reels \"O preço de decidir no escuro\": solo, monitoramento, triagem de sintomas e planejamento, sem prometer produtividade.",
      docs: [
        ["Pasta do cliente", "https://drive.google.com/drive/folders/1sajXhr7d9Qf5TxV0LPNuJuD3g3RDbtDt"],
        ["Planejamento editorial", "https://docs.google.com/spreadsheets/d/1AICEQL1dhXnYD1ydEbrUOeLygvSeceQ_pA9N9FOpRqs/edit"],
        ["Manual de identidade", "https://docs.google.com/document/d/1q9nLEDr9G4buLKFiXpKetlqqN7VjMq8MPDdWaqQIW08/edit"],
        ["Roteiros de Reels", "https://docs.google.com/document/d/1Z70eHTcEu3T6pwM1YnCpj03yqRE8HGLcDvUyj0G05rA/edit"],
        ["Roteiros de carrosséis", "https://docs.google.com/document/d/1mTh_Rjq9zhABGB2pUvdQhTwMY6lzwFtqPXsM0V5VSxo/edit"],
        ["Agenda de gravações", "https://docs.google.com/document/d/1EiU_XTe9qCvMu0cP3h4sZoRissbp2iyD8ImtBQHQJxM/edit"]
      ]
    },
    {
      id: "nova7", key: "N", name: "Nova7 Produtora", short: "Nova7", color: "--c4",
      segment: "Perfil próprio da agência", handle: "@nova7.produtora", ig: "https://www.instagram.com/nova7.produtora/",
      club: null, postsProfile: null,
      about: "Conteúdo de método, branding e bastidores. Trabalhos de clientes só entram como case com autorização expressa e métricas documentadas.",
      docs: [
        ["Pasta Nova7", "https://drive.google.com/drive/folders/1EyOYMcDonPsqdMYUJ3Z3UgRq4uw3duhG"],
        ["Central editorial", CENTRAL],
        ["Manual de identidade", "https://docs.google.com/document/d/1MQGtb3CAYfhmfZ3BDN9sNGpBL6qilHAXpbn32yKQ4Vk/edit"],
        ["Diretoria de marketing", "https://docs.google.com/document/d/1SLbj3va2Uvu3JR91fvoDd3_6QBn3hYuNOSbIeOlKi2w/edit"],
        ["Automação de entrega", "https://docs.google.com/document/d/1B1J5p3Bsbf5AnqcyKlcrFgzn3qTTKhAQTdi_FdYeHp8/edit"],
        ["Auditoria 10/11", "https://docs.google.com/document/d/1fn_opR-QpHogYpmKbY6ltpyDki0rS55dypE8GyVWkxc/edit"]
      ]
    }
  ];

  /* ---------- Vendas e redes por janela (10 EVOLUÇÃO HISTÓRICA) ---------- */
  const WINDOWS = ["19–25/10", "27/10–02/11", "02–08/11"];
  const WEEKLY = {
    M: {
      sales: [98770, 93978.02, 109842.42], orders: [null, 1607, 1747], ticket: [57.79, 58.48, 62.87],
      igViews: [114100, 142800, 119600], igInt: [227, 377, 279], igClicks: [97, 115, 91], igVisits: [538, 477, 581], igFollows: [25, 32, 33],
      fbViews: [74300, 47700, 11700], fbInt: [66, 53, 12], fbClicks: [181, 161, 14], fbVisits: [112, 114, 62], fbFollows: [2, 3, 2]
    },
    F: {
      sales: [null, 46941.74, 49311.51], orders: [null, 1020, 999], ticket: [null, 46.02, 49.36],
      igViews: [71000, 70000, 43200], igInt: [98, 81, 316], igClicks: [60, 50, 22], igVisits: [172, 214, 274], igFollows: [27, 17, 26],
      fbViews: [36600, 27900, 7300], fbInt: [4, 1, 0], fbClicks: [73, 53, 0], fbVisits: [15, 13, 15], fbFollows: [2, 0, 0]
    }
  };
  /* Comparação sem sobreposição: terça a domingo */
  const FAIR = [
    { name: "Minas Farma", key: "M", a: 86350.14, b: 102214.54, pct: 18.4 },
    { name: "Farma e Farma", key: "F", a: 43380.11, b: 45749.88, pct: 5.5 },
    { name: "Duas lojas", key: null, a: 129730.25, b: 147964.42, pct: 14.1 }
  ];
  const MINAS_AUG = { igViews: 419600, igInt: 1200, igVisits: 2400, igFollows: 160 };

  /* Farma e Farma · vendas diárias 02–08/11 (PDF do sistema, 68 páginas) */
  const FARMA_DAILY = {
    labels: ["seg 02", "ter 03", "qua 04", "qui 05", "sex 06", "sáb 07", "dom 08"],
    sales: [3561.63, 7885.88, 7055.19, 7421.31, 10083.48, 8385.38, 4918.64],
    orders: [87, 153, 136, 161, 178, 188, 96],
    ticket: [40.94, 51.54, 51.88, 46.10, 56.65, 44.60, 51.24]
  };
  const FARMA_BASKET = [
    ["Compras acima de R$ 100", "122 cupons", "R$ 20.176,92 · 40,9% da receita"],
    ["Fraldas", "51 unidades em 44 cupons", "R$ 3.046,02"],
    ["Limpeza", "30 cupons (9 com 2+ itens da seleção)", "R$ 1.177,23"]
  ];

  /* Farma e Farma · Facebook diário 15/10–13/11 (Meta Business Suite) */
  const FB_DAILY = {
    start: "2026-10-15",
    views: [763, 5636, 7077, 965, 0, 2720, 6269, 5860, 6192, 6593, 9070, 6199, 5470, 5443, 5581, 4265, 1726, 2821, 2556, 1404, 2660, 677, 10, 5, 20, 337, 749, 438, 350, 890],
    clicks: [7, 26, 36, 1, 0, 6, 17, 5, 11, 15, 20, 10, 14, 13, 19, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    visits: [3, 8, 9, 0, 1, 1, 6, 3, 0, 0, 4, 3, 1, 6, 3, 3, 0, 0, 0, 9, 3, 0, 0, 0, 3, 3, 3, 0, 3, 0],
    totals: { views: 92746, viewers: "43,6 mil", interactions: 6, clicks: 207, visits: 75, follows: 2 }
  };

  /* ---------- Achados e ações (abas ANALISE_E_ACOES) ---------- */
  const FINDINGS = [
    { b: "F", p: "ALTA", net: "Facebook", t: "Cliques zerados de 31/10 a 13/11", e: "207 cliques na série de 30 dias, todos até 30/10.", i: "Pode ser mudança de veiculação, CTA ou rastreamento. Não prova perda de pedidos.", n: "Verificar links, mídia paga, distribuição e seletor de métrica." },
    { b: "F", p: "ALTA", net: "Instagram", t: "Bio convida ao WhatsApp, link leva ao Farma Club", e: "Link clicável: farmaclub.farbev.com.br (auditado em 14/11).", i: "Possível fricção para pedidos.", n: "Checar botões do perfil e rastrear contatos por origem." },
    { b: "F", p: "ALTA", net: "Instagram", t: "Sorteio Haskell com arroba inconsistente", e: "Legenda cita @farmaefarma; perfil é @farmaefarmabg.", i: "Participação pode ser prejudicada.", n: "Revisar legenda e regulamento antes de 20/11." },
    { b: "F", p: "ALTA", net: "Instagram", t: "Três publicações novas após a auditoria", e: "Perfil foi de 465 para 468 posts (Farma Club, oferta Personal, Reels Farma Club).", i: "O número do perfil é saldo líquido; não data cada post.", n: "Reconciliar com C-F19 e Meta Insights de conteúdo." },
    { b: "F", p: "MÉDIA", net: "Instagram", t: "Menos visualizações, mais interações", e: "27/10–02/11: 70 mil views e 81 interações; 02–08/11: 43,2 mil e 316.", i: "Maior interação por visualização; janelas compartilham 02/11.", n: "Extrair alcance, salvamentos e ranking por post." },
    { b: "F", p: "MÉDIA", net: "Facebook", t: "Visualizações caem em novembro", e: "15–31/10: 79.829 views em 17 dias; 01–13/11: 12.917 em 13 dias.", i: "Média diária cai de 4.696 para 994.", n: "Conferir anúncios ativos e datas de campanha." },
    { b: "M", p: "ALTA", net: "Clube", t: "Regra do Minas Club não está uniforme", e: "Um post afirma participação automática; outros orientam cadastro.", i: "Pode induzir entendimento errado sobre sorteios.", n: "Validar regulamento com a gestão e padronizar CTA." },
    { b: "M", p: "ALTA", net: "Facebook", t: "Facebook Minas sem série diária", e: "Só relatórios de 19–25/10, 27/10–02/11 e 02–08/11.", i: "Não misturar com o Facebook da Farma e Farma.", n: "Na Meta, selecionar a página Minas e janela de 90 dias." },
    { b: "M", p: "ALTA", net: "Instagram", t: "Instagram Minas sem série diária", e: "Relatórios semanais e um painel de agosto inteiro.", i: "Não há base para reconstruir ago–nov dia a dia.", n: "Extrair 14/08–14/11 na Meta." },
    { b: "M", p: "MÉDIA", net: "Instagram", t: "Visualizações caem 16,2%", e: "27/10–02/11: 142,8 mil; 02–08/11: 119,6 mil.", i: "Queda descritiva; janelas compartilham 02/11.", n: "Conferir volume de Stories e anúncios." },
    { b: "M", p: "MÉDIA", net: "Facebook", t: "Queda de distribuição no Facebook", e: "47,7 mil views em 27/10–02/11 e 11,7 mil em 02–08/11.", i: "Checar pausa de impulsionamento.", n: "Conferir Meta Ads e calendário editorial." },
    { b: "M", p: "MÉDIA", net: "Instagram", t: "Agosto inteiro teve 419,6 mil visualizações", e: "Painel de 01–31/08, fora da janela pedida.", i: "Referência contextual, não total de 14–31/08.", n: "Extrair 14–31/08 para comparação justa." }
  ];

  /* ---------- Alertas (auditoria 10/11 + insights 14/11) ---------- */
  const ALERTS = [
    { p: "P0", b: "F", t: "Sorteio Haskell com arroba errada", d: "A legenda pede para seguir @farmaefarma, mas o perfil é @farmaefarmabg. O sorteio é em 20/11.", a: "Corrigir legenda e conferir regulamento hoje.", u: "https://www.instagram.com/farmaefarmabg/p/DfZscwSEdTM/" },
    { p: "P0", b: "F", t: "Episol Color chamado de \"remédio\"", d: "O Reels R-F13 apresenta protetor solar com cor como remédio. Risco de alegação terapêutica.", a: "Rever legenda e áudio com o farmacêutico responsável.", u: "https://www.instagram.com/farmaefarmabg/reel/DfkW9_Dj60P/" },
    { p: "P0", b: "F", t: "Bio pede WhatsApp, link leva ao Farma Club", d: "O único link clicável vai para farmaclub.farbev.com.br. Há dois telefones diferentes nas legendas: (27) 3732-3700 e (27) 99875-7298.", a: "Configurar botão de WhatsApp e manter o acesso ao Clube.", u: "https://www.instagram.com/farmaefarmabg/" },
    { p: "P0", b: "M", t: "Regra do Minas Club inconsistente", d: "Um post diz que quem compra participa automaticamente; outros orientam cadastro.", a: "Validar o regulamento com a gestão e padronizar o CTA.", u: "https://www.instagram.com/minasfarmabg/p/DeuyEqhk-Zw/" },
    { p: "P1", b: "F", t: "Facebook sem cliques desde 31/10", d: "207 cliques no link até 30/10 e zero depois. Views diárias caíram de cerca de 6 mil para menos de mil.", a: "Conferir anúncios ativos, links e distribuição da página.", u: "https://drive.google.com/file/d/1KFgQeWT6F2uL5ZtmtdctFVoJZx6ke6P0/view" },
    { p: "P1", b: "F", t: "C-F19 repete a pauta do Farma Club", d: "Já existem dois posts de benefícios do Clube. As 3 artes novas aguardam aprovação.", a: "Usar como Stories rastreáveis ou peça sobre cadastro e pontos.", u: "https://drive.google.com/drive/folders/13LSts6VN6liFbsKEQLzk3ce-yW7bB4Yo" },
    { p: "P1", b: "F", t: "Corta Preço com legenda duplicada", d: "Dois posts diferentes com a mesma legenda.", a: "Comparar artes, EANs, datas e vigências.", u: "https://www.instagram.com/farmaefarmabg/p/Deucs4EkUj6/" },
    { p: "P1", b: "M", t: "Black Friday: vigência por lote", d: "Minas tem rodadas com validade própria (até 17/11); Farma divulga ofertas até 30/11.", a: "Separar a campanha do mês da validade de cada lote de preços.", u: "https://www.instagram.com/minasfarmabg/p/Dfj6n9tgPsJ/" },
    { p: "P1", b: "M", t: "Reels de intervalos de medicamentos", d: "Exemplos de 6, 8 e 12 horas podem parecer instrução individual; \"Uma pomada, uma solução\" generaliza indicação.", a: "Revisão farmacêutica das duas peças.", u: "https://www.instagram.com/minasfarmabg/reel/Dfh-yQ-hD-J/" },
    { p: "P2", b: "M", t: "Sem série diária da Meta para a Minas", d: "Instagram e Facebook da Minas só têm relatórios semanais.", a: "Extrair 90 dias na Meta com a página Minas selecionada.", u: "https://drive.google.com/file/d/1Vmr2MsWXSBlgjM7wyLsncY2QbKhva32U/view" },
    { p: "P2", b: "C", t: "Campo Forte sem auditoria e sem métricas", d: "O perfil não foi relido em 10/11 e não há exportação da Meta no Drive.", a: "Exportar métricas ou abrir o perfil na próxima auditoria.", u: "https://www.instagram.com/campofortesolucao/" },
    { p: "P2", b: "C", t: "17 pautas aguardam revisão agronômica", d: "Fotos precisam ser reais e autorizadas; nada de diagnóstico por foto isolada.", a: "Agendar revisão técnica com a equipe Campo Forte.", u: "https://docs.google.com/document/d/1Z70eHTcEu3T6pwM1YnCpj03yqRE8HGLcDvUyj0G05rA/edit" },
    { p: "P2", b: "N", t: "Portfólio depende de autorização", d: "Cases de clientes só entram com aprovação expressa e métricas medidas.", a: "Coletar autorizações na aba ACERVO & AUTORIZAÇÃO.", u: CENTRAL },
    { p: "P1", b: "N", t: "Pautas da Nova7 sem andamento", d: "Nenhuma pauta N7 aparece como publicada na Central, inclusive as de 03/11 em diante.", a: "Confirmar o que foi ao ar e replanejar o restante.", u: CENTRAL }
  ];

  /* ---------- Publicações vistas no Instagram (auditoria) ---------- */
  const IG_POSTS = {
    M: [
      ["DfsFgXmxgvh", "Reels", "Publicação recente, legenda a conferir", "", "14/11"],
      ["DfmkVDRoBWe", "Carrossel", "Publicação recente, legenda a conferir", "", "14/11"],
      ["Dfj6n9tgPsJ", "Carrossel", "Black continua: novidades até 17/11", "", "10/11"],
      ["Dfh-yQ-hD-J", "Reels", "Intervalos de medicamentos 6h/8h/12h", "", "10/11"],
      ["DfX7eKyDvG9", "Carrossel", "Minas Club: pontos e benefícios", "C-M15", "10/11"],
      ["DfUxTRdAHyi", "Carrossel", "Black Friday: produtos e ofertas", "AUD-M02", "10/11"],
      ["DfSJ2gkihzg", "Carrossel", "Vitamina D: precisa suplementar?", "C-M14", "10/11"],
      ["DfQYEYdEXeE", "Reels", "Black o mês inteiro", "R-M20", "10/11"],
      ["DfKCSMWDjZl", "Reels", "Teaser da Black", "R-M19", "10/11"],
      ["DfFLCh8DHs2", "Reels", "Uma pomada, uma solução", "", "10/11"]
    ],
    F: [
      ["DfsXQ31kQ_m", "Carrossel", "Você já conhece o Farma Club?", "C-F19?", "14/11"],
      ["DfruNU2gPGO", "Carrossel", "Black Friday: Fraldas Personal", "", "14/11"],
      ["DfpFu-mlV4I", "Reels", "Suas compras podem valer muito mais", "", "14/11"],
      ["DfkW9_Dj60P", "Reels", "Episol Color", "R-F13", "10/11"],
      ["DfhyZrJm3J_", "Carrossel", "Black continua: ofertas até 30/11", "", "10/11"],
      ["DfaPGbDDw3E", "Carrossel", "Black Friday: produtos de limpeza", "", "10/11"],
      ["DfZscwSEdTM", "Post", "Sorteio Haskell 20/11", "", "10/11"],
      ["DfZg89xiJC3", "Reels", "10 coisas que precisa fazer na farmácia", "R-F12", "10/11"],
      ["DfXQyRIjHEK", "Carrossel", "Quem montou seu skincare: você ou TikTok?", "C-F18", "10/11"],
      ["DfSvCr3glcD", "Carrossel", "Farma Club: primeiro acesso", "C-F01", "10/11"]
    ],
    C: [["DfVQVfHHxXn", "Post", "Análise de solo", "", "referência"]],
    N: [["DfR-L-Cvc81", "Reels", "Reels da produtora", "", "referência"], ["De6vM0yletl", "Post", "Feed da produtora", "", "referência"]]
  };

  /* ---------- Plano Nov–Dez (PRODUÇÃO CENTRAL) ----------
     código | publicar | formato | roteiro | gravar | editar | aprovar | agendar | status | título
     status: pub publicado · fin finalizado · apr aguardando aprovação · prop proposta · vazio = a planejar */
  const PLAN_RAW = `
C-F01|03/11|C|26/10|27/10|28/10|30/10|02/11|pub|Farma Club: como fazer o primeiro acesso e consultar seus pontos
C-F18|05/11|C|26/10|27/10|30/10|03/11|05/11|pub|O algoritmo conhece sua pele? NÃO.
C-F02|06/11|C|26/10|27/10|02/11|04/11|05/11||Fralda: tamanho e custo por unidade importam mais do que a etiqueta
R-F12|06/11|R||05/11|05/11|06/11|06/11|pub|10 coisas antes de comprar em qualquer farmácia — humor da equipe
R-F13|08/11|R||05/11|05/11|08/11|08/11|pub|Episol Color FPS 50 — presente com humor
C-F03|09/11|C|02/11|03/11|04/11|05/11|06/11||O que uma embalagem bonita não diz sobre seu remédio.
R-F02|11/11|R|02/11|05/11|06/11|09/11|10/11||Farma Club: como fazer seu primeiro acesso, passo a passo
C-F19|12/11|C|10/11||10/11|11/11|12/11|apr|Conheça o Farma Club — vantagens e acesso pelo link da bio
C-F04|13/11|C|02/11|03/11|09/11|11/11|12/11||Genérico: o que comparar antes de escolher pelo preço
R-F03|14/11|C|02/11|03/11|10/11|12/11|13/11|fin|Você só olha o FPS? O rótulo tem mais a dizer.
C-F05|16/11|C|09/11|10/11|11/11|12/11|13/11||4 coisas da bula que quase todo mundo ignora.
R-F04|18/11|R|09/11|12/11|13/11|16/11|17/11||Dia 22: o que você precisa saber sobre o Farma Club.
C-F06|20/11|C|09/11|10/11|16/11|18/11|19/11||Você não precisa de dez produtos. Precisa de critério.
C-F07|23/11|C|16/11|17/11|18/11|19/11|20/11||BLACK não é comprar tudo. É comprar melhor.
R-F05|25/11|R|16/11|19/11|20/11|23/11|24/11||Dois remédios diferentes podem ter o mesmo princípio ativo.
C-F08|27/11|C|16/11|17/11|23/11|25/11|26/11||Antes de aproveitar uma oferta, confira estas 5 coisas.
C-F09|30/11|C|23/11|24/11|25/11|26/11|27/11||Seu cabelo não lê propaganda de vitamina.
R-F06|02/12|R|23/11|26/11|27/11|30/11|01/12||Polivitamínico não é seguro só porque vem em cápsula.
C-F10|04/12|C|23/11|24/11|30/11|02/12|03/12||A rotina de verão começa antes de sair de casa.
C-F11|07/12|C|30/11|01/12|02/12|03/12|04/12||Sua pele está oleosa. Lavar mais resolve?
R-F07|09/12|R|30/11|03/12|04/12|07/12|08/12||Farma Club: como consultar seus pontos, passo a passo
C-F12|11/12|C|30/11|01/12|07/12|09/12|10/12||A palavra "natural" não substitui orientação.
R-F08|12/12|R|30/11|03/12|08/12|10/12|11/12||Você pode estar usando repelente do jeito errado.
C-F13|14/12|C|07/12|08/12|09/12|10/12|11/12||O maior foco de mosquito pode estar no seu quintal.
R-F09|16/12|R|07/12|10/12|11/12|14/12|15/12||O sorteio do dia 22 está chegando. Você já conhece as regras?
C-F14|18/12|C|07/12|08/12|14/12|16/12|17/12||Maquiagem com FPS substitui protetor? Depende do uso.
C-F15|21/12|C|14/12|15/12|16/12|17/12|18/12||Uma nécessaire pode evitar muita improvisação nas férias.
R-F10|23/12|R|14/12|17/12|18/12|21/12|22/12||Vai viajar? 4 cuidados com medicamentos antes de sair.
C-F16|25/12|C|14/12|15/12|21/12|23/12|24/12||O melhor cuidado não precisa de embalagem de presente.
C-F17|28/12|C|21/12|22/12|23/12|24/12|25/12||Fim de ano: confira validade e armazenamento dos medicamentos
R-F11|30/12|R|21/12|24/12|25/12|28/12|29/12||Remédio vencido: o lixo comum não é o caminho.
R-M19|31/10|R||||||pub|Está chegando a hora!!
C-M05|02/11|C|26/10|27/10|28/10|29/10|30/10||Fraldas, leite e lenços: a lista da semana sem desperdício
R-M20|02/11|R||||||pub|Black o mês inteiro! Começa 03/11
C-M14|03/11|C|26/10|27/10|28/10|30/10|03/11|pub|Vitamina D virou tendência. Mas quem precisa suplementar?
C-M15|05/11|C|26/10|27/10|30/10|03/11|04/11|pub|Minas Club: como participar e acessar seus pontos?
R-M03|07/11|R|26/10|28/10|03/11|05/11|06/11||Genérico é mais fraco? A resposta que muda sua compra.
C-M06|09/11|C|02/11|03/11|04/11|05/11|06/11||O preço da embalagem não é o custo por uso
C-M01|10/11|C|02/11|03/11|04/11|06/11|09/11||Seu skincare pode estar piorando sua pele.
R-M04|12/11|R|02/11|04/11|06/11|10/11|11/11||Você viu o antes. Viu o depois. Mas não viu tudo.
C-M07|16/11|C|09/11|10/11|11/11|12/11|13/11||Higiene da família: 3 comparações antes de comprar
R-M05|17/11|R|09/11|11/11|12/11|13/11|16/11||Magnésio e berberina viralizaram. O que os vídeos não explicam?
R-M06|19/11|R|09/11|11/11|13/11|17/11|18/11||Sorteio Minas Club: o que conferir antes do dia 22
R-M07|21/11|R|09/11|11/11|17/11|19/11|20/11||Antibiótico para gripe? Este erro ainda acontece.
C-M08|23/11|C|16/11|17/11|18/11|19/11|20/11||Black Friday: 5 perguntas antes de colocar no carrinho
C-M02|24/11|C|16/11|17/11|18/11|20/11|23/11||O desconto só é bom quando a compra faz sentido.
R-M08|26/11|R|16/11|18/11|20/11|24/11|25/11||Uma oferta boa precisa ser clara antes de parecer irresistível
C-M09|30/11|C|23/11|24/11|25/11|26/11|27/11||Comprou na Black? Agora confira validade e armazenamento
R-M09|01/12|R|23/11|25/11|26/11|27/11|30/11||Creatina está em todo lugar. Mas ela é para todo mundo?
R-M10|03/12|R|23/11|25/11|27/11|01/12|02/12||Sua pele precisa mesmo de tudo que o TikTok recomenda?
R-M11|05/12|R|23/11|25/11|01/12|03/12|04/12||Melatonina viralizou. Suplemento não é tratamento para insônia.
C-M10|07/12|C|30/11|01/12|02/12|03/12|04/12||Calor e produtos de cuidado: você guarda tudo no lugar certo?
R-M12|08/12|R|30/11|02/12|03/12|04/12|07/12||Minas Club: entenda os benefícios antes de se cadastrar
R-M13|10/12|R|30/11|02/12|04/12|08/12|09/12||A trend anti-protetor solar pode custar caro.
C-M11|14/12|C|07/12|08/12|09/12|10/12|11/12||Protetor solar: 4 informações que o FPS não conta sozinho
C-M03|15/12|C|07/12|08/12|09/12|11/12|14/12||5 frases sobre sol que você precisa parar de acreditar.
R-M14|17/12|R|07/12|09/12|11/12|15/12|16/12||Dia 22 está chegando: entenda o sorteio do Minas Club.
R-M15|19/12|R|07/12|09/12|15/12|17/12|18/12||A ressaca não se resolve com receita da internet.
C-M12|21/12|C|14/12|15/12|16/12|17/12|18/12||Férias com crianças: o checklist que evita improviso
R-M16|22/12|R|14/12|16/12|17/12|18/12|21/12||Repelente e protetor: o detalhe que muita gente erra.
R-M17|24/12|R|14/12|16/12|18/12|22/12|23/12||Sua mala das férias tem uma farmácia improvisada?
C-M13|28/12|C|21/12|22/12|23/12|24/12|25/12||Janeiro sem correria: organize suas compras recorrentes
C-M04|29/12|C|21/12|22/12|23/12|25/12|28/12||O que você precisa retirar do armário de remédios antes de 2027.
R-M18|31/12|R|21/12|23/12|25/12|29/12|30/12||Promessas milagrosas não cabem no cuidado de 2027.
CF-01|03/11|C|26/10|27/10|28/10|30/10|02/11|prop|A folha do café mudou. Você sabe o que observar antes de concluir?
CF-02|06/11|R|26/10|30/10|02/11|04/11|05/11|prop|A lavoura não perde resultado de uma vez. Ela começa dando sinais.
CF-03|10/11|C|02/11|03/11|04/11|06/11|09/11|prop|Análise de solo não é uma receita pronta.
CF-04|13/11|R|02/11|06/11|09/11|11/11|12/11|prop|Vai investir em adubação sem saber o que o solo precisa?
CF-05|17/11|C|09/11|10/11|11/11|13/11|16/11|prop|Café: sintoma não é diagnóstico.
CF-06|20/11|R|09/11|13/11|16/11|18/11|19/11|prop|Uma mancha no café. Você trataria sem saber a causa?
CF-07|24/11|C|16/11|17/11|18/11|20/11|23/11|prop|Adubação sem histórico pode deixar decisões importantes de fora.
CF-08|27/11|R|16/11|20/11|23/11|25/11|26/11|prop|Uma visita técnica precisa entregar mais que uma conversa.
CF-09|01/12|C|23/11|24/11|25/11|27/11|30/11|prop|Como organizar o histórico de talhões para decidir melhor
CF-10|04/12|R|23/11|27/11|30/11|02/12|03/12|prop|Todo ano você começa do zero na mesma lavoura?
CF-11|08/12|C|30/11|01/12|02/12|04/12|07/12|prop|Manchas no cafeeiro: uma foto sozinha não fecha diagnóstico
CF-12|11/12|R|30/11|04/12|07/12|09/12|10/12|prop|Encontrou uma praga no café. Vai agir no escuro?
CF-13|15/12|C|07/12|08/12|09/12|11/12|14/12|prop|O manejo começa pela leitura correta dos dados.
CF-14|18/12|R|07/12|11/12|14/12|16/12|17/12|prop|Seu laudo de solo chegou. Mas quem vai transformar isso em decisão?
CF-15|22/12|C|14/12|15/12|16/12|18/12|21/12|prop|O que revisar na propriedade antes do recesso de fim de ano
CF-16|25/12|R|14/12|18/12|21/12|23/12|24/12|prop|2027 não deveria começar com os mesmos erros de 2026.
CF-17|29/12|C|21/12|22/12|23/12|25/12|28/12|prop|2027: três informações que o produtor precisa organizar agora
N7-01|03/11|C|26/10|27/10|28/10|30/10|02/11||Seu feed não precisa de mais posts. Precisa de uma direção.
N7-02|05/11|R|26/10|30/10|02/11|03/11|04/11||Você vê um post. Eu vejo seis decisões.
N7-03|07/11|C|26/10|27/10|03/11|05/11|06/11||Como estruturamos um conteúdo farmacêutico antes de gravar
N7-04|10/11|C|02/11|03/11|04/11|06/11|09/11||O problema não é postar pouco. É não saber o que cada post deve fazer.
N7-05|12/11|R|02/11|06/11|09/11|10/11|11/11||Uma farmácia não precisa dançar para gerar atenção.
N7-06|14/11|C|02/11|03/11|10/11|12/11|13/11||Campo Forte: como tirar o agro do visual genérico.
N7-07|17/11|C|09/11|10/11|11/11|13/11|16/11||Arte bonita sem mensagem clara é só decoração.
N7-08|19/11|R|09/11|13/11|16/11|17/11|18/11||Duas farmácias. Duas identidades. Uma regra: não copiar.
N7-09|21/11|C|09/11|10/11|17/11|19/11|20/11||Farma Club: as decisões por trás da identidade visual
N7-10|24/11|C|16/11|17/11|18/11|20/11|23/11||Black Friday sem estratégia é só um monte de etiquetas.
N7-11|26/11|R|16/11|20/11|23/11|24/11|25/11||O desconto não salva um encarte que ninguém entende.
N7-12|28/11|C|16/11|17/11|24/11|26/11|27/11||6 produtos. 1 olhar. O desafio de um encarte eficaz.
N7-13|01/12|C|23/11|24/11|25/11|27/11|30/11||Se sua ideia precisa de um parágrafo para ser entendida, o gancho falhou.
N7-14|03/12|R|23/11|27/11|30/11|01/12|02/12||Um Reels de saúde não termina no corte. Termina na revisão.
N7-15|05/12|C|23/11|24/11|01/12|03/12|04/12||Uma ida ao campo pode render cinco conteúdos — sem inventar nada.
N7-16|08/12|C|30/11|01/12|02/12|04/12|07/12||A gravação de hoje precisa servir à publicação da semana que vem.
N7-17|10/12|R|30/11|04/12|07/12|08/12|09/12||A câmera não é a primeira etapa de um Reels.
N7-18|12/12|C|30/11|01/12|08/12|10/12|11/12||Não é repetir a campanha. É manter uma marca reconhecível.
N7-19|15/12|C|07/12|08/12|09/12|11/12|14/12||Três erros que fazem o usuário abandonar seu carrossel.
N7-20|17/12|R|07/12|11/12|14/12|15/12|16/12||Antes do motion, existe uma pergunta: o que o olho deve ler?
N7-21|19/12|C|07/12|08/12|15/12|17/12|18/12||Uma identidade consistente não precisa repetir a mesma arte.
N7-22|22/12|C|14/12|15/12|16/12|18/12|21/12||O conteúdo do feriado começa na semana anterior.
N7-23|24/12|R|14/12|18/12|21/12|22/12|23/12||Marketing também é saber o que não publicar.
N7-24|26/12|C|14/12|15/12|22/12|24/12|25/12||2026 em projetos: decisões, processos e aprendizados.
N7-25|29/12|C|21/12|22/12|23/12|25/12|28/12||Três criativos. Três decisões. Uma lição: contexto.
N7-26|31/12|R|21/12|25/12|28/12|29/12|30/12||Em 2027, publicar mais não será o meu objetivo.`;

  /* notas da Central para pautas específicas */
  const NOTES = {
    "C-F01": "Publicado em 03/11 às 17h25 (Meta Business Suite).",
    "C-F18": "Publicado em 05/11 às 11h37, confirmado na Meta.",
    "R-F12": "Postado em 06/11 pela manhã, confirmado pelo responsável.",
    "R-F13": "Publicado. Legenda chama protetor solar de remédio: revisar.",
    "C-F19": "3 artes prontas em 10/11. Repete pauta de posts anteriores do Farma Club; não publicar sem decisão editorial.",
    "R-F03": "4 artes entregues em 14/11. Falta revisão farmacêutica e aprovação da copy. Não agendado.",
    "C-M14": "Agendado para 03/11 às 12h. Aprovação farmacêutica não confirmada.",
    "C-M15": "Visto publicado no perfil em 10/11; 05/11 17h30 era a janela planejada.",
    "R-M19": "Publicado. Falta localizar o arquivo final no Drive.",
    "R-M20": "Publicado. Falta localizar o arquivo final no Drive.",
    "R-M04": "Canetas GLP-1: educativo e de segurança, sem promover produto com receita.",
    "R-M05": "Não alegar tratamento de resistência insulínica por suplemento.",
    "R-M11": "Melatonina é suplemento no Brasil, não medicamento para insônia.",
    "R-F02": "Validar visual do site real e ocultar dados pessoais.",
    "R-F07": "Validar visual do site real e ocultar dados pessoais.",
    "C-F04": "Genéricos: equivalência e orientação profissional.",
    "R-M03": "Genéricos: equivalência e orientação profissional."
  };

  const DOC = {
    F: { R: "https://docs.google.com/document/d/1B-j4d6A0EqCMUiCrDaYkiXtA3FD-lsYgkYawc6L8NAY/edit", C: "https://docs.google.com/document/d/1PORQ1-2o-pQ5hM0KnZREGpg-78dSuPG-hvC9svUGleE/edit" },
    M: { R: "https://docs.google.com/document/d/1_6xeWfQ4Axr2asWy8BodZe87I7hw8IRiws0GSYZccpo/edit", C: "https://docs.google.com/document/d/182Zxju54AEBmIjmk5eejOI9W9eGNR7aFIAuyiStKE2c/edit" },
    C: { R: "https://docs.google.com/document/d/1Z70eHTcEu3T6pwM1YnCpj03yqRE8HGLcDvUyj0G05rA/edit", C: "https://docs.google.com/document/d/1mTh_Rjq9zhABGB2pUvdQhTwMY6lzwFtqPXsM0V5VSxo/edit" },
    N: { R: "https://docs.google.com/document/d/1dNiSnTMFkvpyZ0LB90_Cd4xWDf1iqleOXwZYIeskJ4g/edit", C: "https://docs.google.com/document/d/1l8XfzHhrMRdNb6YwkEMp82rmcLrYDpXGdWujnnjluak/edit" }
  };

  const iso = (dm, y) => { if (!dm) return null; const [d, m] = dm.split("/"); return `${y || (Number(m) >= 10 ? 2026 : 2026)}-${m}-${d}`; };
  const brandOf = c => c.startsWith("CF") ? "C" : c.startsWith("N7") ? "N" : c.charAt(2);
  const PLAN = PLAN_RAW.trim().split("\n").map(line => {
    const [code, pub, f, rot, grav, edit, apr, ag, status, title] = line.split("|");
    const b = brandOf(code);
    return {
      code, b, title, format: f === "R" ? "Reels" : "Carrossel",
      date: iso(pub), steps: { roteiro: iso(rot), gravar: iso(grav), editar: iso(edit), aprovar: iso(apr), agendar: iso(ag) },
      status: status || "plan", note: NOTES[code] || "", doc: DOC[b][f]
    };
  });

  const ROUTINE = [
    ["Segunda", "Revisar pendências, aprovar roteiros da próxima semana e montar carrosséis."],
    ["Terça", "Fechar roteiros e ordem de captação; conferir campanhas e identidade."],
    ["Quarta", "Gravações da Minas Farma para a semana seguinte."],
    ["Quinta", "Gravações da Farma e Farma para a semana seguinte."],
    ["Sexta", "Gravações Nova7 e Campo Forte, conforme deslocamento e autorizações."]
  ];

  return { TODAY, CENTRAL, CLIENTS, WINDOWS, WEEKLY, FAIR, MINAS_AUG, FARMA_DAILY, FARMA_BASKET, FB_DAILY, FINDINGS, ALERTS, IG_POSTS, PLAN, ROUTINE };
})();
