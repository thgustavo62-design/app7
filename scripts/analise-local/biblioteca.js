/* Biblioteca de referências de cada empresa: as artes que a agência JÁ criou e aprovou.
   Fonte principal: Desktop\MARKETING GUSTAVO\<EMPRESA> (a pasta de trabalho da agência). Se uma empresa não tem pasta lá, usa o Google Drive no computador
   (G:\Meu Drive\<EMPRESA>) e, por último, as artes do Downloads cujo nome diz o cliente. Nada é copiado nem movido: o índice (biblioteca.json, em
   Documentos\Nova7 Marcas) guarda só o caminho, a categoria pelo nome da pasta e a data.
   REGRA DAS LINHAS (não misturar assuntos): para as farmácias, toda peça é "club" (Farma Club, Minas Club: caminho com "club") ou "farmacia" (o resto).
   Arte de clube só usa referências, logo e padrão do clube; arte normal da farmácia só usa os da farmácia. */
const fs = require('fs'), path = require('path'), os = require('os');
const MARCA = require('./marca');

const EXT = /\.(png|jpe?g|webp)$/i, TAM_MAX = 4.5e6;
/* pasta de cada empresa no Drive do computador (pode ser mudada em kit.json: "drivePasta": ["NOME DA PASTA"]) */
const PASTAS = { 'minas-farma': ['MINAS FARMA'], 'farma-e-farma': ['FARMA E FARMA'], 'campo-forte': ['CAMPO FORTE SOLUÇÕES AGRICOLAS'], nova7: ['NOVA 7'], 'altus-contabilidade': ['ALTUS CONTABILIDADE'], 'junior-lopes-contador': ['Junior Lopes Contador'] };
/* pasta de trabalho da agência (vale mais que o Drive e o Downloads) */
const MKT_RAIZ = () => process.env.N7_MKT_RAIZ || (process.env.N7_ARMAZEM ? '' : path.join(os.homedir(), 'Desktop', 'MARKETING GUSTAVO'));
const PASTAS_MKT = { 'farma-e-farma': ['FARMA E FARMA MARKETING'], 'minas-farma': ['MARKETING MINAS FARMA'] };
/* empresas que têm clube de benefícios: o assunto "clube" nunca se mistura com o resto */
const CLUBES = { 'farma-e-farma': 'Farma Club', 'minas-farma': 'Minas Club' };
const ehClube = rel => /club/i.test(rel);

/* a categoria vem do nome da pasta onde a peça está (a primeira que combinar) */
const CATEGORIAS = [['recorte', /PRODUTOS? RECORTADOS?/i], ['finalizado', /POSTAGENS FINALIZADAS/i], ['identidade', /IDENTIDADE VISUAL/i], ['logo', /(^|[\\/])logos?([\\/]|$)/i], ['elemento', /FUNDOS? PARA CRIA|ITENS|[\\/]icones?[\\/]|3d/i], ['promocao', /PROMO[ÇC][ÕO]ES/i], ['institucional', /INSTITUCIONA/i], ['story', /stories|story|reels/i], ['carrossel', /carrose?i?s?l?|carrosel/i], ['variavel', /variaveis|artes (gerais|di)|artes minas club/i]];
const IGNORAR = /(^|[\\/])(_preview|originais|node_modules|\.git|banco de conte[úu]dos|contratos?|notas?|financeiro|v[ií]deos?[^\\/]*|werllem[^\\/]*|midia [^\\/]*|extra marketing[^\\/]*)([\\/]|$)/i;

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
/* ícones/logos do clube soltos no Downloads (ex.: "icone Minas Club.png"): entram como logo da linha clube da empresa dona do nome */
function logosDeClubeNoDownloads(dir) {
  const out = {}; let nomes = []; try { nomes = fs.readdirSync(dir); } catch (e) { return out; }
  for (const n of nomes) {
    if (!/^(icone|ícone|logo|emblema)[^\\/]*club\.(png)$/i.test(n) && !/^(icone|ícone|logo|emblema)[^\\/]*club[^\\/]*\.png$/i.test(n)) continue;
    const alvo = CLIENTE_DO_NOME.find(([, re]) => re.test(n)); if (!alvo) continue; const f = path.join(dir, n); let st; try { st = fs.statSync(f); } catch (e) { continue; } if (st.size > TAM_MAX) continue;
    (out[alvo[0]] = out[alvo[0]] || []).push({ rel: 'Downloads\\' + n, abs: f, cat: 'logo', conjunto: 'Downloads\\logos-clube', bytes: st.size, mtime: Math.round(st.mtimeMs) });
  }
  return out;
}
const raizDrive = () => {
  if (process.env.N7_DRIVE_RAIZ) return process.env.N7_DRIVE_RAIZ;
  if (process.env.N7_ARMAZEM) return '';   // testes nunca olham o Drive de verdade
  const c = []; for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') for (const n of ['Meu Drive', 'My Drive']) c.push(L + ':\\' + n);
  for (const n of ['Google Drive', 'Meu Drive', 'My Drive']) c.push(path.join(os.homedir(), n));
  return c.find(x => { try { return fs.statSync(x).isDirectory(); } catch (e) { return false; } }) || '';
};
const categoriaDe = rel => { for (const [nome, re] of CATEGORIAS) if (re.test(rel)) return nome; return 'outra'; };

function varrer(dir, base, saida, abs = false, prof = 0) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const f = path.join(dir, e.name), rel = path.relative(base, f);
    if (IGNORAR.test(rel)) continue;
    if (e.isDirectory()) { if (prof < 6) varrer(f, base, saida, abs, prof + 1); continue; }
    if (!EXT.test(e.name)) continue;
    let st; try { st = fs.statSync(f); } catch (x) { continue; }
    const item = { rel, cat: categoriaDe(rel), conjunto: path.dirname(rel), bytes: st.size, mtime: Math.round(st.mtimeMs) }; if (abs) item.abs = f;
    saida.push(item);
  }
}

/* varre a pasta de cada empresa e grava o índice. Devolve { slug: { total, porCategoria, porLinha } } */
function indexar({ marcas = MARCA.pastaMarcas(), raiz = raizDrive(), mkt = MKT_RAIZ() } = {}) {
  const out = { geradoEm: new Date().toISOString(), raiz, mkt, empresas: {} }, resumo = {}, dl = {}, dlDir = DOWNLOADS();
  if (dlDir) varrerDownloads(dlDir, dlDir, dl);
  const semFontes = !raiz && !mkt && !Object.keys(dl).length;
  for (const slug of new Set([...Object.keys(PASTAS), ...Object.keys(PASTAS_MKT)])) {
    const itens = []; let usadas = PASTAS[slug] || [], origem = 'drive', kj = {};
    try { kj = JSON.parse(fs.readFileSync(path.join(marcas, slug, 'kit.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { /* sem kit.json */ }
    const pastasMkt = Array.isArray(kj.marketingPasta) ? kj.marketingPasta : (PASTAS_MKT[slug] || []);
    const mktOk = mkt && pastasMkt.map(p => path.join(mkt, p)).filter(b => fs.existsSync(b));
    if (mktOk && mktOk.length) { origem = 'marketing'; mktOk.forEach(base => varrer(base, base, itens, true)); if (dlDir) itens.push(...(logosDeClubeNoDownloads(dlDir)[slug] || [])); }   // a pasta de trabalho vale mais: nada de Drive nem Downloads para esta empresa
    else {
      if (Array.isArray(kj.drivePasta)) usadas = kj.drivePasta;
      if (raiz) for (const p of usadas) { const base = path.join(raiz, p); if (fs.existsSync(base)) varrer(base, base, itens); }
      itens.push(...(dl[slug] || []));
    }
    /* artes que a equipe APROVOU (base.js copia para <empresa>\aprovadas\<linha>\<código>): são as primeiras referências */
    const ap = path.join(marcas, slug, 'aprovadas'); if (fs.existsSync(ap)) { const novos = []; varrer(ap, ap, novos, true); novos.forEach(i => { i.cat = 'finalizado'; i.aprovada = true; i.rel = 'aprovadas\\' + i.rel; i.conjunto = 'aprovadas\\' + i.conjunto; }); itens.push(...novos); }
    if (!itens.length) continue;
    const temClube = !!CLUBES[slug]; itens.forEach(i => { i.linha = temClube ? (ehClube(i.rel) ? 'club' : 'farmacia') : 'geral'; });
    out.empresas[slug] = { origem, pastas: origem === 'marketing' ? pastasMkt : usadas, itens };
    const por = {}, linhas = {}; itens.forEach(i => { por[i.cat] = (por[i.cat] || 0) + 1; linhas[i.linha] = (linhas[i.linha] || 0) + 1; }); resumo[slug] = { total: itens.length, origem, porCategoria: por, porLinha: linhas };
  }
  if (semFontes && !Object.keys(out.empresas).length) return Object.assign(resumo, { _erro: 'Não achei a pasta MARKETING GUSTAVO nem o Google Drive no computador.' });
  try { fs.mkdirSync(marcas, { recursive: true }); fs.writeFileSync(path.join(marcas, 'biblioteca.json'), JSON.stringify(out)); } catch (e) { resumo._aviso = 'Não consegui gravar biblioteca.json: ' + e.message; }
  return resumo;
}

/* lê o índice (e reindexa se estiver velho ou sem) */
function carregar({ marcas = MARCA.pastaMarcas(), validadeMs = 24 * 36e5 } = {}) {
  const arq = path.join(marcas, 'biblioteca.json');
  try { const j = JSON.parse(fs.readFileSync(arq, 'utf8')); if (Date.now() - Date.parse(j.geradoEm) < validadeMs) return j; } catch (e) { /* sem índice ainda */ }
  indexar({ marcas }); try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return { raiz: '', empresas: {} }; }
}

const abs = (lib, slug, i) => {
  if (i.abs) return fs.existsSync(i.abs) ? i.abs : '';
  const e = lib.empresas[slug]; if (!e) return '';
  const base = e.origem === 'marketing' ? lib.mkt : lib.raiz; if (!base) return '';
  for (const p of e.pastas) { const f = path.join(base, p, i.rel); if (fs.existsSync(f)) return f; } return '';
};
const ehVertical = f => /reels|story|stories/i.test(f || '');
const porData = (a, b) => b.mtime - a.mtime;
const ordemNome = (a, b) => a.rel.localeCompare(b.rel, 'pt', { numeric: true });
/* a linha pedida filtra tudo: 'club' só vê o clube, 'farmacia' só o resto, vazio/'geral' vê tudo (empresas sem clube) */
const daLinha = (i, linha) => !linha || linha === 'geral' || i.linha === 'geral' || i.linha === linha;

/* escolhe as peças de referência para um post: carrossel → um conjunto já finalizado (capa + um slide do meio); post simples → 2 peças.
   `assunto` (palavras do tema) dá preferência a conjuntos cujo nome combina. Devolve caminhos absolutos. */
function escolherReferencias(lib, slug, { formato = '', assunto = '', n = 2, hash = 0, linha = '' } = {}) {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return [];
  const vertical = ehVertical(formato), carrossel = /carrossel/i.test(formato), CATS = ['finalizado', 'carrossel', 'variavel', 'story', 'download', 'promocao', 'institucional'];
  const bom = i => daLinha(i, linha) && i.bytes > 20e3 && i.bytes <= TAM_MAX && CATS.includes(i.cat) && (vertical ? /stor|reel/i.test(i.rel) || i.cat === 'story' : i.cat !== 'story');
  let pool = e.itens.filter(bom); if (!pool.length && vertical) pool = e.itens.filter(i => daLinha(i, linha) && i.bytes > 20e3 && i.bytes <= TAM_MAX && CATS.includes(i.cat));
  const palavras = String(assunto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || [];
  const conjuntos = new Map(); pool.forEach(i => { if (!conjuntos.has(i.conjunto)) conjuntos.set(i.conjunto, []); conjuntos.get(i.conjunto).push(i); });
  const nota = (nome, itens) => { const t = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return palavras.filter(p => t.includes(p)).length * 10 + (itens[0].aprovada ? 20 : itens[0].cat === 'finalizado' ? 5 : itens[0].cat === 'download' ? -2 : 0) + (carrossel && itens.length >= 3 ? 3 : 0) + Math.max(...itens.map(x => x.mtime)) / 1e13; };
  const lista = [...conjuntos.entries()].map(([nome, itens]) => ({ nome, itens: itens.sort(ordemNome), nota: nota(nome, itens) })).sort((a, b) => b.nota - a.nota);
  if (!lista.length) return [];
  /* assunto igual ao de um conjunto já feito: usa esse; senão varia entre os melhores para não repetir sempre a mesma referência */
  const topo = lista.slice(0, Math.min(5, lista.length)), c = lista[0].nota >= 10 ? lista[0] : topo[hash % topo.length], escolhidos = [];
  if (carrossel && c.itens.length >= 3) { escolhidos.push(c.itens[0], c.itens[Math.floor(c.itens.length / 2)]); }
  else { escolhidos.push(...c.itens.slice(0, 1)); const outro = topo[(hash + 1) % topo.length]; if (outro && outro !== c) escolhidos.push(...outro.itens.slice(0, 1)); else if (c.itens[1]) escolhidos.push(c.itens[1]); }
  return escolhidos.slice(0, n).map(i => abs(lib, slug, i)).filter(Boolean);
}
/* peça de identidade visual da linha (clube: o kit completo do clube; farmácia: a primeira da pasta de identidade que não é do clube) */
function folhaDeIdentidade(lib, slug, linha = '') {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return '';
  const c = e.itens.filter(x => x.cat === 'identidade' && daLinha(x, linha) && x.bytes <= TAM_MAX && /\.(png|jpe?g)$/i.test(x.rel) && !/imagem do chatgpt|chatgpt image/i.test(x.rel)).sort((a, b) => (/kit_completo|kit completo/i.test(b.rel) ? 1 : 0) - (/kit_completo|kit completo/i.test(a.rel) ? 1 : 0) || ordemNome(a, b))[0];
  return c ? abs(lib, slug, c) : '';
}
/* melhor logotipo da linha. Farmácia: o logo principal (nome com "logo", sem ser etiqueta de campanha, sem "club"). Clube: o logo/emblema do clube. */
const CAMPANHA = /corta|top ?ofertas|novidade|delivery|etiqueta|barato|m[eê]s d|app|site|cart[aã]o|promo|dia d|gradiente|chatgpt|imagem do|selo|icone|ícone|fundo/i;
function melhorLogo(lib, slug, linha = '') {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return '';
  const clube = linha === 'club', pngs = e.itens.filter(i => /\.png$/i.test(i.rel) && i.bytes > 5e3 && i.bytes <= TAM_MAX && daLinha(i, linha));
  const nome = i => path.basename(i.rel);
  const pont = i => {
    const n = nome(i); let p = 0;
    if (clube) { if (!ehClube(i.rel) || !/logo|emblema|kit_completo|icone.*club|club/i.test(n) || /chatgpt|imagem do/i.test(n)) return -99; p += /logo/i.test(n) ? 12 : /icone.*club|club.*icone/i.test(n) ? 10 : /kit_completo|kit completo/i.test(n) ? 8 : /emblema/i.test(n) ? 5 : 3; p += /compacta|reduzida/i.test(n) ? 2 : 0; }
    else { if (ehClube(i.rel) || !/logo|marca|oficial/i.test(n) || CAMPANHA.test(n) || /branco|preta|preto|mono/i.test(n)) return -99; p += /oficial|principal/i.test(n) ? 12 : /^logo( |_|-)?(minas|farma|fafa)?/i.test(n) ? 6 : 2; p += /logos?|usar em designs/i.test(i.rel) ? 3 : 0; }
    if (/copia|copy|\(\d\)/i.test(n)) p -= 5; return p + Math.min(4, i.bytes / 2e5) / 4;
  };
  const c = pngs.map(i => ({ i, p: pont(i) })).filter(x => x.p > -50).sort((a, b) => b.p - a.p)[0];
  return c ? abs(lib, slug, c.i) : '';
}
/* peças para extrair o padrão (guia de estilo) de UMA linha: as mais recentes finalizadas + carrosséis + identidade, de conjuntos variados */
function amostraParaPadrao(lib, slug, linha = '', max = 6) {
  const e = lib && lib.empresas && lib.empresas[slug]; if (!e) return [];
  const ok = e.itens.filter(i => daLinha(i, linha) && i.bytes > 20e3 && i.bytes <= TAM_MAX && ['finalizado', 'carrossel', 'variavel', 'identidade', 'download', 'promocao', 'institucional'].includes(i.cat) && !/imagem do chatgpt|chatgpt image/i.test(path.basename(i.rel)) || (daLinha(i, linha) && i.cat === 'variavel' && i.bytes > 20e3 && i.bytes <= TAM_MAX)).sort(porData), vistos = new Map(), saida = [];
  for (const i of ok) { const k = i.conjunto; if ((vistos.get(k) || 0) >= (i.cat === 'identidade' ? 2 : 1)) continue; vistos.set(k, (vistos.get(k) || 0) + 1); saida.push(i); if (saida.length >= max) break; }
  return saida.map(i => abs(lib, slug, i)).filter(Boolean);
}

module.exports = { MKT_RAIZ, DOWNLOADS, indexar, carregar, escolherReferencias, folhaDeIdentidade, melhorLogo, amostraParaPadrao, raizDrive, categoriaDe, ehClube, PASTAS, PASTAS_MKT, CLUBES, TAM_MAX };

/* linha de comando:  node biblioteca.js   (indexa e mostra o que achou por empresa, categoria e linha, e os logos escolhidos) */
if (require.main === module) {
  const r = indexar(); if (r._erro) { console.log(r._erro); process.exit(1); }
  const lib = carregar({ validadeMs: 36e5 }); console.log('Biblioteca de referências:');
  for (const [slug, v] of Object.entries(r)) {
    if (slug[0] === '_') continue;
    console.log('  ' + slug + ' (' + v.origem + '): ' + v.total + ' peça(s)  linhas: ' + Object.entries(v.porLinha).map(([c, n]) => c + ' ' + n).join(', ') + '  |  ' + Object.entries(v.porCategoria).map(([c, n]) => c + ' ' + n).join(', '));
    const ln = CLUBES[slug] ? ['farmacia', 'club'] : ['geral']; for (const l of ln) console.log('     logo ' + l + ': ' + (melhorLogo(lib, slug, l) || '(não achei: ponha o caminho em kit.json)'));
  }
}
