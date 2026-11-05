# EscalaIgreja

Portal web gratuito de escala de voluntários da igreja (ministérios, eventos, escala, troca, check-in, chat e aviso no celular).

Stack: Next.js (App Router) + TypeScript + Drizzle ORM + Postgres (Neon Free) + Vercel Free. Custo de hospedagem: R$ 0.

Plano e tarefas: `ESPECS/` (fila em `ESPECS/fila`, fora do git).

## Documentação

- `docs/DEPLOY.md` — passo a passo do deploy grátis (Neon + Vercel), limites do plano e como rodar local.
- `docs/GUIA.md` — guia de uso para administrador, líder e voluntário.
- `docs/checklist-lancamento.md` — checklist de lançamento e LGPD.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build e servidor de produção |
| `pnpm test` | Testes de regra (Vitest, banco PGlite em memória) |
| `pnpm db:migrate` | Aplica as migrações em `DATABASE_URL` |
| `pnpm db:local` | Postgres local sem instalar nada (porta 54329) |
| `pnpm seed:demo` | Igreja de demonstração em banco vazio |
| `pnpm e2e` | Build + teste de ponta a ponta no navegador (Playwright) |
