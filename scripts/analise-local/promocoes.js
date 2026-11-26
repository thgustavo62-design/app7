/* Central de Promoções no processador do computador: lê PDFs de vendas e estoques (.xlsx), CONFERE cada leitura e analisa.
   Uso: node promocoes.js <pasta-com-os-arquivos> <pasta-de-saida> [--nucleos N] [--so-conferir]
   A pasta pode ter as subpastas vendas/ (PDF "Analítico de vendas") e estoque/ (.xlsx), ou os arquivos soltos (PDF = vendas; .xlsx/.csv com "estoque" no nome).
   A loja vem do cabeçalho do PDF (empresa) ou do nome do arquivo ("minas", "farma e farma"). Se os dois discordarem, o arquivo é recusado.
   Só entra na análise arquivo cuja leitura FECHOU (ver leitura.js). Código de saída: 0 tudo certo; 3 algum arquivo foi recusado; 1 erro. */
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const LOJAS = { M: 'Minas Farma', F: 'Farma e Farma' };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lojaDe = t => { const s = strip(t); if (/minas/.test(s)) return 'M'; if (/farma\s*e\s*farma|farmaefarma/.test(s)) return 'F'; return null; };

/* ---------- trabalhador: lê e confere UM arquivo ---------- */
if (!isMainThread) {
  parentPort.on('message', async t => {
    const t0 = Date.now();
    try {
      const A = require('./arquivos'), L = require('./leitura'), J = require('./janela'); require('../../public/assets/js/promo-ingest.js'); let v;
      if (t.tipo === 'vendas') {
        const e = await A.extrairPdf(t.arquivo), a = A.agrupar(e.paginas, 2), b = A.agrupar(e.paginas, 1);
        v = L.validarVendas({ lines: a.lines, linesB: b.lines, numPaginas: e.numPaginas, bytes: e.bytes, sha256: sha(t.arquivo) });
        const I = globalThis.N7PromoIngest, drop = I.partialDay(v.header), cj = J.conferirJanela(v, J.analisarJanela({ rows: v.rows, ajustes: v.ajustes, cobertura: I.coverage(v.rows, drop), diaParcial: drop })); v.checks.push(cj); v.ok = v.ok && cj.ok;
      } else {
        const x = A.lerXlsx(t.arquivo);
        v = L.validarEstoque({ grid: x.grid, linhasNoArquivo: x.linhasNoArquivo, bytes: fs.statSync(t.arquivo).size, sha256: sha(t.arquivo) });
      }
      parentPort.postMessage({ id: t.id, ok: true, v, ms: Date.now() - t0 });
    } catch (e) { parentPort.postMessage({ id: t.id, ok: false, erro: e.stack || String(e), ms: Date.now() - t0 }); }
  });
  return;
}

/* ---------- principal ---------- */
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const [pasta, saida] = process.argv.slice(2);
if (!pasta || !saida || pasta.startsWith('--')) { console.error('Uso: node promocoes.js <pasta> <saida> [--nucleos N] [--so-conferir]'); process.exit(2); }
const soConferir = process.argv.includes('--so-conferir');
const nuc = Math.max(1, Math.min(Number(arg('--nucleos')) || os.availableParallelism(), 16));
const num = (n, d = 2) => (n == null || !isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const brl = n => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function descobrir(raiz) {
  const sub = n => { const p = path.join(raiz, n); return fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : null; };
  const lista = d => fs.readdirSync(d).filter(f => fs.statSync(path.join(d, f)).isFile()).map(f => path.join(d, f));
  const v = sub('vendas'), e = sub('estoque'), out = [];
  if (v || e) {
    if (v) lista(v).filter(f => /\.pdf$/i.test(f)).forEach(f => out.push({ tipo: 'vendas', arquivo: f }));
    if (e) lista(e).filter(f => /\.xlsx$/i.test(f) && !/^~\$/.test(path.basename(f))).forEach(f => out.push({ tipo: 'estoque', arquivo: f }));
  } else {
    lista(raiz).forEach(f => { const b = path.basename(f); if (/\.pdf$/i.test(f)) out.push({ tipo: 'vendas', arquivo: f }); else if (/\.xlsx$/i.test(f) && /estoque/i.test(b) && !/^~\$/.test(b)) out.push({ tipo: 'estoque', arquivo: f }); });
  }
  return out;
}

async function lerTudo(tarefas) {
  const res = new Array(tarefas.length); let prox = 0, feitas = 0; const usados = Math.min(nuc, tarefas.length);
  if (!tarefas.length) return { res, usados: 0 };
  await new Promise((fim, falha) => {
    const ws = Array.from({ length: usados }, () => {
      const w = new Worker(__filename), dar = () => { if (prox < tarefas.length) w.postMessage(Object.assign({ id: prox }, tarefas[prox++])); else w.terminate(); };
      w.on('message', m => { res[m.id] = m; if (++feitas === tarefas.length) { ws.forEach(x => x.terminate()); fim(); } else dar(); });
      w.on('error', falha); dar(); return w;
    });
  });
  return { res, usados };
}

const csv = (rows, cols) => '﻿' + [cols.map(c => c[0]).join(';')].concat(rows.map(r => cols.map(c => { const v = c[1](r); return v == null ? '' : typeof v === 'string' && v.startsWith('="') ? v : typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'))).join('\r\n') + '\r\n';
const md = { ok: '✔', aviso: '⚠', falha: '✘' };

(async () => {
  const t0 = Date.now();
  const tarefas = descobrir(pasta);
  if (!tarefas.length) { console.error(`Nenhum PDF de vendas nem estoque .xlsx em ${pasta}`); process.exit(1); }
  const { res, usados } = await lerTudo(tarefas);

  const arquivos = tarefas.map((t, i) => {
    const r = res[i], base = path.basename(t.arquivo), porNome = lojaDe(base), porCab = r.ok && t.tipo === 'vendas' ? lojaDe(r.v.header && r.v.header.empresa) : null;
    let loja = porCab || porNome, extra = null;
    if (porCab && porNome && porCab !== porNome) extra = `O cabeçalho do PDF diz "${r.v.header.empresa}" (${LOJAS[porCab]}) mas o nome do arquivo sugere ${LOJAS[porNome]}. Confira se o arquivo é da loja certa.`;
    if (!loja) extra = 'Não consegui saber a loja: ponha "minas" ou "farma e farma" no nome do arquivo.';
    const falha = !r.ok ? 'Erro ao ler: ' + String(r.erro).split('\n')[0] : (!r.v.ok ? 'A leitura não fechou (veja as conferências)' : extra);
    return Object.assign({ base, loja, ms: r.ms, falha: falha || null }, t, { v: r.ok ? r.v : null, erro: r.ok ? null : r.erro });
  });

  /* ---------- relatório de leitura (sempre gerado) ---------- */
  fs.mkdirSync(saida, { recursive: true });
  const L = ['# Conferência da leitura dos arquivos', '', `Gerado em ${new Date().toISOString()}. ${arquivos.length} arquivo(s), ${usados} núcleo(s), ${((Date.now() - t0) / 1000).toFixed(1)} s.`, '',
    'Um arquivo só entra na análise se **todas** as conferências abaixo passarem. Dinheiro é somado em centavos inteiros e comparado com o total impresso no relatório.', ''];
  arquivos.forEach(a => {
    L.push(`## ${a.falha ? md.falha : md.ok} ${a.base}`, '', `Tipo: ${a.tipo === 'vendas' ? 'vendas (PDF)' : 'estoque (.xlsx)'} · loja: ${a.loja ? LOJAS[a.loja] : 'não identificada'} · ${a.v ? (a.v.bytes / 1024).toFixed(0) + ' KB · SHA-256 ' + a.v.sha256.slice(0, 16) + '…' : ''}`, '');
    if (a.erro) L.push('```', a.erro.split('\n').slice(0, 6).join('\n'), '```', '');
    if (a.v) a.v.checks.forEach(c => L.push(`- ${c.ok ? (c.aviso ? md.aviso : md.ok) : md.falha} **${c.id}**: ${c.aviso ? c.detalhe : c.msg}${!c.ok && c.detalhe ? '\n  - `' + JSON.stringify(c.detalhe).slice(0, 600) + '`' : ''}`));
    if (a.falha) L.push('', `**Recusado:** ${a.falha}`);
    L.push('');
  });
  fs.writeFileSync(path.join(saida, 'leitura.md'), '﻿' + L.join('\n'));
  const recusados = arquivos.filter(a => a.falha);
  arquivos.forEach(a => console.log(`${a.falha ? 'RECUSADO' : 'ok      '} ${a.tipo.padEnd(7)} ${a.base} (${((a.ms || 0) / 1000).toFixed(1)} s)${a.falha ? ' — ' + a.falha : ''}`));
  if (soConferir) { console.log(`Conferência pronta: ${arquivos.length - recusados.length} de ${arquivos.length} arquivos fecharam. Detalhe em ${path.join(saida, 'leitura.md')}`); process.exit(recusados.length ? 3 : 0); }

  /* ---------- análise por loja, só com o que fechou ---------- */
  require('../../public/assets/js/services.js'); require('../../public/assets/js/promo-ingest.js'); require('../../public/assets/js/promo.js');
  const I = globalThis.N7PromoIngest, PR = globalThis.N7Promo;
  const out = { geradoEm: new Date().toISOString(), lojas: {}, recusados: recusados.map(a => ({ arquivo: a.base, motivo: a.falha })) };

  for (const loja of Object.keys(LOJAS)) {
    const est = arquivos.filter(a => a.loja === loja && a.tipo === 'estoque' && !a.falha), ven = arquivos.filter(a => a.loja === loja && a.tipo === 'vendas' && !a.falha).sort((x, y) => (x.v.header.emissao ? x.v.header.emissao.data + x.v.header.emissao.hora : '').localeCompare(y.v.header.emissao ? y.v.header.emissao.data + y.v.header.emissao.hora : ''));   /* o relatório emitido por último vence nos dias em comum: ele reflete lançamentos que entraram depois */
    if (!est.length && !ven.length) continue;
    const itens = new Map(), intervalos = [], importacoes = [];
    const info = { nome: LOJAS[loja], estoque: null, vendas: [], avisos: [] };
    if (est.length > 1) info.avisos.push(`Há ${est.length} arquivos de estoque válidos para ${LOJAS[loja]}; usei o mais recente (data do arquivo): ${est.sort((a, b) => fs.statSync(b.arquivo).mtimeMs - fs.statSync(a.arquivo).mtimeMs)[0].base}.`);
    if (est.length) {
      const e = est[0]; e.v.items.forEach(it => itens.set(it.barras, { barras: it.barras, desc: it.desc, estoque: it.estoque, estoqueConhecido: true, preco: it.preco, custo: it.custo || null, promoSistema: it.promoSistema, aprox: it.aprox, ultEntrada: it.ultEntrada, fiscal: it.fiscal, dias: {} }));
      info.estoque = { arquivo: e.base, produtos: e.v.items.length, semCusto: e.v.stats.semCusto, duplicados: e.v.stats.duplicados, estoqueTotal: e.v.stats.estoqueTotal };
    } else info.avisos.push('Sem estoque válido: a análise de promoção precisa do estoque e do custo.');
    const todas = [], dias = (a, b) => { const o = []; for (let t = Date.parse(a + 'T12:00:00Z'); t <= Date.parse(b + 'T12:00:00Z'); t += 864e5) o.push(new Date(t).toISOString().slice(0, 10)); return o; };
    const cobs = ven.map(v => I.coverage(v.v.rows, I.partialDay(v.v.header))), dono = {};
    ven.forEach((v, i) => { if (cobs[i]) dias(cobs[i].inicio, cobs[i].fim).forEach(d => { dono[d] = i; }); });      /* o relatório mais novo substitui os dias que cobre (regra do site) */
    const porDia = ven.map(v => { const m = {}; v.v.rows.forEach(r => { m[r.data] = (m[r.data] || 0) + Math.round(r.valor * 100); }); return m; });
    for (let i = 0; i < ven.length; i++) for (let j = i + 1; j < ven.length; j++) {
      if (!cobs[i] || !cobs[j]) continue; const ini = cobs[i].inicio > cobs[j].inicio ? cobs[i].inicio : cobs[j].inicio, fim = cobs[i].fim < cobs[j].fim ? cobs[i].fim : cobs[j].fim; if (ini > fim) continue;
      const comuns = dias(ini, fim), dif = comuns.filter(d => (porDia[i][d] || 0) !== (porDia[j][d] || 0));
      (info.cruzado || (info.cruzado = [])).push({ a: ven[i].base, b: ven[j].base, de: ini, ate: fim, dias: comuns.length, iguais: comuns.length - dif.length, diferentes: dif.map(d => ({ dia: d, a: (porDia[i][d] || 0) / 100, b: (porDia[j][d] || 0) / 100 })) });
      if (dif.length) info.avisos.push(`Os PDFs "${ven[i].base}" e "${ven[j].base}" têm ${comuns.length} dias em comum e DIVERGEM em ${dif.length} dia(s): ${dif.slice(0, 4).map(d => `${d} (${((porDia[i][d] || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no mais antigo × ${((porDia[j][d] || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no emitido depois)`).join('; ')}. Usei o emitido depois (${ven[j].v.header.emissao.data} ${ven[j].v.header.emissao.hora}), que costuma ter lançamentos que entraram atrasados.`);
    }
    for (const v of ven) {
      const h = v.v.header, drop = I.partialDay(h), cov = I.coverage(v.v.rows, drop), ag = I.aggregate(v.v.rows, { dropDay: drop });
      /* mesma regra do site: o relatório novo substitui os dias que cobre e mantém os demais (a mesma venda nunca conta duas vezes) */
      itens.forEach(it => { Object.keys(it.dias).forEach(d => { if (d >= cov.inicio && d <= cov.fim) delete it.dias[d]; }); });
      Object.entries(ag).forEach(([b, p]) => { const it = itens.get(b) || (itens.set(b, { barras: b, desc: p.desc, estoque: 0, estoqueConhecido: false, preco: null, custo: null, promoSistema: null, aprox: null, ultEntrada: '', fiscal: '', dias: {} }), itens.get(b)); Object.entries(p.dias).forEach(([d, qv]) => { if (d >= cov.inicio && d <= cov.fim) it.dias[d] = qv; }); });
      intervalos.push([cov.inicio, cov.fim, drop && !ven.some((o, k) => k !== ven.indexOf(v) && cobs[k] && drop >= cobs[k].inicio && drop <= cobs[k].fim) ? drop : '']); importacoes.push({ tipo: 'vendas', inicio: cov.inicio, fim: cov.fim });
      info.vendas.push({ arquivo: v.base, periodo: h.periodo, cobertura: cov, diaDescartado: drop, vendas: v.v.rows.length, ajustes: v.v.ajustes.length, totalRodapeCentavos: v.v.totalRodape });
      v.v.rows.forEach(r => { if (dono[r.data] === ven.indexOf(v)) todas.push(r); });
    }
    const ds = [...itens.values()].flatMap(i => Object.keys(i.dias)).sort(), data = { items: [...itens.values()], importacoes, campanhas: [], intervalos, cobertura: ds.length ? { inicio: ds[0], fim: ds[ds.length - 1] } : null, estoqueEm: '' }, a = PR.analyze({ items: data.items, params: { coberturaInicio: data.cobertura && data.cobertura.inicio, coberturaIntervalos: data.intervalos } });
    const cand = a.resumo ? PR.candidatos(a, PR.REGRAS.padrao) : null, resumo = PR.brainSummary(loja, LOJAS[loja], data, a);

    /* contas exatas sobre as linhas já conferidas (centavos) */
    const c = r => Math.round(r.valor * 100), prod = todas.filter(r => !I.isNaoProduto(r)), taxa = todas.filter(I.isTaxa), div = todas.filter(r => /^diversos/.test(I.strip(r.desc)) && !I.isTaxa(r));
    const soma = l => l.reduce((s, r) => s + c(r), 0), cupons = new Set(prod.map(r => r.data + '|' + r.lanc)), dia = {}, dow = Array(7).fill(0), hora = Array(24).fill(0), prodAg = {};
    const dd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    prod.forEach(r => { dia[r.data] = (dia[r.data] || 0) + c(r); dow[new Date(r.data + 'T12:00:00Z').getUTCDay()] += c(r); hora[+r.hora.slice(0, 2)] += c(r); const p = prodAg[r.barras] || (prodAg[r.barras] = { barras: r.barras, desc: r.desc, qtd: 0, valor: 0 }); p.qtd += r.qtd; p.valor += c(r); });
    const topValor = Object.values(prodAg).sort((x, y) => y.valor - x.valor).slice(0, 20), nDias = Object.keys(dia).length;
    const noEstoque = est.length ? new Set(est[0].v.items.map(i => i.barras)) : null;
    const semCad = noEstoque ? prod.filter(r => !noEstoque.has(r.barras)) : [];
    const naoProd = todas.filter(I.isNaoProduto); info.exato = { outrosCodigosCentavos: soma(naoProd) - soma(taxa) - soma(div), vendasProdutoCentavos: soma(prod), taxaEntregaCentavos: soma(taxa), diversosCentavos: soma(div), cuponsDistintos: cupons.size, ticketMedioCentavos: cupons.size ? Math.round(soma(prod) / cupons.size) : null, diasComVenda: nDias, mediaPorDiaCentavos: nDias ? Math.round(soma(prod) / nDias) : null,
      porDiaDaSemana: dow.map((v, i) => ({ dia: dd[i], valorCentavos: v })), porHora: hora.map((v, h) => ({ hora: h, valorCentavos: v })).filter(x => x.valorCentavos), topProdutosPorValor: topValor.map(p => ({ barras: p.barras, desc: p.desc, qtd: p.qtd, valorCentavos: p.valor })),
      vendaSemCadastroNoEstoque: noEstoque ? { linhas: semCad.length, valorCentavos: soma(semCad), parteDoValor: soma(prod) ? soma(semCad) / soma(prod) : null } : null };
    if (noEstoque && info.exato.vendaSemCadastroNoEstoque.parteDoValor > 0.05) info.avisos.push(`${num(info.exato.vendaSemCadastroNoEstoque.parteDoValor * 100, 1)}% do valor vendido é de códigos de barras que NÃO estão no arquivo de estoque. Confira se estoque e vendas são da mesma loja e do mesmo período.`);
    const aj = ven.flatMap((v, i) => v.v.ajustes.filter(x => dono[x.data] === i)), covTotal = ven.length ? { inicio: cobs.filter(Boolean).map(x => x.inicio).sort()[0], fim: cobs.filter(Boolean).map(x => x.fim).sort().pop() } : null;
    info.janela = covTotal ? require('./janela').analisarJanela({ rows: todas, ajustes: aj, cobertura: covTotal, diasCobertos: new Set(Object.keys(dono)) }) : null;
    if (info.janela) {
      const j = info.janela, cvs = (rows, cols) => fs.writeFileSync(path.join(saida, `${loja}-${rows}.csv`), csv(j[rows === 'dias' ? 'porDia' : rows === 'semanas' ? 'semanas' : 'meses'], cols));
      cvs('dias', [['Data', r => r.d], ['Vendas (R$)', r => r.v / 100], ['Vendas de produto (R$)', r => r.vp / 100], ['Taxa de entrega (R$)', r => r.taxa / 100], ['Cupons', r => r.cupons], ['Itens', r => r.itens]]);
      cvs('semanas', [['Segunda', r => r.inicio], ['Domingo', r => r.fim], ['Completa', r => (r.completa ? 'sim' : 'não')], ['Vendas (R$)', r => r.vendasCentavos / 100], ['Compras (cupons)', r => r.cupons], ['Ticket (R$)', r => (r.ticketCentavos == null ? null : r.ticketCentavos / 100)], ['Cestas acima de R$ 100 (nº)', r => r.c100n], ['Cestas acima de R$ 100 (R$)', r => r.c100Centavos / 100], ...['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((n, i) => [n + ' (R$)', r => (r.dias7[i] == null ? null : r.dias7[i] / 100)])]);
      cvs('meses', [['Mês', r => r.mes], ['Completo', r => (r.completo ? 'sim' : 'não')], ['Vendas (R$)', r => r.vendasCentavos / 100], ['Cupons', r => r.cupons], ['Ticket (R$)', r => (r.ticketCentavos == null ? null : r.ticketCentavos / 100)]]);
    }
    info.analise = { resumo: a.resumo, avisos: a.avisos, brain: resumo };
    if (cand) {
      info.listas = Object.fromEntries(Object.entries(cand).map(([k, l]) => [k, l.length]));
      const base = [['Barras', r => '="' + r.barras + '"'], ['Produto', r => r.desc], ['Categoria', r => r.cat], ['Papel', r => r.papel], ['ABC', r => r.abc], ['Estoque', r => r.estoque], ['Custo', r => r.custo], ['Preço de venda', r => r.preco], ['Margem', r => r.margem], ['Vendas 60d (un)', r => r.q60], ['Vendas 60d (R$)', r => r.v60], ['Vendas 90d (R$)', r => r.v90], ['Cobertura (dias)', r => r.coberturaDias], ['Capital parado (custo)', r => r.capitalCusto], ['Preço sugerido', r => r.sug && r.sug.por], ['Desconto sugerido', r => r.sug && r.sug.desconto]];
      Object.entries(cand).forEach(([k, l]) => fs.writeFileSync(path.join(saida, `${loja}-${k}.csv`), csv(l, base)));
    }
    out.lojas[loja] = info;
  }
  fs.writeFileSync(path.join(saida, 'promocoes.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(saida, 'promocoes.md'), '﻿' + require('./promocoes-resumo').montar(out));
  console.log(`Promoções: ${Object.keys(out.lojas).length} loja(s) analisada(s) em ${((Date.now() - t0) / 1000).toFixed(1)} s${recusados.length ? `; ${recusados.length} arquivo(s) RECUSADO(S)` : ''}.`);
  process.exit(recusados.length ? 3 : 0);
})().catch(e => { console.error('FALHOU: ' + e.stack); process.exit(1); });
