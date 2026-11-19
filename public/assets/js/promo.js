/* Central de Promoções: motor de análise de uma loja (funções puras, testadas em Node).
   Cruza estoque e vendas diárias por código de barras e responde: o que está parado, o que gira, o que está para acabar,
   quanto dinheiro está preso em estoque e por quanto dá para vender cada item sem furar o piso de margem.
   Regras da agência: nenhuma promoção fura o piso (piso = custo ÷ (1 − margem mínima)); preço sugerido termina em ,90 e nunca fica
   abaixo do piso; sem custo não existe piso (o item é marcado, nunca "aprovado"); margem é sobre a VENDA; lojas nunca se misturam. */
(function (root) {
  const DAY = 86400000;
  const day = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
  const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
  const r2 = v => Math.round(v * 100) / 100;
  const sum = a => a.reduce((x, y) => x + y, 0);

  /* margens mínimas por tipo de campanha (aba Configurações da planilha mestre) */
  const REGRAS = {
    padrao: { id: "padrao", nome: "Campanha padrão", margemMin: 0.20, lucroFixo: 3 },
    limpeza: { id: "limpeza", nome: "Limpeza", margemMin: 0.12, lucroFixo: 3, descMax: 0.30 },
    corta: { id: "corta", nome: "Corta Preço", margemMin: 0.10, lucroFixo: 3 },
    queima: { id: "queima", nome: "Queima de estoque", margemMin: 0.05, lucroFixo: 3 }
  };
  /* desconto máximo por papel do produto (playbook) */
  const DESC_MAX = { isca: 0.40, estoque: 0.50, giro: 0.20, margem: 0.15, imagem: 0.30 };
  const PAPEL = { parado: "Parado (sem venda em 90 dias)", queima: "Estoque encalhado", isca: "Isca / chamariz", giro: "Giro", margem: "Margem", cauda: "Cauda (giro baixo)", semcusto: "Sem custo", semestoque: "Sem estoque" };

  /* terminação ,90: o menor valor que termina em ,90 e não fica abaixo de x */
  const ceil90 = x => { const n = Math.ceil(x - 0.90 - 1e-9); return r2(Math.max(0, n) + 0.90); };

  /* categoria sugerida por palavras da descrição (aproximação: a exportação do sistema não traz categoria) */
  const CATS = [
    ["Bebê", /\b(fralda|pampers|huggies|babysec|mamadeira|chupeta|lenco umed|lenço umed|pomada assadura|bebe|baby|turma da monica)\b/],
    ["Leite e fórmulas", /\b(leite|formula|ninho|nan |aptamil|nestogeno|similac|enfamil|mucilon|neston|cereal)\b/],
    ["Suplementos", /\b(whey|creatina|bcaa|proteina|vitamina|omega|colageno|polivitaminico|centrum|suplemento|pre treino|termogenico)\b/],
    ["Limpeza", /\b(sabao|amaciante|detergente|desinfetante|agua sanitaria|multiuso|lava roupa|limpador|esponja|papel higienico|papel toalha|alvejante)\b/],
    ["Perfumaria e cuidado", /\b(shampoo|condicionador|desodorante|sabonete|creme dental|escova dental|enxaguante|hidratante|protetor solar|perfume|colonia|absorvente|esmalte|maquiagem|barbear)\b/],
    ["Medicamentos e saúde", /\b(mg|mcg|comprimido|cpr|cps|capsula|xarope|gotas|pomada|gel|spray|solucao|ampola|dipirona|paracetamol|ibuprofeno|loratadina|losartana|omeprazol|dorflex|neosaldina|cataflam)\b/]
  ];
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const categoria = desc => { const t = norm(desc); const hit = CATS.find(([, re]) => re.test(t)); return hit ? hit[0] : "Outros"; };

  /* soma de uma janela de dias [ref-n+1, ref] */
  function janela(dias, ref, n) {
    const fim = day(ref), ini = fim - n + 1; let q = 0, v = 0, com = 0, ult = "";
    for (const [d, [dq, dv]] of Object.entries(dias || {})) { const x = day(d); if (x >= ini && x <= fim) { q += dq; v += dv; com++; if (d > ult) ult = d; } }
    return { q, v: r2(v), com, ult };
  }
  const ultimaVenda = dias => Object.keys(dias || {}).filter(d => (dias[d][0] || 0) > 0).sort().pop() || "";

  /* uma linha enriquecida por item */
  /* n60 e n90: dias realmente cobertos pelas vendas importadas (menos que 60 ou 90 quando o histórico é curto) */
  function enrich(it, ref, p, n60 = 60, n90 = 90) {
    const w60 = janela(it.dias, ref, 60), w90 = janela(it.dias, ref, 90);
    const rate60 = w60.q / n60, rate90 = w90.q / n90;
    const mesesEstoque = it.estoque > 0 ? (w90.q > 0 ? it.estoque / (w90.q / (n90 / 30)) : Infinity) : 0;
    const margem = it.custo > 0 && it.preco > 0 ? (it.preco - it.custo) / it.preco : null;
    const taxa = rate90 > 0 ? rate60 / rate90 : null;
    return Object.assign({}, it, {
      cat: categoria(it.desc), q60: w60.q, v60: w60.v, q90: w90.q, v90: w90.v, dias90: w90.com, ultVenda: ultimaVenda(it.dias),
      rate60: r2(rate60 * 100) / 100, rate90: r2(rate90 * 100) / 100, tendencia: taxa == null ? null : r2(taxa * 100) / 100,
      mesesEstoque, coberturaDias: it.estoque > 0 && Math.max(rate60, rate90) > 0 ? Math.round(it.estoque / (rate60 > 0 ? rate60 : rate90)) : (it.estoque > 0 ? Infinity : 0),
      capitalCusto: it.custo > 0 ? r2(it.estoque * it.custo) : null, capitalVenda: it.preco > 0 ? r2(it.estoque * it.preco) : null, margem
    });
  }

  /* percentil de x entre os valores de uma lista ordenada */
  const pctRank = (sorted, x) => { if (!sorted.length) return 0; let lo = 0; while (lo < sorted.length && sorted[lo] < x) lo++; return lo / sorted.length; };

  /* papel do produto, pelas regras do playbook (Isca, Margem, Giro, Estoque) */
  function classify(items, p) {
    const vendidos = items.filter(i => i.q90 > 0), receitas = vendidos.map(i => i.v90).sort((a, b) => a - b);
    const precos = vendidos.filter(i => i.preco > 0).map(i => i.preco).sort((a, b) => a - b), medianaPreco = precos.length ? precos[Math.floor(precos.length / 2)] : 0;
    return items.map(i => {
      let papel;
      if (!(i.estoque > 0)) papel = "semestoque";
      else if (!(i.custo > 0)) papel = i.q90 === 0 ? "parado" : "semcusto";
      else if (i.q90 === 0) papel = "parado";
      else if (i.mesesEstoque >= p.mesesQueima) papel = "queima";
      else {
        const rk = pctRank(receitas, i.v90);
        if (rk >= 0.80 && i.preco <= medianaPreco) papel = "isca";
        else if (i.margem != null && i.margem >= 0.35 && rk >= 0.4) papel = "margem";
        else if (rk >= 0.5) papel = "giro";
        else papel = "cauda";
      }
      return Object.assign({}, i, { papel });
    });
  }

  /* curva ABC pela receita de 90 dias: A até 80%, B até 95%, C o resto (e itens sem venda ficam em "sem venda") */
  function abc(items) {
    const vend = items.filter(i => i.v90 > 0).sort((a, b) => b.v90 - a.v90), tot = sum(vend.map(i => i.v90)); let acc = 0; const m = {};
    vend.forEach(i => { const antes = acc; acc += i.v90; m[i.barras] = tot ? (antes / tot < 0.80 ? "A" : antes / tot < 0.95 ? "B" : "C") : "C"; });
    return items.map(i => Object.assign({}, i, { abc: m[i.barras] || "-" }));
  }

  /* ---------- preço sugerido ---------- */
  function suggest(it, regra = REGRAS.padrao, papel = it.papel) {
    const out = { ok: false, motivo: "", de: it.preco, piso: null, por: null, margem: null, lucroUn: null, desconto: null };
    if (!(it.estoque > 0)) return Object.assign(out, { motivo: "Sem estoque: não entra em encarte." });
    if (!(it.preco > 0)) return Object.assign(out, { motivo: "Sem preço de venda na exportação." });
    if (!(it.custo > 0)) return Object.assign(out, { motivo: "Sem custo na exportação: sem custo não existe piso. Não dá para afirmar que o preço respeita a margem mínima." });
    const piso = it.custo / (1 - regra.margemMin);
    let alvo = Math.max(piso, it.custo + (regra.lucroFixo ?? 3));                 /* sem concorrente: custo + R$ 3, nunca abaixo do piso */
    const dmax = Math.min(DESC_MAX[papel] || 0.5, regra.descMax ?? 1);
    alvo = Math.max(alvo, it.preco * (1 - dmax));                                  /* não descontar além do que o papel do produto permite */
    let por = ceil90(alvo);
    if (por < piso) por = ceil90(piso);                                            /* a terminação ,90 nunca fura o piso */
    out.piso = r2(piso);
    if (por >= it.preco - 0.05) return Object.assign(out, { motivo: "Sem desconto real: o preço mínimo seguro é igual ou maior que o preço de venda atual." });
    return Object.assign(out, { ok: true, por, margem: (por - it.custo) / por, lucroUn: r2(por - it.custo), desconto: 1 - por / it.preco });
  }

  /* ---------- análise completa de uma loja ---------- */
  function analyze({ items, ref, params = {} }) {
    const p = Object.assign({ mesesQueima: 6, rupturaDias: 15 }, params);
    if (!ref) { const ds = items.flatMap(i => Object.keys(i.dias || {})); ref = ds.length ? ds.sort().pop() : null; }
    if (!ref) return { ref: null, items: [], resumo: null, avisos: ["Ainda não há vendas importadas."] };
    /* cobertura do histórico: o giro de 90 dias só vale se as vendas importadas cobrem 90 dias */
    const ini = params.coberturaInicio || items.flatMap(i => Object.keys(i.dias || {})).sort()[0] || ref;
    const cob = Math.max(1, day(ref) - day(ini) + 1), n60 = Math.min(60, cob), n90 = Math.min(90, cob);
    let list = items.map(i => enrich(i, ref, p, n60, n90));
    list = abc(classify(list, p));
    const com = list.filter(i => i.estoque > 0), semCusto = com.filter(i => !(i.custo > 0));
    const parados = list.filter(i => i.papel === "parado"), queima = list.filter(i => i.papel === "queima");
    const ruptura = list.filter(i => i.estoque > 0 && i.q60 > 0 && i.coberturaDias <= p.rupturaDias && (i.abc === "A" || i.abc === "B"));
    const capital = sum(com.map(i => i.capitalCusto || 0));
    const resumo = {
      ref, itens: list.length, comEstoque: com.length, semEstoque: list.length - com.length, semCusto: semCusto.length,
      capitalCusto: r2(capital), capitalVenda: r2(sum(com.map(i => i.capitalVenda || 0))), capitalParado: r2(sum(parados.map(i => i.capitalCusto || 0))), capitalQueima: r2(sum(queima.map(i => i.capitalCusto || 0))),
      parados: parados.length, queima: queima.length, ruptura: ruptura.length, v60: r2(sum(list.map(i => i.v60))), v90: r2(sum(list.map(i => i.v90))),
      margemMedia: (() => { const w = com.filter(i => i.margem != null && i.v90 > 0); const t = sum(w.map(i => i.v90)); return t ? sum(w.map(i => i.margem * i.v90)) / t : null; })(),
      porPapel: Object.fromEntries(Object.keys(PAPEL).map(k => [k, list.filter(i => i.papel === k).length])),
      abcA: list.filter(i => i.abc === "A").length, abcB: list.filter(i => i.abc === "B").length, abcC: list.filter(i => i.abc === "C").length
    };
    resumo.cobertura = { inicio: ini, fim: ref, dias: cob, completa60: cob >= 60, completa90: cob >= 90 };
    const avisos = [];
    if (cob < 90) avisos.push(cob < 60 ? `As vendas importadas cobrem só ${cob} dias: o giro de 60 e de 90 dias ainda não é confiável. "Parado" e "encalhado" valem só para o que foi coberto. Importe mais relatórios.` : `As vendas importadas cobrem ${cob} dias: o giro de 90 dias está parcial. Importe mais relatórios para completar.`);
    if (resumo.semCusto) avisos.push(`${resumo.semCusto} de ${resumo.comEstoque} itens com estoque estão sem custo na exportação: neles não existe piso.`);
    return { ref, items: list, resumo, avisos, params: p };
  }

  /* listas de trabalho */
  const byDesc = (key, dir = -1) => (a, b) => dir * ((a[key] ?? -Infinity) - (b[key] ?? -Infinity));
  function candidatos(a, regra = REGRAS.padrao) {
    const comSug = a.items.filter(i => i.estoque > 0).map(i => Object.assign({}, i, { sug: suggest(i, regra) }));
    const viaveis = comSug.filter(i => i.sug.ok);
    return {
      queima: viaveis.filter(i => i.papel === "parado" || i.papel === "queima").sort((x, y) => (y.capitalCusto || 0) - (x.capitalCusto || 0)),
      atrair: viaveis.filter(i => i.papel === "isca" || i.papel === "giro").sort((x, y) => y.v60 - x.v60),
      margem: comSug.filter(i => i.papel === "margem").sort((x, y) => y.v60 - x.v60),
      semCusto: comSug.filter(i => !(i.custo > 0)).sort((x, y) => y.v90 - x.v90),
      ruptura: comSug.filter(i => i.q60 > 0 && i.coberturaDias <= a.params.rupturaDias && (i.abc === "A" || i.abc === "B")).sort((x, y) => x.coberturaDias - y.coberturaDias),
      semDescontoReal: comSug.filter(i => !i.sug.ok && i.custo > 0 && i.preco > 0)
    };
  }

  /* totais de uma campanha em montagem. linhas: [{ item, por }]; dias: duração; a base de unidades é o giro de 60 dias (não é previsão de lift) */
  function campaignTotals(linhas, regra = REGRAS.padrao, dias = 7) {
    let receita = 0, lucro = 0, un = 0, abaixo = 0, semCusto = 0;
    linhas.forEach(({ item, por }) => {
      if (!(item.custo > 0)) { semCusto++; return; }
      const piso = item.custo / (1 - regra.margemMin), u = item.rate60 * dias;
      if (por < piso - 0.005) abaixo++;
      receita += por * u; lucro += (por - item.custo) * u; un += u;
    });
    return { itens: linhas.length, unidadesBase: r2(un), receitaBase: r2(receita), lucroBase: r2(lucro), margemBase: receita ? lucro / receita : null, abaixoDoPiso: abaixo, semCusto, dias };
  }

  /* cruza duas lojas: item parado numa e girando na outra (candidato a transferência) */
  function cruzarLojas(a, b) {
    const mb = new Map(b.items.map(i => [i.barras, i])), out = [];
    a.items.forEach(i => {
      const o = mb.get(i.barras); if (!o) return;
      if (i.estoque > 0 && i.q90 === 0 && o.q90 > 0) out.push({ barras: i.barras, desc: i.desc, de: "a", estoqueDe: i.estoque, giroPara: o.q90, estoquePara: o.estoque, capital: i.capitalCusto });
      if (o.estoque > 0 && o.q90 === 0 && i.q90 > 0) out.push({ barras: i.barras, desc: i.desc, de: "b", estoqueDe: o.estoque, giroPara: i.q90, estoquePara: i.estoque, capital: o.capitalCusto });
    });
    return out.sort((x, y) => (y.capital || 0) - (x.capital || 0));
  }

  /* tipos de campanha da rotina semanal (calendário de marketing) */
  const CAMPANHAS = [
    { tipo: "Segunda do Bebê", regra: "padrao", selo: "Segunda do Bebê", frase: "Fralda, leite e higiene do bebê com preço de atacado", cats: ["Bebê", "Leite e fórmulas"] },
    { tipo: "Dias do Leite", regra: "padrao", selo: "Dias do Leite", frase: "Fórmulas e leites com preço que cabe no mês", cats: ["Leite e fórmulas"] },
    { tipo: "Quinta dos Suplementos", regra: "padrao", selo: "Quinta dos Suplementos", frase: "Whey, creatina e vitaminas em oferta só hoje", cats: ["Suplementos"] },
    { tipo: "Perfumaria & Cuidado Barato", regra: "padrao", selo: "Cuidado Barato", frase: "Beleza e higiene com preço imbatível", cats: ["Perfumaria e cuidado"] },
    { tipo: "Fim de Semana da Limpeza", regra: "limpeza", selo: "Fim de Semana da Limpeza", frase: "Casa limpa gastando menos", cats: ["Limpeza"] },
    { tipo: "Atacadão do Bebê", regra: "padrao", selo: "Atacadão do Bebê", frase: "Quarta e quinta: o bebê no preço de atacado", cats: ["Bebê", "Leite e fórmulas"] },
    { tipo: "Corta Preço", regra: "corta", selo: "Corta Preço", frase: "Preço cortado nos itens que você mais compra", cats: [] },
    { tipo: "Queima de estoque", regra: "queima", selo: "Últimas unidades", frase: "Últimas unidades com preço de queima", cats: [] },
    { tipo: "Encarte do Mês", regra: "padrao", selo: "Preço Imbatível", frase: "As melhores ofertas do mês", cats: [] }
  ];
  /* de qual loja é este estoque? compara o custo dos códigos em comum com a base de cada loja (custos batendo = mesma loja) */
  function lojaProvavel(items, bases) {
    const out = {};
    Object.keys(bases).forEach(k => {
      const m = new Map(bases[k].filter(i => i.custo > 0).map(i => [i.barras, i.custo]));
      let comuns = 0, iguais = 0;
      items.forEach(i => { const c = m.get(i.barras); if (c && i.custo > 0) { comuns++; if (Math.abs(c - i.custo) / c < 0.005) iguais++; } });
      out[k] = { comuns, pct: comuns >= 20 ? iguais / comuns : null };
    });
    return out;
  }
  const frasePadrao = tipo => (CAMPANHAS.find(c => c.tipo === tipo) || {}).frase || "";
  /* briefing para o designer: só itens acima do piso, com estoque e preço em ,90 (itens fora disso voltam em "problemas") */
  function briefing(campanha, linhas, regra = REGRAS.padrao) {
    const preset = CAMPANHAS.find(c => c.tipo === campanha.tipo) || {}, ok = [], problemas = [];
    linhas.forEach(({ item, por }) => {
      const sug = [];
      if (!(item.estoque > 0)) sug.push("sem estoque");
      if (!(item.custo > 0)) sug.push("sem custo (piso desconhecido)");
      else if (por < item.custo / (1 - regra.margemMin) - 0.005) sug.push("abaixo do piso");
      if (Math.round((por % 1) * 100) !== 90) sug.push("preço não termina em ,90");
      if (por >= item.preco) sug.push("POR não é menor que o DE");
      if (sug.length) problemas.push({ item, por, motivos: sug }); else ok.push({ item, por });
    });
    const head = ["Produto", "Apresentação", "DE (R$)", "POR (R$)", "Campanha", "Frase", "Selo", "Início", "Fim"];
    const fmt = n => n.toFixed(2).replace(".", ",");
    const rows = ok.map(({ item, por }) => [item.desc, "", fmt(item.preco), fmt(por), campanha.tipo || campanha.nome, preset.frase || "", preset.selo || "", campanha.inicio || "", campanha.fim || ""]);
    return { head, rows, ok, problemas, tsv: [head].concat(rows).map(r => r.join("\t")).join("\n") };
  }

  root.N7Promo = { CAMPANHAS, lojaProvavel, frasePadrao, briefing, REGRAS, DESC_MAX, PAPEL, CATS: CATS.map(c => c[0]).concat("Outros"), ceil90, categoria, janela, enrich, classify, abc, suggest, analyze, candidatos, campaignTotals, cruzarLojas, day, iso };
})(typeof window !== "undefined" ? window : globalThis);
