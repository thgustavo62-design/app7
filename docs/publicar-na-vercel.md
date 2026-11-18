# Publicar na Vercel

Passo a passo para colocar o site no ar com a planilha **NOVA7 | SITE | BANCO DE DADOS** como banco e login pela conta Google. Tempo: cerca de 30 minutos. Você faz os passos nas suas contas; o código já está pronto.

> Nunca cole senha, chave ou token em chat, issue ou arquivo do repositório. As chaves vão só nas variáveis de ambiente da Vercel (passo 3).

## 0. Repositório privado (antes de tudo)

O arquivo `private/data.js` tem vendas, auditoria e estratégia dos clientes. Em repositório público, qualquer pessoa lê.

1. GitHub → repositório `app7` → **Settings** → **Danger Zone** → **Change visibility** → **Make private**.
2. Se a Vercel não enxergar o repositório depois disso: GitHub → **Settings** → **Applications** → **Vercel** → **Configure** → em *Repository access*, inclua o `app7`.

## 1. Google Cloud: conta de serviço (o "robô" que lê e grava na planilha)

1. Entre em <https://console.cloud.google.com> e crie um projeto (ex.: `nova7-central`).
2. **APIs e serviços** → **Biblioteca** → procure **Google Sheets API** → **Ativar**.
3. **IAM e administrador** → **Contas de serviço** → **Criar conta de serviço**. Nome: `nova7-site`. Pule as permissões e conclua.
4. Abra a conta criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON**. Um arquivo é baixado. **Guarde fora do repositório.**
5. Copie o e-mail da conta de serviço (termina em `.iam.gserviceaccount.com`).
6. Abra a planilha **NOVA7 | SITE | BANCO DE DADOS** → **Compartilhar** → cole esse e-mail → papel **Editor** → desmarque "Notificar" → **Enviar**.
7. Na aba **Usuarios** da planilha, preencha quem pode entrar: `email` (conta Google), `nome`, `papel` (`admin`, `editor` ou `leitura`) e `ativo` = `sim`. Pelo menos uma linha `admin`.

## 2. Google Cloud: login com Google

1. **APIs e serviços** → **Tela de permissão OAuth**. Tipo de usuário: **Externo**. Nome do app: `Central Nova7`; informe seu e-mail de suporte e de contato. Salve. Publique o app (**Em produção**): ele só pede e-mail e perfil, que em geral não exigem verificação do Google.
2. **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → **Aplicativo da Web**.
3. Em **Origens JavaScript autorizadas**, adicione `http://localhost:3000` agora. O endereço da Vercel entra no passo 4. Não precisa de URI de redirecionamento.
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele não é segredo.

## 3. Vercel: criar o projeto

1. <https://vercel.com/new> → **Import Git Repository** → escolha `app7`.
2. **Framework Preset**: *Other*. Deixe *Root Directory*, *Build Command* e *Output Directory* como estão (vêm do `vercel.json`).
3. Abra **Environment Variables** e crie estas quatro (marque as duas últimas como *Sensitive*):

| Nome | Valor |
| --- | --- |
| `SHEET_ID_DB` | o trecho da URL da planilha-banco entre `/d/` e `/edit` |
| `GOOGLE_CLIENT_ID` | o ID do cliente OAuth do passo 2 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | o arquivo JSON do passo 1 convertido para base64 (veja abaixo) |
| `SESSION_SECRET` | um texto longo e aleatório (veja abaixo) |

   Converter o JSON para base64 (em uma linha só):
   - Mac: `base64 -i chave.json | tr -d '\n'`
   - Linux: `base64 -w0 chave.json`
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("chave.json"))`

   Gerar o `SESSION_SECRET`: `openssl rand -hex 32` (Mac, Linux, ou Git Bash no Windows).

   **Não crie** `AUTH_DEV_EMAIL` nem `DB_DRIVER`. O login de desenvolvimento só existe no seu computador.
4. Clique em **Deploy**.

**Qual branch vira produção.** O `app7` tem uma única branch (`claude/agency-internal-management-site-12a3ih`) e ela é a branch padrão do repositório. A Vercel usa a branch padrão como produção, então **não precisa de pull request nem de merge**: o primeiro deploy já sai como produção. Se um dia você criar uma `main`, ajuste em **Settings** → **Git** → **Production Branch**.

## 4. Liberar o endereço no Google

1. Na Vercel → projeto → **Domains**: copie o endereço de produção (ex.: `https://app7-xxxx.vercel.app`).
2. Google Cloud → **Credenciais** → seu ID do cliente OAuth → **Origens JavaScript autorizadas** → adicione esse endereço → **Salvar**. Pode levar alguns minutos para valer.

## 5. Teste de fumaça (confira nesta ordem)

- [ ] Abrir o endereço mostra só a tela de login, sem nenhum número de cliente.
- [ ] `https://SEU-ENDERECO/api/data` sem login devolve `401`, e `https://SEU-ENDERECO/private/data.js` devolve `404`.
- [ ] Entrar com um e-mail da aba **Usuarios** abre o painel. No topo aparece seu nome e "Salvo na planilha" depois de qualquer mudança.
- [ ] Mudar o status de uma pauta no Kanban: aparece uma linha nova na aba **Alteracoes** da planilha.
- [ ] Recarregar a página mantém a mudança.
- [ ] Entrar com um e-mail que **não** está em Usuarios é recusado.
- [ ] Duas pessoas editando ao mesmo tempo: a segunda recebe o aviso "Outra pessoa mudou isto" e a tela recarrega.

## Se algo falhar

| Sintoma | Causa provável |
| --- | --- |
| Botão do Google não aparece | O endereço não está nas *Origens JavaScript autorizadas* (passo 4), ou um bloqueador de conteúdo barrou. Abra o console do navegador (F12) e procure a mensagem. |
| "Este e-mail não tem acesso" | O e-mail não está na aba **Usuarios**, ou `ativo` não é `sim`. |
| "Erro interno" ao carregar | Faltam variáveis na Vercel. Veja **Deployments** → **Functions** → **Logs**: "Banco não configurado" significa `SHEET_ID_DB` ou `GOOGLE_SERVICE_ACCOUNT_JSON` ausentes. |
| Log `Sheets 403` | A planilha não foi compartilhada com o e-mail da conta de serviço como **Editor** (passo 1.6), ou a API do Sheets não foi ativada. |
| Log `Sheets 429` | Limite do Google (60 gravações por minuto por usuário). O site tenta de novo sozinho; se repetir, espere um minuto. |
| Log "A aba X não tem a coluna Y" | Alguém renomeou ou apagou um cabeçalho (linha 1). Restaure o nome original. |
| Tela em branco e erros "Refused to ..." no console | Uma regra de segurança (CSP em `vercel.json`) barrou algo. Copie a mensagem do console e me mande. |

## Acesso e segurança

- A sessão dura 12 horas (`SESSION_TTL_SECONDS` muda isso). Cada vez que a página abre, o servidor confere de novo se o e-mail continua `ativo` em **Usuarios**.
- Para tirar alguém: coloque `ativo` = `nao`. Para cortar **na hora** todas as sessões abertas: troque `SESSION_SECRET` na Vercel e faça **Redeploy**; todos precisam entrar de novo.
- Papéis: `leitura` só vê; `editor` grava pautas, ideias, aprovações e metas; `admin` também muda políticas de aprovação e horários.
- A chave da conta de serviço dá acesso de editor **só** a planilhas compartilhadas com ela. Se vazar, no Google Cloud apague a chave e crie outra.
- Plano Hobby: pelos termos da Vercel é para uso pessoal e não comercial. Se a Vercel pausar o projeto por isso, migrar para o Pro não exige mudar nada no código.

## Rodar no seu computador

```bash
npm run dev          # http://localhost:3000, dados em memória, botão "Entrar em modo de desenvolvimento"
npm test             # 25 testes
```
