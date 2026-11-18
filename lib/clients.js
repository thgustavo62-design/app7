/* Clientes iniciais (migração dos quatro que já existiam) e conversões da aba Clientes. */
const SV = require('../public/assets/js/services.js') && globalThis.N7Services;
const { load } = require('./dataset');

const SETOR = { M: 'saude', F: 'saude', C: 'agro', N: 'agencia' };
const SERV = { M: 'redes,trafego,varejo', F: 'redes,trafego,varejo', C: 'redes', N: 'redes' };
function defaults(at = '2026-11-18T00:00:00.000Z') {
  return load().CLIENTS.map(c => ({ chave: c.key, id: c.id, nome: c.name, curto: c.short, cor: c.color, segmento: c.segment || '', perfil: c.handle || '', setor: SETOR[c.key] || 'outro', servicos: SERV[c.key] || 'redes', ativo: 'sim', versao: '1', atualizado_em: at, atualizado_por: 'seed', meta_ads: '', meta_ig: '', meta_fb: '' }));
}
const fromRow = r => ({ key: r.chave, id: r.id, name: r.nome, short: r.curto, color: r.cor, segment: r.segmento, handle: r.perfil, setor: r.setor, services: SV.parse(r.servicos), active: String(r.ativo).trim().toLowerCase() !== 'nao', meta: { ads: r.meta_ads || '', ig: r.meta_ig || '', fb: r.meta_fb || '' }, v: r.versao });
module.exports = { defaults, fromRow, SV };
