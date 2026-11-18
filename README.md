# Central Nova7

Site de gestão interna da agência Nova7. Reúne resultados, metas e produção de cada cliente a partir dos dados do Google Drive. O visual segue o do [marketin-extra](https://github.com/thgustavo62-design/marketin-extra): menu lateral grafite, item ativo violeta, painéis com faixa escura e fontes Inter e Sora.

## Telas

| Endereço | O que mostra |
| --- | --- |
| `#painel` | Indicadores da agência, cartões dos clientes, pautas da semana, alertas P0 e rotina semanal |
| `#insights` | Vendas, ticket, Instagram e Facebook por janela, Facebook diário da Farma e Farma, cesta, achados e qualidade dos dados. Filtro: duas farmácias, Minas ou Farma |
| `#minas-farma`, `#farma-e-farma`, `#campo-forte`, `#nova7` | Página do cliente: resultados, andamento do plano, metas, publicações auditadas, documentos do Drive, alertas e achados |
| `#calendario` | Calendário Kanban com três visões (por status, semana e mês), filtros por marca, formato e busca, arrastar e soltar e gaveta de detalhe com as etapas de produção |
| `#alertas` | Alertas P0, P1 e P2 da auditoria de 10/11 e dos insights de 14/11 |

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

## Limites desta versão

- As mudanças no Kanban (status e data) e as metas digitadas ficam salvas só no navegador de quem editou (`localStorage`). O botão **Copiar alterações** copia as mudanças em JSON para levar à planilha.
- Os dados são uma cópia fixa. O próximo passo é ler a planilha Central direto (Google Sheets API) e gravar as mudanças do Kanban de volta nela.
- Campo Forte e Nova7 Produtora ainda não têm métricas exportadas da Meta no Drive.
