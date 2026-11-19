import { expect, test, type Page } from "@playwright/test";

// Roda depois de fluxo-principal.spec.ts (cria a igreja e o admin). Cria o próprio tipo para não mexer no de outras specs.
const SENHA = "senha-e2e-12345";
const NOME = "Tipo Editar E2E";

const dataEmDias = (dias: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + dias * 24 * 60 * 60 * 1000));

async function entrarAdmin(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("admin@e2e.local");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

test("admin define data limite, muda o horário e exclui o tipo de culto", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await entrarAdmin(admin);

  // Culto semanal começando em 3 dias: ocorrências em +3, +10, +17 ... dias.
  await admin.goto("/eventos/novo");
  await admin.getByLabel("Título").fill(NOME);
  await admin.getByLabel("Data (do primeiro culto)").fill(dataEmDias(3));
  await admin.getByLabel("Início").fill("17:00");
  await admin.getByLabel("Repetir toda semana").check();
  await admin.getByRole("button", { name: "Salvar" }).click();
  await expect(admin).toHaveURL(/\/lider\/cultos/);

  const abrirTipo = async () => {
    await admin.goto("/lider/tipos");
    await admin.getByRole("link", { name: new RegExp(`^${NOME} .*17:00`) }).click();
  };

  // Data limite: some tudo depois de +4 dias, fica só o primeiro culto (+3).
  await abrirTipo();
  const limite = dataEmDias(4);
  await admin.getByLabel("Repete até (opcional)").fill(limite);
  await admin.getByRole("button", { name: "Salvar data limite" }).click();
  await expect(admin.getByRole("alertdialog", { name: "Confirmar data limite" })).toContainText("serão removidos");
  await admin.getByRole("button", { name: "Sim, remover" }).click();
  await expect(admin.getByText("Data limite salva")).toBeVisible();
  const [ano, mes, dia] = limite.split("-");
  await expect(admin.getByText(new RegExp(`até ${dia}/${mes}/${ano}`))).toBeVisible();

  const proximoMes = dataEmDias(17).slice(0, 7);
  await admin.goto(`/lider/cultos?mes=${proximoMes}`);
  await expect(admin.getByRole("link", { name: new RegExp(NOME) })).toHaveCount(
    dataEmDias(17).slice(0, 7) === dataEmDias(3).slice(0, 7) ? 1 : 0,
  );

  // Horário: o eyebrow do cabeçalho mostra o novo horário.
  await abrirTipo();
  await admin.getByLabel("Início").fill("18:30");
  await admin.getByLabel("Fim (opcional)").fill("20:00");
  await admin.getByRole("button", { name: "Salvar horário" }).click();
  await expect(admin.getByText("Horário salvo")).toBeVisible();
  await admin.goto("/lider/tipos");
  await admin.getByRole("link", { name: new RegExp(`^${NOME} .*18:30–20:00`) }).click();
  await expect(admin.getByText(/18:30–20:00, até /)).toBeVisible();

  // Excluir: volta para a lista sem o tipo.
  await admin.getByRole("button", { name: "Excluir tipo de culto" }).click();
  await admin.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(admin).toHaveURL(/\/lider\/tipos$/);
  await expect(admin.getByRole("link", { name: new RegExp(`^${NOME}`) })).toHaveCount(0);
});
