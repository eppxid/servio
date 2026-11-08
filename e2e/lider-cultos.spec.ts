import { selecionarMinisterio } from "./ajuda-equipe";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Roda depois de fluxo-principal.spec.ts (ordem alfabética), que cria a igreja, o líder e o voluntário com Vocal.
const SENHA = "senha-e2e-12345";

test.use({ viewport: { width: 390, height: 844 } });

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

test("líder define o modelo 2+1+1, vê Louvor 0/4 no calendário, preenche uma vaga e publica", async ({ browser }) => {
  // 1. Admin cria as funções Violão e Teclado e um culto semanal (o tipo de culto).
  const admin = await entrar(browser, "admin@e2e.local");
  await admin.goto("/lider/equipe?aba=ministerios");
  await selecionarMinisterio(admin, "Louvor E2E");
  await admin.getByRole("link", { name: "Funções", exact: true }).click();
  for (const nome of ["Violão", "Teclado"]) {
    await admin.getByLabel("Nova função").fill(nome);
    await admin.getByRole("button", { name: "Adicionar" }).click();
    await expect(admin.getByLabel(`Nome da função ${nome}`)).toBeVisible();
  }
  const data = dataEmDias(14);
  await admin.goto("/eventos/novo");
  await admin.getByLabel("Título").fill("Culto semanal E2E");
  await admin.getByLabel("Data (do primeiro culto)").fill(data);
  await admin.getByLabel("Início").fill("18:00");
  await admin.getByLabel("Repetir toda semana").check();
  await admin.getByRole("button", { name: "Salvar" }).click();
  await expect(admin).toHaveURL(/\/lider\/cultos/);

  // 2. Líder abre o tipo de culto e define 2 Vocal + 1 Violão + 1 Teclado.
  const lider = await entrar(browser, "lider@e2e.local");
  await lider.goto("/lider/tipos");
  const diaDoCulto = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(
    new Date(`${data}T12:00:00-03:00`),
  );
  await lider.getByRole("link", { name: new RegExp(`^Culto semanal E2E ${diaDoCulto}, 18:00`) }).click();
  const mais = (funcao: string) => lider.getByRole("button", { name: `Mais uma vaga de ${funcao}` });
  await mais("Vocal").click();
  await mais("Vocal").click();
  await mais("Violão").click();
  await mais("Teclado").click();
  await lider.getByRole("button", { name: "Salvar vagas de Louvor E2E" }).click();
  await expect(lider.getByText("Vagas salvas")).toBeVisible();

  const culto = lider.getByRole("link", { name: /Culto semanal E2E/ });

  // 3. O calendário do mês mostra Louvor 0/4 no dia do culto.
  await lider.goto(`/lider/cultos?mes=${data.slice(0, 7)}`);
  await lider.getByRole("button", { name: /0 de 4 vagas/ }).first().click();
  await expect(culto.getByText("Louvor E2E 0/4")).toBeVisible();

  // 4. Tela do culto: escolhe o voluntário para o Vocal (as vagas de função sem candidato ficam abertas).
  await culto.click();
  await expect(lider.getByRole("heading", { name: "Louvor E2E" })).toBeVisible();
  await lider.getByRole("group", { name: "Vocal" }).getByRole("button", { name: "Escolher" }).first().click();
  await lider.getByRole("button", { name: /Voluntario E2E/ }).click();
  await expect(lider.getByText("1/4", { exact: true })).toBeVisible();
  await expect(lider.getByRole("group", { name: "Vocal" }).getByText("Voluntario E2E")).toBeVisible();

  // 5. Publica; o calendário passa a mostrar 1/4.
  await lider.getByRole("button", { name: "Publicar escala" }).click();
  await expect(lider.getByText("Publicada", { exact: true })).toBeVisible();
  await lider.goto(`/lider/cultos?mes=${data.slice(0, 7)}`);
  await lider.getByRole("button", { name: /1 de 4 vagas/ }).first().click();
  await expect(culto.getByText("Louvor E2E 1/4")).toBeVisible();
});
