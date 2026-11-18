/* Subaba "Como pensa": a nota, as conexões e as regras de cada agente, para conferir que não há caixa-preta. */
export const title = { eyebrow: "Central de Inteligência", h1: "Como o cérebro pensa", lead: "As regras de cada agente, as conexões entre eles e como a nota é calculada." };

export function render(host, k) {
  const { B, esc } = k;
  host.innerHTML = `<div class="panel"><div class="panel-body">
    <p>A nota (0 a 100) combina <b>urgência</b> (quantos dias faltam ou de atraso), <b>impacto</b> (vendas e anúncios pesam mais) e <b>confiança</b> (base pequena, feriado, dado velho ou arredondado reduzem). Achados já tratados somem até a data escolhida e voltam, marcados como reincidentes, se o problema continuar.</p>
    <div class="section-title"><h2>As conexões</h2><span>quando um agente fala com outro</span></div>
    <ul class="brain-list">${B.SYNAPSES.map(s => `<li class="brain-row"><div class="brain-row-h"><b>${esc(s.nome)}</b></div><p>${esc(s.texto)}</p></li>`).join("")}</ul>
    <div class="section-title"><h2>As regras de cada agente</h2></div>
    <div class="grid g2">${B.AGENT_ORDER.map(id => { const a = B.AGENTS[id]; return `<div><span class="col-title">${a.name} · ${B.AREAS[a.area].name}</span><p class="src">${a.does}</p><ul class="plain">${a.rules.map(x => `<li>${x}</li>`).join("")}</ul></div>`; }).join("")}</div></div></div>`;
}
