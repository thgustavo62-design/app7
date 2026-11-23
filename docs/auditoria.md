# Auditoria: tudo está interligado?

Como conferir, em minutos, se as peças do site se enxergam entre si. Última rodada completa: **23/11/2026**.

## O que roda sozinho (a cada alteração)

`node --test tests/interligacao.test.js` (já faz parte de `npm test` e do CI). Confere, sem navegador:

- todo script e estilo do `app.html` existe e está no cache do app (`SHELL` do `sw.js`), sem item repetido;
- todo ícone de empresa mapeado em `assets/js/logos.js` existe, todo PNG de `assets/clientes/` está mapeado e guardado no cache;
- ícones e atalhos do manifesto e links da página inicial apontam para arquivos e rotas que existem;
- toda operação que o navegador envia (`sync.js`) tem tratamento no servidor (`model.js`) e vice-versa; toda chave sincronizada volta no estado;
- toda aba do banco tem chave, está documentada em `docs/banco-de-dados.md` e as colunas novas do Comercial estão no esquema;
- toda variável de ambiente que o código lê está explicada nos documentos;
- as listas do Comercial (etapas, objetivos, portes, tipos de negócio, tipos de contato, respostas da conversa) são iguais no navegador e no servidor;
- toda operação de Comercial, cliente e usuário exige administrador;
- o cron e a reescrita do `vercel.json` apontam para arquivos que existem, e a política de segurança libera só o necessário (mapa e busca de endereço).

## O que precisa de navegador (antes de publicar mudanças grandes)

Requisitos: `npm i --no-save playwright-core` e o Microsoft Edge (ou `NAVEGADOR=chrome`). Roda no servidor local, sem tocar na produção.

- `node scripts/auditoria/paginas.js light 1440` (e `dark 1440`, `light 390`): abre as 54 páginas e subpáginas e procura erro de script, requisição falhando, imagem quebrada, texto `undefined`/`NaN`, rolagem lateral e botão sem nome.
- `node scripts/auditoria/fluxos.js`: confere que os mesmos números batem em telas diferentes (pautas atrasadas no Painel, no Assistente, no menu, no Kanban e na Central de Inteligência; total de pautas) e que uma ficha atravessa o sistema (fechamento, cadastro de cliente, menu, carteira, mapa, contrato, ícones).

## O que só dá para ver na produção (manual)

- Variáveis na Vercel contra `lib/config.js`: hoje faltam só `WINDSOR_API_KEY` (a sincronização diária com o Windsor.ai fica sem efeito até existir) e sobra `BANCO_TOKEN` (chave da migração, já invalidada: pode apagar).
- Cabeçalhos da planilha de backup contra `lib/schema.js` (`COLS`): conferido em 23/11, iguais (22 abas).
- Erros em produção (Vercel > Logs): últimos 7 dias, só os de 18/11 (variáveis ainda por configurar naquele dia).
- Proteção de deploy da Vercel, repositório público ou privado, segredos legíveis (`GOOGLE_SERVICE_ACCOUNT_JSON` aparece como "readable-secret").

## Resultado de 23/11/2026

| Verificação | Resultado |
| --- | --- |
| Suíte de testes | 198 passam, 0 falham (6 do Postgres dependem de `PG_TEST_URL`) |
| Interligação (14 verificações estáticas) | passam; achou o cache do app com `autoridade.mjs` repetido (corrigido) |
| Páginas (54, claro, escuro e celular) | sem erro de script, requisição, imagem, texto estranho ou rolagem lateral; achou erro em Promoções > Candidatos quando a loja não tem dados (corrigido) |
| Fluxos e números cruzados (26 verificações) | passam |
| Planilha de backup | cabeçalhos iguais ao esquema |
| Segredos no código e no histórico (62 commits) | nenhum segredo real |

## Pendências conhecidas

- Repositório **público**: guarda o código e o plano de pautas embutido (`private/data.js`); só o nome de um cliente aparece em texto (README, documentos, Playbook e testes). Torná-lo privado resolve.
- `GOOGLE_SERVICE_ACCOUNT_JSON` deveria ser recriada como Sensitive, com a chave antiga revogada.
- `WINDSOR_API_KEY` não existe: o cron diário de `/api/windsor` roda sem efeito.
- Os testes do Postgres (`tests/pg.test.js`) só rodam com um Postgres local; o CI os roda.
