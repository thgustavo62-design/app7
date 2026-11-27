/* Padrão de criação de cada empresa, extraído das peças que a agência JÁ criou e aprovou (biblioteca.js):
   o ChatGPT (pela extensão) olha as artes e escreve o guia de estilo (paleta, tipografia, elementos, composição, receita por tipo de peça).
   O guia fica em Documentos\Nova7 Marcas\<empresa>\padrao.json (a agência pode editar) e entra no pedido de toda arte nova. */
const fs = require('fs'), path = require('path');
const BIB = require('./biblioteca');

const TIPOS = ['promocional', 'educativo', 'institucional', 'aviso', 'sorteio', 'produto'];
const mimeDe = f => /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
const anexoDe = f => ({ nome: path.basename(f).replace(/[^\w.\- ]/g, '').slice(0, 50) || 'ref.png', mime: mimeDe(f), b64: fs.readFileSync(f).toString('base64') });

const pergunta = (nome, linha, clube) => `Você é diretor de arte sênior de uma agência brasileira. As imagens anexas são peças JÁ APROVADAS e PUBLICADAS ${linha === 'club' ? `do programa de benefícios "${clube}" da empresa "${nome}" (SÓ do clube: ignore qualquer estilo que não seja o do clube)` : linha === 'farmacia' ? `das artes NORMAIS da farmácia "${nome}" (institucional, educativo, avisos, promoções; NÃO são do clube de benefícios)` : `da empresa "${nome}"`}. Estude-as com atenção e escreva o PADRÃO DE CRIAÇÃO que um designer precisa seguir para criar peças novas que pareçam do mesmo feed. Seja específico e visual (nada genérico como "moderno e limpo"). Não invente o que não aparece nas imagens.
Responda SOMENTE com um JSON (um objeto): {"resumo": string (até 600 caracteres: o estilo geral), "paleta": [{"nome": string, "hex": "#RRGGBB", "uso": string}] (4 a 8 cores), "tipografia": {"titulo": string, "apoio": string, "tratamento": string}, "elementos": string[] (elementos gráficos recorrentes: ícones 3D, selos, formas, texturas), "fundos": string[], "composicao": string (grade, hierarquia, margens, posição do título e do logotipo), "logotipo": string (posição, tamanho e versão usada), "escalaTipografica": string (tamanho relativo do título, do apoio e da chamada, e como o título é quebrado em linhas), "grade": string (colunas, margens, alinhamento e respiros), "layouts": [{"nome": string, "quando": string, "estrutura": string}] (os 3 a 6 layouts recorrentes: o que fica no topo, no meio e na base, e onde entram logo, produto e chamada), "carrossel": string (como a capa, os slides e o fechamento se comportam e o que se repete entre eles), "stories": string (como é uma sequência de stories: gancho, desenvolvimento, chamada, proporção e elementos de interação), "assinatura": string[] (os detalhes que fazem a peça parecer desta marca e de ninguém mais), "receitas": {"promocional": string, "educativo": string, "institucional": string, "aviso": string, "sorteio": string, "produto": string} (para cada tipo de peça, como montar: fundo, título, elementos, chamada; deixe "" se as imagens não mostram esse tipo), "evitar": string[]}.`;

/* texto curto que entra no pedido da arte */
function textoDoPadrao(p) {
  if (!p) return '';
  const t = [p.resumo, p.paleta && p.paleta.length ? 'Paleta: ' + p.paleta.map(c => `${c.nome} ${c.hex}${c.uso ? ' (' + c.uso + ')' : ''}`).join('; ') + '.' : '', p.tipografia ? 'Tipografia: ' + [p.tipografia.titulo, p.tipografia.apoio, p.tipografia.tratamento].filter(Boolean).join('; ') + '.' : '',
    p.elementos && p.elementos.length ? 'Elementos recorrentes: ' + p.elementos.join('; ') + '.' : '', p.fundos && p.fundos.length ? 'Fundos: ' + p.fundos.join('; ') + '.' : '', p.composicao ? 'Composição: ' + p.composicao : '', p.grade ? 'Grade: ' + p.grade : '', p.escalaTipografica ? 'Escala tipográfica: ' + p.escalaTipografica : '', p.layouts && p.layouts.length ? 'Layouts: ' + p.layouts.map(l => l.nome + ' (' + l.estrutura + ')').join('; ') + '.' : '', p.carrossel ? 'Carrossel: ' + p.carrossel : '', p.stories ? 'Stories: ' + p.stories : '', p.assinatura && p.assinatura.length ? 'Assinatura da marca: ' + p.assinatura.join('; ') + '.' : '', p.logotipo ? 'Logotipo: ' + p.logotipo : '', p.evitar && p.evitar.length ? 'Evitar: ' + p.evitar.join('; ') + '.' : ''];
  return t.filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 2600);
}
const receitaDe = (p, tipo) => (p && p.receitas && tipo && String(p.receitas[tipo] || '').trim()) || '';

/* pede ao ChatGPT o padrão de uma empresa (precisa da extensão). `extrairJson` vem do criativo.js (evita depender dele aqui) */
const arquivoDe = linha => linha === 'club' ? 'padrao-club.json' : 'padrao.json';
async function extrair(ponte, kit, lib, extrairJson, { log = () => {}, n = 6, linha = '' } = {}) {
  const arqs = BIB.amostraParaPadrao(lib, kit.key, linha, n).filter(f => { try { return fs.statSync(f).size <= BIB.TAM_MAX; } catch (e) { return false; } });
  if (arqs.length < 3) return null;
  const resp = await ponte.pedirConversa([{ texto: pergunta(kit.nome, linha, kit.clube), anexos: arqs.map(anexoDe) }], { tempoMs: 8 * 60e3, temporario: true });
  const j = extrairJson(resp.resultados[0] || {}); if (!j || !j.resumo) throw new Error('o ChatGPT não devolveu o padrão em JSON');
  const limpo = { versao: 2, linha: linha || 'geral', escalaTipografica: String(j.escalaTipografica || '').slice(0, 300), grade: String(j.grade || '').slice(0, 300), layouts: (Array.isArray(j.layouts) ? j.layouts : []).slice(0, 6).map(l => ({ nome: String(l && l.nome || '').slice(0, 40), quando: String(l && l.quando || '').slice(0, 120), estrutura: String(l && l.estrutura || '').slice(0, 260) })).filter(l => l.nome), carrossel: String(j.carrossel || '').slice(0, 400), stories: String(j.stories || '').slice(0, 400), assinatura: [].concat(j.assinatura || []).map(x => String(x).slice(0, 120)).slice(0, 8), geradoEm: new Date().toISOString(), baseadoEm: arqs.map(f => path.basename(f)), resumo: String(j.resumo).slice(0, 700), paleta: (Array.isArray(j.paleta) ? j.paleta : []).filter(c => c && /^#[0-9a-f]{6}$/i.test(String(c.hex))).slice(0, 8).map(c => ({ nome: String(c.nome || '').slice(0, 30), hex: String(c.hex), uso: String(c.uso || '').slice(0, 80) })),
    tipografia: { titulo: String(j.tipografia && j.tipografia.titulo || '').slice(0, 200), apoio: String(j.tipografia && j.tipografia.apoio || '').slice(0, 200), tratamento: String(j.tipografia && j.tipografia.tratamento || '').slice(0, 200) },
    elementos: [].concat(j.elementos || []).map(x => String(x).slice(0, 120)).slice(0, 12), fundos: [].concat(j.fundos || []).map(x => String(x).slice(0, 120)).slice(0, 8), composicao: String(j.composicao || '').slice(0, 500), logotipo: String(j.logotipo || '').slice(0, 250),
    receitas: Object.fromEntries(TIPOS.map(t => [t, String(j.receitas && j.receitas[t] || '').slice(0, 600)])), evitar: [].concat(j.evitar || []).map(x => String(x).slice(0, 120)).slice(0, 10) };
  fs.mkdirSync(kit.dir, { recursive: true }); fs.writeFileSync(path.join(kit.dir, arquivoDe(linha)), JSON.stringify(limpo, null, 2)); log(`Padrão de criação de ${kit.nome}${linha === 'club' ? ' (' + kit.clube + ')' : linha === 'farmacia' ? ' (artes normais)' : ''} extraído de ${arqs.length} peça(s) já aprovadas: ${path.join(kit.dir, arquivoDe(linha))}`);
  return limpo;
}
const lerPadrao = (dir, linha = '') => { try { return JSON.parse(fs.readFileSync(path.join(dir, arquivoDe(linha)), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };

module.exports = { arquivoDe, extrair, lerPadrao, textoDoPadrao, receitaDe, TIPOS };
