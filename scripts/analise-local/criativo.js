/* Agente Criativo (roda no computador da agência): produz RASCUNHOS de legenda, roteiro e arte para as pautas que ainda não têm material,
   seguindo as referências do cliente (perfis da V4, estilo), as legendas recentes que já funcionaram e o planejamento do calendário.
   ChatGPT (API da OpenAI) escreve o texto e, se ligado, gera a arte; o Canva recebe o design para a equipe finalizar.
   NUNCA publica: o rascunho entra no site como "Em produção" e passa pela aprovação interna e do cliente.
   As chaves ficam só em %USERPROFILE%\.nova7\agente.json (campos openai e canva), nunca no site nem no repositório. */
const fs = require('fs'), path = require('path'), os = require('os');
const MARCA = require('./marca'), ARTE = require('./arte');

const OPENAI = () => String(process.env.N7_OPENAI_URL || 'https://api.openai.com').replace(/\/$/, '');
const CANVA = () => String(process.env.N7_CANVA_URL || 'https://api.canva.com').replace(/\/$/, '');
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function config(cfgArq) {
  const o = (cfgArq && cfgArq.openai) || {}, c = (cfgArq && cfgArq.canva) || {};
  return { ligado: !!o.apiKey, apiKey: o.apiKey || '', modeloTexto: o.modeloTexto || 'gpt-4.1', modeloImagem: o.modeloImagem || 'gpt-image-1', imagens: o.imagens === true, canvaToken: c.accessToken || '', maxPorRodada: Number(o.maxPorRodada) || 3, maxPorDia: Number(o.maxPorDia) || 12, maxImagensPorDia: Number(o.maxImagensPorDia) || 6 };
}

/* regras que nenhum rascunho pode furar: viram alerta para a revisão humana (a IA erra) */
const PROIBIDO = [[/garantid[oa]s?|garantimos/i, 'promete garantia'], [/100% de (?:resultado|efic[áa]cia|sucesso)/i, 'promete 100% de resultado'], [/sem risco|risco zero/i, 'diz que não há risco'], [/milagr/i, 'usa "milagre"'], [/\bcura\b|curamos|cura de/i, 'promete cura'], [/melhor (?:pre[çc]o|farm[áa]cia|contador) do (?:mundo|brasil|estado)/i, 'superlativo sem prova']];
function conformidade(r, item) {
  const texto = [r.legenda, ...(r.slides || []), ...(r.roteiro || [])].join('\n'), out = [];
  PROIBIDO.forEach(([re, msg]) => { if (re.test(texto)) out.push(`Revisar: o texto ${msg}.`); });
  if (/sa[úu]de|farm/i.test(item.setor || '') && /\bremedio|medicamento\b/i.test(texto) && /\b\d+\s*%\s*(?:off|de desconto)/i.test(texto)) out.push('Revisar: desconto em medicamento exige conferir o preço e a regra da farmácia antes de publicar.');
  if (/cont[aá]bil|contabilidade/i.test(item.setor || '') && /\beconomi[sz]e|reduza (?:seus )?impostos\b/i.test(texto)) out.push('Revisar: contabilidade não pode prometer economia de imposto (norma do CFC).');
  if (!r.legenda) out.push('O modelo não devolveu legenda.');
  return out;
}

async function chamarJson(url, token, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* sem JSON */ }
  if (!r.ok) throw new Error(`${url.replace(/^https?:\/\/[^/]+/, '')} respondeu ${r.status}${j && j.error ? ': ' + String(j.error.message || j.error).slice(0, 140) : ''}`);
  return j;
}

function prompt(item) {
  const ref = item.referencias || {}, kit = MARCA.resumoParaIA(item.kit || {});
  const sistema = `Você é redator de uma agência de marketing brasileira. Escreva em português do Brasil, no tom da marca, sem inventar fatos, preços, prazos ou resultados. Nunca prometa resultado, cura, economia ou garantia. Se faltar informação, escreva de forma genérica e diga isso em "alertas". A ARTE é montada por designer a partir do seu texto (logo, cores e fotos da empresa): por isso escreva títulos curtos e diretos, sem emojis no título, sem clichês de IA ("descubra", "mergulhe", "no mundo de hoje", "desbloqueie") e sem pedir imagem de robô, cérebro, neon, brilho ou pessoas perfeitas. Responda SOMENTE com um JSON: {"legenda": string (até 1800 caracteres, sem hashtags), "arte": {"tag": string (até 3 palavras, ex.: o tema), "titulo": string (até 60 caracteres, a ideia do post), "subtitulo": string (até 90 caracteres, opcional), "cta": string (até 40 caracteres, só se for carrossel), "slides": [{"titulo": string (até 50 caracteres), "texto": string (até 150 caracteres)}] (só se for carrossel, de 3 a 7 slides)}, "roteiro": string[] (se for Reels, cenas curtas), "briefArte": string (que FOTO real combina: cena, luz natural, enquadramento; sem texto na imagem), "hashtags": string[] (até 8), "alertas": string[]}.`;
  const usuario = { cliente: item.cliente, setor: item.setor, perfil: item.perfil, identidade: kit, pauta: { codigo: item.codigo, titulo: item.titulo, formato: item.formato, data: item.data },
    referencias: { perfisV4: ref.v4 || [], estilo: ref.estilo || '', evitar: ref.evitar || '', exemplosDeLegenda: ref.exemplos || [] }, legendasRecentesDoCliente: item.legendasRecentes || [] };
  const msgs = [{ role: 'system', content: sistema }, { role: 'user', content: 'Crie o rascunho desta pauta seguindo as referências (inspire-se no estilo, nunca copie textos de terceiros):\n' + JSON.stringify(usuario) }];
  if (item.ajuste && item.anterior) msgs.push({ role: 'assistant', content: JSON.stringify(item.anterior) }, { role: 'user', content: 'Ajuste o rascunho acima conforme este pedido da equipe e devolva o JSON completo de novo: ' + String(item.ajuste).slice(0, 600) });
  return msgs;
}

async function gerarTexto(item, c) {
  const j = await chamarJson(OPENAI() + '/v1/chat/completions', c.apiKey, { model: c.modeloTexto, messages: prompt(item), response_format: { type: 'json_object' }, temperature: 0.7 });
  const bruto = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; let r; try { r = JSON.parse(bruto); } catch (e) { throw new Error('O modelo não devolveu um JSON válido.'); }
  const arte = r.arte && typeof r.arte === 'object' ? r.arte : {}, cut = (v, n) => String(v ?? '').trim().slice(0, n);
  const slidesArte = (Array.isArray(arte.slides) ? arte.slides : []).slice(0, 8).map(x => ({ titulo: cut(x && x.titulo, 60), texto: cut(x && x.texto, 180) })).filter(x => x.titulo);
  const slidesTxt = slidesArte.length ? slidesArte.map(x => (x.texto ? x.titulo + ': ' + x.texto : x.titulo)) : [].concat(r.slides || []).map(String);
  return { legenda: String(r.legenda || '').slice(0, 2200), arte: { tag: cut(arte.tag, 30), titulo: cut(arte.titulo, 70), subtitulo: cut(arte.subtitulo, 100), cta: cut(arte.cta, 45), slides: slidesArte }, slides: slidesTxt, roteiro: [].concat(r.roteiro || []).map(String), briefArte: String(r.briefArte || ''), hashtags: [].concat(r.hashtags || []).map(String), alertas: [].concat(r.alertas || []).map(String) };
}

/* foto de apoio por IA: só quando a empresa não tem fotos reais e o recurso está ligado. Pedido para parecer foto de verdade, sem rosto, mão, texto ou logo */
async function gerarFotoApoio(item, brief, c, pasta) {
  const prompt = `Fotografia documental real, luz natural, câmera 35mm, leve imperfeição de cena do dia a dia, sem retoque exagerado. Cena: ${brief}. Sem pessoas em primeiro plano, sem rostos, sem mãos, sem texto, sem logotipos, sem neon, sem brilho artificial, sem degradê, sem aspecto de ilustração ou render 3D.`.slice(0, 3000);
  const j = await chamarJson(OPENAI() + '/v1/images/generations', c.apiKey, { model: c.modeloImagem, prompt, size: '1536x1024', quality: 'high', n: 1 });
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error('A OpenAI não devolveu imagem.');
  fs.mkdirSync(pasta, { recursive: true }); const arq = path.join(pasta, 'foto-apoio-ia.png'); fs.writeFileSync(arq, Buffer.from(b64, 'base64')); return arq;
}

async function criarNoCanva(item, c) {
  const j = await chamarJson(CANVA() + '/rest/v1/designs', c.canvaToken, { design_type: { type: 'preset', name: 'instagram_post' }, title: `${item.codigo} — ${item.titulo}`.slice(0, 250) });
  return (j && j.design && j.design.urls && j.design.urls.edit_url) || '';
}

/* um rascunho completo para uma pauta: texto, conformidade, arte da marca (logo, cores e fotos da empresa) e design no Canva (se ligado) */
async function rascunhoDe(item, c, { pastaBase, estado, log = () => {}, edge } = {}) {
  const kit = MARCA.kit(item.slug || item.marca); item = Object.assign({}, item, { kit });
  const r = await gerarTexto(item, c); r.alertas.push(...conformidade(r, item));
  const hoje = new Date().toISOString().slice(0, 10), cota = (estado.criativo = estado.criativo && estado.criativo.dia === hoje ? estado.criativo : { dia: hoje, rascunhos: 0, imagens: 0 });
  const pasta = path.join(pastaBase, slug(item.marca), item.codigo); r.imagens = []; r.artes = [];
  if (!kit.existe) r.alertas.push(...kit.avisos); else {
    let fotoIA = ''; if (c.imagens && item.refazerArte !== false && !kit.fotos.length && r.briefArte && cota.imagens < c.maxImagensPorDia) { try { fotoIA = await gerarFotoApoio(item, r.briefArte, c, pasta); cota.imagens++; r.alertas.push('A foto de apoio foi gerada por IA: confira se parece real e sem defeitos antes de aprovar.'); } catch (e) { r.alertas.push('Foto de apoio não gerada: ' + e.message); log('Foto: ' + e.message); } }
    try {
      const kitUsado = fotoIA ? Object.assign({}, kit, { fotos: [fotoIA] }) : kit, hash = [...item.codigo].reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const artes = await ARTE.compor({ kit: kitUsado, item, r, pasta, handle: (item.perfil && item.perfil.handle) || '', fotoIdx: hash, edge }); r.artes = artes; r.imagens = artes.map(a => a.nome);
      if (!kit.fotos.length && !fotoIA) r.alertas.push('Arte só com tipografia: a empresa ainda não tem fotos reais na pasta de marcas.');
    } catch (e) { r.alertas.push('Arte não montada: ' + e.message); log('Arte: ' + e.message); }
    kit.avisos.filter(a => /pequeno|logo/i.test(a)).slice(0, 1).forEach(a => r.alertas.push(a));
  }
  r.canvaUrl = ''; if (c.canvaToken) { try { r.canvaUrl = await criarNoCanva(item, c); } catch (e) { r.alertas.push('Design no Canva não criado: ' + e.message); log('Canva: ' + e.message); } }
  cota.rascunhos++;
  return Object.assign({ codigo: item.codigo, marca: item.marca, modelo: c.modeloTexto, pasta }, r);
}

module.exports = { slug, config, rascunhoDe, conformidade, gerarTexto, prompt, PROIBIDO };
