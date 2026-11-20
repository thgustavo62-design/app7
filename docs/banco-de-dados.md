# Banco de dados: planilha "NOVA7 | SITE | BANCO DE DADOS"

Planilha do Google Sheets na pasta NOVA7 do Drive. O site grava aqui o que muda ou cria. O plano de novembro e dezembro continua na planilha **NOVA7 | CENTRAL EDITORIAL E PRODUÇÃO**.

O ID da planilha não fica no repositório: vai na variável de ambiente `SHEET_ID_DB` (veja `.env.example`).

## Regras

- Todas as células são **texto**. Datas em `AAAA-MM-DD`, horas em `HH:MM`, números como texto. Assim o Sheets nunca converte nada sozinho.
- Linha 1 é o cabeçalho e não pode mudar: o código procura as colunas pelo nome.
- **Aprovacoes é um registro de eventos**: só se acrescentam linhas. O estado atual é o último evento de cada par pauta + tipo. Isso evita duas pessoas sobrescreverem uma à outra.
- Nas demais abas, cada gravação sobe `versao` em 1. Se a versão lida for diferente da gravada, o servidor recusa e pede para recarregar.
- Campo vazio significa sem dado, nunca zero.
- Marca: `M` Minas Farma, `F` Farma e Farma, `C` Campo Forte, `N` Nova7.

## Abas

| Aba | Para que serve | Colunas |
| --- | --- | --- |
| `Alteracoes` | status e data de pautas do plano da Central mudados no site | codigo, status, data, versao, atualizado_em, atualizado_por |
| `PautasCriadas` | pautas criadas de ideias aprovadas (`I-F01`...) | codigo, marca, titulo, formato, data, hora, status, roteiro, gravar, editar, aprovar, agendar, doc, nota, ideia_id, versao, criado_em, atualizado_em, atualizado_por |
| `Ideias` | quadro de ideias | id, marca, formato, titulo, observacao, etapa, origem, criada_em, pauta_codigo, versao, atualizado_em, atualizado_por |
| `Aprovacoes` | eventos de aprovação (aprovou, reabriu, pediu_ajustes, comentou) | id, codigo, tipo, acao, por, em, texto |
| `Checagens` | nota e checklist pré-publicação | codigo, criterios_json, conformidade_json, nota, atualizado_em, atualizado_por |
| `Politicas` | política de aprovação por marca (none, internal, internal_client) | marca, politica, atualizado_em, atualizado_por |
| `Horarios` | horários fixos de publicação (`dia_semana` 0 domingo a 6 sábado) | id, marca, dia_semana, hora, formato, atualizado_em, atualizado_por |
| `Metas` | metas por marca e indicador | marca, indicador, valor, atualizado_em, atualizado_por |
| `Clientes` | empresas atendidas e **serviços prestados** (`servicos`: `redes`, `trafego`, `criativos`, `varejo`, separados por vírgula); `chave` curta (M, F, PBP...) é a que as outras abas usam em `marca`; `cor` é um dos tokens `--c1` a `--c8`; `ativo` sim ou nao | chave, id, nome, curto, cor, segmento, perfil, setor, servicos, ativo, versao, atualizado_em, atualizado_por |
| `Usuarios` | quem pode entrar. `tipo` = `equipe` (papel admin, editor ou leitura) ou `cliente` (papel `cliente`); `empresas` = chaves separadas por vírgula (equipe vazio = todas; cliente é obrigatório) | email, nome, tipo, papel, empresas, ativo, atualizado_em, atualizado_por |
| `Semanas` | números de cada empresa por semana (`tipo` semana, `inicio` na segunda) ou mês (`tipo` mes, `inicio` no dia 1): vendas, 7 dias, cestas, Instagram, Facebook e Meta Ads. **Vazio é falta de dado, nunca zero** | tipo, inicio, fim, marca, vendas, compras, dia1 a dia7, c100_n, c100_rs, ig_*, fb_* (views, alcance, interacoes, cliques, visitas, seguidores), ads_* (gasto, alcance, impressoes, resultados), janela, fonte, obs, versao, atualizado_em, atualizado_por |
| `SemanasGeral` | promoção, concorrência, decisão, resposta (`sim` ou `nao`) e notas do período | tipo, inicio, promocao, concorrencia, decisao, rumo, notas, versao, atualizado_em, atualizado_por |
| `Responsaveis` | responsável (e-mail da equipe) por etapa de cada pauta, do plano ou criada no site | codigo, roteiro, gravar, editar, aprovar, agendar, versao, atualizado_em, atualizado_por |
| `Autoridade` | números semanais de autoridade por cliente e canal (`canal` = `li`, `ig` ou `geral` para contatos, reuniões e menções). **Vazio é falta de dado**, não zero. Só clientes com o serviço `autoridade` | tipo, inicio, fim, marca, canal, impressoes, alcance, interacoes, comentarios, compartilhamentos, salvamentos, visitas, seg_novos, seg_total, posts, contatos, reunioes, mencoes, obs, versao, atualizado_em, atualizado_por |
| `PromoBase` | base da Central de Promoções: uma linha por produto e loja (`loja` = chave da empresa). `vendas` guarda as vendas dia a dia como `AAMMDD:quantidade:valor;...` (200 dias). **Crie a aba com 30.000 linhas e formato texto** (código de barras não pode virar número) | loja, barras, descricao, estoque, preco, custo, promo_sistema, aprox, ult_entrada, fiscal, vendas, estoque_em, atualizado_em |
| `PromoImportacoes` | registro do que foi importado (estoque ou vendas), com período, linhas, arquivo (e CNPJ do PDF) | id, loja, tipo, inicio, fim, linhas, arquivo, dia_descartado, por, em |
| `PromoCampanhas` | campanhas montadas (itens e totais em JSON) | id, loja, nome, tipo, regra, inicio, fim, status, itens_json, totais_json, versao, criado_por, criado_em, atualizado_em |
| `LinksAprovacao` | links de aprovação enviados a clientes | jti, codigo, tipo, criado_por, criado_em, expira_em, usado_em, usado_por |
| `Config` | versão do esquema e fuso | chave, valor |

`Clientes` já vem com os quatro clientes iniciais (mais o Werllem Polac, setor `executivo`, serviços `redes,autoridade`). Setores aceitos: saude, agro, contabilidade, executivo, agencia, varejo e outro. `Ideias`, `Politicas`, `Horarios` e `Config` já vêm com os dados iniciais (4 ideias, 4 políticas, 12 horários). `Semanas` e `SemanasGeral` vêm com as semanas de 19/10, 26/10 e 02/11 (6 linhas e 1 linha de contexto), só com o que consta nos relatórios; as colunas são texto, com ponto decimal (`109842.42`).

## Como o servidor usa a planilha

- Cada chamada de API lê cada aba no máximo uma vez (em uma única requisição `batchGet`) e mantém essa cópia atualizada enquanto grava. Uma gravação é uma chamada `update` (linha existente) ou `append` (linha nova); exclusão limpa a linha.
- Gravações usam `valueInputOption=RAW`, e todas as células são texto: nada é convertido nem avaliado como fórmula.
- Limites do Google Sheets API: 60 leituras e 60 gravações por minuto por usuário e 300 por projeto. Ao receber erro 429 ou 5xx, o servidor espera e tenta de novo (até 5 vezes, com espera crescente).
- A planilha pode ter colunas extras e em outra ordem. Se faltar uma coluna esperada, o servidor recusa com uma mensagem que nomeia a aba e a coluna.
