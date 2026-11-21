/* Clientes iniciais (migração dos quatro que já existiam) e conversões da aba Clientes. */
const SV = require('../public/assets/js/services.js') && globalThis.N7Services;
const { load } = require('./dataset');

const SETOR = { M: 'saude', F: 'saude', C: 'agro', N: 'agencia' };
const SERV = { M: 'redes,trafego,varejo,promocoes', F: 'redes,trafego,varejo,promocoes', C: 'redes', N: 'redes' };
function defaults(at = '2026-11-18T00:00:00.000Z') {
  return load().CLIENTS.map(c => ({ chave: c.key, id: c.id, nome: c.name, curto: c.short, cor: c.color, segmento: c.segment || '', perfil: c.handle || '', setor: SETOR[c.key] || 'outro', servicos: SERV[c.key] || 'redes', ativo: 'sim', versao: '1', atualizado_em: at, atualizado_por: 'seed', meta_ads: '', meta_ig: '', meta_fb: '', endereco: '', bairro: '', lat: '', lng: '', raio_km: '' }));
}
const num = v => { if (v === '' || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; };   /* vazio continua vazio, nunca vira zero */
const fromRow = r => ({ key: r.chave, id: r.id, name: r.nome, short: r.curto, color: r.cor, segment: r.segmento, handle: r.perfil, setor: r.setor, services: SV.parse(r.servicos), active: String(r.ativo).trim().toLowerCase() !== 'nao', meta: { ads: r.meta_ads || '', ig: r.meta_ig || '', fb: r.meta_fb || '' }, local: { endereco: r.endereco || '', bairro: r.bairro || '', lat: num(r.lat), lng: num(r.lng), raio: num(r.raio_km) }, v: r.versao });
module.exports = { defaults, fromRow, SV };
