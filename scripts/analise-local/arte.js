/* Compositor de arte da marca. A IA escreve o TEXTO; a arte é montada aqui, com o logo, as cores, as fontes e as fotos reais da empresa.
   Por que assim: imagem gerada por IA erra logo e texto e tem "cara de IA" (brilho, degradê, pele lisa). Tipografia certa, grade fixa, margens
   generosas e foto de verdade não têm esse problema. Renderiza HTML -> PNG com o Edge do próprio Windows (sem instalar nada). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFile } = require('child_process'), { pathToFileURL } = require('url');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
const url = f => pathToFileURL(f).href;

function acharEdge() {
  const c = [process.env.N7_EDGE, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  return c.find(f => fs.existsSync(f)) || '';
}

/* tema (fundo/texto/acento) de uma empresa; o acento é a cor da marca com contraste suficiente sobre o fundo */
function tema(kit, nome) {
  const c = kit.cores, escuro = nome === 'escuro', bg = escuro ? c.escuro : c.claro, fg = escuro ? '#FFFFFF' : c.escuro;
  const ac = (escuro && c.acentoEscuro) || [c.primaria, c.destaque, c.secundaria].find(x => contraste(x, bg) >= 3) || fg;
  return { nome, bg, fg, ac, suave: rgba(fg, 0.68), linha: rgba(fg, 0.16), creme: escuro ? rgba('#FFFFFF', 0.06) : c.creme };
}
/* o tema que o slide quer, se o logo funciona nele; senão o primeiro que o logo aceita */
function escolherTema(kit, tipo, comFoto) {
  const aceitos = (kit.logo && kit.logo.temas) || ['claro', 'escuro']; let q = (kit.preferencia && kit.preferencia[tipo]) || 'claro';
  if (comFoto && tipo === 'capa' && aceitos.includes('escuro')) q = 'escuro';
  return tema(kit, aceitos.includes(q) ? q : aceitos[0]);
}

/* logo aparado e centrado na altura pedida. Logo com fundo escuro/claro some no fundo da arte por mistura (screen/multiply) */
function logoHtml(kit, alturaPx, t) {
  if (!kit.logoArquivo) return `<span class="nome" style="font-size:${Math.round(alturaPx * 0.42)}px">${esc(kit.nome)}</span>`;
  const modo = kit.logo && kit.logo.fundo === 'escuro' ? 'lighten' : kit.logo && kit.logo.fundo === 'claro' ? 'darken' : 'normal';
  const r = kit.logoRecorte;
  if (r && kit.logoW) { const s = alturaPx / r.h; return `<span class="logo" style="width:${Math.round(r.w * s)}px;height:${alturaPx}px"><img src="${url(kit.logoArquivo)}" style="width:${Math.round(kit.logoW * s)}px;height:${Math.round(kit.logoH * s)}px;margin-left:${-Math.round(r.x * s)}px;margin-top:${-Math.round(r.y * s)}px;mix-blend-mode:${modo}" alt=""></span>`; }
  return `<img class="logo" style="height:${alturaPx}px;mix-blend-mode:${modo}" src="${url(kit.logoArquivo)}" alt="">`;
}

const BASE = `*{box-sizing:border-box;margin:0;padding:0}html,body{width:var(--W);height:var(--H);overflow:hidden}
body{position:relative;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.logo{display:block;overflow:hidden;position:relative}.logo img{display:block;max-width:none}.nome{font-family:var(--ft);font-weight:700;letter-spacing:.5px}
.fit{overflow:hidden}`;

function pagina(kit, t, W, H, corpo, extraCss = '') {
  const fam = n => `'${String(n).replace(/'/g, '')}'`;
  const fontes = (kit.fontesArq || []).map((f, i) => `@font-face{font-family:'KitFonte${i}';src:url('${url(f)}')}`).join('');
  const ft = [...(kit.fontesArq || []).map((f, i) => `'KitFonte${i}'`).slice(0, 1), fam((kit.fontes || {}).titulo || 'Segoe UI'), "'Segoe UI'", 'Arial', 'sans-serif'].join(',');
  const fc = [fam((kit.fontes || {}).corpo || 'Segoe UI'), "'Segoe UI'", 'Arial', 'sans-serif'].join(',');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${fontes}:root{--W:${W}px;--H:${H}px;--bg:${t.bg};--fg:${t.fg};--ac:${t.ac};--sf:${t.suave};--ln:${t.linha};--ft:${ft};--fc:${fc}}${BASE}body{background:var(--bg);color:var(--fg);font-family:var(--fc)}${extraCss}</style></head><body>${corpo}
<script>
/* encolhe o texto até caber na caixa (sem cortar nunca) */
document.querySelectorAll('.fit').forEach(function(el){var max=parseFloat(el.dataset.max||'0');var fs=parseFloat(getComputedStyle(el).fontSize);var min=parseFloat(el.dataset.min||'28');while(el.scrollHeight>el.clientHeight+1&&fs>min){fs-=2;el.style.fontSize=fs+'px';}});
</script></body></html>`;
}

const MARGEM = 88;
function rodape(kit, t, handle, W) {
  return `<div style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;bottom:${MARGEM - 8}px;display:flex;align-items:center;justify-content:space-between">${logoHtml(kit, 84, t)}<span style="font-size:30px;color:var(--sf);letter-spacing:.5px">${handle ? '@' + esc(handle) : ''}</span></div>`;
}
function marcaDagua(kit, t, W, H) {
  if (!kit.logoArquivo || !(/.svg$/i.test(kit.logoArquivo) || kit.logoW >= 700)) return '';   /* logo pequeno ampliado fica borrado: sem marca d'água */
  const r = kit.logoRecorte; const alt = Math.round(W * 0.95), modo = kit.logo && kit.logo.fundo === 'escuro' ? 'lighten' : kit.logo && kit.logo.fundo === 'claro' ? 'darken' : 'normal';
  if (r && kit.logoW) { const s = alt / r.h; return `<div style="position:absolute;right:${-Math.round(alt * 0.28)}px;bottom:${-Math.round(alt * 0.18)}px;width:${Math.round(r.w * s)}px;height:${alt}px;overflow:hidden;opacity:${t.nome === 'escuro' ? 0.1 : 0.07};pointer-events:none"><img src="${url(kit.logoArquivo)}" style="display:block;max-width:none;width:${Math.round(kit.logoW * s)}px;height:${Math.round(kit.logoH * s)}px;margin-left:${-Math.round(r.x * s)}px;margin-top:${-Math.round(r.y * s)}px;mix-blend-mode:${modo}"></div>`; }
  return '';
}
const tamanhoInicial = n => (n <= 24 ? 148 : n <= 40 ? 124 : n <= 64 ? 104 : n <= 96 ? 88 : 74);

/* ---------- os modelos ---------- */
function modeloCapa(kit, s, ctx) {
  const { W, H, handle, foto } = ctx, t = escolherTema(kit, 'capa', !!foto), titulo = String(s.titulo || '');
  const tag = s.tag ? `<div style="display:flex;align-items:center;gap:18px;font-size:27px;font-weight:700;letter-spacing:5px;text-transform:uppercase;color:var(--ac);margin-bottom:38px"><i style="display:block;width:56px;height:6px;background:var(--ac)"></i>${esc(s.tag)}</div>` : '';
  const fotoH = foto ? Math.round(H * 0.5) : 0, topo = foto ? fotoH + 64 : 120, base = MARGEM + 112, altura = H - topo - base;
  const corpo = `${foto ? `<div style="position:absolute;left:0;top:0;width:${W}px;height:${fotoH}px;background:url('${url(foto)}') center/cover no-repeat;filter:saturate(.94) contrast(1.02)"></div><div style="position:absolute;left:0;top:${fotoH - 10}px;width:${W}px;height:10px;background:var(--ac)"></div>` : marcaDagua(kit, t, W, H)}
    <div style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;top:${topo}px;height:${altura}px;display:flex;flex-direction:column;justify-content:${foto ? 'flex-start' : 'center'}">${tag}
      <div class="fit" data-min="40" style="font-size:${foto ? Math.min(tamanhoInicial(titulo.length), 104) : tamanhoInicial(titulo.length)}px;max-height:${altura - (tag ? 70 : 0)}px"><div style="font-family:var(--ft);font-weight:700;line-height:1.02;letter-spacing:-.01em">${esc(titulo)}</div>${s.subtitulo ? `<div style="margin-top:.45em;font-size:.38em;line-height:1.3;color:var(--sf)">${esc(s.subtitulo)}</div>` : ''}</div>
    </div>${rodape(kit, t, handle, W)}`;
  return { t, corpo };
}
function modeloConteudo(kit, s, ctx) {
  const { W, H, handle, n, total } = ctx, t = escolherTema(kit, 'conteudo', false), cont = total > 1 ? `<span>${String(n).padStart(2, '0')}</span><span style="color:var(--sf)"> / ${String(total).padStart(2, '0')}</span>` : '';
  const topo = 200, altura = H - topo - MARGEM - 130;
  const corpo = `<div style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;top:96px;display:flex;align-items:center;gap:24px;font-size:30px;font-weight:700;letter-spacing:3px;color:var(--ac)">${cont}<i style="display:block;flex:1;height:2px;background:var(--ln)"></i></div>
    <div class="fit" data-min="40" style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;top:${topo}px;height:${altura}px;font-size:84px">
      <div style="font-family:var(--ft);font-weight:700;line-height:1.05;letter-spacing:-.005em">${esc(s.titulo || '')}</div>
      ${s.texto ? `<div style="width:1em;height:.07em;background:var(--ac);margin:.4em 0 .42em"></div><div style="font-size:.52em;line-height:1.36;color:var(--sf)">${esc(s.texto)}</div>` : ''}
    </div>${rodape(kit, t, handle, W)}`;
  return { t, corpo };
}
function modeloFechamento(kit, s, ctx) {
  const { W, H, handle } = ctx, t = escolherTema(kit, 'cta', false), topo = 140, altura = H - topo - MARGEM - 180;
  const corpo = `${marcaDagua(kit, t, W, H)}<div style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;top:${topo}px;height:${altura}px;display:flex;flex-direction:column;justify-content:center">
      <div style="width:84px;height:8px;background:var(--ac);margin-bottom:44px"></div>
      <div class="fit" data-min="44" style="font-size:100px;max-height:${altura - 52}px"><div style="font-family:var(--ft);font-weight:700;line-height:1.02;letter-spacing:-.01em">${esc(s.titulo || '')}</div>${s.texto ? `<div style="margin-top:.4em;font-size:.42em;line-height:1.3;color:var(--sf)">${esc(s.texto)}</div>` : ''}</div>
    </div><div style="position:absolute;left:${MARGEM}px;right:${MARGEM}px;bottom:${MARGEM - 8}px;display:flex;align-items:center;justify-content:space-between">${logoHtml(kit, 120, t)}<span style="font-size:34px;color:var(--ac);font-weight:700">${handle ? '@' + esc(handle) : ''}</span></div>`;
  return { t, corpo };
}

/* ---------- Edge ---------- */
function renderizar(htmlFile, pngFile, W, H, { edge = acharEdge(), timeout = 60000 } = {}) {
  return new Promise((ok, falha) => {
    if (!edge) return falha(new Error('Não achei o Microsoft Edge nem o Chrome neste computador para montar a arte (defina N7_EDGE).'));
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-arte-'));
    execFile(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${perfil}`, `--window-size=${W},${H}`, '--virtual-time-budget=1500', `--screenshot=${pngFile}`, url(htmlFile)], { timeout, windowsHide: true }, err => {
      try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) { /* perfil temporário */ }
      if (err && !fs.existsSync(pngFile)) return falha(new Error('O navegador não montou a arte: ' + String(err.message).slice(0, 120)));
      fs.existsSync(pngFile) ? ok(pngFile) : falha(new Error('O navegador não gerou a imagem.'));
    });
  });
}

/* plano de slides a partir do rascunho: a capa, os conteúdos (se carrossel) e o fechamento */
function planoDeSlides(r, item) {
  const a = r.arte || {}, formato = String(item.formato || ''), carrossel = /carrossel/i.test(formato) || (r.slides || []).length >= 2;
  const capa = { tipo: 'capa', tag: a.tag || '', titulo: a.titulo || item.titulo || '', subtitulo: a.subtitulo || '' };
  const out = [capa];
  if (carrossel) {
    const partes = (Array.isArray(a.slides) && a.slides.length ? a.slides : (r.slides || []).map(x => { const m = String(x).match(/^(.{4,70}?)\s*[:—–-]\s+(.+)$/s); return m ? { titulo: m[1], texto: m[2] } : { titulo: String(x), texto: '' }; })).slice(0, 8);
    partes.forEach(p => out.push({ tipo: 'conteudo', titulo: p.titulo, texto: p.texto || '' }));
    if (a.cta) out.push({ tipo: 'fechamento', titulo: a.cta, texto: '' });
  }
  return out;
}

/* monta todas as artes de um rascunho. Devolve [{ nome, arquivo }] (01_capa.png, 02_slide.png, ...) */
async function compor({ kit, item, r, pasta, handle = '', fotoIdx = 0, edge }) {
  if (!kit || !kit.existe) throw new Error('Sem kit de marca para esta empresa.');
  fs.mkdirSync(pasta, { recursive: true });
  const slides = planoDeSlides(r, item), vertical = /reels|story|stories/i.test(item.formato || ''), W = 1080, H = vertical ? 1920 : 1350, total = slides.length;
  const foto = kit.fotos && kit.fotos.length ? kit.fotos[(fotoIdx % kit.fotos.length + kit.fotos.length) % kit.fotos.length] : '';
  const saida = []; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'n7-html-'));
  try {
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i], ctx = { W, H, handle, foto: s.tipo === 'capa' ? foto : '', n: i + 1, total }, m = s.tipo === 'capa' ? modeloCapa(kit, s, ctx) : s.tipo === 'fechamento' ? modeloFechamento(kit, s, ctx) : modeloConteudo(kit, s, ctx);
      const nome = `${String(i + 1).padStart(2, '0')}_${s.tipo === 'capa' ? 'capa' : s.tipo === 'fechamento' ? 'fechamento' : 'slide'}.png`, html = path.join(tmp, `s${i}.html`), png = path.join(pasta, nome);
      fs.writeFileSync(html, pagina(kit, m.t, W, H, m.corpo)); try { fs.rmSync(png, { force: true }); } catch (e) { /* novo */ }
      await renderizar(html, png, W, H, { edge }); saida.push({ nome, arquivo: png, tipo: s.tipo, largura: W, altura: H });
    }
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temporário */ } }
  return saida;
}

module.exports = { compor, planoDeSlides, escolherTema, tema, contraste, acharEdge, renderizar, logoHtml };
