# Central Nova7

Site de gestão interna da agência Nova7. Reúne resultados, metas e produção de cada cliente a partir dos dados do Google Drive. O visual segue o do [marketin-extra](https://github.com/thgustavo62-design/marketin-extra): menu lateral grafite, item ativo violeta, painéis com faixa escura e fontes Inter e Sora.

## Telas

| Endereço | O que mostra |
| --- | --- |
| `#painel` | Indicadores da agência, cartões dos clientes, pautas da semana, alertas P0 e rotina semanal |
| `#insights` | Vendas, ticket, Instagram e Facebook por janela, Facebook diário da Farma e Farma, cesta, achados e qualidade dos dados. Filtro: duas farmácias, Minas ou Farma |
| `#minas-farma`, `#farma-e-farma`, `#campo-forte`, `#nova7` | Página do cliente: resultados, andamento do plano, metas, publicações auditadas, documentos do Drive, alertas e achados |
| `#calendario` | Calendário Kanban com quatro visões (por status, semana, mês e **ideias**), filtros por marca, formato e busca, arrastar e soltar, horários livres do cliente e gaveta de detalhe com etapas de produção, aprovação e checagem |
| `#fluxo` | Fluxo e horários: política de aprovação e horários fixos de publicação de cada cliente |
| `#alertas` | Alertas P0, P1 e P2 da auditoria de 10/11 e dos insights de 14/11 |
| `#playbook` | Método da agência: nota de saúde de cada cliente, checagem pré-publicação, quem aprova o quê, checklists por setor, cadência de revisão, modelo de relatório mensal, onboarding, formatos de Instagram e Facebook e notas para o Brasil |

## Como rodar

O site não tem build nem dependências. Abra `index.html` no navegador ou sirva a pasta:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Para publicar, sirva a pasta como site estático (GitHub Pages, Vercel ou Netlify).

## Estrutura

```
index.html            esqueleto: menu lateral, barra superior, gaveta e avisos
assets/css/app.css    tokens de cor (claro e escuro) e componentes
assets/js/data.js     dados extraídos do Drive (clientes, janelas, plano Nov–Dez, alertas)
assets/js/playbook.js método da agência (nota de saúde, rubrica, aprovações, cadência, formatos)
assets/js/workflow.js regras de aprovação, horários fixos e ideias (sem tela, testável em Node)
tests/workflow.test.js testes da regra de negócio: node --test tests/
assets/js/charts.js   gráficos em SVG (barras, linhas, área, empilhado)
assets/js/app.js      rotas, telas, Kanban e metas
assets/brand/         símbolo Nova7
```

## Dados

`assets/js/data.js` foi montado em 18/11/2026 a partir de:

- **NOVA7 | CENTRAL EDITORIAL E PRODUÇÃO | 2026**: abas PRODUÇÃO CENTRAL, 08 RELATÓRIOS SEMANAIS e 10 EVOLUÇÃO HISTÓRICA
- **Insights_3_Meses_Minas_Farma** e **Insights_3_Meses_Farma_e_Farma** (14/08 a 14/11)
- **AUDITORIA DE PUBLICAÇÕES — NOVA7 | 4 marcas | 10.11.2026**
- **NOVA7 | DIRETORIA DE MARKETING — Diagnóstico e plano de ação 2026**

Regra herdada das planilhas: `null` significa sem dado, nunca zero. Para atualizar a semana nova, acrescente uma posição nos vetores de `WEEKLY` e um rótulo em `WINDOWS`.

## Nota de saúde e checagem pré-publicação

- **Nota de saúde (0–100)** de cada cliente, com semáforo (80+ saudável, 60–79 atenção, abaixo de 60 crítico). Soma ponderada de ritmo de publicação (25%), pipeline de conteúdo (15%), resultados (25%), engajamento (10%) e conformidade (25%). É recalculada quando o Kanban ou os alertas mudam; dimensões sem dado ficam fora da conta.
- **Checagem pré-publicação** no detalhe de cada pauta: 6 critérios de post social com pesos (nativo da plataforma, gancho, entrega de valor, convite à interação, voz da marca, qualidade visual) e o checklist de conformidade do setor. A peça só fica "pronta para publicar" com nota 85+ e checklist completo.

O método vem dos guias de operação de agência, rubricas, aprovações, cadência de relatórios e especificações de plataforma do repositório [indranilbanerjee/digital-marketing-pro](https://github.com/indranilbanerjee/digital-marketing-pro) (licença MIT), adaptado à Nova7. Regras e benchmarks dos EUA foram retirados; os checklists usam os critérios já definidos nos documentos da Nova7 no Drive.

## Aprovações, ideias e horários fixos

Ideias de produto inspiradas no [Brightbean Studio](https://github.com/brightbeanxyz/brightbean-studio) (AGPL-3.0). O código é próprio; só os conceitos foram aproveitados.

- **Etapas de aprovação por cliente** (`#fluxo`): sem aprovação, só interna, ou interna e do cliente. Padrão: farmácias e Campo Forte com interna e do cliente (revisão do farmacêutico ou do agrônomo e depois o cliente); Nova7 só interna. Na gaveta de cada pauta há o registro de quem aprovou e quando, pedido de ajustes (a pauta volta para Em produção), comentários internos e do cliente e o histórico. **Uma pauta não vai para "Pronto" nem "Publicado" enquanto faltar aprovação da política do cliente.** A trava vale para o arrastar e para o botão Salvar.
- **Quadro de ideias** (visão Ideias do calendário): Nova ideia, Em análise, Aprovada e Descartada, com arrastar e soltar. Só ideia Aprovada pode ser agendada; ela vira uma pauta (`I-F01`, `I-M01`...) em "A planejar", com as datas de produção no padrão da Central e sem cair no passado. O quadro começa com 4 ideias baseadas na auditoria de 10/11 e na diretoria de marketing; edite ou exclua.
- **Horários fixos de publicação**: dia da semana, hora e formato por cliente. Sugestão inicial calculada a partir dos dias em que o plano Nov–Dez de cada cliente já publica (os horários do dia são palpites). Horários livres aparecem tracejados nas visões Semana e Mês quando uma marca está selecionada, e o clique oferece as ideias aprovadas que cabem ali. Datas de atenção (24, 25 e 31/12, 01/01 e 20/11) vêm marcadas.

## Limites desta versão

- As mudanças no Kanban (status e data), as aprovações, as ideias, os horários, as checagens e as metas digitadas ficam salvas só no navegador de quem editou (`localStorage`). O botão **Copiar alterações** copia as mudanças em JSON para levar à planilha.
- Os dados são uma cópia fixa. O próximo passo é ler a planilha Central direto (Google Sheets API) e gravar as mudanças do Kanban de volta nela.
- Campo Forte e Nova7 Produtora ainda não têm métricas exportadas da Meta no Drive.
- **Aprovação direta pelo cliente, por link, não existe ainda:** quem usa o site registra a aprovação em nome do cliente. Para o cliente aprovar sozinho é preciso um servidor.
- Os horários livres não conhecem feriados além dos 5 marcados em `workflow.js`.
