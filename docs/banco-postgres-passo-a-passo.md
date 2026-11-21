# Trocar a planilha por um banco Postgres: passo a passo

Serve para **qualquer Postgres** (Neon, Railway, Render, AWS, Google Cloud, um servidor próprio...). O site só precisa de uma variável, `DATABASE_URL`. A recomendação é o **Neon criado pela própria Vercel**, porque cria e liga as variáveis sozinho.

Nada abaixo muda o site até o passo 5. Você pode parar a qualquer momento: a planilha continua sendo o banco.

## 1. Criar o banco (Neon pela Vercel)
1. Na Vercel, abra **Storage** (menu do topo ou da conta) e clique em **Create Database**.
2. Escolha **Neon** (Postgres) e aceite os termos.
3. **Região: Washington, D.C. (iad1)**, a mesma região em que as funções do site rodam. Assim cada consulta fica a poucos milissegundos.
4. Dê um nome (por exemplo `nova7`) e, quando perguntar, **conecte ao projeto `app7`** nos ambientes Production e Preview.
5. A integração cria sozinha as variáveis do projeto. A que o site usa é `DATABASE_URL` (também aceita `POSTGRES_URL`). Você não precisa copiar nada.

Plano: o gratuito do Neon serve para testar, mas escala a zero quando fica parado (a primeira consulta depois de um tempo é mais lenta). Para a operação, use um plano pago de entrada (cobrança por uso).

## 1b. Outro provedor (não Neon)
Crie um banco Postgres 14 ou mais novo, copie a **URL de conexão** (`postgresql://usuário:senha@servidor:porta/banco`) e, na Vercel > projeto > Settings > Environment Variables, crie `DATABASE_URL` com ela, marcada como **Sensitive**, para Production e Preview. Se o provedor oferece conexão "pooled" (pgbouncer em modo transação), use essa, que é a certa para a Vercel. Se a senha tiver `@ # / ? : %`, troque cada um pelo código (`@` = `%40`, `#` = `%23`, `/` = `%2F`, `?` = `%3F`, `:` = `%3A`, `%` = `%25`), ou use uma senha só com letras e números. Nunca cole a senha no chat.

## 2. Redeploy
Vercel > Deployments > menu do último deploy > **Redeploy**, para o site enxergar a variável nova. **Não** crie `DB_BACKEND` ainda.

## 3. Copiar e conferir
1. No site, entre como administrador > **Configurações > Fontes de dados > Banco de dados**.
2. Os dois selos precisam estar verdes ("planilha conectada" e "Postgres conectado").
3. Clique **Copiar planilha para o Postgres** e confirme. Ele copia aba por aba (a de Promoções é a mais demorada).
4. Clique **Conferir**. Todas as abas precisam aparecer **iguais** (mesma contagem e mesma impressão digital).
5. Se alguém mexeu na planilha no meio do caminho, copie e confira de novo.

## 4. Escolher o momento
Sem importação de estoque ou de vendas em andamento. Faça a última cópia e a conferência.

## 5. Virar a chave
Na Vercel, crie `DB_BACKEND` = `pg` e faça um novo Redeploy. O painel de Banco de dados passa a mostrar "Em uso agora: Postgres".

## 6. Voltar atrás (se precisar)
1. Em **Banco de dados**, clique **Copiar Postgres para a planilha** (leva de volta o que foi gravado depois da virada).
2. Na Vercel, mude `DB_BACKEND` para `sheets` e faça Redeploy.

## Boas práticas
- Mantenha a planilha como cópia de segurança: de vez em quando rode **Copiar Postgres para a planilha** e ative os backups do provedor.
- Os dados ficam num schema próprio (`n7`) com proteção por linha (RLS) ligada, e só a conexão do servidor lê e grava.
- Para voltar a usar o Supabase ou trocar de provedor no futuro, basta outra `DATABASE_URL` e repetir a cópia.
