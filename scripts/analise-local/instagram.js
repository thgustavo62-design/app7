/* Instagram do cliente como fonte do agente criativo: bio, últimas legendas e as imagens mais recentes (padrão visual que o feed já usa).
   A leitura é feita pela extensão do Chrome (só leitura, conta já logada) e fica guardada em Documentos\Nova7 Marcas\<empresa>\instagram\ por 7 dias. */
const fs = require('fs'), path = require('path');
const VALIDADE_MS = 7 * 864e5;

async function dadosDoInstagram(ponte, handle, dir, { max = 12, validadeMs = VALIDADE_MS } = {}) {
  const h = String(handle || '').replace(/^@/, '').trim(); if (!h) return null;
  const arq = path.join(dir, 'perfil.json');
  try { const c = JSON.parse(fs.readFileSync(arq, 'utf8')); if (c.handle === h && Date.now() - Date.parse(c.coletadoEm) < validadeMs) return c; } catch (e) { /* ainda não coletado */ }
  const r = await ponte.pedirInstagram(h, { max });
  fs.mkdirSync(dir, { recursive: true });
  try { for (const n of fs.readdirSync(dir)) if (/\.jpe?g$/i.test(n)) fs.rmSync(path.join(dir, n), { force: true }); } catch (e) { /* pasta nova */ }
  const posts = (r.posts || []).map((p, i) => {
    let arquivo = ''; if (p.imagem && p.imagem.b64) { arquivo = String(i + 1).padStart(2, '0') + '_' + String(p.codigo).replace(/[^\w-]/g, '') + '.jpg'; fs.writeFileSync(path.join(dir, arquivo), Buffer.from(p.imagem.b64, 'base64')); }
    return { codigo: p.codigo, tipo: p.tipo, alt: p.alt || '', legenda: p.legenda || '', arquivo };
  });
  const out = { handle: h, bio: r.bio || '', resumo: r.resumo || '', coletadoEm: new Date().toISOString(), posts };
  fs.writeFileSync(arq, JSON.stringify(out, null, 1)); return out;
}

/* o que a IA de texto recebe: curto, sem imagens */
const resumoParaIA = d => d ? { perfil: String(d.bio || d.resumo || '').replace(/\s+/g, ' ').slice(0, 400), ultimasLegendas: d.posts.map(p => p.legenda).filter(Boolean).slice(0, 6).map(t => t.replace(/\s+/g, ' ').slice(0, 280)), tiposRecentes: d.posts.slice(0, 12).map(p => p.tipo).join(',') } : null;
/* as imagens mais recentes (padrão do feed), para anexar como referência de estilo */
/* linha: 'club' só posts que falam do clube; 'farmacia' só os que não falam (não misturar assuntos); vazio = todos */
const falaDoClube = p => /club/i.test((p.legenda || '') + ' ' + (p.alt || ''));
const imagensDe = (d, dir, n = 1, { linha = '' } = {}) => d ? d.posts.filter(p => p.arquivo && fs.existsSync(path.join(dir, p.arquivo)) && (!linha || linha === 'geral' || (linha === 'club' ? falaDoClube(p) : !falaDoClube(p)))).slice(0, n).map(p => path.join(dir, p.arquivo)) : [];

module.exports = { dadosDoInstagram, resumoParaIA, imagensDe, VALIDADE_MS };
