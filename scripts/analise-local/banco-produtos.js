/* Banco de imagens de produtos da agência: C:\Users\Admin\Design-Flyers\03_assets\banco_produtos (arquivos "<EAN> - <DESCRIÇÃO>.jpg").
   O agente procura os produtos que combinam com o post (nomes que o ChatGPT de texto sugeriu) e anexa a foto REAL no pedido da arte,
   para a embalagem sair fiel (nunca desenhada de cabeça pela IA). */
const fs = require('fs'), path = require('path'), os = require('os');

const TAM_MAX = 4.5e6;
const pasta = () => process.env.N7_BANCO_PRODUTOS || (process.env.N7_ARMAZEM ? '' : path.join(os.homedir(), 'Design-Flyers', '03_assets', 'banco_produtos'));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = s => (norm(s).match(/[a-z0-9]{3,}/g) || []).map(t => t.replace(/s$/, ''));
/* parece remédio (comprimido, xarope, dosagem em mg): a arte pode mostrar, mas a revisão precisa conferir as regras de publicidade */
const PARECE_REMEDIO = /\b(cpr|cps|comp|caps?|xpe|xarope|gts|gotas|amp|inj|susp|\d+ ?mg|\d+ ?mcg)\b/i;

let cache = { dir: '', em: 0, itens: [] };
function indice() {
  const dir = pasta(); if (!dir) return [];
  if (cache.dir === dir && Date.now() - cache.em < 6 * 36e5) return cache.itens;   // a pasta é grande: lê de novo só a cada 6 h
  let nomes = []; try { nomes = fs.readdirSync(dir); } catch (e) { /* sem o banco neste computador */ }
  const itens = [];
  for (const n of nomes) {
    const m = /^(\d{6,14}) - (.+)\.jpe?g$/i.exec(n); if (!m) continue;
    itens.push({ arquivo: path.join(dir, n), ean: m[1], descricao: m[2], tokens: tokens(m[2]) });
  }
  cache = { dir, em: Date.now(), itens }; return itens;
}

/* procura 1 foto por consulta (ex.: "protetor solar", "creatina"): todas as palavras da consulta precisam aparecer na descrição; vence a descrição mais enxuta */
function buscar(consultas, { max = 3 } = {}) {
  const itens = indice(); if (!itens.length) return [];
  const saida = [], usados = new Set();
  for (const q of [].concat(consultas || [])) {
    const qt = tokens(q).filter(t => t.length >= 4 || /^\d/.test(t)); if (!qt.length) continue;
    const ok = itens.filter(i => !usados.has(i.arquivo) && qt.every(t => i.tokens.some(x => x === t || x.startsWith(t))));
    ok.sort((a, b) => a.tokens.length - b.tokens.length);
    for (const c of ok.slice(0, 6)) { try { const tam = fs.statSync(c.arquivo).size; if (tam >= 15e3 && tam <= TAM_MAX) { saida.push(c); usados.add(c.arquivo); break; } } catch (e) { /* arquivo sumiu */ } }
    if (saida.length >= max) break;
  }
  return saida.map(c => ({ arquivo: c.arquivo, nome: c.descricao.replace(/\s+/g, ' ').trim(), remedio: PARECE_REMEDIO.test(c.descricao) }));
}

module.exports = { buscar, indice, pasta, PARECE_REMEDIO };
