/* Armazém de vendas do computador da agência: guarda, cupom a cupom, as linhas dos relatórios JÁ CONFERIDOS, um arquivo por loja e por dia,
   para o sistema ir sendo alimentado só com relatórios NOVOS (fracionados por dia, semana ou mês) e analisar o histórico inteiro, sem
   reimportar nada. Regra de junção igual à do site: o relatório emitido por último vence nos dias que cobre, e um relatório mais antigo
   nunca sobrescreve um dia que já veio de um mais novo. Fica em %USERPROFILE%\.nova7\vendas (ou N7_ARMAZEM); só o seu usuário lê. */
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { dias: enumera } = require('./janela');
const base = () => process.env.N7_ARMAZEM || path.join(os.homedir(), '.nova7', 'vendas');
const pasta = loja => path.join(base(), String(loja).replace(/[^A-Za-z0-9_-]/g, '_'));
const cents = n => Math.round(n * 100);
const grava = (arq, obj) => { const tmp = arq + '.tmp'; fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(JSON.stringify(obj)))); fs.renameSync(tmp, arq); };
const le = arq => JSON.parse(zlib.gunzipSync(fs.readFileSync(arq)).toString('utf8'));

function manifesto(loja) { const a = path.join(pasta(loja), 'manifesto.json'); try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch (e) { return { loja, dias: {} }; } }

/* r: { rows, ajustes, cobertura:{inicio,fim}, emissao:{data,hora}, arquivo, sha256 } (já conferido) */
function guardar(loja, r) {
  const dir = pasta(loja); fs.mkdirSync(dir, { recursive: true });
  const m = manifesto(loja), emi = r.emissao ? r.emissao.data + ' ' + r.emissao.hora : '', out = { novos: 0, substituidos: 0, iguais: 0, ignoradosMaisAntigos: 0, divergentes: [], dias: 0 };
  const porDia = new Map(); r.rows.forEach(x => { (porDia.get(x.data) || porDia.set(x.data, []).get(x.data)).push(x); });
  const ajDia = new Map(); (r.ajustes || []).forEach(a => { (ajDia.get(a.data) || ajDia.set(a.data, []).get(a.data)).push(a); });
  for (const d of enumera(r.cobertura.inicio, r.cobertura.fim)) {
    const rows = porDia.get(d) || [], aj = ajDia.get(d) || [], total = rows.reduce((s, x) => s + cents(x.valor), 0) + aj.reduce((s, x) => s + cents(x.valor), 0), ant = m.dias[d];
    out.dias++;
    if (ant && ant.emissao > emi) { out.ignoradosMaisAntigos++; continue; }                 /* o que já está guardado veio de um relatório mais novo */
    if (ant) { if (ant.totalCentavos === total) out.iguais++; else { out.substituidos++; out.divergentes.push({ d, antesCentavos: ant.totalCentavos, depoisCentavos: total, arquivoAntes: ant.arquivo }); } } else out.novos++;
    grava(path.join(dir, d + '.json.gz'), { d, rows, ajustes: aj });
    m.dias[d] = { emissao: emi, arquivo: r.arquivo, sha256: r.sha256 || '', linhas: rows.length, totalCentavos: total };
  }
  m.atualizadoEm = new Date().toISOString(); fs.writeFileSync(path.join(dir, 'manifesto.json'), JSON.stringify(m)); return out;
}

function carregar(loja) {
  const dir = pasta(loja), m = manifesto(loja), rows = [], ajustes = [];
  Object.keys(m.dias).sort().forEach(d => { try { const x = le(path.join(dir, d + '.json.gz')); x.rows.forEach(r => rows.push(r)); x.ajustes.forEach(a => ajustes.push(a)); } catch (e) { /* dia sem arquivo: fica fora */ } });
  return { loja, rows, ajustes, dias: new Set(Object.keys(m.dias)), manifesto: m };
}

function guardarEstoque(loja, items, arquivo, sha256 = '') { const dir = pasta(loja); fs.mkdirSync(dir, { recursive: true }); grava(path.join(dir, 'estoque.json.gz'), { em: new Date().toISOString(), arquivo, sha256, items }); }
function carregarEstoque(loja) { try { return le(path.join(pasta(loja), 'estoque.json.gz')); } catch (e) { return null; } }
const lojas = () => { try { return fs.readdirSync(base()).filter(n => fs.existsSync(path.join(base(), n, 'manifesto.json'))); } catch (e) { return []; } };

module.exports = { guardar, carregar, guardarEstoque, carregarEstoque, manifesto, lojas, base };
