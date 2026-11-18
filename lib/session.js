/* Sessão em cookie assinado (HMAC-SHA256). Sem estado no servidor. */
const crypto = require('crypto');
const NAME = 'n7_session';
const b64 = s => Buffer.from(s).toString('base64url');
const mac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function create(user, secret, ttl, now = Date.now()) {
  if (!secret) throw new Error('SESSION_SECRET ausente');
  const body = b64(JSON.stringify({ e: user.email, n: user.nome || '', r: user.papel || 'leitura', x: Math.floor(now / 1000) + ttl }));
  return `${body}.${mac(secret, body)}`;
}
function verify(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const good = mac(secret, body);
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.x || p.x < Math.floor(now / 1000)) return null;
    return { email: p.e, nome: p.n, papel: p.r };
  } catch (e) { return null; }
}
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); });
  return out;
}
const fromRequest = (req, secret, now) => verify(parseCookies(req.headers && req.headers.cookie)[NAME], secret, now);
const setCookie = (value, { secure, maxAge }) => `${NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
const clearCookie = secure => setCookie('', { secure, maxAge: 0 });

module.exports = { NAME, create, verify, parseCookies, fromRequest, setCookie, clearCookie };
