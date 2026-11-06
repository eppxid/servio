import { defineConfig } from "@playwright/test";

const PG_PORT = 54329;
const APP_PORT = 3100;

// Os testes que consultam o banco leem a porta daqui.
process.env.PG_LOCAL_PORT = String(PG_PORT);

// Postgres local (PGlite por socket) e o app já compilado (`next build` roda antes, em `pnpm e2e`).
const env = {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres?max=1`, // PGlite atende bem uma conexão por vez
  SESSION_SECRET: "e2e-segredo-de-sessao-com-mais-de-32-caracteres",
  CRON_SECRET: "e2e-cron",
  PG_LOCAL_PORT: String(PG_PORT),
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".next/e2e-results",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${APP_PORT}`, locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  webServer: [
    { command: "node scripts/postgres-local.mjs", port: PG_PORT, env, reuseExistingServer: false },
    {
      command: `pnpm db:migrate && pnpm start --port ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/entrar`,
      env,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
