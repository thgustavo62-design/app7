/* /api/drive: agente do Drive (organiza as pastas de postagens). Só administrador ou editor. Nunca apaga: só renomeia, e só o que foi aprovado.
   GET  ?marca=M&acao=propor            lê a pasta e devolve as mudanças propostas (com o motivo) e os avisos
   GET  ?marca=M&acao=logs              as últimas aplicações (para desfazer)
   POST {acao:'aplicar', marca, ids}    aplica as mudanças aprovadas (o servidor refaz o plano e só aceita ids que ainda existem)
   POST {acao:'desfazer', marca, log}   volta os nomes de uma aplicação (pula o que mudou depois)
   GET  ?marca=M&acao=referencias | rascunhos     referências do agente criativo e os rascunhos dele
   POST {acao:'referencias', marca, ...}  salva as referências (perfis da V4, estilo, o que evitar)
   POST {acao:'decidir', codigo, status}  aprovar ou descartar um rascunho
   GET  ?marca=M&acao=permissao           diz se a conta de serviço pode criar arquivos na pasta (Editor) e se é Drive compartilhado
   POST {acao:'ajustar', codigo, instrucao}   pede ao agente criativo para refazer o rascunho
   POST {acao:'exportar', marca, codigo}      manda legenda (e as artes já enviadas) do rascunho para a pasta do post no Drive
   POST {acao:'sincronizar'}              adianta para Aprovação as pautas com arte e legenda completas no Drive */
const { getRepo } = require('../lib/db');
const D = require('../lib/drive-org');
const C = require('../lib/criacao');
const F = require('../lib/feed');
const { cfg } = require('../lib/config');
const { send, readJson, query, sameSiteRequest, handle } = require('../lib/http');
const { authUser } = require('../lib/guard');

module.exports = handle(async (req, res) => {
  const user = await authUser(req);
  if (!user) return send(res, 401, { error: 'login' });
  if (user.trocar) return send(res, 403, { error: 'trocar_senha' });
  const repo = getRepo(), sa = cfg().serviceAccount;
  if (req.method === 'GET') {
    const q = query(req); if (!q.marca) return send(res, 400, { error: 'Falta a empresa (marca)' });
    if (q.acao === 'permissao') { const dw = D.novoDriveEscrita(sa); if (!dw) return send(res, 200, { ligado: false, erro: 'Falta GOOGLE_SERVICE_ACCOUNT_JSON.' }); try { const id = await C.raizDe(repo, q.marca), cap = await dw.capacidades(id); return send(res, 200, Object.assign({ ligado: true, conta: dw.email }, cap)); } catch (e) { return send(res, 200, { ligado: true, conta: dw.email, podeCriar: false, erro: e.expose ? e.message : 'Não consegui consultar o Drive.' }); } }
    if (q.acao === 'logs') return send(res, 200, { logs: await D.logs(repo, user, q.marca) });
    if (q.acao === 'referencias') return send(res, 200, { referencias: await C.lerReferencias(repo, q.marca) });
    if (q.acao === 'rascunhos') return send(res, 200, { rascunhos: (await C.lerRascunhos(repo, q.marca)).slice(0, 30) });
    return send(res, 200, await D.propor(repo, user, q.marca, { drive: D.novoDriveEscrita(sa) }));
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!sameSiteRequest(req)) return send(res, 403, { error: 'Pedido de origem desconhecida' });
  const b = await readJson(req, 60000);
  if (b.acao === 'sincronizar') { if (!F.podeEditar(user)) return send(res, 403, { error: 'Seu acesso é só de leitura.' }); return send(res, 200, await C.sincronizar(repo, user, { drive: F.novoDrive(sa) })); }
  if (b.acao === 'decidir') { const r = await C.decidirRascunho(repo, user, String(b.codigo || ''), String(b.status || '')); let movidas = []; if (r.status === 'aprovado') { try { movidas = (await C.sincronizar(repo, user, { drive: F.novoDrive(sa) })).movidas; } catch (e) { /* o agente tenta de novo em 30 minutos */ } } return send(res, 200, { rascunho: r, movidas }); }
  if (b.acao === 'ajustar') return send(res, 200, { rascunho: await C.pedirAjuste(repo, user, String(b.codigo || ''), b) });
  if (b.acao === 'exportar') { if (!F.podeEditar(user)) return send(res, 403, { error: 'Seu acesso é só de leitura.' }); return send(res, 200, { drive: await C.exportarRascunho(repo, user, String(b.marca || ''), String(b.codigo || ''), { drive: D.novoDriveEscrita(sa) }) }); }
  if (!b.marca) return send(res, 400, { error: 'Falta a empresa (marca)' });
  if (b.acao === 'referencias') return send(res, 200, { referencias: await C.salvarReferencias(repo, user, b.marca, b) });
  if (b.acao === 'aplicar') return send(res, 200, await D.aplicarAprovadas(repo, user, b.marca, b.ids, { drive: D.novoDriveEscrita(sa) }));
  if (b.acao === 'desfazer') return send(res, 200, await D.desfazerLog(repo, user, b.marca, b.log, { drive: D.novoDriveEscrita(sa) }));
  return send(res, 400, { error: 'Ação desconhecida' });
});
