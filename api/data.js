/* GET /api/data: entrega o conjunto de dados dos clientes como script, só para quem fez login.
   O arquivo private/data.js fica fora da pasta pública e nunca é servido como arquivo estático. */
const fs = require('fs');
const path = require('path');
const { currentUser, handle, send } = require('../lib/http');

module.exports = handle(async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  if (!currentUser(req)) return send(res, 401, { error: 'login' });
  const js = fs.readFileSync(path.join(__dirname, '..', 'private', 'data.js'), 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(js);
});
