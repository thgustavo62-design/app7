/* Comercial: análise da ficha de um cliente novo (serviços recomendados, posicionamento sugerido, prioridade comercial), análise da carteira atual
   e gerador de contrato a partir dos serviços. Funções puras, testadas em Node. Tudo por regras explícitas (nenhuma IA): o posicionamento é um
   RASCUNHO montado com o que a ficha informa e com o conhecimento por setor do Playbook; o contrato é uma MINUTA de apoio, que deve ser revisada
   por um advogado antes de assinar. */
(function (root) {
  const SV = root.N7Services || { SERVICES: {}, ORDER: [], SECTORS: {} };
  const PB = root.N7_PLAYBOOK || { sectors: {}, checks: {} };

  const OBJETIVOS = { vender_mais: "Vender mais", captar_leads: "Captar contatos (leads)", ser_referencia: "Ser referência na área", ganhar_presenca: "Ganhar presença nas redes", promocoes_varejo: "Promoções e preços no varejo", reativar_clientes: "Reativar clientes antigos" };
  const PORTES = { pessoa: "Pessoa física / profissional", mei: "MEI", micro: "Microempresa", pequena: "Pequena empresa", media: "Média empresa", grande: "Grande empresa" };
  const ETAPAS = { novo: "Novo", contato: "Em contato", reuniao: "Reunião", proposta: "Proposta enviada", fechado: "Fechado", perdido: "Perdido" };
  const REGULADOS = ["saude", "contabilidade", "agro"];
  const BRL = v => (v == null || v === "" || !isFinite(Number(v)) ? "R$ 0,00" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const has = (s, k) => !!String(s || "").trim() && String(s).toLowerCase().includes(k);

  /* ---------- ficha: completude ---------- */
  const CAMPOS = [["nome", "Nome"], ["setor", "Setor"], ["segmento", "Segmento"], ["cidade", "Cidade"], ["objetivo", "Objetivo principal"], ["publico", "Público-alvo"], ["diferenciais", "Diferenciais"], ["concorrentes", "Concorrentes"], ["canais", "Canais atuais"], ["dor", "Dor principal"], ["prazo", "Prazo desejado"]];
  /* Ficha ampliada: o tipo de negócio escolhe quais perguntas aparecem. [chave, pergunta] */
  const TIPOS = { loja_fisica: "Loja ou comércio de rua", servico_local: "Prestador de serviço local (clínica, escritório, oficina)", profissional: "Profissional liberal ou autoridade pessoal", online: "Loja online ou e-commerce", b2b: "Empresa que vende para empresas (B2B, indústria)", misto: "Físico e online" };
  const FISICOS = ["loja_fisica", "servico_local", "misto"];
  const F_COMUNS = [["proposta_atual", "Como ele se apresenta hoje (uma frase)"], ["tom_desejado", "Tom de voz que ele quer"], ["nao_quer", "O que ele NÃO quer ser ou parecer"], ["prova_social", "Provas: avaliações, depoimentos, prêmios, número de clientes"], ["sazonalidade", "Datas e épocas fortes do negócio"], ["presenca", "Presença digital hoje (Google Meu Negócio, WhatsApp Business, site, anúncios)"], ["instagram", "Instagram (@)"], ["site", "Site ou link principal"], ["ticket_medio", "Ticket médio (R$)"]];
  const F_TIPO = {
    loja_fisica: [["carro_chefe", "Produtos carro-chefe"], ["horario", "Horário de funcionamento"], ["fluxo", "Movimento: rua, shopping, estacionamento, ponto de referência"], ["delivery", "Faz entrega? Como?"], ["concorrente_proximo", "Concorrente mais próximo (e a distância)"]],
    servico_local: [["servicos_principais", "Serviços principais"], ["agendamento", "Como o cliente agenda"], ["horario", "Horário de atendimento"], ["convenios", "Convênios e formas de pagamento"], ["diferencial_tecnico", "Diferencial técnico ou equipamento"]],
    profissional: [["especialidade", "Especialidade"], ["credenciais", "Formação e registros (CRM, OAB, CRC...)"], ["onde_lembrado", "Onde quer ser lembrado ou convidado"]],
    online: [["carro_chefe", "Produtos carro-chefe"], ["plataforma", "Plataforma (loja própria, marketplace)"], ["logistica", "Entrega e prazo"], ["recompra", "Frequência de recompra"]],
    b2b: [["carro_chefe", "O que vende"], ["decisor", "Quem decide a compra"], ["ciclo", "Ciclo de venda (dias)"], ["cases", "Clientes de referência"]],
    misto: [["carro_chefe", "Produtos carro-chefe"], ["horario", "Horário da loja física"], ["delivery", "Faz entrega? Como?"], ["plataforma", "Plataforma online"]]
  };
  const camposDoTipo = t => F_COMUNS.concat(F_TIPO[t] || []).filter((c, i, a) => a.findIndex(x => x[0] === c[0]) === i);
  const FICHA_KEYS = [...new Set(F_COMUNS.concat(...Object.values(F_TIPO)).map(c => c[0]))];
  const fx = (f, k) => String(((f && f.ficha) || {})[k] || "").trim();
  const temPonto = f => !!f && f.lat !== "" && f.lat != null && f.lng !== "" && f.lng != null && isFinite(Number(f.lat)) && isFinite(Number(f.lng));
  function completude(f) {
    f = f || {};
    const faltam = CAMPOS.filter(([k]) => !String(f[k] || "").trim()).map(([, n]) => n);
    if (!(f.servicos || []).length) faltam.push("Serviços de interesse");
    let total = CAMPOS.length + 2;
    if (!f.tipo_negocio) faltam.push("Tipo de negócio");
    else {
      total += 3;
      if (!fx(f, "proposta_atual")) faltam.push("Como ele se apresenta hoje"); if (!fx(f, "prova_social")) faltam.push("Provas (avaliações, depoimentos)"); if (!fx(f, "presenca")) faltam.push("Presença digital hoje");
      if (FISICOS.includes(f.tipo_negocio)) { total += 1; if (!temPonto(f)) faltam.push("Ponto no mapa"); }
    }
    return { pct: Math.max(0, Math.round((total - faltam.length) / total * 100)), faltam };
  }

  /* ---------- serviços recomendados ---------- */
  function recomendar(f) {
    const w = {}, why = {};
    const add = (s, p, m) => { w[s] = (w[s] || 0) + p; (why[s] = why[s] || []).push(m); };
    const obj = f && f.objetivo, setor = f && f.setor;
    if (obj === "vender_mais" || obj === "captar_leads") { add("trafego", 3, "mídia paga com custo por resultado medido leva a oferta a quem ainda não conhece"); add("redes", 2, "as redes sustentam a confiança de quem clica no anúncio"); add("criativos", 1, "peças novas evitam o desgaste do anúncio"); }
    if (obj === "ser_referencia") { add("autoridade", 3, "reputação se mede por regularidade, engajamento qualificado e convites"); add("redes", 2, "conteúdo constante é a base da referência"); }
    if (obj === "ganhar_presenca") { add("redes", 3, "calendário editorial e rotina de publicação"); add("criativos", 2, "identidade visual consistente"); }
    if (obj === "promocoes_varejo") { add("varejo", 3, "acompanhar vendas por semana mostra o que a promoção move"); add("promocoes", 3, "estoque e giro definem o que entra em promoção e a que preço"); add("redes", 1, "divulgação das ofertas"); add("trafego", 1, "impulsiona as campanhas de oferta"); }
    if (obj === "reativar_clientes") { add("redes", 2, "relacionamento com a base"); add("trafego", 2, "reimpacto de quem já comprou"); add("criativos", 1, "peças de retorno"); }
    if (setor === "contabilidade" || setor === "executivo") add("autoridade", 2, "no setor, a decisão de contratar vem da confiança técnica");
    if (setor === "agro") add("redes", 1, "conteúdo técnico de campo");
    if ((setor === "saude" || setor === "varejo") && (obj === "promocoes_varejo" || has(f.canais, "loja"))) add("promocoes", 1, "varejo físico com estoque e preço para decidir");
    const interesse = new Set((f && f.servicos) || []);
    interesse.forEach(s => add(s, 1, "o cliente pediu este serviço"));
    return Object.keys(w).sort((a, b) => w[b] - w[a]).map(s => ({ servico: s, peso: w[s], interesse: interesse.has(s), motivos: why[s] }));
  }

  /* ---------- posicionamento sugerido (rascunho) ---------- */
  const TOM = { saude: "acolhedor, técnico e responsável, sem alegação de cura nem incentivo à automedicação", agro: "direto, prático e técnico, de quem conhece a lavoura", contabilidade: "claro, sóbrio e didático, sem promessa de resultado", executivo: "opinativo com base em dado, em primeira pessoa e profissional", varejo: "próximo, objetivo, com oferta e prazo claros", agencia: "criativo e seguro do que entrega", outro: "próximo, claro e honesto" };
  const PILARES = {
    saude: ["Educação e cuidado (revisado pelo responsável técnico)", "Bastidor e equipe real", "Oferta e fidelidade, sem apelo à automedicação", "Prova social e avaliações"],
    agro: ["Manejo por fase da cultura", "Campo real: antes e depois documentado", "O técnico explica na lavoura", "Conta de custo e retorno"],
    contabilidade: ["Explico a regra, com fonte e data", "O que muda para o seu tipo de empresa", "Dúvidas reais, sem caso identificável", "Calendário de obrigações"],
    executivo: ["Ponto de vista com dado", "Bastidor de decisão, sem expor terceiros", "Análise de mudança tributária ou comercial", "Série semanal com tema fixo"],
    varejo: ["Oferta clara e prazo", "Produto em uso", "Bastidor da loja", "Cliente real"],
    outro: ["Educação sobre o problema do cliente", "Prova: casos e depoimentos autorizados", "Bastidor e equipe", "Oferta e chamada para ação"]
  };
  const KPI = { redes: "publicações por semana, alcance e engajamento qualificado (comentários, compartilhamentos e salvamentos)", trafego: "custo por resultado, frequência e alcance", criativos: "peças entregues no prazo e aprovadas de primeira", varejo: "vendas da semana nos mesmos dias, ticket e itens por cupom", autoridade: "publicações contra a meta, engajamento qualificado e convites ou reuniões", promocoes: "margem incremental e giro dos itens em promoção" };

  function posicionamento(f) {
    f = f || {};
    const setor = PB.sectors && PB.sectors[f.setor] ? f.setor : (f.setor === "varejo" ? "varejo" : "outro");
    const sec = (PB.sectors && PB.sectors[f.setor]) || null, rec = recomendar(f).filter(r => r.peso >= 2 || r.interesse);
    const dif = String(f.diferenciais || "").split(/[;\n]|\.\s/).map(x => x.trim()).filter(Boolean);
    const publico = String(f.publico || "").trim() || "[defina o público na ficha]";
    const proposta = `Para ${publico}, ${f.nome || "[nome]"} é ${String(f.segmento || "uma marca").trim()}${f.cidade ? " de " + f.cidade : ""} que se diferencia por ${dif[0] || "[informe o principal diferencial na ficha]"}${f.concorrentes ? `, em vez de ser só mais uma opção entre ${f.concorrentes}` : ""}.`;
    const canais = sec ? sec.channels.slice() : ["Instagram", "WhatsApp", "Google Meu Negócio"];
    const alertas = [];
    const orc = Number(f.orcamento_midia);
    const querMidia = rec.some(r => r.servico === "trafego");
    if (querMidia && !(orc > 0)) alertas.push({ nivel: "atencao", texto: "Tráfego pago recomendado, mas a verba de mídia não foi informada. Sem verba definida não dá para prometer alcance nem resultado." });
    else if (querMidia && orc < 500) alertas.push({ nivel: "atencao", texto: `Verba de mídia de ${BRL(orc)} por mês é baixa: o alcance é limitado. Comece com um objetivo só e um público estreito, e não prometa volume.` });
    if (["vender_mais", "captar_leads"].includes(f.objetivo) && !has(f.canais, "whats") && !has(f.canais, "site") && !has(f.canais, "loja")) alertas.push({ nivel: "atencao", texto: "O objetivo é vender ou captar contatos, mas a ficha não diz para onde o cliente vai depois de ver o conteúdo (WhatsApp, site ou loja). Defina o destino antes de investir." });
    if (!dif.length) alertas.push({ nivel: "atencao", texto: "Sem diferenciais informados, o posicionamento fica genérico. Pergunte ao cliente por que alguém deve escolhê-lo e não ao concorrente." });
    if (!String(f.concorrentes || "").trim()) alertas.push({ nivel: "info", texto: "Concorrentes não informados: sem eles não há como comparar preço, tom e frequência de publicação." });
    if (REGULADOS.includes(f.setor)) alertas.push({ nivel: "regulado", texto: "Setor com regras próprias de publicidade: combine desde o início quem faz a revisão técnica e em quantos dias, porque ela entra no prazo de toda peça." });
    if (f.objetivo === "ser_referencia" && !rec.some(r => r.servico === "autoridade")) alertas.push({ nivel: "info", texto: "Referência na área pede o serviço de Autoridade e posicionamento, que acompanha ritmo, engajamento qualificado e convites." });
    /* ficha ampliada: tipo de negócio, território, provas e presença digital */
    const tipo = f.tipo_negocio || "", fisico = FISICOS.includes(tipo), territorio = [], canaisTipo = [], pilarTipo = [];
    if (temPonto(f)) territorio.push(`Ponto marcado no mapa${f.bairro ? ` no bairro ${f.bairro}` : ""}${f.cidade ? `, em ${f.cidade}` : ""}.`);
    if (f.raio_km !== "" && f.raio_km != null && Number(f.raio_km) > 0) territorio.push(`Atende num raio de ${Number(f.raio_km)} km: limite o público dos anúncios e os conteúdos locais a essa área, para a verba não comprar gente que não consegue comprar.`);
    if (fisico) { canaisTipo.push("Google Meu Negócio (mapa, avaliações, horário e fotos): é a primeira vitrine de quem procura perto"); pilarTipo.push(tipo === "servico_local" ? "O atendimento passo a passo, do agendamento ao resultado" : "O lugar: fachada, vitrine, como chegar e onde estacionar"); }
    if (tipo === "online" || tipo === "misto") { canaisTipo.push("Catálogo e WhatsApp com link direto de compra"); pilarTipo.push("Produto em uso, prazo de entrega e política de troca"); }
    if (tipo === "profissional") { canaisTipo.push("Instagram e LinkedIn com ponto de vista próprio"); pilarTipo.push("Ponto de vista e casos reais, sem expor terceiros"); }
    if (tipo === "b2b") { canaisTipo.push("LinkedIn e e-mail para quem decide a compra"); pilarTipo.push("Casos com número e o processo de entrega"); }
    canaisTipo.forEach(c => { if (!canais.some(x => x.toLowerCase().includes(c.slice(0, 12).toLowerCase()))) canais.unshift(c); });
    if (fisico && !temPonto(f)) alertas.push({ nivel: "atencao", texto: "Negócio com endereço físico sem ponto no mapa: marque o local na ficha. Anúncio e conteúdo locais dependem de saber onde o cliente está." });
    if (tipo && !fx(f, "prova_social")) alertas.push({ nivel: "info", texto: "Sem provas coletadas (avaliações, depoimentos, prêmios, número de clientes). Combine desde já como o cliente vai juntar e autorizar o uso delas." });
    if (fisico && fx(f, "presenca") && !has(fx(f, "presenca"), "google")) alertas.push({ nivel: "atencao", texto: "A presença digital informada não cita o Google Meu Negócio. Para quem vende perto, é o primeiro lugar onde o cliente decide: confira se o perfil existe e está completo." });
    if (["vender_mais", "captar_leads"].includes(f.objetivo) && tipo && !fx(f, "ticket_medio")) alertas.push({ nivel: "info", texto: "Ticket médio não informado: sem ele não há como estimar quantas vendas pagam a verba de mídia." });
    const nao = fx(f, "nao_quer"), tomDesejado = fx(f, "tom_desejado"), tomSetor = TOM[f.setor] || TOM[setor] || TOM.outro;
    const cuidadosBase = PB.checks && PB.checks[f.setor] ? PB.checks[f.setor].slice() : ["Autorização por escrito para uso de imagem, depoimentos e marca", "Informações que podem ser comprovadas", "Dados pessoais de terceiros ocultos (LGPD)"];
    if (nao) cuidadosBase.unshift(`Evitar, a pedido do cliente: ${nao}`);
    const sazon = fx(f, "sazonalidade") ? [`Do cliente: ${fx(f, "sazonalidade")}`].concat(sec ? sec.seasons : []) : (sec ? sec.seasons.slice() : []);
    const plano = [`Semana 1: diagnóstico dos perfis e dos concorrentes${sec ? " e leitura da realidade do setor" : ""}; combinar acessos e quem aprova.`, "Semana 2: linha editorial, identidade e os pilares de conteúdo acima; definir horários fixos.", "Semana 3: calendário do mês e primeiras peças em aprovação.", `Semana 4: publicação e primeira medição (${rec.length ? rec.map(r => SV.SERVICES[r.servico] ? SV.SERVICES[r.servico].short.toLowerCase() : r.servico).join(", ") : "indicadores combinados"}), com a primeira reunião de resultados.`];
    return {
      setor, tipo, proposta, partida: fx(f, "proposta_atual"), tomPedido: tomDesejado, tomSetor, tom: tomDesejado ? `${tomDesejado} (o que o cliente pediu). Base do setor: ${tomSetor}` : tomSetor, territorio, pilares: pilarTipo.concat(PILARES[f.setor] || PILARES.outro), canais, formatos: sec ? sec.formats.slice() : [], sazonalidade: sazon,
      armadilhas: sec ? sec.pitfalls.slice() : [], cuidados: cuidadosBase,
      servicos: rec, indicadores: rec.map(r => ({ servico: r.servico, kpi: KPI[r.servico] || "" })).filter(x => x.kpi), plano30: plano, alertas, funil: sec ? sec.funnel : ""
    };
  }

  /* ---------- prioridade comercial do prospect ---------- */
  function fit(f) {
    f = f || {}; const c = completude(f), rec = recomendar(f), motivos = [];
    let s = Math.round(c.pct * 0.3);
    if (PB.sectors && PB.sectors[f.setor]) { s += 20; motivos.push("a agência já conhece o setor (Playbook)"); } else if (f.setor) { s += 8; motivos.push("setor sem Playbook próprio: exige mais pesquisa"); }
    const interesse = (f.servicos || []).filter(x => rec.some(r => r.servico === x));
    if ((f.servicos || []).length && interesse.length) { s += 20; motivos.push("o que o cliente pede bate com o que o objetivo dele exige"); } else if ((f.servicos || []).length) { s += 8; motivos.push("os serviços pedidos não batem com o objetivo: alinhar na reunião"); }
    const orc = Number(f.orcamento_midia), querMidia = rec.some(r => r.servico === "trafego");
    if (querMidia) { s += orc >= 1000 ? 15 : orc >= 500 ? 10 : orc > 0 ? 4 : 0; motivos.push(orc >= 1000 ? "verba de mídia adequada" : orc > 0 ? "verba de mídia limitada" : "verba de mídia não informada"); } else s += 10;
    if (String(f.dor || "").trim()) { s += 10; motivos.push("a dor principal está clara"); }
    if (String(f.prazo || "").trim()) s += 5;
    s = Math.min(100, s);
    return { score: s, nivel: s >= 70 ? "alta" : s >= 45 ? "media" : "baixa", motivos, completude: c };
  }

  /* ---------- carteira ---------- */
  const valorContrato = c => Object.values((c && c.valores) || {}).reduce((t, v) => t + (Number(v) || 0), 0);
  function carteira({ clients = [], contracts = [], saude = {} } = {}) {
    const linhas = clients.map(c => {
      const servicos = c.services || [], sd = saude[c.key], ct = contracts.filter(x => x.cliente_tipo === "cliente" && x.cliente_ref === c.key && x.status !== "encerrado").sort((a, b) => (b.atualizado_em || "").localeCompare(a.atualizado_em || ""))[0] || null;
      const op = [], at = [], tem = s => servicos.includes(s);
      if (tem("redes") && !tem("trafego") && !(sd != null && sd < 50)) op.push({ servico: "trafego", motivo: "o orgânico já roda: mídia paga amplia o alcance com custo por resultado medido" });
      if (tem("trafego") && !tem("criativos") && !tem("redes")) op.push({ servico: "criativos", motivo: "anúncio sem peças novas desgasta (frequência alta e custo subindo)" });
      if (tem("varejo") && !tem("promocoes") && ["saude", "varejo"].includes(c.setor)) op.push({ servico: "promocoes", motivo: "já acompanha vendas: a central de promoções usa estoque e giro para decidir preço e campanha" });
      if (["contabilidade", "executivo"].includes(c.setor) && !tem("autoridade")) op.push({ servico: "autoridade", motivo: "no setor, reputação e convites são o resultado que importa" });
      if (sd != null && sd < 50) at.push(`nota de saúde baixa (${sd}/100): resolver antes de vender mais`);
      if (!ct) at.push("sem contrato registrado no sistema"); else if (ct.status !== "assinado") at.push(`contrato ${ct.status === "enviado" ? "enviado" : "em rascunho"}, ainda não assinado`);
      return { key: c.key, nome: c.name, setor: c.setor || "", servicos, saude: sd == null ? null : sd, contrato: ct ? { id: ct.id, status: ct.status, valor: valorContrato(ct) } : null, oportunidades: op, atencao: at };
    });
    const porSetor = {}; linhas.forEach(l => { const k = l.setor || "outro"; porSetor[k] = (porSetor[k] || 0) + 1; });
    const cobertura = {}; (SV.ORDER || []).forEach(s => { cobertura[s] = linhas.filter(l => l.servicos.includes(s)).length; });
    const mrr = contracts.filter(x => x.cliente_tipo === "cliente" && x.status === "assinado").reduce((t, x) => t + valorContrato(x), 0);
    return { linhas, resumo: { clientes: linhas.length, porSetor, cobertura, mrr, semContrato: linhas.filter(l => !l.contrato).length, oportunidades: linhas.reduce((t, l) => t + l.oportunidades.length, 0), emRisco: linhas.filter(l => l.saude != null && l.saude < 50).length } };
  }

  /* ---------- funil de vendas ---------- */
  /* Chance de fechar por etapa: ponto de partida comum em CRMs, NÃO medido. Ajuste conforme o histórico real da agência. */
  const PROB = { novo: 10, contato: 20, reuniao: 40, proposta: 60, fechado: 100, perdido: 0 };
  const MOTIVOS = ["Preço", "Parou de responder", "Escolheu outra agência", "Sem verba agora", "Momento errado", "Fora do nosso perfil", "Outro"];
  const ATIVIDADES = { ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail", reuniao: "Reunião", nota: "Nota", etapa: "Mudança de etapa" };
  const ABERTAS = ["novo", "contato", "reuniao", "proposta"];
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const diasEntre = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  const valorOk = p => p.valor_estimado !== "" && p.valor_estimado != null && isFinite(Number(p.valor_estimado)) && Number(p.valor_estimado) > 0;
  const ultimoContato = p => (p.atividades || []).filter(a => a.tipo !== "etapa").map(a => a.em).sort().pop() || "";
  const motivoBase = m => String(m || "").split(":")[0].trim() || "Sem motivo registrado";
  /* Resumo do funil. Valor que falta fica de fora e é contado à parte (nunca vira zero); taxa de fechamento só com amostra mínima. */
  function funil(pros, hoje = hojeIso()) {
    const lista = pros || [], colunas = {};
    Object.keys(ETAPAS).forEach(e => { const l = lista.filter(p => p.etapa === e); colunas[e] = { n: l.length, valor: l.filter(valorOk).reduce((t, p) => t + Number(p.valor_estimado), 0), semValor: l.filter(p => !valorOk(p)).length }; });
    const abertas = lista.filter(p => ABERTAS.includes(p.etapa)), comValor = abertas.filter(valorOk);
    const atrasados = abertas.filter(p => p.proximo_contato && p.proximo_contato < hoje).map(p => ({ id: p.id, nome: p.nome, dias: diasEntre(p.proximo_contato, hoje), responsavel: p.responsavel || "" })).sort((a, b) => b.dias - a.dias);
    const semProximo = abertas.filter(p => !p.proximo_contato).map(p => ({ id: p.id, nome: p.nome }));
    const parados = abertas.filter(p => { const u = ultimoContato(p); return u && diasEntre(u, hoje) >= 14; }).map(p => ({ id: p.id, nome: p.nome, dias: diasEntre(ultimoContato(p), hoje) }));
    const ganhos = lista.filter(p => p.etapa === "fechado").length, perdidos = lista.filter(p => p.etapa === "perdido").length, decididos = ganhos + perdidos;
    const mot = {}; lista.filter(p => p.etapa === "perdido").forEach(p => { const m = motivoBase(p.motivo); mot[m] = (mot[m] || 0) + 1; });
    const org = {}; lista.forEach(p => { const o = String(p.origem || "").trim() || "Sem origem"; (org[o] = org[o] || { origem: o, n: 0, ganhos: 0 }); org[o].n++; if (p.etapa === "fechado") org[o].ganhos++; });
    return {
      colunas,
      aberto: { n: abertas.length, valor: comValor.reduce((t, p) => t + Number(p.valor_estimado), 0), semValor: abertas.length - comValor.length, ponderado: Math.round(comValor.reduce((t, p) => t + Number(p.valor_estimado) * PROB[p.etapa] / 100, 0)) },
      atrasados, semProximo, parados,
      fechamento: { ganhos, perdidos, taxa: decididos >= 5 ? Math.round(ganhos / decididos * 100) : null, amostra: decididos },
      motivos: Object.entries(mot).sort((a, b) => b[1] - a[1]), origens: Object.values(org).sort((a, b) => b.n - a.n)
    };
  }
  /* ---------- ficha fechada vira cliente cadastrado ---------- */
  const semAcento = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slugDe = t => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const RESERVADOS = ["painel", "insights", "semana", "calendario", "fluxo", "alertas", "playbook", "config", "comercial", "cerebro", "relatorios", "promocoes", "autoridade"];
  /* Sugere os dados do cadastro a partir da ficha, sem repetir chave, endereço ou cor de quem já existe. O administrador revisa antes de criar. */
  function sugerirCliente(f, clientes = []) {
    const ks = clientes.map(c => c.key), ids = clientes.map(c => c.id).concat(RESERVADOS), cores = clientes.map(c => c.color);
    const palavras = semAcento(f.nome).toUpperCase().split(/[^A-Z0-9]+/).filter(w => w && !["E", "DE", "DA", "DO", "DAS", "DOS"].includes(w));
    let base = palavras.map(w => w[0]).join("").slice(0, 3); if (base.length < 2) base = (palavras[0] || "CLI").slice(0, 3); if (!/^[A-Z]/.test(base)) base = "C" + base;
    let chave = base, n = 2; while (ks.includes(chave)) chave = base.slice(0, 3) + n++;
    const id0 = slugDe(f.nome) || "cliente"; let id = id0, m = 2; while (ids.includes(id)) id = `${id0}-${m++}`.slice(0, 40);
    const livres = ((SV.COLORS) || ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8"]).filter(c => !cores.includes(c));
    return { chave: chave.slice(0, 4), id, nome: String(f.nome || "").trim().slice(0, 80), curto: String(f.nome || "").trim().split(/\s+/)[0].slice(0, 20), cor: livres[0] || SV.COLORS[clientes.length % SV.COLORS.length], setor: f.setor || "", segmento: String(f.segmento || "").slice(0, 80), servicos: (f.servicos || []).slice() };
  }
  /* Depois de virar cliente, os contratos da ficha passam a valer como contratos do cliente (só assim entram na receita recorrente). */
  const contratosDoCliente = (contratos, fichaId, chave) => (contratos || []).map(c => (c.cliente_tipo === "prospect" && c.cliente_ref === fichaId ? Object.assign({}, c, { cliente_tipo: "cliente", cliente_ref: chave }) : c));

  /* Lista de retornos de hoje para frente, mais urgentes primeiro (alimenta a Minha fila do responsável). */
  const retornos = (pros, hoje = hojeIso(), email = "") => (pros || []).filter(p => ABERTAS.includes(p.etapa) && p.proximo_contato && p.proximo_contato <= hoje && (!email || p.responsavel === email)).sort((a, b) => a.proximo_contato.localeCompare(b.proximo_contato));

  /* ---------- valor por extenso ---------- */
  const U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"], C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  function ate999(n) {
    if (n === 0) return ""; if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100, out = [];
    if (c) out.push(C[c]);
    if (r) out.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? " e " + U[r % 10] : ""));
    return out.join(" e ");
  }
  function inteiro(n) {
    if (n === 0) return "zero";
    const g = [], nomes = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
    let i = 0; while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); i++; }
    const partes = [];
    for (let k = g.length - 1; k >= 0; k--) {
      const v = g[k]; if (!v) continue;
      const txt = k === 1 && v === 1 ? "mil" : ate999(v) + (k ? " " + (v === 1 ? nomes[k][0] : nomes[k][1]) : "");
      partes.push({ txt, v });
    }
    return partes.map((p, idx) => (idx === 0 ? p.txt : (idx === partes.length - 1 && (p.v < 100 || p.v % 100 === 0) ? " e " : ", ") + p.txt)).join("").replace(/^, /, "");
  }
  function extenso(valor) {
    const n = Math.round(Number(valor) * 100); if (!isFinite(n) || n < 0) return "";
    const reais = Math.floor(n / 100), cent = n % 100;
    const r = reais ? `${inteiro(reais)} ${reais === 1 ? "real" : (reais % 1e6 === 0 ? "de reais" : "reais")}` : "";
    const c = cent ? `${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
    return [r, c].filter(Boolean).join(" e ") || "zero real";
  }

  /* ---------- contrato ---------- */
  const PARAMS = { redes: [["publicacoes", "Publicações por mês", 12], ["stories", "Sequências de stories por mês", 8]], trafego: [["campanhas", "Campanhas ativas, no máximo", 2], ["reunioes", "Reuniões de resultado por mês", 1]], criativos: [["pecas", "Peças por mês", 8], ["revisoes", "Rodadas de ajuste por peça", 2]], varejo: [["relatorios", "Relatórios por mês", 4]], promocoes: [["campanhas", "Campanhas de promoção por mês", 4]], autoridade: [["posts", "Publicações por mês", 8], ["artigos", "Artigos ou análises por mês", 2]] };
  function escopoPadrao(id, p = {}) {
    const v = (k, d) => (p[k] != null && p[k] !== "" ? p[k] : d);
    switch (id) {
      case "redes": return `Planejamento editorial mensal, produção e agendamento de ${v("publicacoes", 12)} publicações por mês e ${v("stories", 8)} sequências de stories, conforme calendário aprovado pela CONTRATANTE; moderação básica de comentários e mensagens no horário comercial; relatório mensal de resultados.`;
      case "trafego": return `Planejamento, criação e gestão de até ${v("campanhas", 2)} campanhas simultâneas de anúncios pagos nas plataformas da Meta, com otimização contínua, acompanhamento de custo por resultado e ${v("reunioes", 1)} reunião mensal de resultados. A verba de mídia não está incluída (cláusula própria).`;
      case "criativos": return `Criação de ${v("pecas", 8)} peças gráficas ou audiovisuais por mês, com até ${v("revisoes", 2)} rodadas de ajuste por peça, entregues em formatos para as redes sociais e arquivos abertos quando combinado.`;
      case "varejo": return `Análise comercial semanal de vendas, ticket e cestas, com comparação entre os mesmos dias da semana e ${v("relatorios", 4)} relatórios por mês com recomendações; cada unidade de loja é analisada separadamente.`;
      case "promocoes": return `Análise de estoque e giro de 60 e 90 dias e preparação de ${v("campanhas", 4)} campanhas de promoção por mês, com preço sugerido acima do piso de margem definido pela CONTRATANTE e briefing para a arte.`;
      case "autoridade": return `Planejamento e acompanhamento da presença profissional da CONTRATANTE: ${v("posts", 8)} publicações e ${v("artigos", 2)} artigos ou análises por mês, com medição de regularidade, engajamento qualificado e convites originados pelo conteúdo.`;
      default: return "";
    }
  }
  const SETOR_CLAUSULA = {
    saude: "Por se tratar de produtos e serviços de saúde, todo conteúdo técnico será revisado pelo profissional responsável indicado pela CONTRATANTE antes da publicação. As partes não divulgarão alegações terapêuticas nem incentivo à automedicação, e a divulgação de medicamentos e de ofertas seguirá a regulamentação sanitária aplicável.",
    agro: "O conteúdo técnico será revisado pelo responsável técnico indicado pela CONTRATANTE antes da publicação. Não serão feitas promessas de produtividade, rentabilidade ou controle de pragas, e as imagens usadas serão reais e autorizadas.",
    contabilidade: "A publicidade da atividade contábil observará as normas do Conselho Federal de Contabilidade e do CRC aplicáveis, com caráter informativo e moderado, sem promessa de resultado, comparação com colegas ou divulgação de preço, e com a identificação profissional exigida. A CONTRATANTE revisará o conteúdo técnico antes da publicação.",
    executivo: "O conteúdo de opinião será identificado como tal e separado de fatos e normas, com fonte e data quando houver citação de lei. Não haverá orientação para caso concreto nem divulgação de dados de terceiros, e a CONTRATANTE revisará o conteúdo antes da publicação.",
    varejo: "As ofertas divulgadas conterão preço, vigência e condições, que a CONTRATANTE confirma antes da publicação.",
    outro: ""
  };
  const hoje = () => { const d = new Date(); return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }); };
  const dataExt = iso => { if (!iso) return "____ de ________ de ______"; const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }); };

  function gerarContrato(o) {
    const ag = o.agencia || {}, ct = o.contratante || {}, cond = Object.assign({ meses: 12, vencimento: 5, reajuste: "ipca", aviso_dias: 30, multa_atraso: 2, juros: 1, prazo_aprovacao: 3, tacita: false, verba_midia: "" }, o.condicoes || {});
    const svs = (o.servicos || []).filter(s => s && s.id);
    const total = svs.reduce((t, s) => t + (Number(s.valor) || 0), 0), nome = id => (SV.SERVICES[id] ? SV.SERVICES[id].name : id);
    const CONTRATADA = ag.razao_social || "[RAZÃO SOCIAL DA CONTRATADA]", CONTRATANTE = ct.nome || "[NOME DA CONTRATANTE]";
    const reaj = { ipca: "pela variação acumulada do IPCA (IBGE) nos últimos 12 meses", igpm: "pela variação acumulada do IGP-M (FGV) nos últimos 12 meses", nenhum: null }[cond.reajuste];
    const cl = [];
    cl.push({ t: "DAS PARTES", x: [`CONTRATADA: ${CONTRATADA}${ag.nome_fantasia ? ` (nome fantasia ${ag.nome_fantasia})` : ""}, inscrita no CNPJ sob o nº ${ag.cnpj || "[CNPJ]"}, com sede em ${ag.endereco || "[endereço]"}${ag.cidade ? ", " + ag.cidade : ""}, neste ato representada por ${ag.representante || "[representante]"}${ag.cpf_representante ? `, CPF ${ag.cpf_representante}` : ""}.`, `CONTRATANTE: ${CONTRATANTE}, ${ct.doc ? `inscrita no CPF/CNPJ sob o nº ${ct.doc}` : "inscrita no CPF/CNPJ sob o nº [documento]"}, com endereço em ${ct.endereco || "[endereço]"}${ct.cidade ? ", " + ct.cidade : ""}${ct.representante ? `, neste ato representada por ${ct.representante}` : ""}.`, "As partes resolvem firmar o presente contrato de prestação de serviços, que se rege pelas cláusulas a seguir."] });
    cl.push({ t: "DO OBJETO", x: ["O objeto deste contrato é a prestação, pela CONTRATADA, dos seguintes serviços de marketing e comunicação à CONTRATANTE:", ...svs.map((s, i) => `${String.fromCharCode(97 + i)}) ${nome(s.id)}: ${s.escopo || escopoPadrao(s.id)}`)] });
    cl.push({ t: "DAS OBRIGAÇÕES DA CONTRATADA", x: ["Executar os serviços com técnica, diligência e dentro dos prazos combinados no calendário aprovado.", "Submeter à aprovação da CONTRATANTE todo conteúdo antes da publicação.", "Manter sigilo sobre as informações recebidas e prestar contas dos resultados por relatório periódico.", "Utilizar somente materiais, imagens e músicas próprios, licenciados ou autorizados."] });
    cl.push({ t: "DAS OBRIGAÇÕES DA CONTRATANTE", x: ["Fornecer, no prazo, as informações, os materiais, os acessos às contas e as aprovações necessários à execução.", "Responder pela veracidade das informações, dos preços, das condições comerciais e das alegações que fornecer para divulgação.", `Aprovar ou pedir ajuste do conteúdo em até ${cond.prazo_aprovacao} dias úteis. O atraso na aprovação ou no envio de material desloca o cronograma na mesma medida${cond.tacita ? `, e a ausência de resposta nesse prazo será considerada aprovação` : ", sem que isso seja considerado falha da CONTRATADA"}.`, "Manter, em seu nome, as contas das plataformas e os meios de pagamento da mídia."] });
    if (svs.some(s => s.id === "trafego")) cl.push({ t: "DA VERBA DE MÍDIA", x: [`A verba de anúncios é de responsabilidade da CONTRATANTE, paga diretamente às plataformas, e não integra os honorários.${cond.verba_midia ? ` A verba mensal prevista é de ${cond.verba_midia}.` : ""}`, "A CONTRATADA não responde por reprovação de anúncios, suspensão de contas ou alterações de políticas e de preços das plataformas."] });
    cl.push({ t: "DO VALOR E DO PAGAMENTO", x: [`Pelos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal total de ${BRL(total)} (${extenso(total)}), assim discriminado:`, ...svs.map(s => `- ${nome(s.id)}: ${BRL(s.valor)}${Number(s.valor) ? ` (${extenso(s.valor)})` : ""}`), `O pagamento será feito até o dia ${cond.vencimento} de cada mês${ag.pix ? `, por PIX ou transferência para ${ag.pix}` : ""}.`, `O atraso sujeita a CONTRATANTE a multa de ${cond.multa_atraso}% sobre o valor em atraso, juros de ${cond.juros}% ao mês e correção monetária, e autoriza a CONTRATADA a suspender os serviços após 10 dias de atraso.`, reaj ? `O valor será reajustado a cada 12 meses ${reaj}.` : "O valor não será reajustado durante a vigência."] });
    cl.push({ t: "DA VIGÊNCIA E DA RESCISÃO", x: [`O contrato vigora por ${cond.meses} meses, a partir de ${dataExt(cond.inicio)}, e se renova por igual período se nenhuma das partes avisar o contrário com ${cond.aviso_dias} dias de antecedência.`, `Qualquer das partes pode rescindi-lo, sem justa causa, mediante aviso prévio escrito de ${cond.aviso_dias} dias, mantidos os pagamentos até o fim do aviso e o pagamento dos serviços já executados.`, "Qualquer das partes pode rescindi-lo de imediato em caso de descumprimento grave não sanado em 10 dias após notificação."] });
    cl.push({ t: "DOS RESULTADOS", x: ["Os serviços são de meio e não de resultado. A CONTRATADA se compromete a empregar as melhores práticas, mas não garante número de vendas, de seguidores, de contatos ou de alcance, que dependem de fatores externos, como produto, preço, atendimento, concorrência e algoritmos das plataformas."] });
    cl.push({ t: "DA PROPRIEDADE INTELECTUAL E DO USO DE IMAGEM", x: ["Pagos os valores devidos, os materiais criados exclusivamente para a CONTRATANTE passam a ser de uso dela. A CONTRATADA conserva a titularidade de seus métodos, modelos e ferramentas.", "A CONTRATANTE autoriza a CONTRATADA a citar a parceria e a exibir os trabalhos em seu portfólio, salvo se informado o contrário por escrito.", "A CONTRATANTE declara ter autorização para o uso de imagens, nomes, marcas e depoimentos de terceiros que fornecer."] });
    cl.push({ t: "DA CONFIDENCIALIDADE E DA PROTEÇÃO DE DADOS", x: ["As partes manterão sigilo sobre informações confidenciais a que tiverem acesso, durante a vigência e por 2 anos após o término.", "No tratamento de dados pessoais, as partes observarão a Lei nº 13.709/2018 (LGPD). A CONTRATANTE é a controladora dos dados de seus clientes e a CONTRATADA atua como operadora, tratando os dados apenas para os fins deste contrato e adotando medidas de segurança adequadas."] });
    if (SETOR_CLAUSULA[ct.setor]) cl.push({ t: "DA CONFORMIDADE DO SETOR", x: [SETOR_CLAUSULA[ct.setor]] });
    cl.push({ t: "DAS DISPOSIÇÕES GERAIS", x: ["Alterações deste contrato só valem se feitas por escrito e assinadas pelas partes.", "Este contrato pode ser assinado de forma eletrônica, com a mesma validade da assinatura física.", `Fica eleito o foro da comarca de ${ag.foro || ag.cidade || "[cidade]"} para dirimir dúvidas deste contrato, com renúncia a qualquer outro.`] });
    const titulo = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARKETING E COMUNICAÇÃO";
    /* numera os parágrafos de cada cláusula (1.1, 1.2...), menos os itens de lista e as cláusulas de um parágrafo só */
    const ehLista = p => /^[a-z]\)|^- /.test(p);
    const numerar = (c, i) => { const n = c.x.filter(p => !ehLista(p)).length; let k = 0; return c.x.map(p => ({ p, num: ehLista(p) || n < 2 ? "" : `${i + 1}.${++k}` })); };
    const assin = [`${ag.cidade || "[Cidade]"}, ${dataExt(o.data) === "____ de ________ de ______" ? hoje() : dataExt(o.data)}.`, "", "______________________________________", `${CONTRATADA}`, ag.representante || "", "", "______________________________________", `${CONTRATANTE}`, ct.representante || "", "", "Testemunhas:", "1) ______________________________  CPF: ______________", "2) ______________________________  CPF: ______________"];
    const texto = [o.minuta === false ? "" : "MINUTA PARA REVISÃO JURÍDICA: revise com um advogado antes de assinar.", "", titulo, "", ...cl.flatMap((c, i) => [`CLÁUSULA ${i + 1}ª – ${c.t}`, ...numerar(c, i).map(({ p, num }) => (num ? num + " " : "") + p), ""]), ...assin].filter((l, i) => !(i === 0 && l === "") ).join("\n");
    const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const html = `<article class="contrato">${o.minuta === false ? "" : `<p class="minuta">MINUTA PARA REVISÃO JURÍDICA: revise com um advogado antes de assinar.</p>`}<h1>${esc(titulo)}</h1>${cl.map((c, i) => `<section><h2>CLÁUSULA ${i + 1}ª – ${esc(c.t)}</h2>${numerar(c, i).map(({ p, num }) => `<p>${num ? `<b>${num}</b> ` : ""}${esc(p)}</p>`).join("")}</section>`).join("")}<section class="assina"><p>${esc(assin[0])}</p><div class="linhas"><div><hr>${esc(CONTRATADA)}<br>${esc(ag.representante || "")}</div><div><hr>${esc(CONTRATANTE)}<br>${esc(ct.representante || "")}</div></div><p>Testemunhas:</p><p>1) ______________________________ CPF: ______________</p><p>2) ______________________________ CPF: ______________</p></section></article>`;
    return { titulo, clausulas: cl, texto, html, total };
  }

  root.N7Comercial = { TIPOS, FISICOS, F_COMUNS, F_TIPO, FICHA_KEYS, camposDoTipo, temPonto, OBJETIVOS, PORTES, ETAPAS, PROB, MOTIVOS, ATIVIDADES, ABERTAS, hojeIso, funil, retornos, sugerirCliente, contratosDoCliente, valorOk, ultimoContato, PARAMS, completude, recomendar, posicionamento, fit, carteira, valorContrato, extenso, escopoPadrao, gerarContrato, BRL };
})(typeof window !== "undefined" ? window : globalThis);
