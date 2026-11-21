# Central Nova7

Site de gestão interna da agência Nova7: resultados, metas e produção de conteúdo de cada cliente. Login com Google, dados gravados numa planilha do Google Sheets e hospedagem na Vercel. O visual segue o do [marketin-extra](https://github.com/thgustavo62-design/marketin-extra): menu lateral grafite, item ativo violeta, painéis com faixa escura, fontes Inter e Sora.

**Para publicar:** [docs/publicar-na-vercel.md](docs/publicar-na-vercel.md).

## Telas

| Endereço | O que mostra |
| --- | --- |
| `#painel` | Indicadores da agência, cartões dos clientes com nota de saúde, pautas da semana, alertas P0 e rotina semanal |
| `#insights` | Vendas, ticket, Instagram e Facebook por janela, Facebook diário da Farma e Farma, cesta, achados e qualidade dos dados. Filtro: duas farmácias, Minas ou Farma |
| `#relatorios` | Fechamento do mês por cliente, conforme os serviços dele, com PowerPoint para enviar ao cliente |
| `#promocoes` | Central de Promoções das farmácias: estoque e vendas de 60 e 90 dias, candidatos, preço sugerido com piso e campanhas |
| `#autoridade` | Painel de autoridade de marca pessoal ou profissional (LinkedIn, Instagram e convites): ritmo de publicação, engajamento qualificado e contatos que vieram do conteúdo |
| `#semana` | Rotina de segunda-feira: digite os números da semana ou do mês (ou cole as tabelas da Meta), veja a análise e baixe o PowerPoint de 6 a 8 slides |
| `#minas-farma`, `#padaria-bom-pao`... (um por cliente cadastrado) | Página do cliente, **montada conforme os serviços que a Nova7 presta a ele** (veja abaixo): redes sociais, tráfego pago, criativos e análise de varejo |
| Subpáginas na lateral | As páginas longas foram divididas: embaixo da página ativa, a barra lateral lista as subpáginas. **Cliente:** Visão geral (indicadores e cartões), Redes sociais, Plano e metas, Tráfego pago, Varejo, Autoridade e Alertas e achados (só as dos serviços dele). **Semana:** Entrada dos números e Análise e PowerPoint. **Autoridade:** Painel e Entrada. **Promoções, Central de Inteligência e Configurações:** as mesmas abas de dentro da página, também na lateral. No celular ficam no menu "Mais" |
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
| Autoridade e posicionamento | Ritmo de publicação contra a meta, alcance e engajamento qualificado por canal, visitas ao perfil e convites (tela `#autoridade`) |

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

## Relatórios: fechamento do mês por cliente

A tela `#relatorios` (equipe) mostra o fechamento de um mês de um cliente **conforme os serviços dele**: tráfego pago (investimento, resultados, custo por resultado, CPM, impressões, alcance e frequência), redes sociais (Instagram e Facebook), análise de varejo (vendas, compras, ticket, cestas) e conteúdo publicado (pautas do calendário). Cada indicador vem comparado ao mês anterior, com variação.

- **De onde vem o mês:** da linha de mês (busca da Meta pelo mês inteiro) ou da **soma das semanas inteiras dentro do mês** (a semana que atravessa dois meses não entra). A tela diz qual foi a origem e avisa quando só parte das semanas tinha o número.
- **Honestidade dos números:** alcance e frequência só aparecem com o alcance do mês; campo sem número é "sem dado", nunca zero; variação com base pequena (menos de 20) não vira destaque.
- **PowerPoint para o cliente:** botão **Baixar PowerPoint** (capa, resumo com destaques, um slide por serviço com número e "Próximos passos" com o texto que você escrever). Nome: `Relatorio_<Cliente>_AAAA-MM.pptx`. O texto dos próximos passos fica salvo neste navegador.

## As farmácias sempre separadas

Nenhuma análise soma ou mistura a Minas Farma com a Farma e Farma. O Painel mostra as vendas de cada uma em indicadores próprios; a tela Semana e o PowerPoint semanal falam de uma loja por vez (sem "total das lojas" nem participação de uma na outra); o Insights tem um filtro por loja (sem a opção "duas farmácias"); a Central de Promoções tem base, custo, estoque e campanhas por loja; o cérebro gera achados por loja, com saúde por loja. A única comparação entre lojas (produto parado numa e girando na outra) fica escondida na visão geral das Promoções e só aparece quando você clica em **Comparar com a outra loja**.

## Segurança e testes automáticos

- **Permissões sempre atuais:** o cookie guarda o papel de quando a pessoa entrou, mas toda API (`state`, `mutate`, `data`, `promo`, `central`, `windsor`) confere o cadastro de usuários (`lib/guard.js`, memória de 10 segundos por instância). Desativar um usuário ou mudar papel e empresas na planilha vale na próxima requisição, sem esperar o login expirar.
- **Memória de decisões:** os botões Feito, Adiar e Ignorar aceitam os 21 agentes (`lib/agents.js`); `tests/agents.test.js` compara a lista do servidor com o catálogo do site.
- **Alterações nunca se perdem sem conexão:** a fila de envio fica guardada no aparelho (IndexedDB, com localStorage de reserva; `outbox.js`). Se a conexão cair e o app for fechado, na próxima abertura as alterações são reenviadas antes de a tela carregar, e o indicador do topo mostra "N alterações não enviadas" enquanto houver pendência. Ao voltar a internet, o envio recomeça na hora. Conflito com outra pessoa continua descartando a fila, com aviso.
- **O Painel abre com "O que resolver hoje":** os 5 itens mais importantes da Central de Inteligência, cada um com cliente, urgência, agente que encontrou, o porquê (primeira evidência), a próxima ação e um botão Abrir; os indicadores completos ficam logo abaixo. Cada indicador mostra a **origem do número** (por exemplo "Planilha Semanas · 02/11–08/11", "Central editorial · lida às 14:32" ou "Calendário: cópia embutida de 18/11"), e os blocos que ainda usam dados embutidos no site avisam que não atualizam sozinhos.
- **Responsável por etapa:** na gaveta de cada pauta, cada etapa de produção (roteiro, gravação, edição, aprovação e agendamento) tem um seletor de **responsável**, escolhido entre a equipe com acesso ativo (usuário cliente nunca é responsável, e o cliente não vê quem faz o quê). O Painel mostra a **Minha fila** de quem tem etapas atribuídas e ainda não feitas, e o agente Etapas da produção diz, no alerta de etapa atrasada, quem é o responsável ou que a etapa está sem responsável. Dados na aba `Responsaveis`.
- **Visão 360° do cliente:** a Visão geral da página de cada cliente reúne, em uma tela só, indicadores com origem, **Pendências** (aguardando aprovação do cliente, atrasadas e o que a Central de Inteligência vê, com a saúde do cliente), **Próximas entregas**, mídia paga da última semana, **Atividade recente** (aprovações e comentários) e **Campanhas** (nas farmácias), com cartões para as subpáginas de cada serviço.
- **Carregamento:** o pacote do PowerPoint (~450 KB) só é baixado ao clicar em Baixar PowerPoint (`lazy.js`).
- **GitHub Actions** (`.github/workflows/test.yml`) roda `npm test` a cada push e pull request.
- **Importações simultâneas:** cada loja tem uma revisão na aba `Config` (`promo_rev:<loja>`). Antes de regravar a base, o servidor lê a revisão de novo direto da planilha: se outra importação gravou desde que esta começou, a segunda é **recusada (409) e nada é apagado**; basta tentar de novo. Não é uma transação de verdade (sobra uma janela de décimos de segundo entre ler e reservar).
- **Limite conhecido:** a planilha não tem transação, então a proteção acima reduz o risco mas não o elimina. O plano para trocar o banco está em [docs/migracao-postgres.md](docs/migracao-postgres.md). A **fase 1 já está construída**: em Configurações > Fontes de dados > Banco de dados você copia e confere as abas entre a planilha e o Postgres nos dois sentidos, e a virada é só trocar `DB_BACKEND` para `pg` na Vercel. Passo a passo: [docs/banco-postgres-passo-a-passo.md](docs/banco-postgres-passo-a-passo.md). O uso real é de uma pessoa importando por vez; para crescer, o caminho é mover os dados operacionais para um banco com transações (Postgres), mantendo a planilha para importação e exportação. Também ainda não há como restaurar uma importação anterior.

## Autoridade e posicionamento (contador, executivo, profissional liberal)

Para clientes cuja meta não é vender, e sim ser reconhecido (hoje o Werllem Polac, executivo tributário e comercial, e um contador a cadastrar), o serviço **Autoridade e posicionamento** troca a análise de varejo por um painel próprio na tela `#autoridade`. Os números são digitados por semana (segunda a domingo), por canal: **LinkedIn** e **Instagram** (impressões, alcance, interações, comentários, compartilhamentos, salvamentos, visitas ao perfil, seguidores novos e total, publicações) e **Convites** (contatos que vieram do conteúdo, reuniões ou propostas, convites e menções). Campo em branco é falta de dado, nunca zero; **alcance de canais diferentes nunca é somado** (as mesmas pessoas se repetem).

- **Consistência:** publicações da semana contra a meta (padrão 3 por semana; ajustável por cliente na própria tela). Abaixo da meta numa semana é TESTAR; há 2 ou 3 semanas seguidas, CORRIGIR.
- **Alcance e engajamento qualificado:** comentários, compartilhamentos e salvamentos por mil pessoas alcançadas (mais forte que curtida). Alcance com variação de 25% ou mais e engajamento com variação de 30% ou mais só viram conclusão com 500 pessoas ou mais de base; menos de 10 interações qualificadas é INCONCLUSIVO. Também avisa quando entram mais seguidores e o engajamento cai.
- **Convites:** 50 visitas ao perfil ou mais e nenhum contato nas últimas 3 semanas informadas é CORRIGIR (o perfil é visto mas não convida); reuniões e convites acima da semana anterior é ESCALAR, a medida de verdade da autoridade.
- **Conformidade por setor** (checklist antes de publicar, no Playbook e na pauta): *Contabilidade (CFC)*, com conteúdo informativo e moderado, sem promessa de resultado, sem comparação com colegas, sem chamada alusiva a preço, sigilo e LGPD, lei e data de vigência, identificação com nome, categoria e registro no CRC e revisão do contador (as regras de publicidade contábil vêm do CFC: confira o texto vigente da NBC PG 01 e consulte o CRC); *Executivo e marca pessoal*, que mantém a autoridade separada da promoção das farmácias (sem preço, oferta ou medicamento), cita lei com fonte e data, não dá orientação tributária para caso concreto nem promete economia de imposto, declara conflito de interesse e marca opinião como opinião.
- **Cérebro:** área *Autoridade* com os agentes Consistência, Alcance e engajamento e Convites, mais o aviso de dados (semana fechada sem números). Sinapses: ritmo baixo + alcance em queda, e dado velho baixa a nota. Dados na aba `Autoridade`.

## Central de Promoções (serviço "Promoções e preços")

Para as clientes em que a Nova7 programa promoções e preços (hoje Minas Farma e Farma e Farma), a tela `#promocoes` cruza **estoque** e **vendas de 60 e 90 dias** de cada loja. As lojas nunca se misturam: cada uma tem a sua base, o seu custo e as suas campanhas. O serviço é marcado em Configurações → Clientes e serviços.

- **Importar** (aba Importar): a exportação de estoque do sistema (`.xlsx`, colunas Barras, Descrição, Estoque, Preço de Venda, Últ. Prc. Entrada, Preço de Promoção, Valor Aproximado, Últ. Entrada) e o **PDF "Analítico de vendas" cupom a cupom**. Os arquivos são lidos **no navegador** (pdf.js e JSZip); só a base resumida por produto e por dia sobe para a planilha. A leitura mostra quantas linhas foram lidas (o esperado é 99,9% ou mais), empresa e CNPJ do PDF, e **deixa de fora o dia da emissão** quando o relatório saiu durante o expediente (dia cortado). TAXA DE ENTREGA e "DIVERSOS" não são produto. Um PDF novo **substitui só os dias que cobre**: importar duas vezes o mesmo relatório não conta venda em dobro. Para 90 dias, importe os meses em arquivos separados (ou um por semana, toda segunda). O sistema avisa quando o estoque importado parece ser da outra loja (o custo dos produtos em comum bate com a outra base).
- **Visão geral:** dinheiro em estoque (custo e preço de venda), parado em 90 dias, encalhado (6 meses ou mais de estoque), margem média ponderada, risco de ruptura, itens sem custo, papel de cada produto (parado, encalhado, isca, giro, margem, cauda), curva ABC, os 10 que mais faturam e **transferência entre lojas** (parado numa, girando na outra). Enquanto o histórico cobrir menos de 90 dias, a tela avisa que o giro de 60 e 90 dias ainda não é confiável.
- **Candidatos:** listas Queima, Atrair, Margem, Ruptura, Sem custo e Sem desconto real, com giro de 60 e 90 dias, meses de estoque, tendência, margem atual e **preço sugerido**. Regra: **nenhuma promoção fura o piso** (`piso = custo ÷ (1 − margem mínima)`; margem padrão 20%, Limpeza 12%, Corta Preço 10%, Queima 5%); sem concorrente, o preço é custo + R$ 3,00, nunca abaixo do piso, nunca com desconto além do que o papel do produto permite (isca 40%, estoque 50%, giro 20%, margem 15%) e **sempre terminando em ,90**. Item sem custo não tem piso: aparece marcado, nunca aprovado. Item sem estoque não entra em encarte.
- **Montar campanha:** escolha itens, ajuste o preço POR (o piso e a terminação ,90 são conferidos), veja margem e lucro da cesta **no ritmo de hoje** (giro de 60 dias × dias da campanha: não é previsão de vendas com a promoção), salve na planilha e exporte o **briefing para o designer** (Produto, Apresentação, DE, POR, Campanha, Frase, Selo, Início, Fim), copiado ou em CSV. Só entram itens com estoque, acima do piso e com preço em ,90.

**Conferências no servidor** (não dependem de a tela estar certa): uma campanha só é **aprovada ou publicada** se cada item existe na base da loja, tem estoque e custo, o POR respeita o piso da regra da campanha (com o custo de agora), termina em ,90 e é menor que o preço de venda; só uma campanha já aprovada pode ser publicada, e quem aprovou e quando ficam registrados pelo servidor (`totais.aprovacao`). **Relatório de vendas com leitura abaixo de 99,9% é recusado** (nada é gravado nem substituído) e fica bloqueado na tela. A **cobertura** de 60 e 90 dias usa os intervalos que os relatórios realmente cobriram (menos o dia cortado) e avisa as lacunas no meio do histórico. Se o sistema já tem **preço de promoção** abaixo do preço de venda, ele vale como preço praticado na margem e na sugestão.

**Ciclo da campanha:** Rascunho → Aprovada → Publicada → Encerrada, com os passos e quem aprovou (e quando) visíveis em *Campanhas*; os botões Aprovar e Publicar mostram o motivo quando o servidor recusa. A aba **Resultado** compara os itens da campanha com a média dos **mesmos dias da semana nas 4 semanas anteriores** (só dias com relatório importado e fora da própria campanha): unidades, receita, margem e **margem incremental**, com classe (ESCALAR, MANTER, TESTAR, CORRIGIR, ENCERRAR ou INCONCLUSIVO) e confiança. Menos de 2 dias de base ou menos de 10 unidades esperadas é INCONCLUSIVO; dia da campanha sem relatório fica de fora e é avisado. É indício, não prova: clima, feriado, concorrência e outras campanhas não entram.

Ainda não entram: comparação com os preços dos concorrentes, incrementalidade (lift) e margem incremental das promoções, e a importação do estoque por API. Dados guardados: abas `PromoBase` (uma linha por produto e loja, com as vendas dia a dia numa só célula, 200 dias), `PromoImportacoes` e `PromoCampanhas`.

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

**Mês inteiro:** o botão **Buscar Meta do mês**, na tela Relatórios (só administradores), busca o período do mês de uma vez e grava uma linha `mes` na aba `Semanas`. Isso importa porque **o alcance não se soma entre semanas** (as mesmas pessoas se repetem): só o mês buscado inteiro tem alcance e frequência corretos. O agendador também fecha o mês que acabou nos três primeiros dias de cada mês.

Regras: o Windsor só troca os campos que vieram com valor (vendas, anotações e o que você digitou ficam); campo que a conta não tem fica **sem dado, nunca zero**; cada métrica é pedida separadamente, então um campo recusado não derruba os demais. Os campos de cada métrica estão em `MAP` no `lib/windsor.js`. **Confira o alcance** na primeira vez contra o Meta: ele é calculado no período inteiro pelo Windsor, e o resultado do anúncio usa por padrão as conversas iniciadas (`WINDSOR_ADS_RESULT_FIELD` troca o campo).

## Landing page pública

A raiz do site (`/`) é a **landing page da Nova7**, aberta a qualquer pessoa (serviços, como trabalhamos, diferenciais, contato). O sistema de gestão fica em **`/app`** (com login, sem indexação nos buscadores; `robots.txt` bloqueia `/app` e `/api/`). Arquivos: `public/index.html`, `public/assets/css/landing.css`, `public/assets/js/landing.js`, imagem de compartilhamento `public/assets/brand/og-nova7.png`.

- **Contato:** edite só o objeto `CONTACT` no início de `landing.js` (WhatsApp com DDI e DDD, e-mail, Instagram). Sem WhatsApp, os botões usam o e-mail; sem e-mail, o Instagram.
- **Clientes:** a landing **não cita clientes nem resultados**, porque a autorização de case ainda está pendente na Central. Um teste automático garante isso.
- A imagem de compartilhamento (`og:image`) usa o endereço atual da Vercel; ao ligar um domínio próprio, troque a URL em `index.html`.

## Central de Inteligência (o "cérebro")

A tela `#cerebro` responde "o que fazer hoje" **sem nenhuma API de IA**: agentes por função lêem os dados do sistema e o maestro escolhe a **decisão do dia**, sempre com a evidência.

Em 6 passos (motor em `public/assets/js/brain/`, funções puras testadas em Node):

1. **Agentes** lêem os dados e devolvem achados com nota e evidência. São **21, em 7 áreas**:
   - *Operação:* Produção (atrasos, pautas que vencem sem começar, calendário vazio), Etapas da produção (prazo de roteiro, gravação, edição, aprovação e agendamento contra o status), Capacidade da equipe (dia com etapas demais), Aprovações.
   - *Conteúdo:* Ritmo editorial (horários fixos, variedade de formato, ideias aprovadas paradas), Qualidade (peça pronta sem checagem), Criativos (nasce da conversa entre Mídia e Redes).
   - *Resultado:* Mídia paga, Redes sociais e Vendas (da análise semanal, mesmas regras da tela Semana).
   - *Promoções* (só farmácias com o serviço Promoções e preços; **cada loja é lida à parte, nunca somada à outra**): Estoque parado (dinheiro sem venda em 90 dias e encalhado há 6 meses ou mais), Ruptura (itens classe A ou B com estoque para 15 dias), Preço e margem (venda no custo ou abaixo e margem abaixo de 12%) e Campanha da semana (a cadência de cada loja contra as campanhas salvas e aprovadas para hoje e os 2 próximos dias). O resumo vem da Central de Promoções (`promo.js`), carregado em segundo plano; a tela se atualiza quando chega. O botão *Abrir* de cada achado leva à loja e à lista certas, e a campanha da cadência já vem preparada.
   - *Estratégia:* Gestão de contas (saúde por cliente) e Oportunidades (orgânico forte em cliente sem tráfego pago).
   - *Autoridade* (só clientes com o serviço Autoridade e posicionamento): Consistência (ritmo de publicação contra a meta), Alcance e engajamento (LinkedIn e Instagram, sem somar canais) e Convites e contatos (reuniões e perfil visitado que não convida).
   - *Contexto:* Qualidade dos dados (inclui base de promoções sem importar, estoque ou vendas velhos, histórico curto e muito item sem custo) e Datas e feriados.
2. **Memória:** o que foi marcado como feito, adiado ou ignorado e continua aparecendo volta como **reincidente** (+4 a +10 pontos). O que foi feito e deixou de aparecer conta como resolvido.
3. **Sinapses** (conexões entre agentes, listadas na tela "Como o cérebro pensa"): aprovação trava a produção; dado velho baixa a confiança; feriado aperta o prazo; anúncio cansado + redes em queda = criativos desgastados; dado de promoção velho baixa a nota dos achados da loja; estoque parado + falta de campanha vira oportunidade de queima; ruptura com anúncio no ar; ritmo baixo + alcance em queda (autoridade); dado de autoridade velho baixa a nota; falta de publicação + queda de alcance; vendas caindo + anúncio com problema; sobrecarga + atraso; calendário vazio + ideia parada; memória.
4. **Gestão de contas:** soma o que todos disseram de cada cliente numa **saúde de 0 a 100** (80+ em ordem, 60 a 79 atenção, abaixo de 60 em risco) e avisa quando várias frentes pioram juntas.
5. **Maestro:** escolhe a **decisão do dia** e até 2 "também hoje" (agentes e clientes diferentes). Nota de 0 a 100 = urgência x impacto x confiança; Hoje (80+), Esta semana (60+), Acompanhar. Ganhos aparecem à parte e nunca viram decisão.
6. **Tratar:** *Feito* (some hoje), *Adiar 2 dias* ou *Ignorar* (14 dias), gravado na aba `Decisoes` da planilha-banco.

A tela traz ainda o **mapa do cérebro** (os 21 agentes e as conexões que dispararam hoje), a saúde dos clientes e o radar por área. O Painel mostra a decisão do dia num cartão. Usuário cliente não vê a Central de Inteligência.

### Subabas da Central

A barra no topo da Central de Inteligência (`#cerebro/<aba>`) separa o conteúdo: **Hoje** (decisão do dia), **Clientes** (saúde), **Radar** (achados por agente e área), **Agentes 3D**, **Serviços 3D**, **Conexões** (mapa plano e conexões ativas), **Memória** e **Como pensa** (regras). Os números nas abas mostram o que pede atenção.

- **Agentes 3D:** cada agente é uma esfera, agrupada por área; os pontos em órbita são os achados abertos (vermelho = urgente); linhas roxas com pulsos de luz são as conexões que dispararam hoje; losangos rosa são os serviços. Arraste para girar, role/pince para aproximar, toque num ponto para abrir o painel com regras, conexões, serviços atendidos e achados.
- **Serviços 3D:** serviços no centro, clientes ligados ao que contratam (cor = saúde) e os agentes que trabalham para cada serviço.
- Se o aparelho não abrir WebGL, a cena some e a lista de botões abaixo dela mostra o mesmo conteúdo (a lista também serve para usar só com teclado). Respeita "reduzir movimento".

### Estrutura em módulos (código)

O cérebro usa **módulos ES nativos** (sem build), carregados só quando a tela é aberta (`cerebro-loader.js` é o único script comum). Isso deixa o início do app mais leve e cada parte pequena e testável.

```
public/assets/js/
  cerebro-loader.js        carrega os módulos sob demanda (render e cartão do Painel)
  brain/                   MOTOR (sem tela, roda também em Node)
    util.mjs               datas, notas e o molde de achado
    catalog.mjs            áreas, agentes, conexões e SERVICE_AGENTS (quais agentes servem a cada serviço)
    agents/                um arquivo por área: operacao, conteudo, resultado, estrategia, contexto; index.mjs lista os agentes
    memory.mjs  synapses.mjs  health.mjs   memória, conexões entre agentes, saúde por cliente
    index.mjs              o maestro: run(contexto) -> decisão, achados, clientes, conexões, memória
  cerebro/                 TELAS
    index.mjs              barra de subabas (TABS) e cartão do Painel
    kit.mjs                ajudantes comuns (cartões, botões, marcar feito)
    views/                 uma subaba por arquivo (hoje, clientes, radar, agentes, servicos, conexoes, memoria, regras)
    3d/graph.mjs           posições e ligações (puro, testado)  ·  3d/panel.mjs  painel de detalhes  ·  3d/scene.mjs  Three.js
public/assets/vendor/three.module.min.js   Three.js r160 (MIT), copiado para o projeto: o site não carrega código de outros domínios
```

**Para criar um agente novo:** escreva a função num arquivo de `brain/agents/` (ela recebe o contexto e devolve achados com `F(agente, chave, {...})`), coloque-a em `agents/index.mjs`, registre em `catalog.mjs` (`AGENTS`, `AGENT_ORDER`, `SERVICE_AGENTS`) e, se ele conversar com outro, descreva a conexão em `SYNAPSES` e implemente em `synapses.mjs`. **Para criar uma subaba:** escreva `cerebro/views/<nome>.mjs` exportando `{ title, render(host, kit) }` e liste em `TABS`. Todo módulo novo precisa entrar na lista `SHELL` de `public/sw.js` (um teste avisa se faltar).

O Claude (API) é opcional e ainda não é usado; se for ligado depois, serve só para explicar em texto, sem mudar as regras. A parte da Meta (Windsor.ai) entra quando for conectada.

### Fotos na landing (bastidores)

A landing segue o manual de identidade da Nova7 (preto `#0B0C11`, grafite `#171927`, ciano `#38BCD8`, violeta `#7443D8`, Montserrat, "Mais que posts, direção."). Hoje ela é toda desenhada em CSS e SVG, com o "7" da marca em vetor. Para mostrar **fotos reais** (equipe, gravações, bastidores, cidade):

1. Coloque os arquivos (`.jpg`, `.png`, `.webp`) em `public/assets/photos/` (até uns 400 KB cada; redimensione antes).
2. Liste em `public/assets/photos/photos.json`: `[{ "src": "gravacao-1.jpg", "alt": "Gravação de Reels", "caption": "Bastidores de uma gravação" }]`.
3. A seção **Bastidores** aparece sozinha quando a lista tem fotos. Sem fotos, ela fica escondida.

**Não use fotos ou artes de clientes sem autorização** (regra do próprio manual); registre a autorização no ACERVO & AUTORIZAÇÃO.
