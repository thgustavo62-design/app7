# Central Nova7

Site de gestão interna da agência Nova7: resultados, metas e produção de conteúdo de cada cliente. Login com Google, dados gravados numa planilha do Google Sheets e hospedagem na Vercel. O visual segue o do [marketin-extra](https://github.com/thgustavo62-design/marketin-extra): menu lateral grafite, item ativo violeta, painéis com faixa escura, fontes Inter e Sora.

**Para publicar:** [docs/publicar-na-vercel.md](docs/publicar-na-vercel.md).

## Telas

| Endereço | O que mostra |
| --- | --- |
| `#painel` | Indicadores da agência, cartões dos clientes com nota de saúde, pautas da semana, alertas P0 e rotina semanal |
| `#insights` | Vendas, ticket, Instagram e Facebook por janela, Facebook diário da Farma e Farma, cesta, achados e qualidade dos dados. Filtro: duas farmácias, Minas ou Farma |
| `#minas-farma`, `#farma-e-farma`, `#campo-forte`, `#nova7` | Página do cliente: resultados, nota de saúde, notas do setor, andamento do plano, metas, publicações auditadas, documentos do Drive, alertas e achados |
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
  assets/js/app.js      rotas, telas, Kanban e metas
api/                    funções da Vercel: auth, state, mutate, data
lib/                    sessão, login Google, cliente do Sheets, repositório, validação
private/data.js         dados dos clientes (não é servido como arquivo)
tests/                  25 testes: node --test tests/*.test.js
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
