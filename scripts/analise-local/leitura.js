/* Leitura ESTRITA do relatório de vendas (PDF "Analítico de vendas") e do estoque (.xlsx).
   Regra: a leitura só vale se FECHAR. Para as vendas, isso quer dizer:
     1. todas as páginas presentes, na ordem (Pag.: 1/N ... N/N);
     2. toda linha do texto é uma venda, um ajuste conhecido (ARREDONDAMENTO), um cabeçalho ou um rodapé: nenhuma linha "desconhecida";
     3. nenhuma linha de venda rejeitada pelo leitor;
     4. a soma de TODOS os valores lidos, em centavos inteiros, é IGUAL ao "Total:" impresso no rodapé do relatório;
     5. duas leituras do mesmo PDF, agrupando o texto com tolerâncias diferentes, dão exatamente as mesmas linhas;
     6. todas as vendas estão dentro do período do cabeçalho e o cabeçalho (empresa, CNPJ, período) é o mesmo em todas as páginas.
   Qualquer falha marca o arquivo como NÃO CONFIÁVEL: ele não entra na análise e o motivo sai com as linhas exatas.
   Todas as contas de dinheiro são feitas em centavos inteiros (sem erro de ponto flutuante). */
const crypto = require('crypto');
require('../../public/assets/js/promo-ingest.js');
const I = globalThis.N7PromoIngest;

const cents = n => Math.round(n * 100);
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PAG = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) Pag\.: (\d+)\/(\d+)$/;
const STARTS = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} +\d+ +\d+ +\d{6,}/;
/* o ERP lança o arredondamento do troco como uma "venda" de quantidade 0 e valor negativo ou positivo pequeno */
const AJUSTE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) +(\d+) +(\d+) +(\d+) +ARREDONDAMENTO +(-?[\d.]*\d,\d{2}) +(-?\d+) +(-?[\d.]*\d,\d{2}) +(A VISTA|A PRAZO|[A-ZÇÃÕÉÍÚ./ ]+?) +(\d{9}) +(\d{8})(?: +(\d+))? *$/;
const TOTAL = /^Total:\s*(-?[\d.]*\d,\d{2})\s*$/;
const hashRows = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

function classificar(lines) {
  const r = { vendas: [], ajustes: [], pags: [], empresas: new Set(), cnpjs: new Set(), periodos: new Set(), totais: [], desconhecidas: [], cab: 0, rodape: 0 };
  let esperaCab = null, naLegenda = false;
  lines.forEach((raw, idx) => {
    const l = String(raw).replace(/\s+/g, ' ').trim(); let m;
    if (!l) return;
    if ((m = l.match(PAG))) { r.pags.push([Number(m[6]), Number(m[7])]); esperaCab = 'empresa'; r.cab++; return; }
    if (esperaCab === 'empresa') { esperaCab = null; if (/^\d{14}$/.test(l)) r.cnpjs.add(l); else if (!/^A N A L I T I C O/.test(l) && !/^Periodo/.test(l)) { r.empresas.add(l); esperaCab = 'cnpj'; } r.cab++; return; }
    if (esperaCab === 'cnpj') { esperaCab = null; if (/^\d{14}$/.test(l)) { r.cnpjs.add(l); r.cab++; return; } }
    if (/^A N A L I T I C O D E V E N D A S$/.test(l)) { r.cab++; return; }
    if ((m = l.match(/^Periodo de: (\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4}) Horario das (\S+) as (\S+)$/))) { r.periodos.add(`${m[1]}|${m[2]}|${m[3]}|${m[4]}`); r.cab++; return; }
    if (/^-{20,}$/.test(l)) { r.cab++; return; }
    if (/^Data\/Hora Mov\./.test(l)) { r.cab++; return; }
    if ((m = l.match(TOTAL))) { r.totais.push({ texto: l, valor: I.brNum(m[1]), idx }); r.rodape++; return; }
    if (/^-{5,}$/.test(l) || /^={20,}$/.test(l)) { r.rodape++; return; }
    if (/^Legenda:$/.test(l)) { naLegenda = true; r.rodape++; return; }
    if (STARTS.test(l)) {
      if ((m = l.match(AJUSTE))) { r.ajustes.push({ linha: l, idx, valor: I.brNum(m[11]), qtd: Number(m[10]), data: `${m[3]}-${m[2]}-${m[1]}` }); return; }
      r.vendas.push({ linha: l, idx }); return;
    }
    if (naLegenda) { r.rodape++; return; }                                        /* depois de "Legenda:", o que sobra é a explicação das colunas */
    r.desconhecidas.push({ idx, linha: l.slice(0, 200) });
  });
  return r;
}

/* lines: texto na tolerância normal; linesB: o mesmo PDF agrupado com outra tolerância; numPaginas: páginas reais do arquivo */
function validarVendas({ lines, linesB, numPaginas, bytes = 0, sha256 = '' }) {
  const checks = [], add = (id, ok, msg, detalhe) => checks.push({ id, ok: !!ok, aviso: false, msg, detalhe: detalhe || null });
  const warn = (id, cond, msg, detalhe) => checks.push({ id, ok: true, aviso: !cond, msg, detalhe: cond ? null : detalhe });
  const c = classificar(lines), p = I.parseSalesLines(lines), header = p.header, rows = p.rows;

  /* 1. páginas completas e em ordem */
  const total = c.pags.length ? c.pags[0][1] : 0, seqOk = c.pags.length === numPaginas && c.pags.every(([n, t], i) => n === i + 1 && t === total) && total === numPaginas;
  add('paginas', seqOk, seqOk ? `${numPaginas} páginas, de 1/${total} a ${total}/${total}, sem falta nem repetição` : `Páginas fora do esperado: o arquivo tem ${numPaginas} e o texto marca ${c.pags.length} ("Pag.: x/${total}")`, seqOk ? null : c.pags.slice(0, 10).map(x => x.join('/')));
  /* 2. cabeçalho único */
  const cabOk = c.cnpjs.size === 1 && c.periodos.size === 1 && !!header.periodo;
  add('cabecalho', cabOk, cabOk ? `Empresa ${header.empresa} · CNPJ ${[...c.cnpjs][0]} · período ${header.periodo.inicio} a ${header.periodo.fim} em todas as páginas` : `Cabeçalho muda entre páginas ou falta (${c.cnpjs.size} CNPJ, ${c.periodos.size} períodos)`, cabOk ? null : { cnpjs: [...c.cnpjs], periodos: [...c.periodos] });
  /* 3. nenhuma linha desconhecida */
  add('classificacao', c.desconhecidas.length === 0, c.desconhecidas.length ? `${c.desconhecidas.length} linha(s) do relatório não são venda, ajuste, cabeçalho nem rodapé` : `Todas as ${lines.length} linhas do texto foram classificadas (${c.vendas.length + c.ajustes.length} lançamentos, ${c.cab} de cabeçalho, ${c.rodape} de rodapé)`, c.desconhecidas.length ? c.desconhecidas.slice(0, 20) : null);
  /* 4. nenhuma linha de venda rejeitada */
  const rej = c.vendas.length - rows.length;
  add('rejeitadas', rej === 0, rej === 0 ? `${rows.length} vendas lidas de ${c.vendas.length} linhas de venda (100%)` : `${rej} linha(s) de venda não foram lidas (${rows.length} de ${c.vendas.length})`, rej ? p.stats.exemplosRejeitados : null);
  /* 5. soma = total do rodapé, em centavos */
  const soma = rows.reduce((s, r) => s + cents(r.valor), 0), somaAj = c.ajustes.reduce((s, a) => s + cents(a.valor), 0);
  const tot = c.totais.length === 1 ? cents(c.totais[0].valor) : null, fecha = tot != null && soma + somaAj === tot;
  add('total', fecha, c.totais.length !== 1 ? `O relatório deveria ter 1 linha "Total:" e tem ${c.totais.length}` : fecha ? `Soma fecha com o "Total:" do rodapé: ${brl(soma)} em vendas ${somaAj >= 0 ? '+' : '−'} ${brl(Math.abs(somaAj))} de ${c.ajustes.length} ajuste(s) de arredondamento = ${brl(tot)}` : `NÃO FECHA: lido ${brl(soma + somaAj)} (vendas ${brl(soma)}, ajustes ${brl(somaAj)}), rodapé ${brl(tot)}, diferença ${brl(soma + somaAj - tot)}`, fecha ? null : { vendas: soma, ajustes: somaAj, rodape: tot });
  /* 6. datas dentro do período */
  const ini = header.periodo && header.periodo.inicio, fim = header.periodo && header.periodo.fim, fora = rows.filter(r => r.data < ini || r.data > fim);
  add('datas', !!ini && fora.length === 0, fora.length ? `${fora.length} venda(s) fora do período do cabeçalho` : `Todas as vendas estão dentro de ${ini} a ${fim}`, fora.length ? fora.slice(0, 10).map(r => r.data + ' ' + r.desc) : null);
  /* 7. duas leituras idênticas */
  let dupla = null;
  if (linesB) { const pb = I.parseSalesLines(linesB), cb = classificar(linesB); dupla = hashRows(rows) === hashRows(pb.rows) && c.ajustes.length === cb.ajustes.length && c.totais.length === cb.totais.length && JSON.stringify(c.totais.map(t => t.valor)) === JSON.stringify(cb.totais.map(t => t.valor)); }
  if (linesB) add('dupla-leitura', dupla, dupla ? 'Duas leituras do PDF, com tolerâncias de agrupamento diferentes, deram exatamente as mesmas linhas' : 'As duas leituras do PDF DIVERGEM: o agrupamento das linhas é instável neste arquivo', null);
  /* avisos (não impedem a análise, mas aparecem no relatório) */
  const difPreco = rows.filter(r => Math.abs(cents(r.preco) * r.qtd - cents(r.valor)) > 1);
  warn('preco-x-qtd', difPreco.length === 0, 'Preço × quantidade = valor líquido em todas as linhas', `${difPreco.length} linha(s) com valor líquido diferente de preço × quantidade (desconto ou acréscimo no caixa); o total ainda fecha`);
  const neg = rows.filter(r => r.qtd < 0 || r.valor < 0);
  warn('devolucoes', neg.length === 0, 'Nenhuma devolução (quantidade ou valor negativo)', `${neg.length} linha(s) negativas (devolução), somadas ao total: ${brl(neg.reduce((s, r) => s + cents(r.valor), 0))}`);
  const diaParcial = I.partialDay(header);
  warn('dia-parcial', !diaParcial, 'Relatório emitido depois do fim do expediente: o último dia está completo', `Emitido em ${header.emissao && header.emissao.data} às ${header.emissao && header.emissao.hora}: o dia ${diaParcial} está CORTADO e fica fora do giro (como o site faz)`);

  const ok = checks.every(x => x.ok);
  return { ok, checks, rows, ajustes: c.ajustes, header, diaParcial, totalRodape: tot, somaCentavos: soma + somaAj, sha256, bytes, linhas: lines.length, paginas: numPaginas };
}

/* ---------- estoque ---------- */
const ALIAS = { barras: ['barras', 'codigo de barras', 'cod barras', 'ean'], estoque: ['estoque', 'saldo', 'qtde estoque'], preco: ['preco de venda', 'preco venda', 'venda'], custo: ['ult prc entrada', 'ult prc  entrada', 'ultimo preco de entrada', 'custo', 'preco de custo'], promo: ['preco de promocao', 'promocao'] };
function validarEstoque({ grid, linhasNoArquivo, bytes = 0, sha256 = '' }) {
  const checks = [], add = (id, ok, msg, detalhe) => checks.push({ id, ok: !!ok, aviso: false, msg, detalhe: detalhe || null });
  const warn = (id, cond, msg, detalhe) => checks.push({ id, ok: true, aviso: !cond, msg, detalhe: cond ? null : detalhe });
  const r = I.parseStockGrid(grid);
  if (r.erro) { add('colunas', false, r.erro); return { ok: false, checks, items: [], stats: null, sha256, bytes }; }
  let hi = -1; for (let i = 0; i < Math.min(15, grid.length); i++) { const h = (grid[i] || []).map(I.strip); if (h.includes('barras') || h.includes('codigo de barras')) { hi = i; break; } }
  const hdr = grid[hi].map(I.strip), col = k => { for (const a of ALIAS[k]) { const i = hdr.indexOf(a); if (i >= 0) return i; } return -1; };
  const ix = Object.fromEntries(Object.keys(ALIAS).map(k => [k, col(k)]));
  add('colunas', true, `Colunas encontradas: ${Object.entries(ix).filter(([, v]) => v >= 0).map(([k, v]) => `${k} (${grid[hi][v]})`).join(', ')}${ix.custo < 0 ? ' · SEM coluna de custo' : ''}`);
  /* 1. toda linha do arquivo está contada */
  const dados = grid.slice(hi + 1).filter(l => (l || []).some(c => c != null && c !== '')).length, st = r.stats, contadas = r.items.length + st.duplicados + st.semBarras;
  add('linhas', dados === contadas, dados === contadas ? `${dados} linhas de dados: ${r.items.length} produtos + ${st.duplicados} duplicados + ${st.semBarras} sem código de barras (nenhuma sumiu)` : `${dados} linhas de dados no arquivo mas só ${contadas} foram contadas`, dados === contadas ? null : { dados, contadas });
  add('arquivo-x-leitura', grid.length === linhasNoArquivo, `O leitor viu ${grid.length} das ${linhasNoArquivo} linhas gravadas no arquivo`, grid.length === linhasNoArquivo ? null : { grid: grid.length, arquivo: linhasNoArquivo });
  /* 2. células numéricas ilegíveis nas colunas principais */
  const ruins = []; const seen = new Set();
  for (let i = hi + 1; i < grid.length; i++) for (const k of ['estoque', 'preco', 'custo', 'promo']) { const j = ix[k]; if (j < 0) continue; const v = (grid[i] || [])[j]; if (v == null || v === '') continue; const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); if (!isFinite(n)) ruins.push(`linha ${i + 1} ${k}: ${JSON.stringify(v)}`); }
  add('numeros', ruins.length === 0, ruins.length ? `${ruins.length} célula(s) numérica(s) ilegíveis` : 'Todas as células de estoque, preço, custo e promoção são números válidos', ruins.length ? ruins.slice(0, 20) : null);
  /* 3. soma do estoque: grade bruta x produtos lidos (a diferença são os duplicados e os sem código, que o site deixa de fora) */
  const brutoEst = grid.slice(hi + 1).reduce((s, l) => s + (typeof (l || [])[ix.estoque] === 'number' ? l[ix.estoque] : 0), 0), lidoEst = r.items.reduce((s, i) => s + i.estoque, 0);
  /* duplicados: o leitor guarda o primeiro e descarta os outros; mostra o que isso custa */
  const visto = new Map(), dup = [];
  for (let i = hi + 1; i < grid.length; i++) { const l = grid[i] || [], b = typeof l[ix.barras] === 'number' ? String(Math.round(l[ix.barras])) : String(l[ix.barras] ?? '').replace(/\D/g, ''); if (!b || /^0+$/.test(b)) continue; if (visto.has(b)) dup.push({ barras: b, primeira: visto.get(b), repetida: { linha: i + 1, estoque: l[ix.estoque], preco: l[ix.preco] } }); else visto.set(b, { linha: i + 1, estoque: l[ix.estoque], preco: l[ix.preco] }); }
  const perdaEst = dup.reduce((s, d) => s + (Number(d.repetida.estoque) || 0), 0);
  warn('duplicados', dup.length === 0, 'Nenhum código de barras repetido', `${dup.length} código(s) repetido(s): o site guarda só a primeira linha e descarta as outras (${perdaEst} unidade(s) de estoque ficam fora). Exemplos: ${JSON.stringify(dup.slice(0, 5))}`);
  warn('soma-estoque', Math.abs(brutoEst - lidoEst - perdaEst) < 1e-6 || st.semBarras > 0, 'A soma do estoque bate (arquivo = lido + descartado dos duplicados)', `Arquivo ${brutoEst}, lido ${lidoEst}, duplicados descartados ${perdaEst}, sem código ${st.semBarras} linha(s)`);
  warn('sem-custo', !(st.semCusto > 0), 'Todo produto tem custo (piso de promoção calculável)', `${st.semCusto} de ${r.items.length} produtos sem custo: neles não existe piso e a promoção fica bloqueada`);
  const neg = r.items.filter(i => i.estoque < 0); warn('estoque-negativo', neg.length === 0, 'Nenhum estoque negativo', `${neg.length} produto(s) com estoque negativo`);
  const inv = r.items.filter(i => i.custo > 0 && i.preco > 0 && i.custo > i.preco); warn('custo-maior-preco', inv.length === 0, 'Nenhum produto com custo acima do preço de venda', `${inv.length} produto(s) com custo maior que o preço de venda (margem negativa), ex.: ${inv.slice(0, 3).map(i => i.desc).join('; ')}`);
  const zero = r.items.filter(i => !(i.preco > 0)); warn('sem-preco', zero.length === 0, 'Todo produto tem preço de venda', `${zero.length} produto(s) sem preço de venda`);
  return { ok: checks.every(x => x.ok), checks, items: r.items, stats: Object.assign({}, st, { duplicadosLista: dup.length, estoqueTotal: lidoEst }), sha256, bytes };
}

module.exports = { validarVendas, validarEstoque, classificar, cents, brl };
