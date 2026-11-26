# Preview de Feed

Tela **Preview de Feed** (menu Operação): o perfil de cada cliente num celular, para planejar a ordem dos posts e o cliente ver como vai ficar antes de publicar.

## De onde vêm os posts

- **Planejados**: as pautas do Calendário Kanban (as próximas 60 dias e as atrasadas). Sem arte ainda, aparecem como um cartão na cor do cliente com o título.
- **Com arte**: as pastas do Google Drive. A pasta de cada cliente é a **POSTAGENS FINALIZADAS**; cada post é uma subpasta com este nome:

  `AAAA-MM-DD__CÓDIGO__Titulo-Com-Hifens` (ex.: `2026-11-05__C-M15__Minas-Club-Como-Participar`)

  Dentro dela: as artes em ordem pelo nome (`01_capa.png`, `02_passo.png`... ou um `.mp4`) e um Google Doc cujo nome começa com `LEGENDA`. A legenda é o trecho depois de "LEGENDA PARA COPIAR"; a hora vem de "ÀS 17H30" se existir.
- O **código** (C-M15) liga a pasta à pauta do calendário: o post usa título, formato e data da pauta e as artes da pasta. Pasta sem pauta também aparece.
- Status do post: o da pauta; arte pronta no Drive vale ao menos "Pronto". Publicado fica no fim da grade, por data.

## O que a equipe pode fazer

- **Arrastar** os posts que ainda não foram publicados (ou usar ◀ ▶ dentro do post) para mudar a ordem. A ordem fica só no preview: **não muda as datas do calendário**.
- Filtrar por Em andamento, Prontos e Publicados; abas Grade e Reels.
- **Visão do cliente**: esconde códigos e etapas internas ("Em breve" no lugar do status). Usuário cliente sempre vê assim, só da própria empresa.
- **Perfil mostrado no celular** (usuário, nome, bio, link, seguidores, seguindo, destaques) e **pasta do Drive** (cole o link) ficam em cada cliente, na lateral.

## Ligar o Drive (uma vez)

1. No Google Cloud do projeto da conta de serviço, ative a **Google Drive API**.
2. A pasta precisa ser legível pela conta de serviço (`GOOGLE_SERVICE_ACCOUNT_JSON`): ou "qualquer pessoa com o link" como leitor, ou compartilhada com o e-mail da conta de serviço como Leitor. Hoje a de Minas Farma já é por link.
3. Abra o Preview de Feed e toque em **Atualizar agora**. O Drive é só lido: nada é gravado nele. O resultado fica 2 minutos na memória do servidor.

Sem o passo 1 a tela funciona só com os posts planejados e avisa o que falta.

## Onde está

- `api/feed.js` e `lib/feed.js`: leitura do Drive (escopo `drive.readonly`), perfil e ordem guardados na aba **Config**, chave `feed:<empresa>` (por exemplo `feed:M`). Lê quem tem acesso à empresa; grava só admin ou editor.
- `public/assets/js/feed.js`: regras da grade (montar, ordenar, mover) e a tela.
- `tests/feed.test.js`: nomes de pasta, legenda, Drive de mentira, permissões, rota e regras da grade.
- A pasta padrão de cada cliente está em `PASTAS_PADRAO` (`lib/feed.js`); para um cliente novo, cole o link da pasta na própria tela.
