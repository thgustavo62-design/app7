/* Coleta os dados que os agentes analisam e grava num arquivo (snapshot.json).
   Uso: node coletar.js <arquivo-de-saida> [--local]
   - sem --local: entra no site publicado (N7_URL, N7_EMAIL e N7_SENHA vêm do ambiente; nada disso é gravado) e baixa /api/data e /api/state.
   - com --local: usa os dados de exemplo do próprio repositório (private/data.js + semanas de teste), sem internet e sem login. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const [out, ...flags] = process.argv.slice(2);
if (!out) { console.error('Uso: node coletar.js <saida.json> [--local]'); process.exit(2); }

async function local() {
  process.env.NODE_ENV = 'development'; delete process.env.VERCEL;
  delete process.env.DB_BACKEND; delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.SHEET_ID_DB; delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const { getRepo } = require(path.join(ROOT, 'lib', 'db'));
  const M = require(path.join(ROOT, 'lib', 'model'));
  const DS = require(path.join(ROOT, 'lib', 'dataset'));
  const repo = getRepo(), user = { email: 'analise@local', nome: 'Análise local', papel: 'admin', tipo: 'equipe', empresas: [] };
  const state = await M.loadState(repo), registry = await M.loadRegistry(repo, user);
  const N7 = DS.filtered(null, { internal: true });
  return { fonte: 'local (dados de exemplo do repositório)', N7, state, registry, now: new Date().toISOString() };
}

async function remoto() {
  const BASE = (process.env.N7_URL || 'https://app7-eight.vercel.app').replace(/\/$/, '');
  const email = process.env.N7_EMAIL, senha = process.env.N7_SENHA;
  if (!email || !senha) throw new Error('Faltam N7_EMAIL e N7_SENHA no ambiente (o Analisar.ps1 pergunta e passa sozinho).');
  const H = c => ({ 'content-type': 'application/json', 'x-n7': '1', origin: BASE, cookie: c || '' });
  const r = await fetch(BASE + '/api/auth?action=password', { method: 'POST', headers: H(), body: JSON.stringify({ email, senha }) });
  if (!r.ok) throw new Error('Login recusado (' + r.status + '). Confira e-mail e senha.');
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const get = async p => { const x = await fetch(BASE + p, { headers: H(cookie) }); if (!x.ok) throw new Error(p + ' respondeu ' + x.status); return x; };
  const js = await (await get('/api/data')).text(), ctx = { window: {} };
  vm.runInNewContext(js, ctx);
  const st = await (await get('/api/state')).json();
  return { fonte: 'produção (' + BASE + ')', N7: JSON.parse(JSON.stringify(ctx.window.N7)), state: st.state, registry: st.registry, now: st.now };
}

(async () => {
  const snap = await (flags.includes('--local') ? local() : remoto());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap));
  const n = o => (o ? Object.keys(o).length : 0);
  console.log(`Coletado de ${snap.fonte}: ${snap.N7.PLAN.length} pautas do plano, ${(snap.state.weeks || []).length} linhas de semana, ${snap.registry.clients.length} clientes, ${(snap.state.ideas || []).length} ideias.`);
})().catch(e => { console.error('FALHOU: ' + e.message); process.exit(1); });
