/* Servidor local: serve public/ e as funções de api/ (com dados em memória).
   Uso: node dev-server.js   (porta 3000; mude com PORT=...). Login de desenvolvimento ligado. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

/* aplica os mesmos cabeçalhos de segurança do vercel.json (inclui o CSP), para o teste local ser fiel */
let SECURITY = [];
try { SECURITY = (JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).headers.find(h => h.source === '/(.*)') || { headers: [] }).headers; } catch (e) { /* sem vercel.json */ }

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    SECURITY.forEach(h => res.setHeader(h.key, h.value));
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      let handler;
      try { handler = require(path.join(__dirname, 'api', api[1] + '.js')); } catch (e) { res.statusCode = 404; return res.end('{"error":"não encontrado"}'); }
      return handler(req, res);
    }
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname === '/app' ? '/app.html' : url.pathname)));
    if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end('Não encontrado'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(buf);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Central Nova7 em http://localhost:${port}  (dados em memória; login de desenvolvimento)`));
}
module.exports = { createServer };
