import { expect, test } from "@playwright/test";

// Roda depois de fluxo-principal (ordem alfabética): o voluntário e a escala já existem no banco.
const SENHA = "senha-e2e-12345";
const PRINTS = process.env.PRINTS_DIR; // se definido, grava os prints das 4 telas (claro e escuro)

test("voluntário: folgas, onde quero servir e telas em claro/escuro", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto("/entrar");
  await p.getByLabel("E-mail").fill("voluntario@e2e.local");
  await p.getByLabel("Senha", { exact: true }).fill(SENHA);
  await p.getByRole("button", { name: "Entrar" }).click();

  // Folgas: marca um dia, aparece na lista; remove.
  await p.waitForURL(/\/(inicio|agenda)/);
  await p.goto("/folgas");
  await p.getByRole("button", { name: "Próximo mês" }).click();
  await p.getByRole("button", { name: /, 10 de / }).click();
  await p.getByRole("button", { name: "Marcar folga" }).click();
  await expect(p.getByText("Folga marcada")).toBeVisible();
  await expect(p.locator(".list .row")).toHaveCount(1);

  // Onde quero servir: o ministério do fluxo anterior tem a função Vocal já aprovada.
  await p.goto("/perfil/servir");
  await expect(p.getByText("Louvor E2E")).toBeVisible();
  await expect(p.getByText(/Vocal.*aprovada/)).toBeVisible();

  if (PRINTS) {
    for (const esquema of ["light", "dark"] as const) {
      await p.addInitScript((t) => localStorage.setItem("ui:theme", t), esquema);
      for (const [rota, nome] of [["/inicio", "inicio"], ["/agenda", "agenda"], ["/folgas", "folgas"], ["/perfil/servir", "servir"]]) {
        await p.goto(rota);
        await p.waitForTimeout(400);
        await p.screenshot({ path: `${PRINTS}/${nome}-${esquema === "light" ? "claro" : "escuro"}.png` });
      }
    }
  }

  // Remove a folga pelo toque no mesmo dia.
  await p.goto("/folgas");
  await p.getByRole("button", { name: "Próximo mês" }).click();
  await p.getByRole("button", { name: /, 10 de .*folga/ }).click();
  await p.getByRole("button", { name: "Remover folga" }).click();
  await expect(p.getByText("Folga removida")).toBeVisible();
  await expect(p.getByText("Nenhuma folga marcada.")).toBeVisible();
});
