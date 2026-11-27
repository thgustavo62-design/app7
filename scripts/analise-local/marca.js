/* Identidade visual de cada empresa: cores, fontes, tom, logo e fotos reais.
   Os padrões vêm de marcas.json (cores medidas nos logos do site). A agência ajusta por empresa em
   Documentos\Nova7 Marcas\<empresa>\  (kit.json só com o que mudar, logo.png/logo.svg, fontes\, fotos\).
   O logo é aparado sozinho: PNG com fundo transparente perde a margem vazia, para ficar centrado e do tamanho certo. */
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');

const REPO = path.join(__dirname, '..', '..');
const DEFAULTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'marcas.json'), 'utf8'));
const pastaMarcas = () => process.env.N7_MARCAS || path.join(fs.existsSync(path.join(os.homedir(), 'Documents')) ? path.join(os.homedir(), 'Documents') : path.join(os.homedir(), '.nova7'), 'Nova7 Marcas');
const COR = /^#[0-9a-f]{6}$/i;
const EXT_FOTO = /\.(jpe?g|png|webp)$/i;

/* leitor mínimo de PNG (sem dependências): dimensões e caixa do que não é transparente */
function lerPng(file) {
  const b = fs.readFileSync(file); if (b.toString('ascii', 1, 4) !== 'PNG') return null;
  let p = 8, w = 0, h = 0, ct = 0, bd = 8, il = 0; const idat = []; let plte = null, trns = null;
  while (p < b.length) { const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; } else if (t === 'IDAT') idat.push(d); else if (t === 'PLTE') plte = d; else if (t === 'tRNS') trns = d; p += 12 + len; }
  if (il || bd !== 8 || ![0, 2, 3, 4, 6].includes(ct)) return { w, h, px: null };
  const raw = zlib.inflateSync(Buffer.concat(idat)), ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], stride = w * ch, out = Buffer.alloc(h * stride); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) { const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); } cur[i] = v & 255; }
    prev = cur; }
  const px = (x, y) => { const o = y * stride; if (ct === 3) { const i = out[o + x]; return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255]; }
    if (ct === 2) return [out[o + x * 3], out[o + x * 3 + 1], out[o + x * 3 + 2], 255]; if (ct === 6) return [out[o + x * 4], out[o + x * 4 + 1], out[o + x * 4 + 2], out[o + x * 4 + 3]];
    if (ct === 0) return [out[o + x], out[o + x], out[o + x], 255]; return [out[o + x * 2], out[o + x * 2], out[o + x * 2], out[o + x * 2 + 1]]; };
  return { w, h, px };
}
/* caixa do conteúdo visível (alfa > 20); null se o PNG não tem transparência útil */
function caixaVisivel(im) {
  if (!im || !im.px) return null; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, transp = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { if (im.px(x, y)[3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } else transp++; }
  if (x1 < 0 || transp < im.w * im.h * 0.02) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const mescla = (a, b) => { const o = Object.assign({}, a); for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? mescla(a && a[k] || {}, b[k]) : b[k]; return o; };

/* o kit de uma empresa, já resolvido: caminhos reais, logo aparado, fotos disponíveis e avisos do que falta */
function kit(key, { marcas = pastaMarcas() } = {}) {
  const base = DEFAULTS[key]; const avisos = [];
  if (!base) return { key, existe: false, avisos: [`Sem kit de marca para "${key}": crie ${path.join(marcas, key, 'kit.json')}.`] };
  let k = JSON.parse(JSON.stringify(base)); const dir = path.join(marcas, key);
  try { const f = path.join(dir, 'kit.json'); if (fs.existsSync(f)) k = mescla(k, JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''))); } catch (e) { avisos.push('kit.json da pasta de marcas está inválido e foi ignorado: ' + e.message); }
  Object.keys(k.cores || {}).forEach(c => { if (c !== 'confirmar' && !COR.test(k.cores[c])) { avisos.push(`Cor "${c}" inválida no kit; usei o padrão.`); k.cores[c] = base.cores[c]; } });
  /* logo: o da pasta de marcas vale mais que o do site */
  let logo = '';
  for (const n of ['logo.svg', 'logo.png', 'logo.jpg', 'logo.webp']) if (fs.existsSync(path.join(dir, n))) { logo = path.join(dir, n); break; }
  if (!logo && k.logo && k.logo.arquivo) { const f = path.join(REPO, 'public', 'assets', 'clientes', k.logo.arquivo); if (fs.existsSync(f)) logo = f; }
  let recorte = k.logo && k.logo.recorte || null, w = 0, h = 0;
  if (logo && /\.png$/i.test(logo)) { try { const im = lerPng(logo); if (im) { w = im.w; h = im.h; if (!recorte) recorte = caixaVisivel(im); } } catch (e) { avisos.push('Não consegui ler o logo para aparar: ' + e.message); } }
  const ehDoSite = logo && logo.startsWith(path.join(REPO, 'public'));
  if (logo && ehDoSite && w && w <= 300) avisos.push(`O logo de ${k.nome} é o ícone pequeno do site (${w}px): para arte de feed, ponha o original em ${path.join(dir, 'logo.png')} (ou logo.svg).`);
  if (!logo) avisos.push(`${k.nome} não tem logo: ponha logo.png ou logo.svg em ${dir}. Enquanto isso a arte usa o nome em texto.`);
  /* fotos reais da empresa (a melhor forma de a arte não parecer feita por IA) */
  const fdir = path.join(dir, 'fotos'); let fotos = []; try { fotos = fs.readdirSync(fdir).filter(n => EXT_FOTO.test(n)).sort().map(n => path.join(fdir, n)); } catch (e) { /* sem fotos */ }
  if (!fotos.length) avisos.push(`Sem fotos reais de ${k.nome}: ponha fotos da loja/equipe/produtos em ${fdir} (a arte fica muito mais natural).`);
  const fontesDir = path.join(dir, 'fontes'); let fontesArq = []; try { fontesArq = fs.readdirSync(fontesDir).filter(n => /\.(woff2?|ttf|otf)$/i.test(n)).map(n => path.join(fontesDir, n)); } catch (e) { /* só fontes do sistema */ }
  if (k.confirmar || (k.cores && k.cores.confirmar)) avisos.push(`As cores de ${k.nome} são provisórias: confirme em ${path.join(dir, 'kit.json')}.`);
  return Object.assign(k, { key, existe: true, dir, logoArquivo: logo, logoRecorte: recorte, logoW: w, logoH: h, fotos, fontesArq, avisos });
}
const todas = opts => Object.keys(DEFAULTS).filter(k => !k.startsWith('_')).map(k => kit(k, opts));

/* resumo curto do kit para o prompt da IA (a IA recebe a identidade, nunca desenha logo nem texto) */
const resumoParaIA = k => k.existe ? { empresa: k.nome, tom: k.tom, evitar: k.evitar, cores: { principal: k.cores.primaria, secundaria: k.cores.secundaria, destaque: k.cores.destaque } } : {};

module.exports = { kit, todas, lerPng, caixaVisivel, pastaMarcas, resumoParaIA, DEFAULTS };

/* linha de comando:  node marca.js --preparar   (cria as pastas de cada empresa e lista o que falta)
                      node marca.js --amostras   (monta uma arte de exemplo de cada empresa para você conferir a identidade) */
if (require.main === module) {
  (async () => {
    const raiz = pastaMarcas(), arg = process.argv[2] || '--preparar';
    if (arg === '--amostras') {
      const ARTE = require('./arte'); console.log('Montando uma arte de exemplo de cada empresa em ' + raiz + ' (uma subpasta _amostra por empresa) ...');
      for (const k of todas()) {
        if (!k.existe) continue;
        try { const r = { arte: { tag: k.nome, titulo: 'Exemplo de arte da marca', subtitulo: 'Confira logo, cores e fonte', cta: 'Fale com a gente', slides: [{ titulo: 'Segundo slide', texto: 'Texto de apoio do carrossel.' }] }, slides: ['x'] };
          const a = await ARTE.compor({ kit: k, item: { titulo: 'Exemplo', formato: 'Carrossel' }, r, pasta: path.join(k.dir, '_amostra'), handle: k.key.replace(/-/g, '') }); console.log('  ' + k.nome + ': ' + a.length + ' arte(s) em ' + path.join(k.dir, '_amostra')); } catch (e) { console.log('  ' + k.nome + ': ' + e.message); }
      }
      return;
    }
    console.log('Pasta de marcas: ' + raiz);
    for (const k of todas()) {
      if (!k.existe) continue; fs.mkdirSync(path.join(k.dir, 'fotos'), { recursive: true }); fs.mkdirSync(path.join(k.dir, 'fontes'), { recursive: true });
      const kj = path.join(k.dir, 'kit.json');
      if (!fs.existsSync(kj)) fs.writeFileSync(kj, JSON.stringify({ _leia: 'Deixe só o que quiser mudar. Cores em #RRGGBB. Troque logo.png/logo.svg, ponha fotos na subpasta fotos e fontes (.ttf/.otf/.woff2) na subpasta fontes.', cores: DEFAULTS[k.key].cores, fontes: DEFAULTS[k.key].fontes, tom: DEFAULTS[k.key].tom, evitar: DEFAULTS[k.key].evitar }, null, 2));
      console.log('\n' + k.nome + '  (' + k.dir + ')');
      console.log('  logo: ' + (k.logoArquivo ? path.basename(k.logoArquivo) + (k.logoW ? ' ' + k.logoW + 'px' : '') : 'FALTA') + '   fotos: ' + k.fotos.length + '   fontes próprias: ' + k.fontesArq.length);
      k.avisos.forEach(a => console.log('  - ' + a));
    }
  })().catch(e => { console.error(e.message); process.exit(1); });
}
