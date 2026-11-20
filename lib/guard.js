/* Usuário da requisição, sempre conferido com o cadastro de hoje.
   O cookie assinado guarda papel e empresas de quando a pessoa entrou (até 12 horas), então alterar ou desativar um usuário na planilha
   não valeria até ele entrar de novo. Aqui cada API confere o cadastro (com 10 segundos de memória por instância, para não ler a planilha
   a cada clique): usuário desativado ou removido perde o acesso, e papel e empresas valem os atuais. */
const { currentUser } = require('./http');
const { cfg } = require('./config');
const { findUser } = require('./model');
const TTL_MS = 10000;
const memo = new Map();

async function freshUser(repo, s, { now = Date.now(), ttl = TTL_MS, devEmail = '' } = {}) {
  if (!s || !s.email) return null;
  const hit = memo.get(s.email);
  let u;
  if (hit && now - hit.at < ttl) u = hit.user;
  else {
    u = await findUser(repo, s.email);
    if (!u && devEmail && s.email === String(devEmail).trim().toLowerCase()) u = s;      /* login de desenvolvimento sem linha na planilha */
    memo.set(s.email, { at: now, user: u });
  }
  return u ? Object.assign({}, u, s.trocar ? { trocar: true } : {}) : null;
}
const forget = email => { if (email) memo.delete(String(email).toLowerCase()); else memo.clear(); };

async function authUser(req) {
  const s = currentUser(req); if (!s) return null;
  const { getRepo } = require('./db');
  return freshUser(getRepo(), s, { devEmail: cfg().devEmail });
}
module.exports = { authUser, freshUser, forget };
