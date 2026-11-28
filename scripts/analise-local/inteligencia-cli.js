/* Roda a Inteligência de vendas da semana para todas as lojas do armazém, uma loja por núcleo (worker_threads), e grava o relatório da semana.
   Uso: node inteligencia-cli.js [--loja F --loja M] [--semana AAAA-MM-DD] [--saida PASTA] [--nucleos N] [--nome F="Farma e Farma"]
   Saída: <pasta>/<loja>/semana-<segunda>.json e .md, e ultima.md (a mais recente). Código de saída: 0 ok; 4 nenhuma loja com semanas para comparar.
   Só lê o armazém (linhas de venda já conferidas ao centavo) e só mexe em produto e categoria: o cliente não é lido. Não publica nada: quem publica no site é o agente (Agente.ps1). */
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const fs = require('fs'), path = require('path'), os = require('os');

if (!isMainThread) {
  const Z = require('./armazem'), INT = require('./inteligencia'), w = Z.carregar(workerData.loja);
  const t0 = Date.now(), i = w.rows.length ? INT.analisarSemana({ rows: w.rows, diasCobertos: w.dias, semana: workerData.semana || null }) : { ok: false, nota: 'Sem vendas no armazém.' };
  parentPort.postMessage({ loja: workerData.loja, i, ms: Date.now() - t0, dias: w.dias.size });
} else {
  const arg = (nome, multi) => { const v = []; process.argv.forEach((a, k) => { if (a === '--' + nome && process.argv[k + 1]) v.push(process.argv[k + 1]); }); return multi ? v : v[0]; };
  const Z = require('./armazem'), INT = require('./inteligencia');
  const docs = fs.existsSync(path.join(os.homedir(), 'Documents')) ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), '.nova7');
  const saida = arg('saida') || path.join(process.env.N7_RELATORIOS || path.join(docs, 'Nova7 Relatórios'), 'Inteligência');
  const pedidas = arg('loja', true), lojas = pedidas.length ? pedidas : Z.lojas(), semana = arg('semana') || '', nucleos = Math.max(1, Number(arg('nucleos')) || os.cpus().length);
  const nomes = Object.fromEntries(arg('nome', true).map(x => { const k = x.indexOf('='); return [x.slice(0, k), x.slice(k + 1)]; }));
  if (!lojas.length) { console.error('Nenhuma loja no armazém (' + Z.base() + ').'); process.exit(4); }
  const rodar = loja => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { loja, semana } }); w.once('message', res); w.once('error', rej); });
  (async () => {
    const t0 = Date.now(), fila = lojas.slice(), feitos = []; let ok = 0;
    await Promise.all(Array.from({ length: Math.min(nucleos, fila.length) }, async () => { while (fila.length) { const loja = fila.shift(); try { feitos.push(await rodar(loja)); } catch (e) { feitos.push({ loja, i: { ok: false, nota: 'Falhou: ' + e.message }, ms: 0, dias: 0 }); } } }));
    feitos.sort((a, b) => String(a.loja).localeCompare(String(b.loja)));
    for (const r of feitos) {
      const nome = nomes[r.loja] || r.loja, dir = path.join(saida, String(r.loja).replace(/[^A-Za-z0-9_-]/g, '_'));
      if (!r.i.ok) { console.log(`Loja ${nome}: ${r.i.nota}`); continue; }
      ok++; fs.mkdirSync(dir, { recursive: true });
      const md = INT.markdown(nome, r.i), base = path.join(dir, 'semana-' + r.i.semana.inicio);
      fs.writeFileSync(base + '.json', JSON.stringify(r.i, null, 1)); fs.writeFileSync(base + '.md', md); fs.writeFileSync(path.join(dir, 'ultima.md'), md);
      console.log(`Loja ${nome}: semana de ${r.i.semana.inicio} (${r.i.confianca}) · foco: ${r.i.foco.map(f => f.titulo).join(' | ') || 'nada fora do ritmo'} · ${r.ms} ms · ${base}.md`);
    }
    console.log(`${ok} de ${feitos.length} loja(s) analisada(s) em ${((Date.now() - t0) / 1000).toFixed(1)} s, ${Math.min(nucleos, lojas.length)} em paralelo.`);
    process.exit(ok ? 0 : 4);
  })();
}
