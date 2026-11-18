# Central Nova7

Site de gestão interna da agência Nova7: resultados, metas e produção de conteúdo de cada cliente. Login com Google, dados gravados numa planilha do Google Sheets e hospedagem na Vercel. O visual segue o do [marketin-extra](https://github.com/thgustavo62-design/marketin-extra): menu lateral grafite, item ativo violeta, painéis com faixa escura, fontes Inter e Sora.

**Para publicar:** [docs/publicar-na-vercel.md](docs/publicar-na-vercel.md).

## Telas

| Endereço | O que mostra |
| --- | --- |
| `#painel` | Indicadores da agência, cartões dos clientes com nota de saúde, pautas da semana, alertas P0 e rotina semanal |
| `#insights` | Vendas, ticket, Instagram e Facebook por janela, Facebook diário da Farma e Farma, cesta, achados e qualidade dos dados. Filtro: duas farmácias, Minas ou Farma |
| `#semana` | Rotina de segunda-feira: digite os números da semana ou do mês (ou cole as tabelas da Meta), veja a análise e baixe o PowerPoint de 6 a 8 slides |
| `#minas-farma`, `#padaria-bom-pao`... (um por cliente cadastrado) | Página do cliente, **montada conforme os serviços que a Nova7 presta a ele** (veja abaixo): redes sociais, tráfego pago, criativos e análise de varejo |
| `#config` | Só administradores: subabas **Usuários** e **Clientes e serviços** |
| `#calendario` | Calendário Kanban com quatro visões (status, semana, mês e ideias), filtros, arrastar e soltar, horários livres e gaveta da pauta com etapas, aprovação e checagem pré-publicação |
| `#fluxo` | Política de aprovação e horários fixos de publicação de cada cliente |
| `#alertas` | Alertas P0, P1 e P2 da auditoria de 10/11 e dos insights de 14/11 |
| `#playbook` | Método da agência: nota de saúde, checagem pré-publicação, níveis de aprovação, cadência, relatório mensal, onboarding, formatos das redes e notas para o Brasil |

## Como funciona

```
Navegador ──(cookie de sessão)──► Funções da Vercel (api/) ──(conta de serviço)──► Planilha NOVA7 | SITE | BANCO DE DADOS
   public/                           login Google, validação, versões
```

- **Login:** "Entrar com Google". O servidor confere o token e só deixa entrar quem está ativo na aba `Usuarios` da planilha. Sessão em cookie assinado (12 h). Papéis: `leitura`, `editor`, `admin`.
- **Dados dos clientes** (vendas, insights, auditoria) ficam em `private/data.js`, fora da pasta pública, e só saem por `/api/data` depois do login.
- **Gravação:** a tela trabalha na memória e envia cada mudança em fila a `/api/mutate`. O servidor valida e grava na planilha. Duas pessoas mexendo no mesmo registro ao mesmo tempo: a segunda recebe um aviso e a tela recarrega (coluna `versao`).
- **Aprovações** são um registro de eventos (só se acrescenta linha), então ninguém sobrescreve ninguém.
- **Banco:** esquema em [docs/banco-de-dados.md](docs/banco-de-dados.md).

## Estrutura

```
public/                 o site (só esta pasta é servida como arquivos)
  index.html
  assets/css/app.css    tokens de cor (claro e escuro) e componentes
  assets/js/boot.js     login, carga dos dados e do estado, início do site
  assets/js/store.js    armazenamento em memória que avisa cada mudança
  assets/js/sync.js     compara mudanças, envia ao servidor, versões e fila
  assets/js/workflow.js regras de aprovação, horários fixos e ideias
  assets/js/playbook.js método da agência
  assets/js/charts.js   gráficos em SVG
  assets/js/services.js os quatro serviços (compartilhado com o servidor)
  assets/js/settings.js tela Configurações (usuários e clientes)
  assets/js/ingest.js   leitura de números e de tabelas coladas da Meta
  assets/js/analysis.js análise semanal e mensal (mesmo dia da semana, feriados, classe e confiança)
  assets/js/semana.js   tela Semana: entrada, análise e exportação
  assets/js/report.js   deck em PowerPoint (PptxGenJS)
  assets/vendor/        PptxGenJS 4.0.1 (MIT) com JSZip
  assets/js/app.js      rotas, telas, Kanban e metas
api/                    funções da Vercel: auth, state, mutate, data
lib/                    sessão, login Google, cliente do Sheets, repositório, validação, escopo por empresa (scope.js) e dados filtrados (dataset.js)
private/data.js         dados dos clientes (não é servido como arquivo)
tests/                  48 testes: node --test tests/*.test.js
dev-server.js           servidor local com dados em memória
vercel.json             pasta pública, cabeçalhos de segurança (CSP) e função de dados
```

## Rodar no computador

```bash
npm run dev     # http://localhost:3000, dados em memória, login de desenvolvimento
npm test        # testes da regra de negócio, do servidor e da sincronização
```

Não há dependências para instalar.

## Dados

`private/data.js` foi montado em 18/11/2026 a partir de:

- **NOVA7 | CENTRAL EDITORIAL E PRODUÇÃO | 2026**: abas PRODUÇÃO CENTRAL, 08 RELATÓRIOS SEMANAIS e 10 EVOLUÇÃO HISTÓRICA
- **Insights_3_Meses_Minas_Farma** e **Insights_3_Meses_Farma_e_Farma** (14/08 a 14/11)
- **AUDITORIA DE PUBLICAÇÕES — NOVA7 | 4 marcas | 10.11.2026**
- **NOVA7 | DIRETORIA DE MARKETING — Diagnóstico e plano de ação 2026**

Regra herdada das planilhas: `null` significa sem dado, nunca zero. Para acrescentar uma semana nova, acrescente uma posição nos vetores de `WEEKLY` e um rótulo em `WINDOWS`.

## Aprovações, ideias e horários fixos

Ideias de produto inspiradas no [Brightbean Studio](https://github.com/brightbeanxyz/brightbean-studio) (AGPL-3.0). O código é próprio; só os conceitos foram aproveitados.

- **Etapas de aprovação por cliente** (`#fluxo`): sem aprovação, só interna, ou interna e do cliente. **Uma pauta não vai para "Pronto" nem "Publicado" enquanto faltar aprovação da política do cliente.** Há pedido de ajustes, comentários e histórico.
- **Quadro de ideias** (visão Ideias do calendário): Nova ideia, Em análise, Aprovada e Descartada. Só ideia Aprovada pode ser agendada; ela vira uma pauta (`I-F01`...) no próximo horário livre do cliente.
- **Horários fixos de publicação**: dia, hora e formato por cliente, sugeridos pelos dias em que o plano Nov–Dez já publica (os horários do dia são palpites). Datas de atenção (24, 25 e 31/12, 01/01 e 20/11) vêm marcadas.

## Clientes, serviços e usuários

Em **Configurações** (só administradores):

- **Clientes e serviços:** cadastre cada empresa com nome, perfil, segmento, setor e os **serviços prestados** (um ou mais). O painel de cada cliente muda conforme o serviço:

| Serviço | O que o cliente ganha |
| --- | --- |
| Redes sociais | Calendário Kanban, aprovações, ideias, horários fixos, nota de saúde, metas |
| Tráfego pago | Meta Ads semana a semana: gasto, alcance, frequência, CPM, custo por resultado e alerta de saturação |
| Criativos e design | Fila de peças com etapas e aprovação, sem métricas de venda |
| Análise comercial de varejo | Vendas por semana, mesmos dias da semana, ticket, cestas e o PowerPoint semanal |

  O cartão do Painel, os indicadores, o menu e a tela Semana (campos de entrada) acompanham os mesmos serviços. Empresas não são apagadas: desative para tirá-las do site sem perder o histórico. Os quatro clientes iniciais foram migrados (Minas Farma e Farma e Farma com redes, tráfego e varejo; Campo Forte e Nova7 com redes).
- **Usuários:** dois tipos. **Equipe da Nova7** (administrador, editor ou leitura) vê todas as empresas ou só as marcadas. **Usuário do cliente** vê só a própria empresa: acompanha o que está sendo feito e **aprova ou pede ajustes** nas pautas; não vê resultados internos, alertas, playbook, outras empresas nem configurações, e não grava nada além da aprovação do cliente.
- **O recorte é feito no servidor**: `/api/data` e `/api/state` entregam a cada usuário só as empresas dele, e `/api/mutate` recusa o que for de outra empresa (403). O nome de quem aprova vem do login, não do que a tela envia. O acesso é conferido no login e ao abrir a página; uma mudança de acesso vale no próximo carregamento.
- O administrador não pode tirar o próprio acesso nem deixar o site sem administrador.

## Semana: análise de segunda-feira e PowerPoint

A tela `#semana` substitui a planilha da rotina de segunda. Escolha **Semana** (segunda a domingo) ou **Mês**, e preencha por empresa:

- **Vendas** das duas farmácias (total, compras, cestas acima de R$ 100 e vendas de cada dia), **Instagram**, **Facebook** e **Meta Ads**. Cada canal aceita **colar a tabela** exportada da Meta (com cabeçalho, em CSV ou tabulação, série diária ou linhas como `Visualizações 119,6 mil`). O site mostra o que leu antes de aplicar e usa a linha de total quando existe. Nada é gravado até clicar em **Salvar**.
- **Promoção que rodou, concorrência, decisão da semana e a pergunta "estamos no melhor caminho?"**.

Regras da análise (as da rotina da agência): compara **o mesmo dia da semana** nas duas janelas, marca feriados, classifica cada leitura (ESCALAR, MANTER, TESTAR, CORRIGIR, INCONCLUSIVO) com confiança ALTA, MÉDIA ou BAIXA, trata base pequena como inconclusiva, sinaliza Meta Ads com frequência acima de 1,5 ou alcance acima dos 30.674 habitantes, e **nunca troca dado que falta por zero**. Campo vazio é falta de dado e aparece na lista "o que não pôde ser respondido".

O botão **Baixar PowerPoint** gera, no navegador, um deck editável (tabelas e gráfico nativos) com capa, a semana por filial, dia a dia, mídia paga (se informada), Instagram e Facebook, o que funcionou, o que faltou e a decisão da semana. Slides sem conteúdo são omitidos. Nome: `Semanal_MinasFarma_FarmaEFarma_AAAA-MM-DD.pptx`.

Ainda não entram: margem, lift e margem incremental das promoções, entrega contra balcão e estoque (dependem do PDF por item e da exportação de estoque) e a exportação em Excel.

## Nota de saúde e checagem pré-publicação

Método adaptado do repositório aberto [digital-marketing-pro](https://github.com/indranilbanerjee/digital-marketing-pro) (MIT). A **nota de saúde (0–100)** soma ritmo de publicação (25%), pipeline (15%), resultados (25%), engajamento (10%) e conformidade (25%). A **checagem pré-publicação** tem 6 critérios com pesos e um checklist de conformidade por setor; a peça só fica pronta com nota 85+ e checklist completo.

## Limites desta versão

- O plano de novembro e dezembro e os números de vendas e redes ainda vêm de uma cópia (`private/data.js`). O próximo passo é ler a planilha Central direto e gravar o status de volta nela.
- **Aprovação direta pelo cliente, por link, não existe ainda:** quem usa o site registra a aprovação em nome do cliente.
- A planilha não tem transações: dois servidores gravando no mesmo milissegundo podem se sobrepor. A coluna `versao` cobre o uso normal de uma equipe pequena.
- Gravações dependem do Google: limite de 60 por minuto por usuário. O site tenta de novo sozinho e mostra "Sem conexão: tentando de novo" no topo.
- O servidor foi testado com respostas simuladas do Google e com dados em memória. O primeiro deploy real precisa do teste de fumaça do guia de publicação.
- Campo Forte e Nova7 Produtora ainda não têm métricas exportadas da Meta no Drive.
- Os horários livres só conhecem 5 datas de atenção (`HOLIDAYS` em `public/assets/js/workflow.js`).

## Login por e-mail e senha

A tela de entrada aceita **e-mail e senha** (e, se `GOOGLE_CLIENT_ID` estiver configurado, também o login com Google). Todo usuário cadastrado começa com a **senha padrão** (variável `SENHA_PADRAO` na Vercel) e é **obrigado a criar a própria senha no primeiro acesso**; depois disso a senha padrão deixa de valer para ele. O servidor guarda só o hash (`scrypt`) na coluna `senha_hash` da aba `Usuarios`, bloqueia a conta por 15 minutos depois de 5 erros seguidos e não revela se o e-mail existe. Enquanto a senha não é trocada, `/api/state`, `/api/data` e `/api/mutate` respondem 403. Em **Configurações → Usuários**, o administrador vê quem ainda está na senha padrão e pode **redefinir a senha** de alguém (a pessoa volta à senha padrão e cria outra).

## App no celular (PWA)

O site é um **PWA**: dá para instalar na tela inicial do celular e abre em tela cheia, como app.

- **Android (Chrome):** abra o site, toque em **Instalar app** (no menu "Mais") ou em ⋮ → *Instalar app*.
- **iPhone (Safari):** toque em Compartilhar → *Adicionar à Tela de Início*.
- **No celular:** barra de abas embaixo (Painel, Calendário, Semana, Insights e Mais), topo compacto, indicadores em 2 colunas, filtros que rolam de lado e campos sem o zoom automático do iPhone.
- **Sem internet** o app abre e avisa "Sem conexão". **Nenhum dado de `/api/` é guardado no aparelho**: só o casco do app (HTML, CSS, JS e ícones). Para publicar uma versão nova do casco que force a troca, mude `VERSION` em `public/sw.js`; o app avisa "Há uma versão nova" e atualiza com um toque.
- Os ícones saem do símbolo da marca (128 px); com um arquivo vetorial (SVG) ficam ainda mais nítidos.

## Calendário ao vivo e fontes de dados

O plano de pautas é **lido da aba PRODUÇÃO CENTRAL** da planilha Central editorial (cache de 5 minutos; empresa, datas, etapas, status e nota vêm de lá). Se a leitura falhar, o site continua com a cópia embutida (`private/data.js`) e mostra o motivo. **Configurações → Fontes de dados** mostra o estado, as contagens e as linhas que não puderam ser importadas, com o botão *Ler agora*. A planilha precisa estar compartilhada com a conta de serviço; para outra planilha, defina `CENTRAL_SHEET_ID`.

## Meta via Windsor.ai (Instagram, Facebook e anúncios)

Os resultados da Meta de todos os clientes vêm do **Windsor.ai** pela API de conectores (`https://connectors.windsor.ai/{conector}`), com a variável `WINDSOR_API_KEY` na Vercel.

1. Em **Configurações → Fontes de dados**, o botão **Descobrir contas** lista os IDs de cada conta (anúncios, Instagram e página do Facebook).
2. Em **Configurações → Clientes e serviços**, informe os IDs de cada cliente.
3. **Testar a última semana** mostra o que veio, sem gravar; **Sincronizar agora** grava na aba `Semanas`. O agendador da Vercel faz isso todo dia às 09:00 UTC (variável `CRON_SECRET`), nas duas últimas semanas fechadas.

Regras: o Windsor só troca os campos que vieram com valor (vendas, anotações e o que você digitou ficam); campo que a conta não tem fica **sem dado, nunca zero**; cada métrica é pedida separadamente, então um campo recusado não derruba os demais. Os campos de cada métrica estão em `MAP` no `lib/windsor.js`. **Confira o alcance** na primeira vez contra o Meta: ele é calculado no período inteiro pelo Windsor, e o resultado do anúncio usa por padrão as conversas iniciadas (`WINDSOR_ADS_RESULT_FIELD` troca o campo).

## Landing page pública

A raiz do site (`/`) é a **landing page da Nova7**, aberta a qualquer pessoa (serviços, como trabalhamos, diferenciais, contato). O sistema de gestão fica em **`/app`** (com login, sem indexação nos buscadores; `robots.txt` bloqueia `/app` e `/api/`). Arquivos: `public/index.html`, `public/assets/css/landing.css`, `public/assets/js/landing.js`, imagem de compartilhamento `public/assets/brand/og-nova7.png`.

- **Contato:** edite só o objeto `CONTACT` no início de `landing.js` (WhatsApp com DDI e DDD, e-mail, Instagram). Sem WhatsApp, os botões usam o e-mail; sem e-mail, o Instagram.
- **Clientes:** a landing **não cita clientes nem resultados**, porque a autorização de case ainda está pendente na Central. Um teste automático garante isso.
- A imagem de compartilhamento (`og:image`) usa o endereço atual da Vercel; ao ligar um domínio próprio, troque a URL em `index.html`.

## Central de Inteligência (o "cérebro")

A tela `#cerebro` responde "o que fazer hoje" **sem nenhuma API de IA**: agentes por função lêem os dados do sistema e o maestro escolhe a **decisão do dia**, sempre com a evidência.

Em 6 passos (`public/assets/js/brain.js`, funções puras testadas em Node):

1. **Agentes** lêem os dados e devolvem achados com nota e evidência. São **14, em 5 áreas**:
   - *Operação:* Produção (atrasos, pautas que vencem sem começar, calendário vazio), Etapas da produção (prazo de roteiro, gravação, edição, aprovação e agendamento contra o status), Capacidade da equipe (dia com etapas demais), Aprovações.
   - *Conteúdo:* Ritmo editorial (horários fixos, variedade de formato, ideias aprovadas paradas), Qualidade (peça pronta sem checagem), Criativos (nasce da conversa entre Mídia e Redes).
   - *Resultado:* Mídia paga, Redes sociais e Vendas (da análise semanal, mesmas regras da tela Semana).
   - *Estratégia:* Gestão de contas (saúde por cliente) e Oportunidades (orgânico forte em cliente sem tráfego pago).
   - *Contexto:* Qualidade dos dados e Datas e feriados.
2. **Memória:** o que foi marcado como feito, adiado ou ignorado e continua aparecendo volta como **reincidente** (+4 a +10 pontos). O que foi feito e deixou de aparecer conta como resolvido.
3. **Sinapses** (conexões entre agentes, listadas na tela "Como o cérebro pensa"): aprovação trava a produção; dado velho baixa a confiança; feriado aperta o prazo; anúncio cansado + redes em queda = criativos desgastados; falta de publicação + queda de alcance; vendas caindo + anúncio com problema; sobrecarga + atraso; calendário vazio + ideia parada; memória.
4. **Gestão de contas:** soma o que todos disseram de cada cliente numa **saúde de 0 a 100** (80+ em ordem, 60 a 79 atenção, abaixo de 60 em risco) e avisa quando várias frentes pioram juntas.
5. **Maestro:** escolhe a **decisão do dia** e até 2 "também hoje" (agentes e clientes diferentes). Nota de 0 a 100 = urgência x impacto x confiança; Hoje (80+), Esta semana (60+), Acompanhar. Ganhos aparecem à parte e nunca viram decisão.
6. **Tratar:** *Feito* (some hoje), *Adiar 2 dias* ou *Ignorar* (14 dias), gravado na aba `Decisoes` da planilha-banco.

A tela traz ainda o **mapa do cérebro** (os 14 agentes e as conexões que dispararam hoje), a saúde dos clientes e o radar por área. O Painel mostra a decisão do dia num cartão. Usuário cliente não vê a Central de Inteligência.

Para criar um agente novo: escreva a função em `brain.js` que devolve achados (`F(agente, chave, {...})`), registre em `AGENTS`/`AGENT_ORDER` com área e regras, e, se ele conversar com outro, descreva a conexão em `SYNAPSES` e implemente em `connect()`. Os testes conferem o catálogo.

O Claude (API) é opcional e ainda não é usado; se for ligado depois, serve só para explicar em texto, sem mudar as regras. A parte da Meta (Windsor.ai) entra quando for conectada.

### Fotos na landing (bastidores)

A landing segue o manual de identidade da Nova7 (preto `#0B0C11`, grafite `#171927`, ciano `#38BCD8`, violeta `#7443D8`, Montserrat, "Mais que posts, direção."). Hoje ela é toda desenhada em CSS e SVG, com o "7" da marca em vetor. Para mostrar **fotos reais** (equipe, gravações, bastidores, cidade):

1. Coloque os arquivos (`.jpg`, `.png`, `.webp`) em `public/assets/photos/` (até uns 400 KB cada; redimensione antes).
2. Liste em `public/assets/photos/photos.json`: `[{ "src": "gravacao-1.jpg", "alt": "Gravação de Reels", "caption": "Bastidores de uma gravação" }]`.
3. A seção **Bastidores** aparece sozinha quando a lista tem fotos. Sem fotos, ela fica escondida.

**Não use fotos ou artes de clientes sem autorização** (regra do próprio manual); registre a autorização no ACERVO & AUTORIZAÇÃO.
