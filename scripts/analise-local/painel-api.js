/* API local da página "Base de regras e estilos" da extensão do Chrome (painel.html). Roda dentro da ponte (127.0.0.1, com token).
   Lê e grava a base de cada empresa (regras.json, padrao*.json) e mostra o que o agente está usando (logos, referências, aprendizado). */
const fs = require('fs'), path = require('path'), os = require('os');
const MARCA = require('./marca'), BASE = require('./base'), BIB = require('./biblioteca'), PADRAO = require('./padrao');

const slugs = () => Object.keys(MARCA.DEFAULTS).filter(k => !k.startsWith('_'));
const id64 = f => Buffer.from(f).toString('base64url');
const resolve = id => { try { return Buffer.from(String(id), 'base64url').toString('utf8'); } catch (e) { return ''; } };
const ERRO = (status, msg) => ({ status, json: { erro: msg } });

/* arquivos que a página pode abrir: só imagens dentro das pastas que o agente usa */
function permitido(f) {
  if (!f || !/\.(png|jpe?g|webp)$/i.test(f)) return false;
  const raizes = [MARCA.pastaMarcas(), BIB.MKT_RAIZ && BIB.MKT_RAIZ(), BIB.DOWNLOADS && BIB.DOWNLOADS(), BIB.raizDrive()].filter(Boolean).map(r => path.resolve(r).toLowerCase() + path.sep);
  let real; try { real = fs.realpathSync(f).toLowerCase(); } catch (e) { return false; }
  return raizes.some(r => real.startsWith(r));
}
const itemArq = f => f ? { id: id64(f), nome: path.basename(f), pasta: path.basename(path.dirname(f)) } : null;
const nomeArq = f => f ? path.basename(f) : '';

function resumoDoPadrao(p) { return p ? { linha: p.linha, geradoEm: p.geradoEm, baseadoEm: p.baseadoEm || [], resumo: p.resumo, paleta: p.paleta || [], tipografia: p.tipografia || {}, elementos: p.elementos || [], fundos: p.fundos || [], composicao: p.composicao, logotipo: p.logotipo, receitas: p.receitas || {}, evitar: p.evitar || [] } : null; }

function empresa(slug, lib) {
  const kit = MARCA.kit(slug); if (!kit.existe) return null;
  const linhas = kit.clube ? ['farmacia', 'club'] : ['geral'], b = BASE.ler(kit.dir);
  const logos = {}; linhas.forEach(l => { logos[l] = nomeArq(BIB.melhorLogo(lib, slug, l)); });
  return { slug, nome: kit.nome, clube: kit.clube || '', linhas, regras: b.regras, padroes: { farmacia: resumoDoPadrao(kit.clube ? kit.padrao : null), club: resumoDoPadrao(kit.padraoClub), geral: resumoDoPadrao(kit.clube ? null : kit.padrao) },
    logos, aprendizado: { aprovadas: b.aprovadas.length, ajustes: b.ajustes.length, descartadas: b.descartadas.length, recentes: b.aprovadas.slice(-6).reverse(), ajustesRecentes: b.ajustes.slice(-6).reverse() }, biblioteca: lib.empresas[slug] ? { origem: lib.empresas[slug].origem, total: lib.empresas[slug].itens.length } : null, avisos: (kit.avisos || []).slice(0, 4) };
}

/* contexto: { acionar(): pede ao agente para rodar o criativo logo; estado(): estado da ponte } */
async function tratar({ metodo, caminho, q = {}, corpo = {} }, ctx = {}) {
  if (caminho === '/base' && metodo === 'GET') { const lib = BIB.carregar(); return { json: { empresas: slugs().map(s => empresa(s, lib)).filter(Boolean), geradoEm: new Date().toISOString() } }; }
  if (caminho === '/base/amostras' && metodo === 'GET') {
    const slug = String(q.slug || ''), linha = String(q.linha || ''), lib = BIB.carregar(); if (!slugs().includes(slug)) return ERRO(404, 'Empresa desconhecida.');
    const refs = BIB.escolherReferencias(lib, slug, { formato: 'Carrossel', assunto: '', n: 2, hash: 0, linha }).concat(BIB.escolherReferencias(lib, slug, { formato: 'Post', assunto: '', n: 2, hash: 1, linha }));
    return { json: { logo: itemArq(BIB.melhorLogo(lib, slug, linha)), identidade: itemArq(BIB.folhaDeIdentidade(lib, slug, linha)), referencias: [...new Set(refs)].slice(0, 4).map(itemArq) } };
  }
  if (caminho === '/arquivo' && metodo === 'GET') {
    const f = resolve(q.id); if (!permitido(f)) return ERRO(403, 'Arquivo não permitido.');
    const st = fs.statSync(f); if (st.size > 6e6) return ERRO(413, 'Arquivo grande demais.');
    return { arquivo: { buf: fs.readFileSync(f), tipo: /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg' } };
  }
  const kit = () => { const s = String(corpo.slug || ''); if (!slugs().includes(s)) return null; const k = MARCA.kit(s); return k.existe ? k : null; };
  if (caminho === '/base/regra' && metodo === 'POST') { const k = kit(); if (!k) return ERRO(404, 'Empresa desconhecida.'); try { return { json: { regra: BASE.adicionar(k.dir, { texto: corpo.texto, linha: corpo.linha || 'todas', origem: 'manual' }) } }; } catch (e) { return ERRO(400, e.message); } }
  if (caminho === '/base/regra/atualizar' && metodo === 'POST') { const k = kit(); if (!k) return ERRO(404, 'Empresa desconhecida.'); try { return { json: { regra: BASE.atualizar(k.dir, String(corpo.id), { texto: corpo.texto, linha: corpo.linha, status: corpo.status }) } }; } catch (e) { return ERRO(400, e.message); } }
  if (caminho === '/base/regra/remover' && metodo === 'POST') { const k = kit(); if (!k) return ERRO(404, 'Empresa desconhecida.'); return { json: { removida: BASE.remover(k.dir, String(corpo.id)) } }; }
  /* edição do padrão de criação (padrao.json): só os campos de texto que a equipe pode corrigir à mão */
  if (caminho === '/base/padrao' && metodo === 'POST') {
    const k = kit(); if (!k) return ERRO(404, 'Empresa desconhecida.'); const linha = k.clube ? (corpo.linha === 'club' ? 'club' : 'farmacia') : '', atual = PADRAO.lerPadrao(k.dir, linha); if (!atual) return ERRO(404, 'Esse padrão ainda não foi extraído.');
    const txt = (v, n) => String(v ?? '').trim().slice(0, n), novo = Object.assign({}, atual);
    if (corpo.resumo !== undefined) novo.resumo = txt(corpo.resumo, 700); if (corpo.composicao !== undefined) novo.composicao = txt(corpo.composicao, 500); if (corpo.logotipo !== undefined) novo.logotipo = txt(corpo.logotipo, 250);
    if (Array.isArray(corpo.evitar)) novo.evitar = corpo.evitar.map(x => txt(x, 120)).filter(Boolean).slice(0, 12);
    if (corpo.receitas && typeof corpo.receitas === 'object') { novo.receitas = Object.assign({}, atual.receitas); for (const t of PADRAO.TIPOS) if (corpo.receitas[t] !== undefined) novo.receitas[t] = txt(corpo.receitas[t], 600); }
    novo.editadoPelaEquipe = new Date().toISOString(); fs.writeFileSync(path.join(k.dir, PADRAO.arquivoDe(linha)), JSON.stringify(novo, null, 2)); return { json: { padrao: resumoDoPadrao(novo) } };
  }
  /* "refazer a partir das peças": guarda o padrão atual de lado e o agente extrai de novo na próxima rodada */
  if (caminho === '/base/refazer-padrao' && metodo === 'POST') {
    const k = kit(); if (!k) return ERRO(404, 'Empresa desconhecida.'); const linha = k.clube ? (corpo.linha === 'club' ? 'club' : 'farmacia') : '', f = path.join(k.dir, PADRAO.arquivoDe(linha));
    if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.json$/, '.anterior-' + Date.now() + '.json')); if (ctx.acionar) ctx.acionar(); return { json: { ok: true } };
  }
  return null;
}

module.exports = { tratar, permitido, slugs };
