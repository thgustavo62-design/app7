/* Login por e-mail e senha. Quem ainda não tem senha própria (senha_hash vazio) entra com a senha padrão
   (variável SENHA_PADRAO) e é obrigado a criar a sua no primeiro acesso. Depois de 5 erros seguidos,
   a conta fica bloqueada por 15 minutos. A resposta nunca revela se o e-mail existe. */
const { ConfigError } = require('./config');
const { findUser } = require('./model');
const P = require('./password');

const MAX_TRIES = 5, LOCK_MS = 15 * 60e3;
const GENERIC = 'E-mail ou senha incorretos.';
const norm = v => String(v || '').trim().toLowerCase();
const isActive = r => String(r.ativo).trim().toLowerCase() !== 'nao';
const bad = (status, error) => ({ status, error });
let DUMMY = null;                                        /* hash falso: e-mail inexistente gasta o mesmo tempo */

async function row(repo, email) { return (await repo.rows('Usuarios')).find(r => norm(r.email) === email) || null; }

async function checkPassword(repo, emailRaw, senha, c, now = Date.now()) {
  const email = norm(emailRaw), pw = String(senha || '');
  if (!email || !pw || pw.length > 200) return bad(401, GENERIC);
  const r = await row(repo, email);
  if (!r || !isActive(r)) { if (!DUMMY) DUMMY = P.hash('x'); P.verify(pw, DUMMY); return bad(401, GENERIC); }
  const until = Number(r.bloqueado_ate) || 0;
  if (until > now) return bad(429, `Muitas tentativas erradas. Tente de novo em ${Math.ceil((until - now) / 60e3)} minuto(s).`);
  let ok;
  if (r.senha_hash) ok = P.verify(pw, r.senha_hash);
  else {
    if (!c.defaultPassword) throw new ConfigError('Falta a variável SENHA_PADRAO na Vercel (Settings > Environment Variables). Depois de criá-la, faça um novo deploy.');
    ok = P.same(pw, c.defaultPassword);
  }
  if (!ok) {
    const tries = (Number(r.tentativas) || 0) + 1;
    await repo.upsert('Usuarios', tries >= MAX_TRIES ? { email: r.email, tentativas: '', bloqueado_ate: String(now + LOCK_MS) } : { email: r.email, tentativas: String(tries) });
    return tries >= MAX_TRIES ? bad(429, 'Muitas tentativas erradas. A conta ficou bloqueada por 15 minutos.') : bad(401, GENERIC);
  }
  if (r.tentativas || r.bloqueado_ate) await repo.upsert('Usuarios', { email: r.email, tentativas: '', bloqueado_ate: '' });
  const user = await findUser(repo, email);
  if (!user) return bad(401, GENERIC);
  if (!r.senha_hash) user.trocar = true;
  return { user };
}

/* define a senha própria. Quem já tem senha precisa informar a atual; no primeiro acesso (trocar) não. */
async function setPassword(repo, session, nova, atual, c) {
  const email = norm(session.email), r = await row(repo, email);
  if (!r || !isActive(r)) return bad(401, 'Acesso não encontrado.');
  if (!session.trocar && !(r.senha_hash && atual && P.verify(String(atual), r.senha_hash))) return bad(403, 'A senha atual não confere.');
  const msg = P.rules(nova, c.defaultPassword);
  if (msg) return bad(400, msg);
  await repo.upsert('Usuarios', { email: r.email, senha_hash: P.hash(nova), tentativas: '', bloqueado_ate: '' }, { user: { email } });
  const user = await findUser(repo, email);
  return user ? { user } : bad(401, 'Acesso não encontrado.');
}
module.exports = { checkPassword, setPassword, MAX_TRIES, LOCK_MS };
