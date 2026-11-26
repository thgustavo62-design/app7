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

const DO_COMPUTADOR = new Set(['ola', 'proximo', 'baixar', 'batida', 'enviar', 'concluir', 'falhar']);

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
    if (!F.tokenOk(req)) return send(res, 401, { error: 'Token do computador inválido ou ausente' });
    if (acao === 'ola') return send(res, 200, { ok: true });                              /* só confere a chave; não pega arquivo nem conta como "ligado" */
    if (acao === 'proximo') {
      await b.visto({ nome: String(q.nome || '').slice(0, 60), nucleos: Number(q.nucleos) || 0 });
      await b.limpar().catch(() => {});
      const j = await b.pegar(String(q.nome || 'pc').slice(0, 60));
      return send(res, 200, { job: j ? F.publico(j) : null });
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
      await b.apagarPartes(j.id, 'in'); await b.atualizar(j.id, { estado: 'pronto', resultado_partes: n, erro: '' });
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
      return send(res, 200, { online: seg != null && seg <= F.ONLINE_S, haSegundos: seg == null ? null : Math.round(seg), nucleos: v && v.info && v.info.nucleos || 0, computador: v && v.info && v.info.nome || '' });
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
