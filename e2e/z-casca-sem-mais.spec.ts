import { expect, test, type Browser, type Page } from "@playwright/test";

// Roda por último (ordem alfabética): usa o admin criado por fluxo-principal.spec.ts.
const SENHA = "senha-e2e-12345";

async function entrar(browser: Browser, modo?: "lider"): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (modo) await contexto.addCookies([{ name: "servio_modo", value: modo, url: "http://localhost:3100" }]);
  const pagina = await contexto.newPage();
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail").fill("admin@e2e.local");
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).not.toHaveURL(/\/entrar/);
  return pagina;
}

test("login cai no início do modo e não há menu Mais", async ({ browser }) => {
  const voluntario = await entrar(browser);
  await expect(voluntario).toHaveURL(/\/inicio$/);
  await expect(voluntario.getByRole("button", { name: "Mais opções" })).toHaveCount(0);

  const lider = await entrar(browser, "lider");
  await expect(lider).toHaveURL(/\/lider\/cultos$/);
  await expect(lider.getByRole("button", { name: "Mais opções" })).toHaveCount(0);
});

test("telas antigas redirecionam para as abas novas", async ({ browser }) => {
  const admin = await entrar(browser);
  await expect(admin).toHaveURL(/\/inicio/);
  const casos: [string, RegExp][] = [
    ["/ministerios", /\/lider\/equipe$/],
    ["/ministerios/1", /\/lider\/equipe\?ministerio=1&aba=membros$/],
    ["/eventos", /\/lider\/cultos$/],
    ["/eventos?mes=2026-12", /\/lider\/cultos\?mes=2026-12$/],
    ["/agenda/trocas", /\/lider\/escalar$/],
    ["/escalas", /\/lider\/escalar$/],
    ["/escalas/1/1", /\/lider\/cultos\/1$/],
  ];
  for (const [de, para] of casos) {
    await admin.goto(de);
    await expect(admin, de).toHaveURL(para);
  }
});

test("Perfil tem Tema e Meus pontos e medalhas", async ({ browser }) => {
  const admin = await entrar(browser);
  await admin.goto("/perfil");
  await expect(admin.getByRole("group", { name: "Tema" }).getByRole("button", { name: "Escuro" })).toBeVisible();
  await admin.getByRole("link", { name: /Meus pontos e medalhas/ }).click();
  await expect(admin).toHaveURL(/\/reconhecimento/);
});
