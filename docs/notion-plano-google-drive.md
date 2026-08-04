# Plano — Guardar fotos no Google Drive de cada usuário

> Documento de planejamento, para colar no Notion antes de implementar. Responde a uma
> pergunta direta: dá para o APPingos guardar as fotos de cada pessoa no Google Drive dela, em
> vez de (ou além de) armazenamento próprio?

## A resposta curta

Sim. A API do Google Drive permite que o app crie e organize pastas dentro do Drive pessoal de
quem autoriza, sem enxergar o resto do Drive dessa pessoa. É o mesmo tipo de fluxo já desenhado
no [plano de Agenda com Google Calendar](./notion-plano-agenda-google-calendar.md) — OAuth por
usuário, token guardado só no servidor — trocando a API de Calendar pela de Drive.

## Por que isso importa agora

O [plano de Stories](./notion-plano-stories-timeline.md) já apontava o problema sem resolver:
o Supabase Storage grátis tem **1 GB** no total do projeto, e foto de celular moderno come isso
rápido. Google Drive dá **15 GB grátis por conta pessoal**. Se cada pessoa guarda as próprias
fotos no próprio Drive, o limite deixa de ser um problema do APPingos — vira o Drive de cada um,
que já é maior e que vocês já pagam ou não por conta própria.

## Desenho: conexão por pessoa, não por espaço

Mesma decisão do plano de Agenda, pelo mesmo motivo: cada um tem a própria conta Google.
"Conectar o Google Drive" é uma ação de **usuário**, guardada por `user_id`. Dá para reaproveitar
a mesma tabela/infraestrutura de OAuth do plano de Agenda em vez de duplicar:

```
google_drive_conta(user_id pk, pasta_raiz_id text, email_google text, conectado_em)
-- refresh token na mesma tabela protegida do plano de Agenda — nunca exposta ao client
```

## Escopo: `drive.file`, não o Drive inteiro

A API do Google tem um escopo estreito e feito para exatamente este caso:
[`drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) —
o app só enxerga e gerencia **os arquivos que ele mesmo criou**, nunca o resto do Drive da
pessoa. Isso é mais barato de pedir (menos assustador no consentimento) e mais seguro por
padrão: mesmo com o token vazado, o alcance é só o que o app criou.

Vale a mesma pegadinha já registrada no plano de Agenda: escopos do Drive também passam por
verificação do Google para apps públicos. A mesma saída serve — **app em modo "Testing" no
Google Cloud Console**, com as duas contas cadastradas como test users, sem passar pela revisão.

## Estrutura de pastas

Ao conectar pela primeira vez, uma rota de servidor cria (via `files.create`,
`mimeType: application/vnd.google-apps.folder`):

```
APPingos/
  Stories/
```

**Preenchimento é preguiçoso**: só cria a subpasta do módulo quando aquele módulo já existe de
verdade. Um "Documentos" vazio esperando um módulo que ainda não foi construído não ajuda
ninguém — é só mais uma pasta para explicar depois.

## O ponto difícil: o álbum é de casal, o Drive é individual

A foto sobe para o Drive de quem tirou. Como a outra pessoa enxerga? Duas saídas, com trade-off
honesto:

1. **Compartilhar a pasta com o e-mail Google do parceiro** (`permissions.create`, papel
   leitor) — mais privado, mas exige saber o e-mail da conta Google dela, que só é confiável se
   ela também conectou o próprio Drive (é de onde viria `email_google` da tabela acima). Se ela
   ainda não conectou, o app não tem como saber com quem compartilhar.
2. **Link "qualquer pessoa com o link visualiza"** — funciona sempre, sem depender do outro
   lado, mas é menos privado: quem tiver o link (vazado por acidente que seja) vê o arquivo.

Recomendação: (1) como padrão assim que os dois tiverem conectado, caindo para (2) só
enquanto o parceiro ainda não conectou — e avisar isso na tela, não deixar implícito.

## Upload: onde os bytes passam

O token de atualização (refresh token) nunca sai do servidor — mesma regra do plano de Agenda.
Mas o **token de acesso** (validade de ~1h, escopo só `drive.file`) é seguro o bastante para ser
entregue ao navegador por um instante, permitindo que o **upload vá direto do celular para o
Drive**, sem passar pelo nosso servidor como intermediário — importante para vídeo, que é pesado.
Resize/compressão no cliente antes de subir continua valendo, mesma regra do
[plano do painel lateral](#) para avatares.

## O que fica no banco do APPingos

Só a referência, nunca o arquivo: `post_midia` ganha `drive_file_id` e `drive_view_url` (em vez
de, ou ao lado de, um caminho no Supabase Storage). Uma coluna `armazenamento: 'supabase' |
'drive'` por mídia deixa as duas opções coexistirem — uma foto pode estar num, a próxima no
outro — em vez de forçar uma migração de tudo de uma vez.

## Fases de implementação

1. Google Cloud: ativar Drive API, escopo `drive.file`, modo Testing (reaproveitar o mesmo
   projeto/client OAuth do plano de Agenda, se ele já existir)
2. Schema: `google_drive_conta` + a coluna `armazenamento` em `post_midia`
3. Conexão: rotas de servidor de início/callback (o mesmo padrão do plano de Agenda)
4. Criação da pasta raiz `APPingos/` e da subpasta `Stories/` ao conectar
5. Upload de uma mídia de Stories indo para o Drive em vez do Supabase Storage
6. Compartilhamento automático da pasta com o parceiro quando o e-mail dela for conhecido

## Fora de escopo por enquanto

- Sincronizar o que a pessoa já tinha no Drive antes de conectar — o escopo `drive.file` nem
  enxerga esses arquivos, de propósito
- Editar ou apagar, pelo APPingos, arquivos que o usuário mexeu direto no Drive fora do app —
  o mesmo motivo acima
- Pasta para módulos que ainda não existem (a estrutura fica reservada em nome, não criada de
  antemão)
- Backup/exportação em massa de tudo que já está no Supabase Storage para o Drive — se as duas
  formas de armazenamento coexistirem bem, migrar o que já existe é uma tarefa à parte, não um
  requisito deste plano

## Referências

- [Drive API — `drive.file`, o escopo por arquivo](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Verificação de escopos sensíveis](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
