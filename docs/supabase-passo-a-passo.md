# Supabase: passo a passo para trocar a planilha pelo Postgres

Nada abaixo muda o site até o passo 5. Você pode parar a qualquer momento: a planilha continua sendo o banco.

## 1. Criar o projeto
1. Entre em supabase.com e crie uma organização e um projeto.
2. **Região: South America (São Paulo)**, a mais perto de Baixo Guandu.
3. Escolha uma **senha forte do banco** e guarde no seu gerenciador de senhas. Nunca cole no chat.
4. Plano: para uso real, **Pro** (US$ 25 por mês). O gratuito pausa o projeto depois de uma semana sem uso.

## 2. Pegar a conexão
1. No projeto, clique em **Connect** (ou Project Settings > Database).
2. Escolha **Transaction pooler** (porta **6543**). É a certa para a Vercel, que abre muitas conexões curtas.
3. Copie a URL. Ela se parece com `postgresql://postgres.xxxxxxxx:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`.
4. Troque `[SUA-SENHA]` pela senha. Se a senha tiver `@ # / ? : %`, troque cada um por seu código (`@` = `%40`, `#` = `%23`, `/` = `%2F`, `?` = `%3F`, `:` = `%3A`, `%` = `%25`), ou escolha uma senha só com letras e números.

## 3. Colocar na Vercel
1. Vercel > projeto **app7** > Settings > Environment Variables.
2. Crie `DATABASE_URL` com a URL do passo 2 e marque **Sensitive**. Ambientes: Production e Preview.
3. **Ainda não** crie nem mude `DB_BACKEND`.
4. Faça um novo deploy (Deployments > Redeploy) para o site enxergar a variável.

(Se preferir, me diga que a variável está criada e eu confiro o deploy. Eu não vejo o valor.)

## 4. Copiar e conferir
1. No site, entre como administrador > **Configurações > Fontes de dados > Banco de dados**.
2. Os dois selos devem estar verdes ("planilha conectada" e "Postgres conectado").
3. Clique **Copiar planilha para o Postgres** e confirme. Ele copia aba por aba (a de Promoções é a mais demorada).
4. Clique **Conferir**. Todas as abas precisam aparecer **iguais** (mesma contagem e mesma impressão digital).
5. Repita copiar e conferir se alguém mexeu na planilha no meio do caminho.

## 5. Virar a chave
1. Escolha um momento sem importação de estoque ou de vendas em andamento.
2. Faça a última cópia e a conferência (passo 4).
3. Na Vercel, crie `DB_BACKEND` = `pg` e faça um novo deploy.
4. Abra o site: o painel de Banco de dados deve mostrar "Em uso agora: Postgres (Supabase)".

## 6. Voltar atrás (se precisar)
1. Em **Banco de dados**, clique **Copiar Postgres para a planilha** (leva de volta o que foi gravado depois da virada).
2. Na Vercel, mude `DB_BACKEND` para `sheets` e faça um novo deploy.

## Boas práticas
- Mantenha a planilha como cópia de segurança: de vez em quando rode **Copiar Postgres para a planilha** (e ative os backups do Supabase, que no plano Pro são diários).
- O schema usado se chama `n7` e tem a proteção por linha (RLS) ligada sem política, então a API pública do Supabase não enxerga os dados. Só a conexão do servidor lê e grava.
- Não ative "Data API" para o schema `n7` em Settings > API.
