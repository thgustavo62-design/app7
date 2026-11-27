/* Base de regras e estilos de cada empresa: o que a agência exige e o que o agente aprendeu com as aprovações e os pedidos de ajuste.
   Fica em Documentos\Nova7 Marcas\<empresa>\regras.json e entra em TODO pedido de texto e de arte ("REGRAS DA AGÊNCIA (obrigatórias)").
   Quem manda é a equipe: o agente só SUGERE regras (a partir dos ajustes pedidos); regra sugerida só vale depois de aceita na página da extensão.
   Aprovações viram referência: as artes que a equipe aprova são copiadas para <empresa>\aprovadas\<linha>\<código> e passam a ser as primeiras referências. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const LINHAS = ['todas', 'farmacia', 'club', 'geral'];
const arq = dir => path.join(dir, 'regras.json');
const novoId = () => 'r' + crypto.randomBytes(4).toString('hex');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function ler(dir) {
  try { const j = JSON.parse(fs.readFileSync(arq(dir), 'utf8').replace(/^﻿/, '')); return { regras: Array.isArray(j.regras) ? j.regras : [], aprovadas: Array.isArray(j.aprovadas) ? j.aprovadas : [], ajustes: Array.isArray(j.ajustes) ? j.ajustes : [], descartadas: Array.isArray(j.descartadas) ? j.descartadas : [] }; }
  catch (e) { return { regras: [], aprovadas: [], ajustes: [], descartadas: [] }; }
}
function salvar(dir, b) { fs.mkdirSync(dir, { recursive: true }); const tmp = arq(dir) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(b, null, 2)); fs.renameSync(tmp, arq(dir)); return b; }

const limpaTexto = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 400);
/* regra nova da equipe (ativa) ou sugerida pelo agente (espera aceite). Não repete regra igual */
function adicionar(dir, { texto, linha = 'todas', origem = 'manual', status, fonte = '' }) {
  texto = limpaTexto(texto); if (texto.length < 6) throw new Error('Escreva a regra com pelo menos 6 letras.');
  if (!LINHAS.includes(linha)) linha = 'todas'; const b = ler(dir), n = norm(texto), igual = b.regras.find(r => norm(r.texto) === n && r.linha === linha);
  if (igual) { if (igual.status === 'desativada' && origem === 'manual') { igual.status = 'ativa'; salvar(dir, b); } return igual; }
  const r = { id: novoId(), linha, texto, origem, status: status || (origem === 'manual' ? 'ativa' : 'sugerida'), em: new Date().toISOString(), fonte: String(fonte).slice(0, 40) };
  b.regras.push(r); salvar(dir, b); return r;
}
function atualizar(dir, id, { texto, linha, status }) {
  const b = ler(dir), r = b.regras.find(x => x.id === id); if (!r) throw new Error('Regra não encontrada.');
  if (texto !== undefined) { const t = limpaTexto(texto); if (t.length < 6) throw new Error('Regra curta demais.'); r.texto = t; } if (linha !== undefined && LINHAS.includes(linha)) r.linha = linha; if (status !== undefined && ['ativa', 'sugerida', 'desativada'].includes(status)) r.status = status;
  salvar(dir, b); return r;
}
function remover(dir, id) { const b = ler(dir), n = b.regras.length; b.regras = b.regras.filter(r => r.id !== id); salvar(dir, b); return b.regras.length < n; }

/* as regras que valem para uma linha ('todas' vale sempre; 'geral' = empresa sem clube) */
const regrasAtivas = (dir, linha = '') => ler(dir).regras.filter(r => r.status === 'ativa' && (r.linha === 'todas' || !linha || r.linha === linha || (linha === 'geral'))).map(r => r.texto);
/* bloco de texto para o pedido */
const blocoDeRegras = (dir, linha = '') => { const t = regrasAtivas(dir, linha); return t.length ? 'REGRAS DA AGÊNCIA (obrigatórias, vêm da equipe; valem mais que o seu gosto):\n' + t.map(x => '- ' + x).join('\n') + '\n' : ''; };

/* pedido de ajuste da equipe vira regra SUGERIDA (a equipe decide na página da extensão se vale para sempre) */
function sugerirDeAjuste(dir, { instrucao, codigo = '', linha = 'todas' }) {
  const b = ler(dir), texto = limpaTexto(instrucao); if (texto.length < 6) return null;
  b.ajustes.push({ codigo: String(codigo).slice(0, 20), instrucao: texto, em: new Date().toISOString() }); b.ajustes = b.ajustes.slice(-60); salvar(dir, b);
  return adicionar(dir, { texto, linha, origem: 'ajuste', status: 'sugerida', fonte: codigo });
}
function registrarAprovada(dir, { codigo, linha, arquivos = [], titulo = '' }) {
  const b = ler(dir); if (b.aprovadas.some(a => a.codigo === codigo)) return false;
  b.aprovadas.push({ codigo: String(codigo).slice(0, 20), linha: linha || 'geral', titulo: String(titulo).slice(0, 80), arquivos: arquivos.slice(0, 10), em: new Date().toISOString() }); b.aprovadas = b.aprovadas.slice(-200); salvar(dir, b); return true;
}
function registrarDescartada(dir, { codigo, titulo = '', linha = '' }) {
  const b = ler(dir); if (b.descartadas.some(a => a.codigo === codigo)) return false; b.descartadas.push({ codigo: String(codigo).slice(0, 20), titulo: String(titulo).slice(0, 80), linha, em: new Date().toISOString() }); b.descartadas = b.descartadas.slice(-100); salvar(dir, b); return true;
}

/* copia as artes aprovadas para a pasta de aprendizado da empresa (viram referência) */
function guardarAprovada(dir, { codigo, linha, origemDir, nomes, titulo }) {
  const sub = path.join(dir, 'aprovadas', /^(club|farmacia)$/.test(linha) ? linha : 'geral', String(codigo).replace(/[^\w-]/g, '')), copiados = [];
  fs.mkdirSync(sub, { recursive: true });
  for (const n of nomes || []) { const f = path.join(origemDir, n); if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(sub, n)); copiados.push(n); } }
  if (copiados.length) registrarAprovada(dir, { codigo, linha, arquivos: copiados, titulo });
  return copiados.length;
}

module.exports = { ler, salvar, adicionar, atualizar, remover, regrasAtivas, blocoDeRegras, sugerirDeAjuste, registrarAprovada, registrarDescartada, guardarAprovada, LINHAS };
