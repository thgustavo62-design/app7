# Plano: migrar os dados operacionais da planilha para o Postgres

Status: **plano, nada foi alterado em produção.** A planilha continua sendo o banco até a virada (fase 4).

## Por que

A planilha já é o banco de tudo: usuários, pautas, aprovações, semanas, autoridade, promoções, campanhas e importações. Funciona para uma equipe pequena, mas:

- **Sem transação.** A base de uma loja é regravada de uma vez (limpa e escreve em blocos de 1.000 linhas). A proteção por revisão (`promo_rev:<loja>`) reduz o risco de duas importações se sobrescreverem, mas não elimina: sobra uma janela entre ler e reservar.
- **Sem consulta.** Todo pedido lê abas inteiras; o custo cresce com o histórico de vendas.
- **Sem restauração.** Não existe como desfazer uma importação.
- **Limites da API do Google.** Cota de leituras e gravações por minuto, e células de texto com limite de tamanho (as vendas de um produto cabem numa célula só até certo ponto).

## O que NÃO muda

- Login (Google e senha), sessão em cookie e a conferência de permissões a cada pedido (`lib/guard.js`).
- O formato das operações (`/api/mutate`), a fila persistente no navegador e toda a interface.
- A planilha continua existindo como **fonte de importação, exportação e cópia de segurança** (exportação noturna do banco para a planilha).

## Estratégia: trocar o "motorista", não o carro

Todo o servidor fala com o banco por uma interface pequena (`lib/repo.js`: `readMany`, `append`, `write`, `clear`, `replace`). A planilha é um motorista (`SheetsDriver`); a memória, dos testes, é outro (`MemoryDriver`).

1. **Fase 1: `PgDriver` genérico.** Mesmas abas como tabelas (`tab`, `row`, colunas em `jsonb`), mesma interface. O código das regras (`model.js`, `promo-store.js`) não muda. Ganho imediato: gravação de uma aba inteira (`replace`) vira **uma transação**, e a revisão por loja vira trava de verdade (`SELECT ... FOR UPDATE`).
2. **Fase 2: tabelas próprias para o que pesa.** Vendas deixam de ser uma célula `AAMMDD:qtd:valor;...` e viram `promo_vendas(loja, barras, dia, qtd, valor)` (cerca de 400 mil linhas por loja com 50 dias de venda por produto, na ordem de dezenas de MB com índice). Estoque em `promo_estoque`; `semanas` e `autoridade` com colunas tipadas. Consultas por período e por produto passam a ser índices, não leitura de tudo.
3. **Fase 3: histórico e restauração.** Cada importação guarda o lote (`importacao_id`) e pode ser **desfeita**; campanhas aprovadas guardam o instantâneo de preço, custo e estoque que valeu na aprovação.
4. **Fase 4: virada.** Migração dos dados e troca da variável `DB_BACKEND=sheets` para `pg`.

## Como a migração roda sem risco

- **Script de migração** lê a planilha e grava no Postgres, e depois **compara contagens e somas** por aba (linhas, soma de vendas por loja e dia, versões). Só segue se bater.
- **Modo sombra:** por alguns dias o servidor lê dos dois e registra divergências, sem mudar o que o usuário vê.
- **Virada com marcador de manutenção** de poucos minutos (leitura continua, gravação pausa), última sincronização e troca da variável.
- **Volta atrás:** a planilha segue recebendo a exportação noturna; voltar é trocar `DB_BACKEND` de volta e reimportar a diferença do dia.

## Testes

- A suíte atual roda em `MemoryDriver`; passa a rodar também contra um Postgres de teste (CI) com os mesmos casos: importação simultânea, conflito de versão, escopo por empresa, aprovação de campanha.
- Novos casos: duas importações em paralelo (a segunda espera ou recebe 409, nunca apaga a outra), desfazer importação, transação que falha no meio e não deixa a base pela metade.

## Provedor e custo (conferir antes de contratar: mudam)

| Opção | Condições encontradas | Observação |
|---|---|---|
| **Neon** (também pela Vercel) | Plano gratuito: 1 GB por projeto e 100 horas de computação por projeto, sem cobrança de excedente; pago (Launch) por uso: cerca de US$ 0,106 por hora de computação e US$ 0,35 por GB-mês | Escala para zero quando ocioso (a primeira consulta depois de parado é mais lenta); passar de gratuito para pago é mudança de cobrança, não de dados |
| **Supabase** | Gratuito: 2 projetos, 0,5 GB de banco por projeto, **pausa o projeto após 1 semana sem uso**; Pro: US$ 25 por mês por organização, 8 GB de disco, sem pausa | O Pro faz sentido se quiser usar também armazenamento de arquivos (anexos) e login deles |

Para uma operação com clientes reais, **não recomendo o plano gratuito de nenhum dos dois** (pausa e escala a zero atrapalham a rotina de segunda-feira). O volume previsto (dezenas de MB) cabe em qualquer plano pago de entrada, então o custo é a assinatura mínima do provedor.

Fontes: [limites do plano gratuito do Neon](https://neon.com/faqs/free-plan-limits-and-quotas), [preços do Neon](https://neon.com/pricing), [preços do Supabase](https://supabase.com/pricing), [limites do plano gratuito do Supabase](https://supabase.com/changelog/33121-relaxing-database-size-limit-on-free-plan-0-5-gb-database-size-per-project).

## O que preciso de você para começar

1. **Escolher o provedor** (minha sugestão: Neon pela integração da Vercel, ou Supabase se quiser anexos de peças).
2. **Criar a conta e o banco** e colocar a conexão como variável **Sensitive** na Vercel (`DATABASE_URL`). Eu nunca peço a senha no chat.
3. **Autorizar a janela de virada** (poucos minutos, fora do horário de importação).

## Etapas e esforço (ordem de grandeza)

| Fase | O que entrega | Esforço |
|---|---|---|
| 1 | `PgDriver` genérico, testes no CI, script de migração com conferência | pequeno a médio |
| 2 | Tabelas próprias de vendas, estoque, semanas e autoridade; consultas por índice | médio |
| 3 | Desfazer importação, instantâneo de aprovação | pequeno |
| 4 | Modo sombra, virada e plano de volta | pequeno, mas depende de janela combinada |

Cada fase é publicável sozinha e reversível. A fase 1 já elimina o risco de duas importações se sobrescreverem.
