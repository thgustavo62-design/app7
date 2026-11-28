/* Agente Criativo (roda no computador da agência): produz RASCUNHOS de legenda, roteiro e arte para as pautas que ainda não têm material,
   seguindo as referências do cliente (perfis da V4, estilo), as legendas recentes que já funcionaram e o planejamento do calendário.
   ChatGPT (API da OpenAI) escreve o texto e, se ligado, gera a arte; o Canva recebe o design para a equipe finalizar.
   NUNCA publica: o rascunho entra no site como "Em produção" e passa pela aprovação interna e do cliente.
   As chaves ficam só em %USERPROFILE%\.nova7\agente.json (campos openai e canva), nunca no site nem no repositório. */
const fs = require('fs'), path = require('path'), os = require('os');
const MARCA = require('./marca'), ARTE = require('./arte'), IG = require('./instagram'), BIB = require('./biblioteca'), PADRAO = require('./padrao'), BANCO = require('./banco-produtos'), BASE = require('./base');

const OPENAI = () => String(process.env.N7_OPENAI_URL || 'https://api.openai.com').replace(/\/$/, '');
const CANVA = () => String(process.env.N7_CANVA_URL || 'https://api.canva.com').replace(/\/$/, '');
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/* ChatGPT pelo Chrome (sem API): em agente.json  "chatgpt": { "modo": "extensao" }.  O agente escreve o pedido na ponte local e a extensão
   "Nova7 ↔ ChatGPT" (no Chrome já logado) conversa no chatgpt.com e devolve a resposta. Sem chave, sem cobrança por uso. */
function config(cfgArq) {
  const o = (cfgArq && cfgArq.openai) || {}, c = (cfgArq && cfgArq.canva) || {}, w = (cfgArq && cfgArq.chatgpt) || {}, extensao = w.modo === 'extensao';
  return { ligado: extensao || !!o.apiKey, modo: extensao ? 'extensao' : 'api', apiKey: o.apiKey || '', modeloTexto: extensao ? 'ChatGPT (Chrome)' : (o.modeloTexto || 'gpt-4.1'), modeloImagem: o.modeloImagem || 'gpt-image-1', imagens: !extensao && o.imagens === true, canvaToken: c.accessToken || '', maxPorRodada: Number(o.maxPorRodada || w.maxPorRodada) || 3, maxPorDia: Number(o.maxPorDia || w.maxPorDia) || 12, maxImagensPorDia: Number(o.maxImagensPorDia) || 6, porta: Number(w.porta) || 0, abrirChrome: w.abrirChrome !== false, instagram: w.instagram !== false, artes: w.artes === 'modelo' ? 'modelo' : 'ia', artesPorDia: Number(w.artesPorDia) || 40 };
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
  const sistema = `Você é redator de uma agência de marketing brasileira. Escreva em português do Brasil, no tom da marca, sem inventar fatos, preços, prazos ou resultados. Nunca misture assuntos: post do clube de benefícios (Farma Club/Minas Club) fala só do clube; post normal da farmácia não fala do clube. Nunca prometa resultado, cura, economia ou garantia. Se faltar informação, escreva de forma genérica e diga isso em "alertas". A ARTE é montada por designer a partir do seu texto (logo, cores e fotos da empresa): por isso escreva títulos curtos e diretos, sem emojis no título, sem clichês de IA ("descubra", "mergulhe", "no mundo de hoje", "desbloqueie") e sem pedir imagem de robô, cérebro, neon, brilho ou pessoas perfeitas. Responda SOMENTE com um JSON: {"legenda": string (até 1800 caracteres, sem hashtags), "arte": {"tag": string (até 3 palavras, ex.: o tema), "titulo": string (até 60 caracteres, a ideia do post), "subtitulo": string (até 90 caracteres, opcional), "cta": string (até 40 caracteres, só se for carrossel), "slides": [{"titulo": string (até 50 caracteres), "texto": string (até 150 caracteres)}] (só se for carrossel, de 3 a 7 slides)}, "roteiro": string[] (se for Reels, cenas curtas), "briefArte": string (a CENA da arte: elementos, objetos e clima visual que combinam com o assunto; sem texto na imagem), "linha": "club" | "farmacia" ("club" SÓ quando o assunto do post É o clube de benefícios da empresa: cadastro, pontos, sorteios, vantagens do Farma Club/Minas Club; todo o resto é "farmacia"), "tipoPeca": "promocional" | "educativo" | "institucional" | "aviso" | "sorteio" | "produto" (o que melhor descreve este post), "produtos": string[] (até 3 nomes de produtos reais da categoria que combinam com o post, ex.: "protetor solar", "creatina"; vazio se não fizer sentido), "hashtags": string[] (até 8), "alertas": string[] (no máximo 3, curtos: só risco REAL de publicação, como promessa, dado a confirmar ou regra; NUNCA comente o processo, anexos, JSON, imagens ou ferramentas)}.`;
  const usuario = { cliente: item.cliente, setor: item.setor, perfil: item.perfil, identidade: kit, pauta: { codigo: item.codigo, titulo: item.titulo, formato: item.formato, data: item.data },
    referencias: { perfisV4: ref.v4 || [], estilo: ref.estilo || '', evitar: ref.evitar || '', exemplosDeLegenda: ref.exemplos || [] }, legendasRecentesDoCliente: item.legendasRecentes || [], instagramDoCliente: item.instagram || undefined, regrasDaAgencia: item.regras || undefined, sequenciaDaSemana: (item.sequencia || []).slice(0, 10) };
  const msgs = [{ role: 'system', content: sistema }, { role: 'user', content: 'Crie o rascunho desta pauta seguindo as referências (inspire-se no estilo, nunca copie textos de terceiros). Respeite a "sequenciaDaSemana" (pautas vizinhas, incluindo stories e Reels): dê continuidade à narrativa, não repita o assunto das vizinhas e escreva os slides como um roteiro com começo, meio e fim. Cumpra TODAS as "regrasDaAgencia" (são da equipe e valem mais que o seu gosto). Se houver "instagramDoCliente", mantenha o tom e o jeito do que o cliente já posta e não repita os assuntos das últimas legendas:\n' + JSON.stringify(usuario) }];
  if (item.ajuste && item.anterior) msgs.push({ role: 'assistant', content: JSON.stringify(item.anterior) }, { role: 'user', content: 'Ajuste o rascunho acima conforme este pedido da equipe e devolva o JSON completo de novo: ' + String(item.ajuste).slice(0, 600) });
  return msgs;
}

/* o mesmo pedido em uma mensagem só (o chat não tem papéis de sistema/assistente): vai colado no chatgpt.com */
function promptWeb(item) {
  const m = prompt(item); let t = m[0].content + '\n\n' + m[1].content;
  if (m[3]) t += '\n\nSeu rascunho anterior:\n' + m[2].content + '\n\n' + m[3].content;
  return t + '\n\nResponda SOMENTE com o JSON pedido: um único objeto, sem explicação antes ou depois.';
}

/* tira o JSON de uma resposta de chat: aceita bloco de código, texto em volta e quebra de linha dentro de texto */
function extrairJson(resposta) {
  const cands = [].concat(resposta && resposta.blocos || [], resposta && resposta.texto || (typeof resposta === 'string' ? resposta : ''));
  for (const bruto of cands) {
    const limpo = String(bruto).replace(/^\s*json\s*\n/i, '').replace(/```(?:json)?/gi, '').trim(), a = limpo.indexOf('{'), z = limpo.lastIndexOf('}');
    if (a < 0 || z <= a) continue; const corte = limpo.slice(a, z + 1);
    for (const t of [corte, corte.replace(/\r?\n/g, ' ')]) { try { const o = JSON.parse(t); if (o && typeof o === 'object') return o; } catch (e) { /* tenta o próximo */ } }
  }
  throw new Error('O ChatGPT não devolveu um JSON válido.');
}

async function gerarTexto(item, c) {
  let r;
  if (c.modo === 'extensao') {
    if (!c.ponte) throw new Error('A ponte com a extensão do Chrome não está ligada.');
    r = extrairJson(await c.ponte.pedir(promptWeb(item)));
  } else {
    const j = await chamarJson(OPENAI() + '/v1/chat/completions', c.apiKey, { model: c.modeloTexto, messages: prompt(item), response_format: { type: 'json_object' }, temperature: 0.7 });
    const bruto = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; try { r = JSON.parse(bruto); } catch (e) { throw new Error('O modelo não devolveu um JSON válido.'); }
  }
  return normalizar(r);
}

/* alertas do ChatGPT de texto: no máximo 3, curtos, sem comentário sobre o processo (anexos, JSON, imagens, "não foram anexadas"...) */
const COMENTARIO_DE_PROCESSO = /anexad|json|briefing|imagens? final|ferrament|n[ãa]o foram (fornecid|anex)|dire[çc][ãa]o (de arte|visual)|refer[êe]ncias visuais/i;
function alertasUteis(l) { return [].concat(l || []).map(x => String(x).replace(/\s+/g, ' ').trim()).filter(x => x.length > 8 && !COMENTARIO_DE_PROCESSO.test(x)).map(x => x.slice(0, 160)).slice(0, 3); }
function normalizar(r) {
  const arte = r.arte && typeof r.arte === 'object' ? r.arte : {}, cut = (v, n) => String(v ?? '').trim().slice(0, n);
  const slidesArte = (Array.isArray(arte.slides) ? arte.slides : []).slice(0, 8).map(x => ({ titulo: cut(x && x.titulo, 60), texto: cut(x && x.texto, 180) })).filter(x => x.titulo);
  const slidesTxt = slidesArte.length ? slidesArte.map(x => (x.texto ? x.titulo + ': ' + x.texto : x.titulo)) : [].concat(r.slides || []).map(String);
  return { legenda: String(r.legenda || '').slice(0, 2200), arte: { tag: cut(arte.tag, 30), titulo: cut(arte.titulo, 70), subtitulo: cut(arte.subtitulo, 100), cta: cut(arte.cta, 45), slides: slidesArte }, slides: slidesTxt, roteiro: [].concat(r.roteiro || []).map(String), briefArte: String(r.briefArte || ''), linha: /club/i.test(String(r.linha || '')) ? 'club' : 'farmacia', tipoPeca: cut(r.tipoPeca, 20).toLowerCase(), produtos: [].concat(r.produtos || []).map(x => cut(x, 60)).filter(Boolean).slice(0, 3), hashtags: [].concat(r.hashtags || []).map(String), alertas: alertasUteis(r.alertas) };
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

/* LINHA da peça (não misturar assuntos): empresas com clube de benefícios separam "club" de "farmacia"; as demais ficam "geral".
   É clube quando o título da pauta ou da arte fala do clube, ou quando o texto do ChatGPT disse linha "club". */
function decidirLinha(item, r, kit) {
  if (!kit.clube) return 'geral';
  const nomeClube = new RegExp('club', 'i');
  if (nomeClube.test([item.titulo, r.arte && r.arte.titulo, r.arte && r.arte.tag].join(' ')) || r.linha === 'club') return 'club';
  return 'farmacia';
}

/* ---------- arte gerada pelo ChatGPT (imagem 3D profissional, no estilo das referências da empresa) ---------- */
const mimeDe = f => /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
const anexoDe = f => ({ nome: path.basename(f).slice(0, 60), mime: mimeDe(f), b64: fs.readFileSync(f).toString('base64') });
const palavras = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
const TAM_MAX_ANEXO = 4.5e6;

/* fotos de produtos reais cujo nome de arquivo combina com o assunto (ex.: creatina-max-titanium.png para um post de creatina) */
/* fotos reais do banco de produtos da agência (só para farmácias) para os produtos que o texto sugeriu */
function produtosDoBanco(kit, r, item) {
  if (!/farm|saude|saúde/i.test((item.setor || '') + ' ' + (kit.key || '')) || !(r.produtos || []).length) return [];
  return BANCO.buscar(r.produtos, { max: 3 });
}
function produtosParaArte(kit, r, item) {
  if (!kit.produtos || !kit.produtos.length) return [];
  const alvo = new Set(palavras([].concat(r.produtos || [], item.titulo, r.arte && r.arte.titulo, r.legenda).join(' ')));
  return kit.produtos.map(f => ({ f, nota: palavras(path.basename(f, path.extname(f))).filter(p => alvo.has(p)).length })).filter(x => x.nota > 0 && fs.statSync(x.f).size <= TAM_MAX_ANEXO).sort((a, b) => b.nota - a.nota).slice(0, 3).map(x => x.f);
}
/* referências de estilo: 2 por rascunho, variando entre as da empresa */
function referenciasParaArte(kit, hash) {
  const ok = (kit.referencias || []).filter(f => fs.statSync(f).size <= TAM_MAX_ANEXO); if (!ok.length) return [];
  const a = ok[hash % ok.length], b = ok.length > 1 ? ok[(hash + 1 + Math.floor(ok.length / 2)) % ok.length] : null; return [a, b && b !== a ? b : null].filter(Boolean);
}
const linhasDoSlide = s => {
  if (s.tipo === 'capa') return [s.tag && `Etiqueta pequena: "${s.tag}"`, `Título principal (o maior texto da arte): "${s.titulo}"`, s.subtitulo && `Subtítulo: "${s.subtitulo}"`].filter(Boolean);
  if (s.tipo === 'fechamento') return [`Chamada final (botão ou faixa de destaque): "${s.titulo}"`];
  return [`Título: "${s.titulo}"`, s.texto && `Texto de apoio: "${s.texto}"`].filter(Boolean);
};
/* pedido de conferência (e de correção) de UMA imagem: o ChatGPT confere só os ERROS GRAVES antes de a arte ir para a aprovação da equipe */
function conferenciaDaImagem(item, r, kit, slide, i, n, linha, formato) {
  const textos = linhasDoSlide(slide).join(' | '), regras = kit.dir ? BASE.regrasAtivas(kit.dir, linha) : [];
  const logoDe = linha === 'club' ? `o logotipo do ${kit.clube}` : `o logotipo da ${kit.nome}`;
  const linhaTxt = linha === 'club' ? `só a identidade do ${kit.clube}; nenhum logotipo ou elemento da farmácia normal (promoção, oferta)` : linha === 'farmacia' ? `nenhum logotipo, coroa, emblema ou cor especial do ${kit.clube || 'clube de benefícios'}` : 'identidade da própria empresa';
  /* CONFERÊNCIA PROPORCIONAL (2026-11-28): o ChatGPT reprovava arte boa por detalhe (margem de 6%, marca na embalagem do produto, "pequena diferença" de proporção ou de rótulo, brilho) e gastava
     imagens em correções que às vezes pioravam a arte. Agora só BLOQUEIA o que é erro de verdade; o resto vira observação e não reprova. Na dúvida, aprova: a equipe revisa no site e pede o ajuste. */
  const texto = `Confira esta arte (imagem ${i + 1} de ${n}) antes de ela ir para a aprovação da equipe. Responda SOMENTE com um JSON: {"aprovada": boolean, "problemas": string[], "observacoes": string[], "textoLido": string}.
REPROVE (aprovada=false) SOMENTE se houver um destes ERROS GRAVES:
1. TEXTO ERRADO: falta algum destes textos, há letra trocada, palavra cortada ou escrita errada, ou há texto extra inventado (${textos}).
2. LOGOTIPO: não aparece ${logoDe}, ou aparece de outra marca, ou está tão distorcido que não se reconhece. Pequena diferença de proporção, de posição ou de acabamento NÃO reprova.
3. LINHA ERRADA: ${linhaTxt}.
4. REGRA DA AGÊNCIA descumprida: ${regras.length ? regras.join('; ') : 'não há regras extras, ignore este item'}.
5. CONTEÚDO CORTADO: texto ou produto principal cortado pela borda da imagem, ou formato diferente de ${formato}.
6. PRODUTO: embalagem muito deformada ou ilegível, ou medicamento de tarja/receita aparecendo.
7. ARTE QUEBRADA: falhas visíveis de geração (rosto ou mão deformados, objetos fundidos, ilegível) ou aparência claramente amadora.
NÃO REPROVE por: margem de segurança, marca ou nome que faz parte da embalagem de um produto, pequenas diferenças de rótulo ou tipografia da embalagem, brilho ou acabamento, tamanho do logotipo dentro do razoável, gosto de composição ou cor. Se notar algo assim, escreva em "observacoes" e mantenha aprovada=true.
NA DÚVIDA, APROVE: uma pessoa da equipe ainda revisa e pede ajuste pelo site.
Se reprovar, liste cada erro grave, curto e específico (ex.: 'a palavra "propaganda" está escrita "propagnda"'). Em "textoLido" copie os textos que você leu na arte.`;
  const corrigir = `A imagem ${i + 1} de ${n} teve estes erros graves: {{problemas}}. Gere a imagem ${i + 1} DE NOVO corrigindo SOMENTE esses erros, sem mudar mais nada: mesmo estilo, mesma composição, mesma paleta, mesmo logotipo e formato ${formato}, com os textos EXATAMENTE assim: ${textos}. Não faça perguntas: gere a imagem.`;
  return { texto, corrigir, max: 1 };                                                      /* no máximo UMA correção: mais que isso gasta imagem e costuma piorar */
}

/* uma mensagem por imagem, todas na mesma conversa para manter o estilo. Só a primeira leva os anexos */
function mensagensDeArte(item, r, kit, plano, vertical, anexos, nomesAnexos, produtos, handle, linha = 'geral') {
  const estiloLinha = linha === 'club' ? (kit.estiloArteClub || kit.estiloArte) : kit.estiloArte, receitaLinha = PADRAO.receitaDe(linha === 'club' ? kit.padraoClub : kit.padrao, r.tipoPeca);
  const regrasTxt = kit.dir ? BASE.blocoDeRegras(kit.dir, linha) : '';
  const regraLinha = linha === 'club' ? `LINHA: CLUBE DE BENEFÍCIOS (${kit.clube}). Esta peça é SÓ sobre o ${kit.clube}: use o logotipo e a identidade do ${kit.clube} (anexos) e o padrão visual do clube. NÃO misture com promoções, ofertas ou artes normais da farmácia.` : linha === 'farmacia' ? `LINHA: ARTE NORMAL DA FARMÁCIA. Use o logotipo da ${kit.nome} (primeiro anexo) e o padrão visual da farmácia. NÃO use logotipo, emblema, coroa, cores nem elementos do ${kit.clube || 'clube de benefícios'} nesta peça e não cite o clube.` : '';
  const formato = vertical ? '9:16 (vertical, Reels/Story)' : '4:5 (vertical, feed do Instagram)', n = plano.length;
  const cores = `${kit.cores.primaria} (principal), ${kit.cores.secundaria} (secundária), ${kit.cores.destaque} (destaque)`;
  const nome = n > 1 ? (/stor(y|ies)/i.test(item.formato || '') && !/reels/i.test(item.formato || '') ? 'sequência de stories' : 'carrossel') : (vertical ? 'capa de Reels' : 'post');
  const papel = t => t === 'capa' ? 'CAPA (gancho)' : t === 'fechamento' ? 'FECHAMENTO (chamada para ação)' : 'SLIDE';
  const roteiroTxt = plano.map((x, k) => `${k + 1}) ${papel(x.tipo)}: ${[x.titulo, x.texto || x.subtitulo].filter(Boolean).join(' — ')}`).join('\n');
  const roteiroBloco = n > 1 ? `ROTEIRO COMPLETO DO ${nome.toUpperCase()} (a ordem e a narrativa importam; cada imagem é um passo e leva só o texto do seu passo):\n${roteiroTxt}\n` : '';
  const cenasVideo = (r.roteiro || []).length && /reels/i.test(item.formato || '') ? `ROTEIRO DO VÍDEO (a capa antecipa a primeira cena):\n${r.roteiro.slice(0, 6).map((x, k) => (k + 1) + ') ' + x).join('\n')}\n` : '';
  const sequenciaBloco = (item.sequencia || []).length ? `SEQUÊNCIA DA SEMANA (mantenha continuidade visual e narrativa com estas pautas, sem repetir o assunto nem a mesma cena):\n${item.sequencia.slice(0, 8).map(p => `- ${p.data.slice(5).split('-').reverse().join('/')} ${p.formato}: ${p.titulo}${p.antes ? ' (já foi)' : ''}`).join('\n')}\n` : '';
  const prod = produtos.length ? `Mostre os produtos das fotos anexadas (${produtos.map(f => path.basename(f, path.extname(f)).replace(/^\d{6,14}\s*-\s*/, '').replace(/[-_]+/g, ' ')).join(', ')}) FIÉIS ao original: mesma embalagem, rótulo, cores e formato; não invente nem altere o rótulo.`
    : ((r.produtos || []).length ? `Se mostrar produtos (${r.produtos.join(', ')}), use embalagens genéricas bonitas, SEM marca nem texto legível de terceiros.` : 'Não precisa mostrar produtos.');
  return plano.map((s, i) => {
    const textos = linhasDoSlide(s).concat(s.tipo === 'fechamento' && handle ? [`Perfil: "@${handle}"`] : []).join('\n');
    const cena = i === 0 || s.tipo === 'capa' ? (r.briefArte || '') : `variação coerente com o tema "${r.arte && r.arte.titulo || item.titulo}"`;
    if (i === 0) return { imagem: true, anexos, texto: `Você é diretor de arte sênior de uma agência de marketing brasileira. Gere AGORA a imagem 1 de ${n} de um ${nome} de Instagram da ${kit.nome}. Não faça perguntas e não explique: apenas gere a imagem.

${regraLinha ? regraLinha + '\n' : ''}${regrasTxt}${roteiroBloco}${cenasVideo}${sequenciaBloco}DIREÇÃO DE ARTE (trabalhe como um designer sênior, não como um gerador de imagens):
- UM ponto focal claro; o título é o maior elemento e ocupa de 35% a 45% da altura; hierarquia em 3 níveis (título, apoio, chamada).
- Escala tipográfica consistente (título muito maior que o apoio), alinhamento a uma grade única, margens e respiros iguais, espaçamento entre linhas apertado nos títulos e confortável no apoio; contraste de texto forte (legível no celular).
- Profundidade em camadas (fundo, meio, frente), luz principal vinda de um lado com luz de contorno, sombras suaves de contato, elementos flutuantes só para guiar o olhar; produto ou objeto-herói grande, nítido e bem recortado.
- Paleta limitada à da marca (até 4 cores + neutros), acabamento polido e consistente em todas as imagens; nada de excesso: se um elemento não ajuda a mensagem, tire.
- Em carrossel: o mesmo sistema visual em todas as imagens (fundo, tipografia, grade, elementos recorrentes), com a capa mais forte e o fechamento com a chamada em destaque; numeração discreta só se as referências usarem.
ESTILO: arte publicitária 3D premium, rica e profissional, no mesmo nível das artes de referência anexadas, SEGUINDO O PADRÃO VISUAL DELAS (paleta, tipo de letra 3D, ícones, fundo, acabamento): título em letras 3D grossas com contorno e brilho, ícones 3D brilhantes, iluminação de estúdio, profundidade, elementos flutuantes, composição limpa e hierarquia clara. Use a linguagem visual das referências, mas NÃO copie o conteúdo, os textos nem os produtos delas.
${estiloLinha ? 'PADRÃO DA MARCA' + (linha === 'club' ? ' (CLUBE)' : '') + ': ' + estiloLinha + '\n' : ''}${receitaLinha ? 'RECEITA PARA PEÇA ' + String(r.tipoPeca || '').toUpperCase() + ' DESTA LINHA: ' + receitaLinha + '\n' : ''}IDENTIDADE: cores ${cores}. Use EXATAMENTE o logotipo anexado (não redesenhe, não altere letras nem cores), em tamanho discreto e legível.
FORMATO: ${formato}. Margem de segurança de 6% nas bordas (nada importante colado na borda).
TEXTOS (escreva EXATAMENTE assim, em português do Brasil, sem erro de ortografia e sem nenhum outro texto):
${textos}
PRODUTOS: ${prod}
CENA: ${cena}
ANEXOS NESTA MENSAGEM: ${nomesAnexos}.
NÃO FAÇA: promessa de cura ou de resultado, medicamento de tarja, pessoa famosa, logotipo de terceiros que não faça parte da embalagem dos produtos, texto extra, aparência de colagem barata. A marca que já está na embalagem de um produto real é permitida.${kit.evitar ? ' Evite também: ' + kit.evitar + '.' : ''}` };
    const anterior = plano[i - 1], proximo = plano[i + 1], elo = `Esta imagem vem depois de "${anterior.titulo || ''}"${proximo ? ` e antes de "${proximo.titulo || ''}"` : ' e encerra o carrossel'}. `;
    return { imagem: true, texto: `${roteiroBloco}Agora gere a imagem ${i + 1} de ${n} do MESMO ${nome}. ${elo} Mantenha exatamente o mesmo estilo, paleta, tipografia 3D, iluminação e o mesmo logotipo da imagem anterior (continuidade visual total). Formato ${formato}, margem de segurança de 6%. Não faça perguntas: gere a imagem.
TEXTOS (EXATAMENTE assim, sem erro de ortografia e sem nenhum outro texto):
${textos}
CENA: ${cena}` };
  });
}

/* gera as artes no ChatGPT (pela extensão), enquadra no tamanho do post e devolve no mesmo formato do compositor de modelos */
async function gerarArtesChatGPT(item, r, kit, pasta, c, { log = () => {}, edge } = {}) {
  const plano = ARTE.planoDeSlides(r, item).slice(0, 8), vertical = /reels|story|stories/i.test(item.formato || ''), W = 1080, H = vertical ? 1920 : 1350;
  const hash = [...item.codigo].reduce((a, ch) => a + ch.charCodeAt(0), 0), handle = (item.perfil && item.perfil.handle) || '';
  const lib = BIB.carregar(), linha = decidirLinha(item, r, kit);
  const logoProprio = kit.logoArquivo && !String(kit.logoArquivo).startsWith(path.join(__dirname, '..', '..', 'public')) && /\.(png|jpe?g|webp)$/i.test(kit.logoArquivo) && fs.statSync(kit.logoArquivo).size <= TAM_MAX_ANEXO ? kit.logoArquivo : '';
  /* logo da LINHA: clube → logo do clube; farmácia → logo da farmácia (o do kit.json/pasta de marcas só vale para a farmácia) */
  const logo = (linha === 'club' ? BIB.melhorLogo(lib, kit.key, 'club') : (logoProprio || BIB.melhorLogo(lib, kit.key, linha))) || (kit.logoArquivo && /\.(png|jpe?g|webp)$/i.test(kit.logoArquivo) && fs.statSync(kit.logoArquivo).size <= TAM_MAX_ANEXO ? kit.logoArquivo : '');
  const assunto = [item.titulo, r.arte && r.arte.titulo, (r.produtos || []).join(' ')].join(' ');
  const daBiblioteca = BIB.escolherReferencias(lib, kit.key, { formato: item.formato, assunto, n: 2, hash, linha }).filter(f => fs.statSync(f).size <= TAM_MAX_ANEXO), identidade = BIB.folhaDeIdentidade(lib, kit.key, linha);
  const refs = (daBiblioteca.length ? daBiblioteca : referenciasParaArte(kit, hash).slice(0, 2)).concat((item.instagramDados ? IG.imagensDe(item.instagramDados.d, item.instagramDados.dir, 1, { linha }) : []).filter(f => fs.statSync(f).size <= TAM_MAX_ANEXO)), bancoProd = produtosDoBanco(kit, r, item), prods = produtosParaArte(kit, r, item).concat(bancoProd.map(b => b.arquivo)).slice(0, 3), arquivos = [logo, identidade && fs.statSync(identidade).size <= TAM_MAX_ANEXO ? identidade : '', ...refs, ...prods].filter(Boolean);
  const nomes = [logo && 'logotipo da empresa (primeiro anexo)', arquivos.includes(identidade) && 'um elemento da identidade visual da marca (mesmo acabamento 3D)', refs.length && `${refs.length} arte(s) de referência de ESTILO (peças já aprovadas e publicadas da empresa)${(item.instagramDados && IG.imagensDe(item.instagramDados.d, item.instagramDados.dir, 1, { linha }).length) ? ' (a última é um post recente do Instagram do cliente: mantenha coerência com o feed dele)' : ''}`, prods.length && `${prods.length} foto(s) de produto real`].filter(Boolean).join('; ') || 'nenhum';
  const msgs = mensagensDeArte(item, r, kit, plano, vertical, arquivos.map(anexoDe), nomes, prods, handle, linha);
  const formatoTxt = vertical ? '9:16' : '4:5'; msgs.forEach((m, i) => { m.verificar = conferenciaDaImagem(item, r, kit, plano[i], i, plano.length, linha, formatoTxt); });
  const resp = await c.ponte.pedirConversa(msgs, { tempoMs: plano.length * 12 * 60e3 + 120e3, aguardarConexaoMs: 0, temporario: false });
  fs.mkdirSync(path.join(pasta, 'originais'), { recursive: true });
  const artes = [], alertas = [];
  for (let i = 0; i < resp.resultados.length; i++) {
    const im = resp.resultados[i].imagens && resp.resultados[i].imagens[0]; if (!im) break;
    const tipo = plano[i].tipo, nome = `${String(i + 1).padStart(2, '0')}_${tipo === 'conteudo' ? 'slide' : tipo}.png`, bruto = path.join(pasta, 'originais', 'chatgpt_' + nome);
    fs.writeFileSync(bruto, Buffer.from(im.b64, 'base64'));
    const arq = path.join(pasta, nome); await ARTE.enquadrar(bruto, arq, W, H, { edge }); artes.push({ nome, arquivo: arq, tipo, largura: W, altura: H });
  }
  if (!artes.length) throw new Error(resp.erro || 'o ChatGPT não devolveu nenhuma imagem');
  const slidesQ = resp.resultados.map((x, i) => ({ n: i + 1, aprovada: !!(x.verificacao && x.verificacao.aprovada), tentativas: x.verificacao ? x.verificacao.tentativas : 0, problemas: x.verificacao && !x.verificacao.aprovada ? x.verificacao.problemas : [] }));
  const completas = artes.length === plano.length, reprovadas = slidesQ.filter(x => !x.aprovada);
  const qualidade = { passou: completas && !reprovadas.length, linha, regras: kit.dir ? BASE.regrasAtivas(kit.dir, linha).length : 0, completas, slides: slidesQ, motivo: !completas ? `só ${artes.length} de ${plano.length} imagens` : reprovadas.length ? `${reprovadas.length} imagem(ns) não passaram na conferência` : '' };
  const corrigidas = slidesQ.filter(x => x.aprovada && x.tentativas > 0).length; if (corrigidas) alertas.push(`${corrigidas} imagem(ns) foram corrigidas automaticamente na conferência antes de chegar aqui.`);
  reprovadas.forEach(x => alertas.push(`Imagem ${x.n} não passou na conferência: ${x.problemas.slice(0, 2).join('; ')}`));
  if (linha !== 'geral') alertas.push(linha === 'club' ? `Linha CLUBE (${kit.clube}): arte só com logo e padrão do clube.` : `Linha FARMÁCIA: arte normal com o logo da farmácia (sem elementos do ${kit.clube}).`);
  alertas.push('Arte gerada pelo ChatGPT: confira a ortografia dos textos, o logotipo e os produtos antes de aprovar (a IA pode errar letras).');
  if (artes.length < plano.length) alertas.push(`Só ${artes.length} de ${plano.length} imagens foram geradas (${resp.erro || 'erro no ChatGPT'}). Use "Pedir ajuste" para refazer.`);
  if (!logo) alertas.push('Sem logotipo em PNG/JPG para anexar: o ChatGPT pode ter desenhado a marca por conta própria. Ponha logo.png na pasta de marcas.');
  if (bancoProd.some(b => b.remedio)) alertas.push('Um dos produtos da arte parece medicamento (' + bancoProd.filter(b => b.remedio).map(b => b.nome).join(', ').slice(0, 120) + '): confira as regras de publicidade (ANVISA) antes de aprovar.');
  if (!(kit.referencias || []).length && !daBiblioteca.length) alertas.push('Sem artes de referência da empresa: o estilo da arte foi livre.');
  return { artes, n: artes.length, alertas, qualidade };
}

/* um rascunho completo para uma pauta: texto, conformidade, arte da marca (logo, cores e fotos da empresa) e design no Canva (se ligado) */
async function rascunhoDe(item, c, { pastaBase, estado, log = () => {}, edge } = {}) {
  const kit = MARCA.kit(item.slug || item.marca); item = Object.assign({}, item, { kit, regras: kit.dir ? BASE.regrasAtivas(kit.dir, '') : undefined });
  /* o que o cliente já posta no Instagram (tom, assuntos, padrão visual): lido pela extensão, guardado por 7 dias. Se falhar, segue sem */
  if (c.modo === 'extensao' && c.instagram && c.ponte && kit.existe && item.perfil && item.perfil.handle) {
    try { const dir = path.join(kit.dir, 'instagram'), d = await IG.dadosDoInstagram(c.ponte, item.perfil.handle, dir); if (d) item = Object.assign({}, item, { instagram: IG.resumoParaIA(d), instagramDados: { d, dir } }); }
    catch (e) { log('Instagram de ' + item.perfil.handle + ': ' + e.message); item.instagramAviso = e.message; }
  }
  const r = await gerarTexto(item, c); r.alertas.push(...conformidade(r, item));
  if (kit.clube) r.linha = decidirLinha(item, r, kit);
  if (item.instagramAviso) r.alertas.push('Não li o Instagram do cliente (' + item.instagramAviso + '): o rascunho não considerou o que ele já posta.');
  const hoje = new Date().toISOString().slice(0, 10), cota = (estado.criativo = estado.criativo && estado.criativo.dia === hoje ? estado.criativo : { dia: hoje, rascunhos: 0, imagens: 0 });
  const pasta = path.join(pastaBase, slug(item.marca), item.codigo); r.imagens = []; r.artes = [];
  if (!kit.existe) r.alertas.push(...kit.avisos); else {
    let artesIA = null;
    if (c.modo === 'extensao' && c.artes !== 'modelo' && c.ponte && cota.imagens < c.artesPorDia) {
      try { const g = await gerarArtesChatGPT(item, r, kit, pasta, c, { log, edge }); artesIA = g.artes; r.qualidade = g.qualidade; cota.imagens += g.n; r.alertas.push(...g.alertas); log(`Arte: ${g.n} imagem(ns) geradas pelo ChatGPT para ${item.codigo}.`); }
      catch (e) { r.alertas.push('A arte pelo ChatGPT não saiu (' + e.message + '): usei o modelo da marca.'); log('Arte ChatGPT, ' + item.codigo + ': ' + e.message); }
    }
    if (artesIA) { r.artes = artesIA; r.imagens = artesIA.map(a => a.nome); } else {
    r.qualidade = { passou: false, linha: r.linha || '', regras: kit.dir ? BASE.regrasAtivas(kit.dir, r.linha || '').length : 0, completas: true, slides: [], motivo: 'arte pelo modelo simples (o ChatGPT não gerou a imagem): não conferida' };
    let fotoIA = ''; if (c.imagens && item.refazerArte !== false && !kit.fotos.length && r.briefArte && cota.imagens < c.maxImagensPorDia) { try { fotoIA = await gerarFotoApoio(item, r.briefArte, c, pasta); cota.imagens++; r.alertas.push('A foto de apoio foi gerada por IA: confira se parece real e sem defeitos antes de aprovar.'); } catch (e) { r.alertas.push('Foto de apoio não gerada: ' + e.message); log('Foto: ' + e.message); } }
    try {
      const kitUsado = fotoIA ? Object.assign({}, kit, { fotos: [fotoIA] }) : kit, hash = [...item.codigo].reduce((a, ch) => a + ch.charCodeAt(0), 0);
      const artes = await ARTE.compor({ kit: kitUsado, item, r, pasta, handle: (item.perfil && item.perfil.handle) || '', fotoIdx: hash, edge }); r.artes = artes; r.imagens = artes.map(a => a.nome);
      if (!kit.fotos.length && !fotoIA) r.alertas.push('Arte só com tipografia: a empresa ainda não tem fotos reais na pasta de marcas.');
    } catch (e) { r.alertas.push('Arte não montada: ' + e.message); log('Arte: ' + e.message); }
    }
    kit.avisos.filter(a => /pequeno|logo/i.test(a)).slice(0, 1).forEach(a => r.alertas.push(a));
  }
  r.canvaUrl = ''; if (c.canvaToken) { try { r.canvaUrl = await criarNoCanva(item, c); } catch (e) { r.alertas.push('Design no Canva não criado: ' + e.message); log('Canva: ' + e.message); } }
  cota.rascunhos++;
  r.previews = r.imagens.length ? await ARTE.miniaturas(pasta, r.imagens, { edge }).catch(() => []) : [];
  return Object.assign({ codigo: item.codigo, marca: item.marca, modelo: c.modeloTexto, pasta }, r);
}

/* garante o padrão de criação (padrao.json) das empresas que têm peças na biblioteca: 1 por vez, só com a extensão conectada */
async function garantirPadroes(c, { log = () => {}, max = 2 } = {}) {
  if (!c.ponte || !c.ponte.conectada()) return 0; const lib = BIB.carregar(); let feitos = 0;
  for (const slug of Object.keys(BIB.PASTAS)) {
    if (feitos >= max) break; const kit = MARCA.kit(slug); if (!kit.existe || !lib.empresas[slug]) continue;
    /* o padrão antigo (feito antes da regra das linhas) misturava clube e farmácia: guarda de lado e refaz por linha */
    /* padrão de versão antiga (menos detalhado): guarda de lado e extrai de novo com o modelo mais rico */
    for (const [campo, arquivo] of [['padrao', 'padrao.json'], ['padraoClub', 'padrao-club.json']]) { if (kit[campo] && (kit[campo].versao || 1) < 2 && !kit[campo].editadoPelaEquipe) { try { fs.renameSync(path.join(kit.dir, arquivo), path.join(kit.dir, arquivo.replace('.json', '.v1.json'))); kit[campo] = null; } catch (e) { /* segue */ } } }
    if (kit.clube && kit.padrao && !kit.padrao.linha) { try { fs.renameSync(path.join(kit.dir, 'padrao.json'), path.join(kit.dir, 'padrao.antigo-misturado.json')); kit.padrao = null; } catch (e) { /* segue */ } }
    for (const linha of (kit.clube ? ['farmacia', 'club'] : [''])) {
      if (feitos >= max) break; if ((linha === 'club' ? kit.padraoClub : kit.padrao)) continue;
      try { if (await PADRAO.extrair(c.ponte, kit, lib, extrairJson, { log, linha })) feitos++; } catch (e) { log('Padrão de criação, ' + kit.nome + (linha ? ' (' + linha + ')' : '') + ': ' + e.message); return feitos; }
    }
  }
  return feitos;
}

/* 2026-11-28: artes de uma versão anterior (ex.: 7 slides velhos ao lado da capa nova) ficavam misturadas na pasta do Drive. Guarda em _versoes_anteriores/<data> (nunca apaga)
   tudo o que é NN_*.png/jpg e não pertence à versão atual. Sem imagens atuais não mexe em nada. Devolve quantas guardou. */
function guardarVersoesAnteriores(destino, imagens) {
  const atuais = new Set(imagens || []); if (!atuais.size || !fs.existsSync(destino)) return 0;
  const velhas = fs.readdirSync(destino).filter(x => /^\d{2}_.+\.(png|jpe?g)$/i.test(x) && !atuais.has(x)); if (!velhas.length) return 0;
  const guarda = path.join(destino, '_versoes_anteriores', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)); fs.mkdirSync(guarda, { recursive: true });
  for (const x of velhas) fs.renameSync(path.join(destino, x), path.join(guarda, x)); return velhas.length;
}

module.exports = { guardarVersoesAnteriores, decidirLinha, produtosDoBanco, garantirPadroes, slug, config, rascunhoDe, gerarArtesChatGPT, mensagensDeArte, produtosParaArte, conformidade, gerarTexto, normalizar, extrairJson, promptWeb, prompt, PROIBIDO };
