/* Dados dos clientes (private/data.js), carregados no servidor e entregues já filtrados para cada usuário.
   Quem é de uma empresa só nunca recebe os dados das outras: o filtro é aqui, não na tela. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILE = path.join(__dirname, '..', 'private', 'data.js');
let text = null, parsed = null;

function source() { if (text == null) text = fs.readFileSync(FILE, 'utf8'); return text; }
function load() {
  if (!parsed) { const ctx = { window: {} }; vm.runInNewContext(source(), ctx); parsed = JSON.parse(JSON.stringify(ctx.window.N7)); }   /* copia para este contexto: arrays de outro contexto confundem comparações */
  return parsed;
}
/* código da pauta do plano -> chave da empresa */
function planBrands() { return new Map(load().PLAN.map(p => [p.code, p.b])); }
const keyed = (obj, ok) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => ok(k)));

/* allowed: Set de chaves ou null (tudo). internal=false remove o que é só da equipe (auditoria, alertas, rotina). */
function filtered(allowed, { internal = true } = {}) {
  const D = load(), ok = k => !allowed || allowed.has(k);
  const has = k => ok(k);
  return {
    TODAY: D.TODAY, CENTRAL: D.CENTRAL, WINDOWS: D.WINDOWS,
    CLIENTS: D.CLIENTS.filter(c => ok(c.key)),
    WEEKLY: keyed(D.WEEKLY, ok),
    FAIR: D.FAIR.filter(f => ok(f.key)),
    MINAS_AUG: has('M') ? D.MINAS_AUG : null,
    FARMA_DAILY: has('F') ? D.FARMA_DAILY : null,
    FARMA_BASKET: has('F') ? D.FARMA_BASKET : [],
    FB_DAILY: has('F') ? D.FB_DAILY : null,
    FINDINGS: internal ? D.FINDINGS.filter(f => ok(f.b)) : [],
    ALERTS: internal ? D.ALERTS.filter(a => ok(a.b)) : [],
    IG_POSTS: keyed(D.IG_POSTS, ok),
    PLAN: D.PLAN.filter(p => ok(p.b)),
    ROUTINE: internal ? D.ROUTINE : []
  };
}
/* script entregue em /api/data; sem restrição entrega o arquivo original */
function scriptFor(allowed, opts = {}) {
  if (!allowed && opts.internal !== false) return source();
  return 'window.N7 = ' + JSON.stringify(filtered(allowed, opts)) + ';\n';
}
module.exports = { load, planBrands, filtered, scriptFor };
