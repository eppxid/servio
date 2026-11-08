import { expect, test } from "@playwright/test";

// Roda depois de lider-cultos.spec.ts (que cria o tipo "Culto semanal E2E <dia>, 18:00"). Renomeia e restaura o nome.
const SENHA = "senha-e2e-12345";

test("admin renomeia o tipo de culto e vê o nome novo na lista", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/entrar");
  await admin.getByLabel("E-mail").fill("admin@e2e.local");
  await admin.getByLabel("Senha").fill(SENHA);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin).not.toHaveURL(/\/entrar/);

  await admin.goto("/lider/tipos");
  await admin.getByRole("link", { name: /^Culto semanal E2E .*, 18:00/ }).click();
  const original = await admin.getByLabel("Nome do tipo de culto").inputValue();

  await admin.getByLabel("Nome do tipo de culto").fill("Culto de celebração");
  await admin.getByRole("button", { name: "Salvar nome" }).click();
  await expect(admin.getByText("Nome salvo")).toBeVisible();

  await admin.goto("/lider/tipos");
  await expect(admin.getByRole("link", { name: /^Culto de celebração .*18:00/ })).toBeVisible();

  await admin.getByRole("link", { name: /^Culto de celebração .*18:00/ }).click();
  await admin.getByLabel("Nome do tipo de culto").fill(original);
  await admin.getByRole("button", { name: "Salvar nome" }).click();
  await expect(admin.getByText("Nome salvo")).toBeVisible();
});
