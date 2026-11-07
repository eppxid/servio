import { expect, test, type Browser, type Page } from "@playwright/test";

// Roda depois de lider-tipo-renomear.spec.ts (ordem alfabética): usa o admin e o líder do Louvor já criados.
const SENHA = "senha-e2e-12345";

async function entrar(browser: Browser, email: string): Promise<Page> {
  const pagina = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha").fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).not.toHaveURL(/\/entrar/);
  return pagina;
}

function dataEmDias(dias: number) {
  const d = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function novoCulto(pagina: Page, titulo: string, data: string, hora: string, repete: boolean) {
  await pagina.goto("/eventos/novo");
  await pagina.getByLabel("Título").fill(titulo);
  await pagina.getByLabel("Data (do primeiro culto)").fill(data);
  await pagina.getByLabel("Início").fill(hora);
  if (repete) await pagina.getByLabel("Repetir toda semana").check();
  await pagina.getByRole("button", { name: "Salvar" }).click();
  await expect(pagina).toHaveURL(/\/eventos/);
}

test("assistente não salva o tipo de culto com todas as vagas em 0", async ({ browser }) => {
  const admin = await entrar(browser, "admin@e2e.local");
  await admin.goto("/lider/configurar?passo=2");
  const campos = admin.getByLabel(/^Quantidade de /);
  const n = await campos.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(campos.nth(i)).toHaveValue("1");
  for (let i = 0; i < n; i++) await campos.nth(i).fill("0");
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(admin.getByText("Defina pelo menos 1 vaga.")).toBeVisible();
  await expect(admin).toHaveURL(/passo=2/);
});

test("culto avulso: copiar de tipo sem vagas avisa com link; 'Definir aqui' cria 0/2 em rascunho", async ({ browser }) => {
  const admin = await entrar(browser, "admin@e2e.local");
  // Um tipo de culto sem vagas (série) e um culto avulso.
  await novoCulto(admin, "Tipo sem vagas E2E", dataEmDias(60), "17:00", true);
  await novoCulto(admin, "Avulso vagas E2E", dataEmDias(45), "16:00", false);

  const lider = await entrar(browser, "lider@e2e.local");
  await admin.goto(`/eventos?mes=${dataEmDias(45).slice(0, 7)}`);
  const href = await admin.getByRole("link", { name: /Avulso vagas E2E/ }).getAttribute("href");
  await lider.goto(`/lider/cultos/${href!.split("/").pop()}`);
  await expect(lider.getByText(/não tem vagas para Louvor E2E/).first()).toBeVisible();

  // Copiar de um tipo sem vagas: mensagem e link, sem criar nada.
  const tipo = lider.locator("select[name=tipo]");
  const opcao = tipo.locator("option", { hasText: "17:00" }).first();
  await expect(opcao).toContainText("0 vagas");
  await tipo.selectOption(await opcao.getAttribute("value") ?? "");
  await lider.getByRole("button", { name: "Copiar vagas deste tipo" }).click();
  await expect(lider.getByRole("alert").filter({ hasText: "não tem vagas para" })).toBeVisible();
  await expect(lider.getByRole("link", { name: "Definir vagas do tipo" })).toBeVisible();

  // Definir aqui: 2 vagas de Vocal só neste culto.
  await lider.getByRole("button", { name: "Mais uma vaga de Vocal" }).click();
  await lider.getByRole("button", { name: "Mais uma vaga de Vocal" }).click();
  await lider.getByRole("button", { name: "Salvar vagas de Louvor E2E" }).click();
  await expect(lider.getByText("0/2 vagas · Rascunho")).toBeVisible();
});
