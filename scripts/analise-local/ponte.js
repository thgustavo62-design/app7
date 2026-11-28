/* Ponte entre o agente e a extensão "Nova7 ↔ ChatGPT" do Chrome.
   O agente escreve o pedido (prompt) aqui; a extensão, que roda no Chrome já logado no ChatGPT da agência, busca o pedido,
   conversa no chatgpt.com como uma pessoa e devolve a resposta. Nada de API paga: usa o plano do ChatGPT.
   Segurança: escuta SÓ em 127.0.0.1, exige o token (gerado sozinho, guardado em %USERPROFILE%\.nova7\ponte.json e copiado
   para config.json da pasta da extensão) e recusa pedidos vindos de páginas da internet (só aceita a própria extensão). */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawn } = require('child_process');

const PORTA_PADRAO = 47710;
const PASTA_EXTENSAO = process.env.N7_EXTENSAO_DIR || path.join(__dirname, 'extensao-chatgpt');
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* token fixo entre reinícios, para a extensão não precisar ser reconfigurada */
function lerOuCriarToken(casa) {
  const arq = path.join(casa || path.join(os.homedir(), '.nova7'), 'ponte.json');
  try { const j = JSON.parse(fs.readFileSync(arq, 'utf8')); if (j.token && j.token.length >= 24) return j.token; } catch (e) { /* ainda não existe */ }
  const token = crypto.randomBytes(24).toString('hex');
  try { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify({ token }), { mode: 0o600 }); } catch (e) { /* sem disco: vale só nesta execução */ }
  return token;
}

/* "a extensão já apareceu alguma vez neste computador?" — só então vale a pena o agente abrir o Chrome sozinho */
const arqPonte = () => path.join(os.homedir(), '.nova7', 'ponte.json');
const jaVistaAntes = () => { try { return JSON.parse(fs.readFileSync(arqPonte(), 'utf8')).visto === true; } catch (e) { return false; } };
const marcarVista = () => { try { const j = JSON.parse(fs.readFileSync(arqPonte(), 'utf8')); j.visto = true; fs.writeFileSync(arqPonte(), JSON.stringify(j), { mode: 0o600 }); } catch (e) { /* sem disco */ } };

/* rotas: async ({ metodo, caminho, q, corpo }) => { status?, json } | { arquivo:{buf,tipo} } | null  (a página "Base de regras" da extensão); origemExtra: regex de origem aceita além da extensão (testes) */
function criar({ porta = PORTA_PADRAO, token, log = () => {}, pastaExtensao = PASTA_EXTENSAO, vivaMs = 70000, persistir = false, rotas = null, origemExtra = null } = {}) {
  token = token || lerOuCriarToken(); let vista = persistir ? jaVistaAntes() : false;
  const fila = [];                 // pedidos esperando a extensão buscar
  const emAndamento = new Map();   // pedidos já entregues à extensão
  const historico = []; let vistoEm = 0, esperando = [], versaoExtensao = '', estado = { feitos: 0, falhas: 0, ultimoErro: '' };
  const conectada = () => Date.now() - vistoEm < vivaMs;
  const visto = req => { vistoEm = Date.now(); versaoExtensao = String(req.headers['x-n7-versao'] || versaoExtensao); if (!vista) { vista = true; if (persistir) marcarVista(); } };

  function acordar() { const e = esperando; esperando = []; e.forEach(f => f()); }
  function finalizar(id, fn, resultado) { const p = emAndamento.get(id) || fila.find(x => x.id === id); if (!p) return false; clearTimeout(p.timer); historico.push({ tipo: p.tipo, em: new Date().toISOString(), segundos: Math.round((Date.now() - p.criadoEm) / 1000), ok: !!(resultado && !resultado.erro), erro: String(resultado && resultado.erro || '').slice(0, 320) }); emAndamento.delete(id); const i = fila.indexOf(p); if (i >= 0) fila.splice(i, 1); fn(p); return true; }

  /* pede ao ChatGPT (pela extensão) e devolve { texto, blocos }. Rejeita com .codigo = 'SEM_EXTENSAO' | 'TEMPO' | 'CHATGPT' */
  /* enfileira um trabalho e devolve o corpo bruto que a extensão respondeu ({ resultados, erro } ou, no formato antigo, { texto, blocos, erro }) */
  function enfileirar(carga, tempoMs, aguardarConexaoMs = 0) {
    return new Promise(async (resolve, reject) => {
      if (!conectada() && aguardarConexaoMs) await aguardarConexao(aguardarConexaoMs);
      if (!conectada()) return reject(Object.assign(new Error('A extensão do Chrome não está conectada (abra o Chrome com a extensão "Nova7 ↔ ChatGPT" ligada e o ChatGPT logado).'), { codigo: 'SEM_EXTENSAO' }));
      const tipo = carga.instagram ? 'instagram @' + carga.instagram.handle : carga.mensagens ? 'conversa de ' + carga.mensagens.length + ' mensagem(ns)' + (carga.mensagens.some(m => m.imagem) ? ' com imagem' : '') : 'texto';
      const id = crypto.randomBytes(6).toString('hex'), p = { id, tipo, carga: Object.assign({}, carga, { limiteMs: tempoMs }), resolve, reject, criadoEm: Date.now() };
      p.timer = setTimeout(() => { finalizar(id, () => { estado.falhas++; reject(Object.assign(new Error('O ChatGPT não respondeu a tempo.'), { codigo: 'TEMPO' })); }); }, tempoMs);
      fila.push(p); acordar();
    });
  }
  const resultadosDe = b => Array.isArray(b.resultados) ? b.resultados : (b.erro ? [] : [{ texto: String(b.texto || ''), blocos: [].concat(b.blocos || []).map(String), imagens: [] }]);
  const falhou = (b, rs) => Object.assign(new Error(String(b.erro).slice(0, 300)), { codigo: 'CHATGPT', resultados: rs });
  /* texto: devolve { texto, blocos }. Rejeita com .codigo = 'SEM_EXTENSAO' | 'TEMPO' | 'CHATGPT' */
  async function pedir(prompt, { tempoMs = 6 * 60e3, aguardarConexaoMs = 0 } = {}) {
    const b = await enfileirar({ prompt: String(prompt), temporario: true }, tempoMs, aguardarConexaoMs), rs = resultadosDe(b);
    if (b.erro && !rs.length) throw falhou(b, rs);
    return { texto: String(rs[0] && rs[0].texto || ''), blocos: (rs[0] && rs[0].blocos || []).map(String) };
  }
  /* a extensão antiga (1.0.x) só sabe texto: avisa para recarregar em vez de mandar o pedido novo para ela */
  function exigirVersao(maior, menor, remendo = 0) {
    const v = String(versaoExtensao || '').split('.').map(Number); while (v.length < 3) v.push(0); if (!v.some(isNaN) && String(versaoExtensao || '') && (v[0] < maior || (v[0] === maior && (v[1] < menor || (v[1] === menor && v[2] < remendo))))) throw Object.assign(new Error('A extensão do Chrome está desatualizada (versão ' + versaoExtensao + '): recarregue-a em chrome://extensions (ícone de recarregar).'), { codigo: 'EXTENSAO_ANTIGA' });
  }
  /* lê o Instagram de um perfil (só leitura) pelo Chrome já logado. Devolve { bio, resumo, posts:[{codigo,tipo,alt,legenda,imagem:{mime,b64}}] } */
  async function pedirInstagram(handle, { max = 12, tempoMs = 4 * 60e3, aguardarConexaoMs = 0 } = {}) {
    exigirVersao(1, 2, 0);
    const b = await enfileirar({ instagram: { handle: String(handle || '').replace(/^@/, ''), max }, temporario: true }, tempoMs, aguardarConexaoMs);
    if (b.erro || !b.instagram) throw falhou({ erro: b.erro || 'O Instagram não devolveu dados.' }, []);
    return b.instagram;
  }
  /* conversa com várias mensagens ([{ texto, anexos:[{nome,mime,b64}], imagem }]) na mesma conversa (normal, não temporária: só assim o ChatGPT gera imagem).
     Devolve { resultados:[{texto,blocos,imagens:[{mime,b64,w,h}]}], erro } — pode vir com parte pronta e um erro */
  async function pedirConversa(mensagens, { tempoMs, aguardarConexaoMs = 0, temporario = false } = {}) {
    exigirVersao(1, 2, 2);
    const b = await enfileirar({ mensagens, temporario }, tempoMs || Math.max(1, mensagens.length) * 6 * 60e3, aguardarConexaoMs), rs = resultadosDe(b);
    if (b.erro && !rs.length) throw falhou(b, rs);
    return { resultados: rs, erro: b.erro ? String(b.erro).slice(0, 300) : '' };
  }
  async function aguardarConexao(ms) { const t = Date.now(); while (!conectada() && Date.now() - t < ms) await dormir(500); return conectada(); }

  const ler = req => new Promise((ok, no) => { let b = '', n = 0; req.on('data', d => { n += d.length; if (n > 80e6) { no(new Error('grande demais')); req.destroy(); } else b += d; }); req.on('end', () => ok(b)); req.on('error', no); });
  const json = (res, s, o) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };

  const srv = http.createServer(async (req, res) => {
    try {
      /* defesa contra páginas da web e contra DNS rebinding: só a extensão, só por 127.0.0.1/localhost */
      const origem = req.headers.origin, host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!['127.0.0.1', 'localhost'].includes(host)) return json(res, 403, { erro: 'host' });
      /* só nos testes (origemExtra): a página de teste não é a extensão, então precisa de CORS; a extensão de verdade não usa */
      if (origemExtra && origem && origemExtra.test(origem)) { res.setHeader('access-control-allow-origin', origem); res.setHeader('access-control-allow-headers', 'x-n7-token, x-n7-versao, content-type'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); } }
      if (origem && !/^chrome-extension:\/\//.test(origem) && !(origemExtra && origemExtra.test(origem))) return json(res, 403, { erro: 'origem' });
      if (req.headers['x-n7-token'] !== token) return json(res, 401, { erro: 'token' });
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/ping') { visto(req); return json(res, 200, { ok: true, na_fila: fila.length, em_andamento: emAndamento.size }); }
      if (u.pathname === '/job') {
        visto(req);
        /* 2026-11-28: a extensão só volta a buscar pedido depois de devolver o anterior. Se buscou com um ainda em andamento, ela foi recarregada (ou o Chrome reiniciou o serviço) e PERDEU o pedido:
           antes o agente esperava até o limite (até 98 min num carrossel) sem saber. Agora falha na hora e o agente pede de novo. */
        for (const q of [...emAndamento.values()]) if (Date.now() - (q.entregueEm || 0) > 3000) finalizar(q.id, x => { estado.falhas++; estado.ultimoErro = 'A extensão reiniciou durante o pedido.'; x.reject(Object.assign(new Error('A extensão do Chrome reiniciou (foi recarregada?) durante o pedido: ele se perdeu. Peça de novo.'), { codigo: 'EXTENSAO_REINICIOU' })); }, { erro: 'A extensão reiniciou durante o pedido.' });
        const espera = Math.min(25, Math.max(0, Number(u.searchParams.get('espera')) || 0)) * 1000, t0 = Date.now();
        while (!fila.length && Date.now() - t0 < espera && !req.destroyed) { await new Promise(r => { esperando.push(r); setTimeout(r, 1000); }); vistoEm = Date.now(); }
        const p = fila.shift(); if (!p) { res.statusCode = 204; return res.end(); }
        p.entregueEm = Date.now(); emAndamento.set(p.id, p); return json(res, 200, Object.assign({ id: p.id }, p.carga));
      }
      if (u.pathname === '/resultado' && req.method === 'POST') {
        vistoEm = Date.now(); const b = JSON.parse(await ler(req) || '{}');
        const ok = finalizar(String(b.id), p => {
          if (b.erro) { estado.falhas++; estado.ultimoErro = String(b.erro).slice(0, 320); } else estado.feitos++;
          p.resolve(b);
        }, b);
        return json(res, ok ? 200 : 404, { ok });
      }
      if (u.pathname === '/estado') return json(res, 200, Object.assign({ historico: historico.slice(-20).reverse() }, api.estado()));
      if (rotas) {
        const corpo = req.method === 'POST' ? JSON.parse(await ler(req) || '{}') : {}, r = await rotas({ metodo: req.method, caminho: u.pathname, q: Object.fromEntries(u.searchParams), corpo });
        if (r) { if (r.arquivo) { res.statusCode = 200; res.setHeader('content-type', r.arquivo.tipo); res.setHeader('cache-control', 'private, max-age=60'); return res.end(r.arquivo.buf); } return json(res, r.status || 200, r.json); }
      }
      return json(res, 404, { erro: 'rota' });
    } catch (e) { json(res, 500, { erro: String(e.message).slice(0, 120) }); }
  });

  /* a extensão lê config.json da própria pasta: porta e token. Escrito sempre que a ponte sobe */
  function gravarConfigExtensao(portaReal) {
    try { fs.mkdirSync(pastaExtensao, { recursive: true }); fs.writeFileSync(path.join(pastaExtensao, 'config.json'), JSON.stringify({ porta: portaReal, token }, null, 2)); return true; }
    catch (e) { log('Ponte: não consegui gravar config.json da extensão (' + e.message + ').'); return false; }
  }
  const ligar = () => new Promise((ok, no) => {
    srv.once('error', e => no(e.code === 'EADDRINUSE' ? new Error(`a porta ${porta} já está em uso (outro agente aberto?)`) : e));
    srv.listen(porta, '127.0.0.1', () => { const real = srv.address().port; gravarConfigExtensao(real); ok(real); });
  });
  const parar = () => { fila.concat([...emAndamento.values()]).forEach(p => { clearTimeout(p.timer); p.reject(Object.assign(new Error('Agente encerrado.'), { codigo: 'TEMPO' })); }); fila.length = 0; emAndamento.clear(); acordar(); try { srv.close(); srv.closeAllConnections && srv.closeAllConnections(); } catch (e) { /* já fechado */ } };

  const api = { ligar, parar, pedir, pedirConversa, pedirInstagram, conectada, jaViu: () => vista, aguardarConexao, token, pastaExtensao, estado: () => Object.assign({ conectada: conectada(), versaoExtensao, naFila: fila.length, emAndamento: emAndamento.size }, estado), get porta() { return srv.address() && srv.address().port; } };
  return api;
}

/* acorda o Chrome quando a extensão não aparece (o Chrome precisa estar aberto para a extensão trabalhar) */
function abrirChrome(url = 'https://chatgpt.com/') {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', 'chrome', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (process.platform === 'darwin') spawn('open', ['-a', 'Google Chrome', url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('google-chrome', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (e) { return false; }
}

module.exports = { criar, abrirChrome, lerOuCriarToken, PORTA_PADRAO, PASTA_EXTENSAO };
