/* Relatório executivo em HTML (um arquivo só, sem internet, imprime em PDF pelo navegador) com a análise completa de uma loja ou rede.
   Reaproveita o mesmo desenho da tela "Análise completa" do site (public/assets/js/analise-vendas.js), então o que o cliente vê no papel é o que vê no painel.
   É o material para mostrar e vender a análise a outras farmácias e redes: capa com a marca da agência, resumo executivo, as seções, e a nota de confiabilidade. */
require('../../public/assets/js/analise-vendas.js');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const R = c => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dm = iso => (iso ? iso.split('-').reverse().join('/') : '—');

const CSS = `
:root{--ink:#14161f;--mut:#5b6073;--line:#e6e8f0;--bg:#f6f7fb;--card:#fff;--v:#7c4dff;--c:#14b8a6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:24px 20px 60px}
.capa{background:linear-gradient(135deg,#14161f,#2b1f5c 60%,#4c2fb3);color:#fff;border-radius:22px;padding:42px 36px;margin-bottom:22px}
.capa small{letter-spacing:.14em;text-transform:uppercase;opacity:.7}.capa h1{margin:8px 0 6px;font-size:2.1rem;line-height:1.15}.capa p{margin:0;opacity:.85}
.capa .marca{margin-top:26px;font-weight:700;letter-spacing:.08em}
.resumo{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 22px;margin-bottom:18px}
.resumo h2{margin:0 0 10px;font-size:1.15rem}.resumo ol{margin:0;padding-left:20px;display:grid;gap:10px}.resumo li b{display:block}.resumo li span{color:var(--mut);font-size:.9rem}
.conf{background:#eefaf4;border:1px solid #bfe8d2;border-radius:14px;padding:12px 16px;color:#176b45;font-size:.9rem;margin-bottom:18px}
.notice{background:#eef2ff;border:1px solid #d6defc;border-radius:12px;padding:10px 14px;margin:0 0 14px;font-size:.88rem}
.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-bottom:16px;overflow:hidden;break-inside:avoid-page}
.rb{padding:14px 20px;border-bottom:1px solid var(--line);background:#fafbff}.rb h3{margin:0;font-size:1.02rem}.rb small{color:var(--mut)}
.panel-body{padding:14px 20px}.table-wrap{overflow:auto;margin:6px 0 10px}
table{border-collapse:collapse;width:100%;font-size:.84rem}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--mut);font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}.rk{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 16px}.rk small{color:var(--mut);display:block}.rk b{font-size:1.45rem}.rk em{display:block;font-style:normal;color:var(--mut);font-size:.8rem}
.grid.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.av{display:grid;gap:14px}.av h4{margin:14px 0 6px;font-size:.9rem}.av-bar{display:inline-block;width:110px;height:8px;border-radius:6px;background:#e9ebf3;overflow:hidden;vertical-align:middle}.av-bar i{display:block;height:100%;background:var(--v);border-radius:6px}
.av-spark{color:var(--v);vertical-align:middle}.av-up{color:#1f9d63}.av-down{color:#d64545}.av-hm th,.av-hm td{padding:4px 6px;font-size:.76rem}
.av-focos{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.av-foco{padding:10px 12px;border-radius:14px;background:#f4f5fa;border-left:4px solid #94a3b8}.av-foco h4{margin:0 0 6px}.av-foco p{margin:0 0 6px}.av-foco small{display:block;color:var(--mut)}
.av-foco.def{border-left-color:#d99a1f}.av-foco.ace{border-left-color:#1f9d63}.av-foco.rea{border-left-color:#d64545}.av-foco.ati{border-left-color:var(--v)}
.av-ops{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.av-op{padding:10px 12px;border-radius:14px;background:#f4f5fa}.av-op small{text-transform:uppercase;letter-spacing:.04em;color:var(--mut);display:block}.av-op p{margin:6px 0 0;font-size:.86rem}.av-op .av-acao{font-weight:600}
.av-lista{margin:0;padding-left:18px;display:grid;gap:6px}.src{color:var(--mut);font-size:.8rem}
.rod{color:var(--mut);font-size:.8rem;text-align:center;margin-top:24px}
@media print{body{background:#fff}.wrap{padding:0}.capa{border-radius:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.panel{break-inside:avoid-page}}
@media(max-width:700px){.grid.g2{grid-template-columns:1fr}}`;

function gerar(a, { marca = 'Nova7', titulo = 'Análise de vendas e marketing', geradoEm = new Date() } = {}) {
  const H = { banner: (ic, tit, sub) => `<div class="rb"><h3>${tit}</h3>${sub ? `<small>${sub}</small>` : ''}</div>`, kpi: (label, val, sub) => `<div class="rk"><small>${label}</small><b>${val}</b><em>${sub || ''}</em></div>` };
  const corpo = globalThis.N7AnaliseVendas.html(Object.assign({}, a, { publicadoEm: a.atualizadoEm }), H).replace(/<p class="notice info">[\s\S]*?<\/p>/, '');
  const top = (a.oportunidades || []).filter(o => /Foco|Equipe|Promoção|Combos|Fideliza|Venda adicional|Entrega/.test(o.area)).slice(0, 6);
  const c = a.cobertura, g = a.geral;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · ${esc(a.nome)}</title><style>${CSS}</style></head><body><div class="wrap">
  <div class="capa"><small>${esc(titulo)}</small><h1>${esc(a.nome)}</h1><p>${dm(c.inicio)} a ${dm(c.fim)} · ${c.dias} dias · ${g.cupons.toLocaleString('pt-BR')} cupons analisados um a um</p><div class="marca">${esc(marca)}</div></div>
  <div class="resumo"><h2>Resumo executivo</h2><p style="margin:0 0 10px">Vendas de <b>${R(g.vendasCentavos)}</b> no período, ticket médio de <b>${R(g.ticketMedioCentavos)}</b> e <b>${g.itensPorCupom.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</b> itens por cupom. O que fazer primeiro:</p>
    <ol>${top.map(o => `<li><b>${esc(o.titulo)}</b><span>${esc(o.acao)}</span></li>`).join('') || '<li><span>Continue alimentando relatórios para o plano de ação ficar mais firme.</span></li>'}</ol></div>
  <div class="conf"><b>Como os números foram feitos.</b> Cada relatório de vendas foi lido por programa, linha a linha, e só entrou depois de a soma de tudo fechar, ao centavo, com o total impresso no próprio relatório. Os cupons foram analisados individualmente (horário, itens, pagamento, categoria, o que se compra junto). Categorias são comparadas sempre com o movimento da loja inteira. Margem usa o custo atual do estoque. Tudo aqui é hipótese para testar, não promessa de resultado.</div>
  ${corpo}
  <p class="rod">${esc(marca)} · gerado em ${geradoEm.toLocaleString('pt-BR')} · ${esc(a.nome)}</p></div></body></html>`;
}
module.exports = { gerar };
