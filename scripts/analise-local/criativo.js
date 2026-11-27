/* Agente Criativo (roda no computador da agência): produz RASCUNHOS de legenda, roteiro e arte para as pautas que ainda não têm material,
   seguindo as referências do cliente (perfis da V4, estilo), as legendas recentes que já funcionaram e o planejamento do calendário.
   ChatGPT (API da OpenAI) escreve o texto e, se ligado, gera a arte; o Canva recebe o design para a equipe finalizar.
   NUNCA publica: o rascunho entra no site como "Em produção" e passa pela aprovação interna e do cliente.
   As chaves ficam só em %USERPROFILE%\.nova7\agente.json (campos openai e canva), nunca no site nem no repositório. */
const fs = require('fs'), path = require('path'), os = require('os');

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
  const ref = item.referencias || {};
  const sistema = `Você é redator e diretor de arte de uma agência de marketing brasileira. Escreva em português do Brasil, com o tom da marca, sem inventar fatos, preços, prazos ou resultados. Nunca prometa resultado, cura, economia ou garantia. Se faltar informação, escreva de forma genérica e deixe claro no campo "alertas". Responda SOMENTE com um JSON: {"legenda": string (até 1800 caracteres, sem hashtags), "slides": string[] (se for carrossel, um texto curto por slide, até 8), "roteiro": string[] (se for Reels, cenas curtas), "briefArte": string (descrição objetiva da arte: composição, cores, tipografia, o que mostrar), "hashtags": string[] (até 8), "alertas": string[]}.`;
  const usuario = { cliente: item.cliente, setor: item.setor, perfil: item.perfil, pauta: { codigo: item.codigo, titulo: item.titulo, formato: item.formato, data: item.data },
    referencias: { perfisV4: ref.v4 || [], estilo: ref.estilo || '', evitar: ref.evitar || '', exemplosDeLegenda: ref.exemplos || [] }, legendasRecentesDoCliente: item.legendasRecentes || [] };
  return [{ role: 'system', content: sistema }, { role: 'user', content: 'Crie o rascunho desta pauta seguindo as referências (inspire-se no estilo, nunca copie textos de terceiros):\n' + JSON.stringify(usuario) }];
}

async function gerarTexto(item, c) {
  const j = await chamarJson(OPENAI() + '/v1/chat/completions', c.apiKey, { model: c.modeloTexto, messages: prompt(item), response_format: { type: 'json_object' }, temperature: 0.7 });
  const bruto = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; let r; try { r = JSON.parse(bruto); } catch (e) { throw new Error('O modelo não devolveu um JSON válido.'); }
  return { legenda: String(r.legenda || '').slice(0, 2200), slides: [].concat(r.slides || []).map(String), roteiro: [].concat(r.roteiro || []).map(String), briefArte: String(r.briefArte || ''), hashtags: [].concat(r.hashtags || []).map(String), alertas: [].concat(r.alertas || []).map(String) };
}

async function gerarImagem(item, brief, c, pasta) {
  const j = await chamarJson(OPENAI() + '/v1/images/generations', c.apiKey, { model: c.modeloImagem, prompt: `${brief}\nEstilo para Instagram, sem texto escrito dentro da imagem, sem logotipos de terceiros.`.slice(0, 3000), size: '1024x1024', n: 1 });
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error('A OpenAI não devolveu imagem.');
  fs.mkdirSync(pasta, { recursive: true }); const nome = 'arte-1.png'; fs.writeFileSync(path.join(pasta, nome), Buffer.from(b64, 'base64')); return nome;
}

async function criarNoCanva(item, c) {
  const j = await chamarJson(CANVA() + '/rest/v1/designs', c.canvaToken, { design_type: { type: 'preset', name: 'instagram_post' }, title: `${item.codigo} — ${item.titulo}`.slice(0, 250) });
  return (j && j.design && j.design.urls && j.design.urls.edit_url) || '';
}

/* um rascunho completo para uma pauta: texto, conformidade, arte (se ligada) e design no Canva (se ligado) */
async function rascunhoDe(item, c, { pastaBase, estado, log = () => {} }) {
  const r = await gerarTexto(item, c); r.alertas.push(...conformidade(r, item));
  const hoje = new Date().toISOString().slice(0, 10), cota = (estado.criativo = estado.criativo && estado.criativo.dia === hoje ? estado.criativo : { dia: hoje, rascunhos: 0, imagens: 0 });
  r.imagens = [];
  if (c.imagens && r.briefArte && cota.imagens < c.maxImagensPorDia) { try { r.imagens.push(await gerarImagem(item, r.briefArte, c, path.join(pastaBase, slug(item.marca), item.codigo))); cota.imagens++; } catch (e) { r.alertas.push('Arte não gerada: ' + e.message); log('Imagem: ' + e.message); } }
  r.canvaUrl = ''; if (c.canvaToken) { try { r.canvaUrl = await criarNoCanva(item, c); } catch (e) { r.alertas.push('Design no Canva não criado: ' + e.message); log('Canva: ' + e.message); } }
  cota.rascunhos++;
  return Object.assign({ codigo: item.codigo, marca: item.marca, modelo: c.modeloTexto }, r);
}

module.exports = { config, rascunhoDe, conformidade, gerarTexto, prompt, PROIBIDO };
