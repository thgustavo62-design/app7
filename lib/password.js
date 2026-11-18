/* Senhas: hash com scrypt (nativo do Node, sem dependências) e comparação em tempo constante. */
const crypto = require('crypto');
const N = 16384;

function hash(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { N });
  return `s1$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
function verify(pw, stored) {
  const [v, s, h] = String(stored || '').split('$');
  if (v !== 's1' || !s || !h) return false;
  const want = Buffer.from(h, 'base64url');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64url'), want.length, { N });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
/* compara dois textos sem vazar, pelo tempo, onde diferem */
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
/* regras da senha nova: 8 a 72 caracteres, diferente da senha padrão, com letra e número */
function rules(pw, defaultPw) {
  const s = String(pw || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s.length > 72) return 'A senha pode ter no máximo 72 caracteres.';
  if (defaultPw && same(s, defaultPw)) return 'Escolha uma senha diferente da senha padrão.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  return '';
}
module.exports = { hash, verify, same, rules };
