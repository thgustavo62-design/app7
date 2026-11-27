/* Biblioteca de referências de cada empresa: as artes que a agência JÁ criou e aprovou, lidas da pasta do Google Drive no computador (G:\Meu Drive\<EMPRESA>).
   Nada é copiado nem movido: o índice (biblioteca.json, em Documentos\Nova7 Marcas) guarda só o caminho, a categoria pelo nome da pasta e a data.
   Na hora de criar, o agente escolhe as peças certas para o tipo de post e anexa no ChatGPT como padrão a seguir. */
const fs = require('fs'), path = require('path'), os = require('os');
const MARCA = require('./marca');

const EXT = /\.(png|jpe?g|webp)$/i, TAM_MAX = 4.5e6;
/* pasta de cada empresa no Drive do computador (pode ser mudada em kit.json: "drivePasta": ["NOME DA PASTA"]) */
const PASTAS = { 'minas-farma': ['MINAS FARMA'], 'farma-e-farma': ['FARMA E FARMA'], 'campo-forte': ['CAMPO FORTE SOLUÇÕES AGRICOLAS'], nova7: ['NOVA 7'], 'altus-contabilidade': ['ALTUS CONTABILIDADE'], 'junior-lopes-contador': ['Junior Lopes Contador'] };
/* a categoria vem do nome da pasta onde a peça está */
const CATEGORIAS = [['finalizado', /POSTAGENS FINALIZADAS/i], ['identidade', /IDENTIDADE VISUAL/i], ['logo', /(^|[\\/])logos?([\\/]|$)/i], ['elemento', /FUNDOS? PARA CRIA|ITENS|[\\/]icones?[\\/]|3d/i], ['story', /stories|story|reels/i], ['carrossel', /carrose?i?s?l?|carrosel/i], ['variavel', /variaveis|artes (gerais|di)|artes minas club/i]];
const IGNORAR = /(^|[\\/])(_preview|originais|node_modules|\.git|banco de conte[úu]dos|contratos?|notas?|financeiro|v[ií]deos?)([\\/]|$)/i;

/* pasta Downloads: só entram artes (PNG/JPG grandes, formato de post/story) cujo NOME ou PASTA diz de qual cliente são; o resto (encartes recortados, etiquetas) fica de fora */
const DOWNLOADS = () => process.env.N7_DOWNLOADS || (process.env.N7_ARMAZEM ? '' : path.join(os.homedir(), 'Downloads'));
const CLIENTE_DO_NOME = [['minas-farma', /minas/i], ['farma-e-farma', /farma ?(e|&|and) ?farma|farma club|farmaefarma|f&f/i], ['campo-forte', /campo forte/i], ['nova7', /nova ?7/i], ['altus-contabilidade', /altus/i]];
const IGNORAR_DL = /_files$|fluxo-de-edicao|WhatsApp Unknown|^asd_|Instagram_files|snap|node_modules|\.git|Design sem nome|Imagem do ChatGPT/i;
function dimensoes(f) { try { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(32); fs.readSync(fd, b, 0, 32, 0); fs.closeSync(fd); if (b.toString('latin1', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch (e) { /* não é PNG */ } return null; }
function varrerDownloads(dir, base, porEmpresa, prof = 0) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (IGNORAR_DL.test(e.name)) continue; const f = path.join(dir, e.name), rel = path.relative(base, f);
    if (e.isDirectory()) { if (prof < 2) varrerDownloads(f, base, porEmpresa, prof + 1); continue; }
    if (!EXT.test(e.name)) continue;
    const alvo = CLIENTE_DO_NOME.find(([, re]) => re.test(rel)); if (!alvo) continue;
    let st; try { st = fs.statSync(f); } catch (x) { continue; } if (st.size < 400e3 || st.size > TAM_MAX) continue;
    const d = dimensoes(f); if (d && (d.w < 900 || d.w / d.h < 0.5 || d.w / d.h > 1.05)) continue;
    (porEmpresa[alvo[0]] = porEmpresa[alvo[0]] || []).push({ rel: 'Downloads\\' + rel, abs: f, cat: 'download', conjunto: path.dirname(rel) === '.' ? 'Downloads\\' + rel : 'Downloads\\' + path.dirname(rel), bytes: st.size, mtime: Math.round(st.mtimeMs) });
  }
}
const raizDrive = () => {
  if (process.env.N7_DRIVE_RAIZ) return process.env.N7_DRIVE_RAIZ;
  if (process.env.N7_ARMAZEM) return '';   // testes nunca olham o Drive de verdade
  const c = []; for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') for (const n of ['Meu Drive', 'My Drive']) c.push(L + ':\\' + n);
  for (const n of ['Google Drive', 'Meu Drive', 'My Drive']) c.push(path.join(os.homedir(), n));
  return c.find(x => { try { return fs.statSync(x).isDirectory(); } catch (e) { return false; } }) || '';
};
const categoriaDe = rel => { for (const [nome, re] of CATEGORIAS) if (re.test(rel)) return nome; return 'outra'; };

function varrer(dir, base, saida, prof = 0) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const f = path.join(dir, e.name), rel = path.relative(base, f);
    if (IGNORAR.test(rel)) continue;
    if (e.isDirectory()) { if (prof < 6) varrer(f, base, saida, prof + 1); continue; }
    if (!EXT.test(e.name)) continue;
    let st; try { st = fs.statSync(f); } catch (x) { continue; }
    saida.push({ rel, cat: categoriaDe(rel), conjunto: path.dirname(rel), bytes: st.size, mtime: Math.round(st.mtimeMs) });
  }
}

/* varre a pasta de cada empresa e grava o índice. Devolve { slug: { total, porCategoria } } */
function indexar({ marcas = MARCA.pastaMarcas(), raiz = raizDrive() } = {}) {
  const out = { geradoEm: new Date().toISOString(), raiz, empresas: {} }, resumo = {}, dl = {}, dlDir = DOWNLOADS();
  if (dlDir) varrerDownloads(dlDir, dlDir, dl);
  if (!raiz && !Object.keys(dl).length) return Object.assign(resumo, { _erro: 'Não achei o Google Drive no computador (instale o Google Drive para computador).' });
  for (const [slug, pastas] of Object.entries(PASTAS)) {
    const itens = []; let usadas = pastas;
    try { const kj = JSON.parse(fs.readFileSync(path.join(marcas, slug, 'kit.json'), 'utf8').replace(/^﻿/, '')); if (Array.isArray(kj.drivePasta)) usadas = kj.drivePasta; } catch (e) { /* sem kit.json */ }
    if (raiz) for (const p of usadas) { const base = path.join(raiz, p); if (fs.existsSync(base)) varrer(base, base, itens); }
    itens.push(...(dl[slug] || []));
    if (!itens.length) continue;
    out.empresas[slug] = { pastas: usadas, itens };
    const por = {}; itens.forEach(i => { por[i.cat] = (por[i.cat] || 0) + 1; }); resumo[slug] = { total: itens.length, porCategoria: por };
  }
  try { fs.mkdirSync(marcas, { recursive: true }); fs.writeFileSync(path.join(marcas, 'biblioteca.json'), JSON.stringify(out)); } catch (e) { resumo._aviso = 'Não consegui gravar biblioteca.json: ' + e.message; }
  return resumo;
}

/* lê o índice (e reindexa se estiver velho ou sem) */
function carregar({ marcas = MARCA.pastaMarcas(), validadeMs = 24 * 36e5 } = {}) {
  const arq = path.join(marcas, 'biblioteca.json');
  try { const j = JSON.parse(fs.readFileSync(arq, 'utf8')); if (Date.now() - Date.parse(j.geradoEm) < validadeMs) return j; } catch (e) { /* sem índice ainda */ }
  indexar({ marcas }); try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return { raiz: '', empresas: {} }; }
}

const abs = (lib, slug, i) => { if (i.abs) return fs.existsSync(i.abs) ? i.abs : ''; const e = lib.empresas[slug]; if (!e) return ''; for (const p of e.pastas) { const f = path.join(lib.raiz, p, i.rel); if (fs.existsSync(f)) return f; } return ''; };
const ehVertical = f => /reels|story|stories/i.test(f || '');
const porData = (a, b) => b.mtime - a.mtime;
const ordemNome = (a, b) => a.rel.localeCompare(b.rel, 'pt', { numeric: true });

/* escolhe as peças de referência para um post: carrossel → um conjunto já finalizado (capa + um slide do meio); post simples → 2 peças finalizadas/variáveis.
   `semelhantes` (palavras do assunto) dá preferência a conjuntos cujo nome combina. Devolve caminhos absolutos. */
function escolherReferencias(lib, slug, { formato = '', assunto = '', n = 2, hash = 0 } = {}) {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return [];
  const vertical = ehVertical(formato), carrossel = /carrossel/i.test(formato);
  const bom = i => i.bytes > 20e3 && i.bytes <= TAM_MAX && ['finalizado', 'carrossel', 'variavel', 'story', 'download'].includes(i.cat) && (vertical ? /stor|reel/i.test(i.rel) || i.cat === 'story' : i.cat !== 'story');
  let pool = e.itens.filter(bom); if (!pool.length && vertical) pool = e.itens.filter(i => i.bytes > 20e3 && i.bytes <= TAM_MAX && ['finalizado', 'carrossel', 'variavel', 'download'].includes(i.cat));
  const palavras = String(assunto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || [];
  const conjuntos = new Map(); pool.forEach(i => { if (!conjuntos.has(i.conjunto)) conjuntos.set(i.conjunto, []); conjuntos.get(i.conjunto).push(i); });
  const nota = (nome, itens) => { const t = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return palavras.filter(p => t.includes(p)).length * 10 + (itens[0].cat === 'finalizado' ? 5 : itens[0].cat === 'download' ? -2 : 0) + (carrossel && itens.length >= 3 ? 3 : 0) + Math.max(...itens.map(x => x.mtime)) / 1e13; };
  const lista = [...conjuntos.entries()].map(([nome, itens]) => ({ nome, itens: itens.sort(ordemNome), nota: nota(nome, itens) })).sort((a, b) => b.nota - a.nota);
  if (!lista.length) return [];
  /* assunto igual ao de um conjunto já feito: usa esse; senão varia entre os melhores para não repetir sempre a mesma referência */
  const topo = lista.slice(0, Math.min(5, lista.length)), c = lista[0].nota >= 10 ? lista[0] : topo[hash % topo.length], escolhidos = [];
  if (carrossel && c.itens.length >= 3) { escolhidos.push(c.itens[0], c.itens[Math.floor(c.itens.length / 2)]); }
  else { escolhidos.push(...c.itens.slice(0, 1)); const outro = topo[(hash + 1) % topo.length]; if (outro && outro !== c) escolhidos.push(...outro.itens.slice(0, 1)); else if (c.itens[1]) escolhidos.push(c.itens[1]); }
  return escolhidos.slice(0, n).map(i => abs(lib, slug, i)).filter(Boolean);
}
/* a folha de identidade visual e a melhor versão do logotipo, quando existem na biblioteca */
function folhaDeIdentidade(lib, slug) { const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return ''; const i = e.itens.filter(x => x.cat === 'identidade' && x.bytes <= TAM_MAX).sort(ordemNome)[0]; return i ? abs(lib, slug, i) : ''; }
/* melhor logotipo da empresa na biblioteca (PNG grande, de preferência da pasta "usar em designs") */
function melhorLogo(lib, slug) {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return '';
  const c = e.itens.filter(i => i.cat === 'logo' && /\.png$/i.test(i.rel) && i.bytes > 8e3 && i.bytes <= TAM_MAX).map(i => ({ i, n: (/usar em designs/i.test(i.rel) ? 20 : 0) + (/horizontal|principal|completo|vertical/i.test(i.rel) ? 6 : 0) - (/icone|ícone|favicon|preto|branco|mono/i.test(path.basename(i.rel)) ? 8 : 0) + Math.min(10, i.bytes / 1e5) })).sort((a, b) => b.n - a.n)[0];
  return c ? abs(lib, slug, c.i) : '';
}
/* peças para extrair o padrão (guia de estilo): as mais recentes finalizadas + carrosséis + identidade, de conjuntos variados */
function amostraParaPadrao(lib, slug, max = 8) {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return [];
  const ok = e.itens.filter(i => i.bytes > 20e3 && i.bytes <= TAM_MAX && ['finalizado', 'carrossel', 'variavel', 'identidade', 'download'].includes(i.cat)).sort(porData), vistos = new Map(), saida = [];
  for (const i of ok) { const k = i.conjunto; if ((vistos.get(k) || 0) >= (i.cat === 'identidade' ? 2 : 1)) continue; vistos.set(k, (vistos.get(k) || 0) + 1); saida.push(i); if (saida.length >= max) break; }
  return saida.map(i => abs(lib, slug, i)).filter(Boolean);
}

module.exports = { indexar, carregar, escolherReferencias, folhaDeIdentidade, melhorLogo, amostraParaPadrao, raizDrive, categoriaDe, PASTAS, TAM_MAX };

/* linha de comando:  node biblioteca.js   (indexa e mostra quantas peças achou por empresa e categoria) */
if (require.main === module) {
  const r = indexar(); if (r._erro) { console.log(r._erro); process.exit(1); }
  console.log('Biblioteca de referências (lida do Drive no computador):');
  for (const [slug, v] of Object.entries(r)) { if (slug[0] === '_') continue; console.log('  ' + slug + ': ' + v.total + ' peça(s)  ' + Object.entries(v.porCategoria).map(([c, n]) => c + ' ' + n).join(', ')); }
}
