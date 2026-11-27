/* Página "Base de regras e estilos" da extensão. Fala só com o agente deste computador (127.0.0.1) usando o token de config.json.
   Tudo é montado com textContent (nunca innerHTML com dados), porque os textos vêm de arquivos e do ChatGPT. */
(function () {
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, ...filhos) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v === false || v == null) continue; if (k === 'class') n.className = v; else if (k === 'texto') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    for (const f of filhos.flat()) if (f != null && f !== false) n.append(f.nodeType ? f : document.createTextNode(String(f)));
    return n;
  };
  const NOME_LINHA = { todas: 'Todas as linhas', farmacia: 'Farmácia (artes normais)', club: 'Clube de benefícios', geral: 'Geral' };
  let CFG = null, DADOS = null, empresaAtual = '', linhaAtual = '';

  async function carregarCfg() { const r = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' }); const c = await r.json(); if (!c.porta || !c.token) throw new Error('config.json sem porta/token'); return c; }
  async function api(caminho, corpo) {
    const o = { headers: { 'x-n7-token': CFG.token, 'content-type': 'application/json' } }; if (corpo !== undefined) { o.method = 'POST'; o.body = JSON.stringify(corpo); }
    const r = await fetch(`http://127.0.0.1:${CFG.porta}${caminho}`, o), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status); return j;
  }
  async function imagem(id) { try { const r = await fetch(`http://127.0.0.1:${CFG.porta}/arquivo?id=${encodeURIComponent(id)}`, { headers: { 'x-n7-token': CFG.token } }); return r.ok ? URL.createObjectURL(await r.blob()) : ''; } catch (e) { return ''; } }
  const aviso = (t, erro) => { const a = $('#aviso'); a.hidden = !t; a.textContent = t || ''; a.style.color = erro ? 'var(--erro)' : 'var(--ok)'; if (t) setTimeout(() => { if (a.textContent === t) a.hidden = true; }, 5000); };
  const tentar = async (fn, ok) => { try { await fn(); if (ok) aviso(ok); await recarregar(); } catch (e) { aviso(e.message, true); } };

  /* ---------- estado do agente ---------- */
  async function estado() {
    const box = $('#estado');
    try {
      const e = await api('/estado'); box.replaceChildren(el('b', { class: e.conectada ? 'on' : 'off', texto: e.conectada ? 'Agente conectado' : 'Agente sem resposta' }), ` · extensão ${e.versaoExtensao || '?'} · fila ${e.naFila + e.emAndamento} · feitos ${e.feitos} · falhas ${e.falhas}`, e.ultimoErro ? el('div', { class: 'falha', texto: 'Último erro: ' + e.ultimoErro }) : null);
      const tb = $('#historico tbody'); tb.replaceChildren(...(e.historico || []).map(h => el('tr', {}, el('td', { texto: new Date(h.em).toLocaleString('pt-BR') }), el('td', { texto: h.tipo }), el('td', { texto: h.segundos + ' s' }), el('td', { class: h.ok ? 'ok' : 'falha', texto: h.ok ? 'ok' : (h.erro || 'falhou') }))));
      if (!(e.historico || []).length) tb.replaceChildren(el('tr', {}, el('td', { colspan: 4, texto: 'Nenhum trabalho ainda nesta sessão do agente.' })));
    } catch (e) { box.replaceChildren(el('b', { class: 'off', texto: 'Agente desligado ou token errado' }), ' — abra o agente no computador (Agente.ps1).'); }
  }

  /* ---------- abas ---------- */
  function abas() {
    const emp = $('#empresas'); emp.replaceChildren(...DADOS.empresas.map(e => el('button', { type: 'button', 'aria-pressed': String(e.slug === empresaAtual), texto: e.nome, onclick: () => { empresaAtual = e.slug; linhaAtual = ''; desenhar(); } })));
    const e = atual(), ln = $('#linhas'); const ls = e.linhas.length > 1 ? e.linhas : [];
    if (!linhaAtual || !e.linhas.includes(linhaAtual)) linhaAtual = e.linhas[0];
    ln.replaceChildren(...ls.map(l => el('button', { type: 'button', 'aria-pressed': String(l === linhaAtual), texto: l === 'club' ? e.clube || 'Clube' : 'Farmácia (artes normais)', onclick: () => { linhaAtual = l; desenhar(); } })));
  }
  const atual = () => DADOS.empresas.find(e => e.slug === empresaAtual) || DADOS.empresas[0];

  /* ---------- regras ---------- */
  function regras() {
    const e = atual(), vale = r => r.linha === 'todas' || r.linha === linhaAtual || linhaAtual === 'geral';
    const sug = e.regras.filter(r => r.status === 'sugerida'), lista = e.regras.filter(r => r.status !== 'sugerida' && vale(r));
    $('#sugeridas').replaceChildren(...(sug.length ? [el('div', { class: 'caixa' }, el('h3', { texto: `Sugestões do agente (${sug.length}) — vieram dos seus pedidos de ajuste` }), el('p', { class: 'sub', texto: 'Aceite só o que deve valer para TODA arte daqui para frente.' }),
      el('ul', { class: 'lista' }, sug.map(r => el('li', { class: 'item' }, el('div', { class: 'texto' }, el('span', { class: 'etiqueta', texto: 'sugerida' }), r.fonte ? el('span', { class: 'etiqueta', texto: r.fonte }) : null, r.texto),
        el('div', { class: 'acoes' }, el('button', { class: 'primario', type: 'button', texto: 'Aceitar', onclick: () => tentar(() => api('/base/regra/atualizar', { slug: e.slug, id: r.id, status: 'ativa' }), 'Regra aceita.') }), el('button', { type: 'button', texto: 'Aceitar só nesta linha', onclick: () => tentar(() => api('/base/regra/atualizar', { slug: e.slug, id: r.id, status: 'ativa', linha: linhaAtual === 'geral' ? 'todas' : linhaAtual }), 'Regra aceita para esta linha.') }), el('button', { class: 'perigo', type: 'button', texto: 'Recusar', onclick: () => tentar(() => api('/base/regra/remover', { slug: e.slug, id: r.id }), 'Sugestão recusada.') }))))))] : []));
    $('#regras').replaceChildren(...(lista.length ? lista.map(r => el('li', { class: 'item' + (r.status === 'desativada' ? ' desativada' : '') },
      el('div', { class: 'texto' }, el('span', { class: 'etiqueta', texto: NOME_LINHA[r.linha] || r.linha }), el('span', { class: 'etiqueta', texto: r.origem }), r.texto),
      el('div', { class: 'acoes' },
        el('button', { type: 'button', texto: r.status === 'ativa' ? 'Desativar' : 'Ativar', onclick: () => tentar(() => api('/base/regra/atualizar', { slug: e.slug, id: r.id, status: r.status === 'ativa' ? 'desativada' : 'ativa' })) }),
        el('button', { type: 'button', texto: 'Editar', onclick: () => { const t = prompt('Editar a regra:', r.texto); if (t && t !== r.texto) tentar(() => api('/base/regra/atualizar', { slug: e.slug, id: r.id, texto: t }), 'Regra atualizada.'); } }),
        el('button', { class: 'perigo', type: 'button', texto: 'Excluir', onclick: () => { if (confirm('Excluir esta regra?')) tentar(() => api('/base/regra/remover', { slug: e.slug, id: r.id }), 'Regra excluída.'); } })))) : [el('li', { class: 'sub', texto: 'Nenhuma regra ainda para esta linha. Adicione a primeira abaixo.' })]));
    const sel = $('#nr-linha'); sel.replaceChildren(...['todas', ...e.linhas].map(l => el('option', { value: l, texto: l === 'todas' ? 'Todas as linhas' : l === 'club' ? (e.clube || 'Clube') : l === 'farmacia' ? 'Só farmácia' : 'Geral', selected: l === 'todas' })));
  }

  /* ---------- estilo ---------- */
  function estilo() {
    const e = atual(), p = e.padroes[linhaAtual], box = $('#estilo');
    if (!p) { box.replaceChildren(el('div', { class: 'caixa' }, 'O padrão desta linha ainda não foi extraído. O agente faz isso sozinho na próxima rodada (precisa de pelo menos 3 peças aprovadas na pasta de marketing).')); return; }
    const resumo = el('textarea', { rows: 4, 'aria-label': 'Resumo do estilo' }); resumo.value = p.resumo || '';
    const composicao = el('textarea', { rows: 3, 'aria-label': 'Composição' }); composicao.value = p.composicao || '';
    const evitar = el('textarea', { rows: 4, 'aria-label': 'O que evitar, uma por linha' }); evitar.value = (p.evitar || []).join('\n');
    const rec = Object.entries(p.receitas || {}).filter(([, v]) => v);
    box.replaceChildren(
      el('div', { class: 'caixa' }, el('h3', { texto: 'Resumo' }), resumo, el('h3', { texto: 'Composição' }), composicao, el('h3', { texto: 'Evitar (uma por linha)' }), evitar,
        el('p', {}, el('button', { class: 'primario', type: 'button', texto: 'Salvar minhas correções', onclick: () => tentar(() => api('/base/padrao', { slug: e.slug, linha: linhaAtual, resumo: resumo.value, composicao: composicao.value, evitar: evitar.value.split('\n').map(x => x.trim()).filter(Boolean) }), 'Estilo salvo.') }), ' ',
          el('button', { type: 'button', texto: 'Refazer a partir das peças aprovadas', onclick: () => { if (confirm('O agente guarda este padrão de lado e extrai um novo na próxima rodada (alguns minutos). Continuar?')) tentar(() => api('/base/refazer-padrao', { slug: e.slug, linha: linhaAtual }), 'Pedi ao agente para refazer o padrão.'); } }))),
      el('div', { class: 'caixa' }, el('h3', { texto: 'Paleta' }), el('div', { class: 'paleta' }, (p.paleta || []).map(c => el('span', { class: 'cor', title: c.uso || '' }, el('i', { style: 'background:' + String(c.hex).replace(/[^#0-9a-fA-F]/g, '') }), `${c.nome} ${c.hex}`)))),
      el('div', { class: 'caixa' }, el('h3', { texto: 'Tipografia' }), el('p', { texto: [p.tipografia && p.tipografia.titulo && 'Título: ' + p.tipografia.titulo, p.tipografia && p.tipografia.apoio && 'Apoio: ' + p.tipografia.apoio, p.tipografia && p.tipografia.tratamento && 'Tratamento: ' + p.tipografia.tratamento].filter(Boolean).join(' · ') }), el('h3', { texto: 'Elementos recorrentes' }), el('ul', {}, (p.elementos || []).map(x => el('li', { texto: x })))),
      rec.length ? el('div', { class: 'caixa' }, el('h3', { texto: 'Receita por tipo de peça' }), el('ul', {}, rec.map(([k, v]) => el('li', {}, el('b', { texto: k + ': ' }), v)))) : null,
      el('p', { class: 'sub', texto: `Extraído em ${p.geradoEm ? new Date(p.geradoEm).toLocaleString('pt-BR') : '?'} de ${(p.baseadoEm || []).length} peça(s) aprovadas.` }));
  }

  /* ---------- logo e referências ---------- */
  async function referencias() {
    const e = atual(), box = $('#refs'); box.replaceChildren(el('span', { class: 'sub', texto: 'Carregando…' }));
    try {
      const a = await api(`/base/amostras?slug=${encodeURIComponent(e.slug)}&linha=${encodeURIComponent(linhaAtual === 'geral' ? '' : linhaAtual)}`), itens = [['Logo', a.logo], ['Identidade', a.identidade], ...(a.referencias || []).map((r, i) => ['Referência ' + (i + 1), r])].filter(([, x]) => x);
      if (!itens.length) { box.replaceChildren(el('span', { class: 'sub', texto: 'Nada encontrado para esta linha na pasta de marketing.' })); return; }
      const cartoes = itens.map(([rotulo, x]) => { const img = el('img', { alt: rotulo + ': ' + x.nome }); imagem(x.id).then(u => { if (u) img.src = u; }); return el('figure', { class: 'ref', style: 'margin:0' }, img, el('figcaption', {}, el('b', { texto: rotulo }), el('br'), x.nome)); });
      box.replaceChildren(...cartoes);
    } catch (err) { box.replaceChildren(el('span', { class: 'falha', texto: err.message })); }
  }

  /* ---------- aprendizado ---------- */
  function aprendizado() {
    const e = atual(), a = e.aprendizado;
    $('#aprendizado').replaceChildren(
      el('div', { class: 'caixa' }, el('p', {}, el('b', { texto: String(a.aprovadas) }), ' arte(s) aprovada(s) já viraram referência · ', el('b', { texto: String(a.ajustes) }), ' pedido(s) de ajuste registrados · ', el('b', { texto: String(a.descartadas) }), ' descartada(s)'),
        e.biblioteca ? el('p', { class: 'sub', texto: `Biblioteca lida: ${e.biblioteca.total} peça(s) (${e.biblioteca.origem === 'marketing' ? 'pasta MARKETING GUSTAVO' : e.biblioteca.origem}).` }) : el('p', { class: 'falha', texto: 'Sem biblioteca de referências para esta empresa.' }),
        (a.recentes || []).length ? el('p', {}, 'Últimas aprovadas: ', (a.recentes || []).map(x => `${x.codigo} (${x.linha})`).join(', ')) : null,
        (a.ajustesRecentes || []).length ? el('div', {}, el('b', { texto: 'Últimos ajustes pedidos:' }), el('ul', {}, a.ajustesRecentes.map(x => el('li', { texto: `${x.codigo || ''} — ${x.instrucao}` })))) : null,
        (e.avisos || []).length ? el('div', {}, el('b', { texto: 'Avisos do kit:' }), el('ul', {}, e.avisos.map(x => el('li', { texto: x })))) : null));
  }

  function desenhar() { abas(); regras(); estilo(); referencias(); aprendizado(); }
  async function recarregar() { DADOS = await api('/base'); if (!empresaAtual || !DADOS.empresas.some(e => e.slug === empresaAtual)) empresaAtual = (DADOS.empresas[0] || {}).slug || ''; desenhar(); }

  $('#nova-regra').addEventListener('submit', ev => { ev.preventDefault(); const t = $('#nr-texto').value; if (!t.trim()) return; tentar(async () => { await api('/base/regra', { slug: atual().slug, linha: $('#nr-linha').value, texto: t }); $('#nr-texto').value = ''; }, 'Regra adicionada.'); });

  (async () => {
    try { CFG = await carregarCfg(); await estado(); await recarregar(); setInterval(estado, 10000); }
    catch (e) { $('#estado').textContent = 'Não consegui falar com o agente: ' + e.message + '. Abra o agente no computador e recarregue esta página.'; }
  })();
})();
