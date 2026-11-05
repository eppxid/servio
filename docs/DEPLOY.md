# Deploy gratuito: Vercel + Neon

Custo: R$ 0. Você precisa de uma conta no GitHub (ou GitLab), uma no Neon e uma no Vercel. Tempo: cerca de 30 minutos.

## O que você precisa antes

- Node.js 20 ou mais novo e pnpm (`npm i -g pnpm`).
- O código deste repositório em um repositório seu no GitHub, GitLab ou Bitbucket.
- Uma conta em https://neon.com e uma em https://vercel.com (entre com o GitHub).

## 1. Criar o banco no Neon

1. No Neon, clique em **New Project**.
2. Escolha a região **AWS South America (São Paulo) — sa-east-1**. Os dados ficam no Brasil.
3. Abra **Connect** e ligue a opção **Connection pooling**.
4. Copie a URL que aparece. Ela tem `-pooler` no endereço e termina com `?sslmode=require`.
5. Guarde essa URL. Ela é a `DATABASE_URL`.

## 2. Criar as tabelas

No seu computador, na pasta do projeto:

1. Instale as dependências: `pnpm install`
2. Crie as tabelas, trocando a URL pela sua:
   - Linux ou Mac: `DATABASE_URL="postgres://..." pnpm db:migrate`
   - PowerShell: `$env:DATABASE_URL="postgres://..."; pnpm db:migrate`
3. Confira a mensagem `migrations applied successfully`.

Repita este passo sempre que uma versão nova trouxer arquivos novos em `drizzle/`.

## 3. Gerar os segredos

Gere cada valor no seu computador. Não envie para o repositório.

| Variável | Como gerar |
|---|---|
| `SESSION_SECRET` | `openssl rand -base64 48` (mínimo de 32 caracteres) |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `pnpm vapid` (o comando imprime os três) |
| `VAPID_SUBJECT` | `mailto:` mais um e-mail de contato, por exemplo `mailto:contato@suaigreja.org` |

Sem `openssl`, use qualquer gerador de senha com 48 caracteres.

## 4. Importar o projeto no Vercel

1. No Vercel, clique em **Add New → Project** e escolha o repositório.
2. Deixe o framework em **Next.js**. O arquivo `vercel.json` já fixa a região `gru1` (São Paulo) e os dois crons.
3. Abra **Environment Variables** e crie estas variáveis:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | A URL com pooler do passo 1 |
| `SESSION_SECRET` | Do passo 3 |
| `CRON_SECRET` | Do passo 3 |
| `VAPID_PUBLIC_KEY` | Do passo 3 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | O mesmo valor de `VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY` | Do passo 3 |
| `VAPID_SUBJECT` | Do passo 3 |
| `IGREJA_NOME`, `IGREJA_CNPJ`, `IGREJA_ENDERECO`, `IGREJA_CONTATO` | Dados da igreja (controladora). Aparecem na política de privacidade. Vazio vira "a informar". |

4. Clique em **Deploy**. O primeiro build leva de 1 a 3 minutos.
5. O endereço grátis é `https://NOME-DO-PROJETO.vercel.app`. Para trocar o nome, abra **Settings → Domains**.

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` entra no código durante o build. Se você mudar esse valor, faça um novo deploy.

## 5. Primeiro acesso

1. Abra `https://NOME-DO-PROJETO.vercel.app`.
2. A tela **Primeiro acesso** pede o nome da igreja, o seu nome, e-mail e senha (8 caracteres ou mais).
3. Marque a autorização de tratamento de dados e clique em **Criar**. Você vira o administrador.
4. Só a primeira pessoa usa essa tela. Depois dela, o sistema manda para **Entrar**.
5. Siga o `docs/GUIA.md` para criar ministérios e convidar a equipe.

Antes de convidar pessoas, siga o `docs/checklist-lancamento.md` (política de privacidade e termos revisados).

## 6. Testar o passo a passo sem risco (opcional)

Para ver o sistema cheio de dados, use um banco Neon separado (um branch) e rode:

```
DATABASE_URL="postgres://..." pnpm seed:demo
```

O comando cria uma igreja de demonstração com 2 ministérios, 8 voluntários, eventos de 1 mês, repertório em 2 eventos e histórico de check-in. A senha de todos é `demo-12345`. Logins: `admin@demo.local`, `marta@demo.local` (líder), `ana@demo.local` (voluntária). O comando recusa rodar se o banco já tem uma igreja.

Nunca rode o seed no banco de produção.

## Limites do plano grátis

Confira os números atuais nas páginas oficiais antes de decidir: https://neon.com/pricing e https://vercel.com/docs/limits.

- **Neon pausa o banco após 5 minutos sem uso.** O primeiro acesso depois da pausa leva alguns segundos. Isso é normal.
- **Não use "ping" para manter o banco acordado.** Um ping constante gasta as 100 CU-h do mês e o banco para até o mês virar.
- **O cron do Vercel Hobby roda 1 vez por dia** e pode atrasar até 59 minutos. Por isso o lembrete diário (`/api/cron/lembretes`) e a limpeza (`/api/cron/limpeza`) não têm hora exata. O `vercel.json` marca 21:00 UTC (18:00 em Brasília) e 06:00 UTC.
- O chat atualiza por consulta a cada 5 segundos. Não há conexão aberta, então cabe no plano grátis.
- O plano Hobby do Vercel é para uso pessoal e sem fins comerciais. Igreja sem fins lucrativos costuma caber. Leia os termos do Vercel e confirme.

## Testar o cron na mão

```
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://NOME-DO-PROJETO.vercel.app/api/cron/limpeza
```

Sem o cabeçalho, a resposta é `401`.

## Atualizar a versão

1. Envie o código novo para o repositório (`git push`). O Vercel faz o deploy sozinho.
2. Se a versão trouxe arquivos novos em `drizzle/`, rode `pnpm db:migrate` com a `DATABASE_URL` de produção.

## Rodar tudo no seu computador

1. Copie `.env.example` para `.env.local` e preencha.
2. Suba um Postgres local sem instalar nada: `pnpm db:local` (porta 54329).
3. Em outro terminal, com `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres?max=1`: `pnpm db:migrate` e `pnpm dev`.
4. Teste de ponta a ponta: `pnpm e2e` (faz o build, sobe o banco local e o app, e roda o navegador).
   Na primeira vez, rode `pnpm exec playwright install chromium`.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Build falha com `SESSION_SECRET precisa ter 32 caracteres` | A variável está vazia ou curta. Gere de novo (passo 3). |
| Erro `DATABASE_URL não definida` | Falta a variável no Vercel. Adicione e faça um novo deploy. |
| Página lenta só no primeiro acesso | O Neon estava pausado. Aguarde alguns segundos. |
| Aviso no celular não chega | Confira as 3 chaves VAPID. No iPhone, instale o app na tela inicial (iOS 16.4 ou mais novo). |
| Cron responde `401` | O `CRON_SECRET` do Vercel difere do usado na chamada. |
