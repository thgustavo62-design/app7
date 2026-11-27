/* /api/leitura: fila de leitura de arquivos pesados no COMPUTADOR da agência (PowerShell). Veja lib/fila.js.
   Quem usa o site (equipe com acesso de escrita):
     GET  ?acao=estado                      o computador da agência está ligado e buscando arquivos?
     POST ?acao=nova                        {loja, tipo:'vendas'|'estoque', nome, bytes, partes}  -> {id}
     POST ?acao=parte&id=&n=                um pedaço do arquivo (corpo binário, até 4 MB)
     POST ?acao=pronto&id=                  terminou o envio: entra na fila
     GET  ?acao=status&id=                  estado do arquivo (enviando, aguardando, lendo, pronto, erro)
     GET  ?acao=resultado&id=&n=            pedaço n do resultado (JSON em bytes)
     POST ?acao=cancelar&id= | ?acao=limpar&id=
   O computador da agência (cabeçalho Authorization: Bearer LEITURA_TOKEN, sem cookie):
     GET  ?acao=ola                         confere a chave (não mexe na fila)
     POST ?acao=publicar&loja=             análise profunda da loja (JSON, até 4 MB)
     GET  ?acao=snapshot                   dados do site para os agentes rodarem no computador da agência
     GET  ?acao=cerebro                    (site) última execução dos agentes no computador da agência
     GET  ?acao=analise                    (site) análises publicadas das lojas que a pessoa pode abrir
     GET  ?acao=proximo&nome=&nucleos=      pega o próximo arquivo da fila (e avisa que está ligado)
     GET  ?acao=baixar&id=&n=               pedaço n do arquivo
     POST ?acao=batida&id=                  "ainda estou lendo"
     POST ?acao=enviar&id=&n=               pedaço n do resultado
     POST ?acao=concluir&id=  {partes}      | ?acao=falhar&id=  {erro} */
const { getRepo } = require('../lib/db');
const P = require('../lib/promo-store');
const F = require('../lib/fila');
const { isClient } = require('../lib/scope');
const { send, readJson, query, sameSiteRequest, handle } = require('../lib/http');
const { authUser } = require('../lib/guard');
const { cfg } = require('../lib/config');

/* Gravação automática: com o relatório CONFERIDO (soma = Total do rodapé) e a loja CONFIRMADA pelo CNPJ, o servidor grava sozinho as vendas, o estoque e as semanas
   da Análise semanal, com as mesmas travas da tela. Divergência com número digitado à mão não é sobrescrita: vira aviso. */
const SISTEMA = { email: 'agente@computador', nome: 'Computador da agência', papel: 'admin', tipo: 'equipe', empresas: [] };
async function lerResultado(b, id, n) { const bufs = []; for (let i = 0; i < n; i++) bufs.push(await b.getParte(id, 'out', i)); return JSON.parse(Buffer.concat(bufs).toString('utf8')); }
async function autoGravar(b, j, r) {
  const repo = getRepo(), M = require('../lib/model'), out = {};
  if (!r.ok) return { pulou: 'a conferência não fechou: nada foi gravado' };
  await P.needLoja(repo, SISTEMA, j.loja);
  if (j.tipo === 'estoque') { const x = await P.importEstoque(repo, SISTEMA, j.loja, { items: r.items, arquivo: j.nome }); return { estoque: x }; }
  const cnpj = r.header && r.header.cnpj, cob = r.cobertura; if (!cob) return { pulou: 'relatório sem datas cobertas' };
  out.vendas = await P.importVendas(repo, SISTEMA, j.loja, { produtos: r.produtos, inicio: cob.inicio, fim: cob.fim, diaDescartado: r.diaParcial || '', linhas: r.linhas, candidatas: r.linhas, conferencia: { totalCentavos: r.totalRodapeCentavos, somaCentavos: r.somaCentavos }, cnpj, arquivo: (j.nome + (cnpj ? ' · CNPJ ' + cnpj : '') + ' · conferido').slice(0, 120) });
  const semanas = ((r.janela && r.janela.semanas) || []).filter(w => w.completa), antigas = (await M.loadState(repo)).weeks, ops = [], gravadas = [], divergentes = [];
  semanas.forEach(w => {
    const old = antigas.find(x => x.tipo === 'semana' && x.inicio === w.inicio && x.marca === j.loja), meu = old && /PDF de vendas conferido/.test(old.fonte || '');
    if (old && old.vendas != null && !meu && Math.round(old.vendas * 100) !== w.vendasCentavos) { divergentes.push({ inicio: w.inicio, fim: w.fim, noSiteCentavos: Math.round(old.vendas * 100), noPdfCentavos: w.vendasCentavos }); return; }
    ops.push({ t: 'week', op: 'upsert', tipo: 'semana', inicio: w.inicio, marca: j.loja, vendas: w.vendasCentavos / 100, compras: w.cupons, dias: w.dias7.map(v => (v == null ? null : v / 100)), c100n: w.c100n, c100rs: w.c100Centavos / 100,
      ig: old ? old.ig : {}, fb: old ? old.fb : {}, ads: old ? old.ads : {}, janela: old ? old.janela || '' : '', fonte: 'PDF de vendas conferido ao centavo (PowerShell)', obs: old && old.obs ? old.obs : 'Vendas = total do relatório (inclui taxa de entrega e arredondamentos); compras = cupons; cestas = cupons acima de R$ 100.', v: old ? old.v : undefined });
    gravadas.push(w.inicio);
  });
  if (ops.length) await M.applyOps(repo, ops, SISTEMA);
  out.semanas = { gravadas, divergentes }; return out;
}

const DO_COMPUTADOR = new Set(['ola', 'criativo-fila', 'criativo-ajustes', 'exportar', 'rascunho', 'previews', 'refazer-artes', 'aprendido', 'sincronizar', 'ideias', 'snapshot', 'loja', 'publicadas', 'despublicar', 'publicar', 'proximo', 'baixar', 'batida', 'enviar', 'concluir', 'falhar']);

async function bruto(req, limite) {
  if (Buffer.isBuffer(req.body)) { if (req.body.length > limite) throw F.bad('Pedaço grande demais', 413); return req.body; }
  if (req.body !== undefined && req.body !== null) throw F.bad('Envie o pedaço como application/octet-stream');
  let n = 0; const partes = [];
  for await (const c of req) { n += c.length; if (n > limite) throw F.bad('Pedaço grande demais', 413); partes.push(c); }
  return Buffer.concat(partes);
}
const binario = (res, buf) => { res.statusCode = 200; res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Length', buf.length); res.end(buf); };
const inteiro = (v, max) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > max) throw F.bad('Número de pedaço inválido'); return n; };

module.exports = handle(async (req, res) => {
  const q = query(req), acao = q.acao || '', b = F.backend();

  /* ---------- o computador da agência ---------- */
  if (DO_COMPUTADOR.has(acao)) {
    if (!cfg().leituraToken) return send(res, 503, { error: 'A variável LEITURA_TOKEN não existe neste deploy: confira o nome exato, o ambiente Production e faça Redeploy.' });
    if (!F.tokenOk(req)) return send(res, 401, { error: 'A chave enviada é diferente da variável LEITURA_TOKEN da Vercel (confira se colou a chave inteira, sem espaço, e refaça o Redeploy).' });
    if (acao === 'ola') return send(res, 200, { ok: true });                              /* só confere a chave; não pega arquivo nem conta como "ligado" */
    if (acao === 'proximo') {
      await b.visto({ nome: String(q.nome || '').slice(0, 60), nucleos: Number(q.nucleos) || 0, criativo: q.criativo === '1' });
      await b.limpar().catch(() => {});
      const j = await b.pegar(String(q.nome || 'pc').slice(0, 60));
      return send(res, 200, { job: j ? F.publico(j) : null });
    }
    if (acao === 'criativo-fila') { const C = require('../lib/criacao'), F2 = require('../lib/feed'); const dr = F2.novoDrive(cfg().serviceAccount), itens = await C.filaCriacao(getRepo(), SISTEMA, { drive: dr, dias: Number(process.env.N7_FILA_DIAS) || 7 }), aj = await C.filaAjustes(getRepo(), SISTEMA, { drive: dr }); return send(res, 200, { itens: [...aj.itens, ...itens], exportar: aj.exportar, semPreview: aj.semPreview, aprovadas: aj.aprovadas, descartadas: aj.descartadas }); }
    if (acao === 'aprendido') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'), b = await readJson(req, 20000); return send(res, 200, { aprendidos: await C.marcarAprendido(getRepo(), SISTEMA, b.codigos) }); }
    if (acao === 'refazer-artes') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'), b = await readJson(req, 20000); return send(res, 200, { refazendo: await C.refazerArtes(getRepo(), SISTEMA, b.codigos, b.instrucao) }); }
    if (acao === 'previews') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'), b = await readJson(req, 20000); return send(res, 200, await C.salvarPreviews(getRepo(), SISTEMA, String(b.codigo || ''), b)); }
    if (acao === 'criativo-ajustes') { const C = require('../lib/criacao'), F2 = require('../lib/feed'); return send(res, 200, await C.filaAjustes(getRepo(), SISTEMA, { drive: F2.novoDrive(cfg().serviceAccount) })); }
    if (acao === 'exportar') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'), D = require('../lib/drive-org'), b = await readJson(req, 4600000); return send(res, 200, { drive: await C.exportarRascunho(getRepo(), SISTEMA, String(b.marca || ''), String(b.codigo || ''), { drive: D.novoDriveEscrita(cfg().serviceAccount), arte: b.arte }) }); }
    if (acao === 'rascunho') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'); return send(res, 200, { rascunho: await C.guardarRascunho(getRepo(), SISTEMA, await readJson(req, 300000)) }); }
    if (acao === 'sincronizar') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); const C = require('../lib/criacao'), F2 = require('../lib/feed'); return send(res, 200, await C.sincronizar(getRepo(), SISTEMA, { drive: F2.novoDrive(cfg().serviceAccount) })); }
    if (acao === 'ideias') {                                                              /* ideias de conteúdo que saem das análises; ideia que já existe NÃO é recriada nem alterada */
      if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
      const M = require('../lib/model'), repo = getRepo(), corpo = await readJson(req, 200000), lista = Array.isArray(corpo.ideias) ? corpo.ideias.slice(0, 12) : [];
      const existentes = new Set((await M.loadState(repo)).ideas.map(i => i.id)), novas = lista.filter(i => /^auto-[A-Za-z0-9_-]{4,55}$/.test(String(i.id)) && !existentes.has(i.id));
      const ops = novas.map(i => ({ t: 'idea', op: 'upsert', id: i.id, b: String(i.b), format: i.format === 'Reels' ? 'Reels' : 'Carrossel', title: String(i.title || '').slice(0, 140), note: String(i.note || '').slice(0, 600), stage: 'nova', src: 'Agente (PowerShell): ' + String(i.src || 'análise de vendas').slice(0, 80), at: new Date().toISOString().slice(0, 10) }));
      if (ops.length) await M.applyOps(repo, ops, SISTEMA);
      return send(res, 200, { criadas: ops.map(o => o.id), jaExistiam: lista.length - ops.length });
    }
    if (acao === 'loja') { const c = await P.checarLoja(getRepo(), String(q.loja || ''), String(q.cnpj || '')); return send(res, 200, c); }
    if (acao === 'publicadas') return send(res, 200, { lojas: (await b.analises()).map(x => x.loja) });
    if (acao === 'despublicar') { if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' }); await b.despublicarAnalise(String(q.loja || '').replace(/[^A-Za-z0-9_-]/g, '')); return send(res, 200, { ok: true }); }
    if (acao === 'snapshot') {                                                            /* tudo o que os agentes do cérebro leem, para rodarem no computador da agência */
      const M = require('../lib/model'), DS = require('../lib/dataset'), repo = getRepo(), adm = { email: 'agente@computador', nome: 'Computador da agência', papel: 'admin', tipo: 'equipe', empresas: [] };
      const state = await M.loadState(repo), registry = await M.loadRegistry(repo, adm), v = await DS.view(await M.activeClients(repo));
      return send(res, 200, { N7: DS.filtered(null, { internal: true }, v), state, registry, now: new Date().toISOString() });
    }
    if (acao === 'publicar') {                                                            /* análise profunda de uma loja, feita no computador da agência */
      if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
      const loja = String(q.loja || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20), buf = await bruto(req, 4000000);
      if (!loja) return send(res, 400, { error: 'Falta a loja' });
      try { const j = JSON.parse(buf.toString('utf8')); if (!j || !(loja === '_cerebro' ? j.execucao : j.geral)) throw new Error('formato'); } catch (e) { return send(res, 400, { error: 'A análise publicada não é válida' }); }
      await b.publicarAnalise(loja, buf); return send(res, 200, { ok: true, bytes: buf.length });
    }
    const j = await b.job(String(q.id || ''));
    if (!j) return send(res, 404, { error: 'Arquivo não encontrado' });
    if (j.estado !== 'lendo') return send(res, 409, { error: 'Este arquivo não está mais sendo lido (foi cancelado ou já terminou)' });
    if (acao === 'baixar') { const p = await b.getParte(j.id, 'in', inteiro(q.n, F.MAX_PARTES)); return p ? binario(res, p) : send(res, 404, { error: 'Pedaço não encontrado' }); }
    if (acao === 'batida') { await b.atualizar(j.id, {}); return send(res, 200, { ok: true }); }
    if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
    if (acao === 'enviar') { const buf = await bruto(req, F.LIMITE_PARTE); await b.putParte(j.id, 'out', inteiro(q.n, 400), buf); return send(res, 200, { ok: true }); }
    const corpo = await readJson(req, 20000);
    if (acao === 'concluir') {
      const n = Number(corpo.partes);
      if (!Number.isInteger(n) || n < 1 || n > 400 || (await b.nPartes(j.id, 'out')) !== n) return send(res, 400, { error: 'O resultado chegou incompleto' });
      await b.apagarPartes(j.id, 'in');
      let n2 = n;
      try {
        const r = await lerResultado(b, j.id, n); let auto;
        try { auto = await autoGravar(b, j, r); } catch (e) { auto = { erro: String(e && e.message || e) }; }
        r.auto = auto; const bytes = Buffer.from(JSON.stringify(r)); await b.apagarPartes(j.id, 'out'); n2 = Math.max(1, Math.ceil(bytes.length / F.LIMITE_PARTE));
        for (let i = 0; i < n2; i++) await b.putParte(j.id, 'out', i, bytes.subarray(i * F.LIMITE_PARTE, (i + 1) * F.LIMITE_PARTE));
      } catch (e) { console.error('[n7] gravação automática:', e && e.message); }
      await b.atualizar(j.id, { estado: 'pronto', resultado_partes: n2, erro: '' });
      return send(res, 200, { ok: true });
    }
    if (acao === 'falhar') { await b.apagarPartes(j.id, 'in'); await b.atualizar(j.id, { estado: 'erro', erro: String(corpo.erro || 'Falha ao ler o arquivo').slice(0, 500) }); return send(res, 200, { ok: true }); }
  }

  /* ---------- quem usa o site ---------- */
  const user = await authUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  if (isClient(user)) return send(res, 403, { error: 'Sem acesso' });
  const meu = async id => { const j = await b.job(String(id || '')); if (!j || (j.por !== user.email && user.papel !== 'admin')) throw F.bad('Arquivo não encontrado', 404); return j; };

  if (req.method === 'GET') {
    if (acao === 'estado') {
      const v = await b.ultimoVisto(), seg = v ? (Date.now() - v.visto) / 1000 : null;
      return send(res, 200, { online: seg != null && seg <= F.ONLINE_S, haSegundos: seg == null ? null : Math.round(seg), nucleos: v && v.info && v.info.nucleos || 0, computador: v && v.info && v.info.nome || '', criativo: !!(v && v.info && v.info.criativo) });
    }
    if (acao === 'cerebro') {                                                              /* o que os agentes rodaram no computador da agência na última vez */
      const x = (await b.analises()).find(y => y.loja === '_cerebro'); if (!x) return send(res, 200, { cerebro: null });
      try { return send(res, 200, { cerebro: JSON.parse(x.dados.toString('utf8')), publicadoEm: new Date(x.em).toISOString() }); } catch (e) { return send(res, 200, { cerebro: null }); }
    }
    if (acao === 'analise') {                                                              /* análises publicadas, só das lojas que a pessoa pode abrir */
      const ok = new Set((await P.lojasDo(getRepo(), user)).map(c => c.key)), out = {};
      for (const x of await b.analises()) { if (!ok.has(x.loja)) continue; try { out[x.loja] = JSON.parse(x.dados.toString('utf8')); out[x.loja].publicadoEm = new Date(x.em).toISOString(); } catch (e) { /* publicação ilegível: ignora */ } }
      return send(res, 200, { lojas: out });
    }
    if (acao === 'status') return send(res, 200, F.publico(await meu(q.id)));
    if (acao === 'resultado') {
      const j = await meu(q.id); if (j.estado !== 'pronto') return send(res, 409, { error: 'O resultado ainda não está pronto' });
      const p = await b.getParte(j.id, 'out', inteiro(q.n, 400)); return p ? binario(res, p) : send(res, 404, { error: 'Pedaço não encontrado' });
    }
    return send(res, 400, { error: 'Ação desconhecida' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  if (!P.canWrite(user)) return send(res, 403, { error: 'Seu acesso é só de leitura' });

  if (acao === 'nova') {
    const c = await readJson(req, 20000), repo = getRepo();
    await P.needLoja(repo, user, c.loja);
    const bytes = Number(c.bytes), partes = Number(c.partes);
    if (!F.ehTipo(c.tipo)) return send(res, 400, { error: 'Tipo de arquivo inválido' });
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > F.LIMITE_ARQUIVO) return send(res, 400, { error: `Arquivo de 1 byte a ${Math.round(F.LIMITE_ARQUIVO / 1048576)} MB` });
    if (!Number.isInteger(partes) || partes < 1 || partes > F.MAX_PARTES || partes < Math.ceil(bytes / F.LIMITE_PARTE)) return send(res, 400, { error: 'Número de pedaços inválido' });
    if ((await b.ativos(user.email)) >= F.MAX_ATIVOS) return send(res, 429, { error: 'Há arquivos demais na fila. Espere terminarem.' });
    await b.limpar().catch(() => {});
    const id = F.novoId(); await b.criar({ id, loja: String(c.loja), tipo: c.tipo, nome: String(c.nome || '').slice(0, 200), bytes, partes, estado: 'enviando', por: user.email, criado_em: Date.now(), atualizado_em: Date.now() });
    return send(res, 200, { id });
  }
  const j = await meu(q.id);
  if (acao === 'parte') {
    if (j.estado !== 'enviando') return send(res, 409, { error: 'Este arquivo já foi enviado' });
    await b.putParte(j.id, 'in', inteiro(q.n, j.partes - 1), await bruto(req, F.LIMITE_PARTE)); return send(res, 200, { ok: true });
  }
  if (acao === 'pronto') {
    if (j.estado !== 'enviando') return send(res, 409, { error: 'Este arquivo já foi enviado' });
    if ((await b.nPartes(j.id, 'in')) !== j.partes) return send(res, 400, { error: 'Faltam pedaços do arquivo' });
    await b.atualizar(j.id, { estado: 'aguardando' }); return send(res, 200, { ok: true });
  }
  if (acao === 'cancelar') { if (['enviando', 'aguardando', 'lendo'].includes(j.estado)) { await b.apagarPartes(j.id); await b.atualizar(j.id, { estado: 'cancelado' }); } return send(res, 200, { ok: true }); }
  if (acao === 'limpar') { await b.apagar(j.id); return send(res, 200, { ok: true }); }
  return send(res, 400, { error: 'Ação desconhecida' });
});
