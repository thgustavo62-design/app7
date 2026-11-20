// Permissões revalidadas: desativar ou rebaixar um usuário na planilha vale na próxima requisição, não só no próximo login.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Repo, MemoryDriver } = require('../lib/repo');
const model = require('../lib/model');
const { freshUser, forget } = require('../lib/guard');

const admin = { email: 'dev@agencia.test', nome: 'Dev', papel: 'admin', tipo: 'equipe', empresas: [] };
const mk = () => new Repo(new MemoryDriver(require('../lib/seed').build({ devEmail: 'dev@agencia.test' })));

test('guard: papel e empresas vêm do cadastro de agora, não do cookie; desativado perde o acesso', async () => {
  forget(); const r = mk();
  await model.applyOps(new Repo(r.d), [{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'editor', empresas: [] }], admin);
  const cookie = { email: 'ana@x.com', nome: 'Ana', papel: 'editor', tipo: 'equipe', empresas: [] };
  let t = 1000;
  const u1 = await freshUser(new Repo(r.d), cookie, { now: t }); assert.equal(u1.papel, 'editor');
  /* o admin rebaixa Ana para leitura e restringe à empresa M */
  await model.applyOps(new Repo(r.d), [{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'leitura', empresas: ['M'], v: (await new Repo(r.d).rows('Usuarios')).find(x => x.email === 'ana@x.com').versao }], admin);
  assert.equal((await freshUser(new Repo(r.d), cookie, { now: t + 5000 })).papel, 'editor', 'dentro dos 10 s a memória vale (poupa a planilha)');
  const u2 = await freshUser(new Repo(r.d), cookie, { now: t + 11000 });
  assert.equal(u2.papel, 'leitura'); assert.deepEqual(u2.empresas, ['M']);
  /* o cookie antigo diz editor, mas quem manda é o cadastro: gravar agora é recusado */
  await assert.rejects(model.applyOps(new Repo(r.d), [{ t: 'goal', key: 'M-sales', value: 1 }], u2), /só de leitura/);
  /* desativada: sem acesso nenhum */
  const rows = await new Repo(r.d).rows('Usuarios'), ana = rows.find(x => x.email === 'ana@x.com');
  await model.applyOps(new Repo(r.d), [{ t: 'user', op: 'upsert', email: 'ana@x.com', nome: 'Ana', tipo: 'equipe', papel: 'leitura', empresas: ['M'], ativo: 'nao', v: ana.versao }], admin);
  const off = await freshUser(new Repo(r.d), cookie, { now: t + 30000 });
  assert.equal(off, null, 'usuário desativado perde o acesso mesmo com o cookie ainda válido');
  forget();
});
test('guard: o primeiro acesso (trocar senha) continua marcado e o login de desenvolvimento sem linha na planilha segue valendo', async () => {
  forget(); const r = mk();
  const t = await freshUser(r, { ...admin, trocar: true }, { now: 5000 }); assert.equal(t.trocar, true);
  forget(); const dev = await freshUser(r, { email: 'solto@dev.local', papel: 'admin', tipo: 'equipe', empresas: [] }, { now: 5000, devEmail: 'solto@dev.local' }); assert.equal(dev.papel, 'admin');
  forget(); assert.equal(await freshUser(r, { email: 'solto@dev.local', papel: 'admin', tipo: 'equipe', empresas: [] }, { now: 5000 }), null, 'sem login de desenvolvimento, quem não está na planilha não entra');
  assert.equal(await freshUser(r, null), null);
});
