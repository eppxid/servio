import { criarMinisterioComConvite } from "./ajuda-equipe";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const SENHA = "senha-e2e-12345";
const URL_BANCO = `postgres://postgres:postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? "54329"}/postgres?max=1`;

/** Troca o tema do app (só para os prints; o tema vive em `window.motion`). */
async function trocarTema(pagina: Page, tema: "light" | "dark") {
  await pagina.evaluate((t) => (window as unknown as { motion: { theme: (v: string) => void } }).motion.theme(t), tema);
  await pagina.waitForTimeout(600);
}

/**
 * Roda depois de `fluxo-principal.spec.ts` (mesmo banco, ordem alfabética, 1 worker): a igreja e o
 * admin `admin@e2e.local` já existem. Ainda não há tela do voluntário para "Onde quero servir",
 * então o pedido de função (`desejada`) entra direto no banco.
 */
test("líder aprova o pedido de entrada e a função desejada de um voluntário na Equipe", async ({ browser }: { browser: Browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/entrar");
  await admin.getByLabel("E-mail").fill("admin@e2e.local");
  await admin.getByLabel("Senha", { exact: true }).fill(SENHA);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin).not.toHaveURL(/\/entrar/);

  const { id: idMinisterio, link } = await criarMinisterioComConvite(admin, "Midia Equipe", "Iluminação");

  const voluntario = await (await browser.newContext()).newPage();
  await voluntario.goto(link);
  await voluntario.getByLabel("Nome", { exact: true }).fill("Ana Equipe");
  await voluntario.getByLabel("E-mail").fill("ana@e2e.local");
  await voluntario.getByLabel("Senha", { exact: true }).fill(SENHA);
  await voluntario.getByRole("checkbox").check();
  await voluntario.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  // Desde a 021 o convite pergunta as funções desejadas; aqui só pede a entrada.
  await voluntario.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(voluntario.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();

  // O PGlite aceita uma conexão só: espera o app soltar a dele (idle_timeout=1 na config).
  await admin.waitForTimeout(2500);
  const sql = postgres(URL_BANCO, { max: 1 });
  try {
    await sql`
      insert into membro_funcoes (igreja_id, membro_id, funcao_id, status)
      select m.igreja_id, m.id, f.id, 'desejada'
      from membros_ministerio m
      join funcoes f on f.ministerio_id = m.ministerio_id
      where m.ministerio_id = ${Number(idMinisterio)} and f.nome = 'Iluminação'`;
  } finally {
    await sql.end();
  }

  await admin.goto(`/lider/equipe?ministerio=${idMinisterio}`);
  await expect(admin.getByText("1 pessoa quer servir em Iluminação")).toBeVisible();
  await expect(admin.getByText("Quer entrar no ministério")).toBeVisible();
  if (process.env.E2E_PRINTS) {
    await admin.setViewportSize({ width: 390, height: 844 });
    for (const tema of ["light", "dark"] as const) {
      await trocarTema(admin, tema);
      await admin.screenshot({ path: `${process.env.E2E_PRINTS}/equipe-pedidos-${tema}.png`, fullPage: true });
    }
  }
  await admin.getByRole("button", { name: "Aprovar entrada de Ana Equipe" }).click();
  await admin.getByRole("button", { name: "Aprovar Iluminação para Ana Equipe" }).click();
  await expect(admin.getByText("pessoa quer servir")).toHaveCount(0);

  const linha = admin.getByRole("button", { name: /Ana Equipe/ });
  await expect(linha).toContainText("Iluminação");
  await expect(linha).toContainText("0 no mês");
  if (process.env.E2E_PRINTS) {
    for (const tema of ["light", "dark"] as const) {
      await trocarTema(admin, tema);
      await admin.screenshot({ path: `${process.env.E2E_PRINTS}/equipe-membros-${tema}.png`, fullPage: true });
    }
    await linha.click();
    await expect(admin.getByRole("heading", { name: "Ana Equipe" })).toBeVisible();
    await admin.waitForTimeout(500);
    await admin.screenshot({ path: `${process.env.E2E_PRINTS}/equipe-folha-dark.png` });
  }
});
