/* Utilidades de resposta HTTP, com a API de Node pura (igual na Vercel e no servidor local). */
const { cfg } = require('./config');
const session = require('./session');

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 200000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) { const e = new Error('Pedido grande demais'); e.status = 413; throw e; } chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const query = req => Object.fromEntries(new URL(req.url, 'http://x').searchParams);

/* Gravações exigem o cabeçalho X-N7 (um formulário de outro site não consegue enviá-lo)
   e, se houver Origin, ele precisa ser deste mesmo endereço. */
function sameSiteRequest(req) {
  if (req.headers['x-n7'] !== '1') return false;
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

const currentUser = req => { const c = cfg(); return session.fromRequest(req, c.sessionSecret); };

function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      const status = e.status && e.status < 600 ? e.status : (e instanceof SyntaxError ? 400 : 500);
      if (status >= 500) console.error('[n7]', e && e.message);
      send(res, status, { error: status >= 500 && !e.expose ? 'Erro interno. Tente de novo em instantes.' : e.message });
    }
  };
}

module.exports = { send, readJson, query, sameSiteRequest, currentUser, handle };
