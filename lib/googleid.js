/* Verifica o ID token do "Entrar com Google" (JWT RS256) com as chaves públicas do Google. */
const crypto = require('crypto');
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = { at: 0, keys: null };

async function fetchJwks(fetchFn = fetch, now = Date.now()) {
  if (jwksCache.keys && now - jwksCache.at < 3600e3) return jwksCache.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new Error('Não foi possível obter as chaves do Google');
  const body = await res.json();
  jwksCache = { at: now, keys: body.keys || [] };
  return jwksCache.keys;
}

async function verifyIdToken(token, { clientId, fetchFn = fetch, now = Date.now(), jwks } = {}) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID ausente');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Token inválido');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('Algoritmo não aceito');
  const keys = jwks || await fetchJwks(fetchFn, now);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Chave do token desconhecida');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Assinatura inválida');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('Emissor inválido');
  if (claims.aud !== clientId) throw new Error('Token de outro aplicativo');
  if (!claims.exp || claims.exp < Math.floor(now / 1000)) throw new Error('Token expirado');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('E-mail não verificado');
  return { email: String(claims.email || '').toLowerCase(), name: claims.name || '' };
}

module.exports = { verifyIdToken, fetchJwks, _resetCache() { jwksCache = { at: 0, keys: null }; } };
