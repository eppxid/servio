import { expect, test, type Browser, type Page } from "@playwright/test";

// Roda depois de lider-cultos.spec.ts (ordem alfabética: "v2-c…"): usa o admin, o líder de
// Louvor E2E, o voluntário com Vocal e o modelo de vagas que lider-cultos.spec.ts deixa nas séries semanais.
const SENHA = "senha-e2e-12345";
/** Com `GUIA_PRINTS=<pasta>`, grava o print do celular da tela do culto. */
const PRINTS = process.env.GUIA_PRINTS;

async function entrar(browser: Browser, email: string): Promise<Page> {
  const pagina = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
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

test("líder vê as funções agrupadas, escolhe, remove e desfaz, publica e usa os atalhos", async ({ browser }) => {
  // O último culto do mês daqui a 60 dias é de uma série semanal ainda em rascunho.
  const admin = await entrar(browser, "admin@e2e.local");
  await admin.goto(`/lider/cultos?mes=${dataEmDias(60).slice(0, 7)}`);
  const href = await admin.getByRole("link", { name: /Culto semanal E2E/ }).last().getAttribute("href");
  const eventoId = href!.split("/").pop()!;

  const lider = await entrar(browser, "lider@e2e.local");
  await lider.goto(`/lider/cultos/${eventoId}`);

  // Funções agrupadas, cada uma com o contador, e o selo geral no topo.
  const vocal = lider.getByRole("group", { name: "Vocal" });
  await expect(lider.getByRole("heading", { level: 1 })).toHaveText(/^(Dom|Seg|Ter|Qua|Qui|Sex|Sáb), \d{1,2} [a-z]{3}$/);
  await expect(vocal.getByText("0/2")).toBeVisible();
  await expect(lider.getByRole("group", { name: "Violão" })).toBeVisible();
  await expect(lider.getByText("Rascunho", { exact: true })).toBeVisible();
  await expect(lider.getByRole("button", { name: "Publicar escala" })).toHaveCount(0);

  // Escolhe a pessoa: aparece com avatar, status "Aguarda" e o contador sobe.
  await vocal.getByRole("button", { name: "Escolher" }).first().click();
  await expect(lider.getByRole("dialog", { name: /Quem vai na Vocal/ })).toBeVisible();
  await lider.getByRole("button", { name: /Escolher Voluntario E2E/ }).click();
  const linha = vocal.getByRole("button", { name: /Voluntario E2E/ });
  await expect(linha).toContainText("Aguarda");
  await expect(vocal.getByText("1/2")).toBeVisible();
  await expect(lider.getByRole("button", { name: "Publicar escala" })).toBeVisible();

  // Remove pela folha da pessoa e desfaz pelo aviso.
  await linha.click();
  const folha = lider.getByRole("dialog", { name: /Voluntario E2E/ });
  await expect(folha.getByRole("button", { name: "Trocar" })).toBeVisible();
  await folha.getByRole("button", { name: "Remover" }).click();
  await expect(lider.getByRole("status")).toContainText("saiu de Vocal");
  await expect(vocal.getByText("0/2")).toBeVisible();
  await expect(lider.getByRole("button", { name: "Publicar escala" })).toHaveCount(0);
  await lider.getByRole("button", { name: "Desfazer" }).click();
  await expect(vocal.getByRole("button", { name: /Voluntario E2E/ })).toBeVisible();
  await expect(vocal.getByText("1/2")).toBeVisible();

  if (PRINTS) {
    await lider.waitForTimeout(500);
    await lider.screenshot({ path: `${PRINTS}/034-culto.png` });
  }

  // Publica: some o botão, fica o selo "Publicada" (e nenhum botão com esse nome).
  await lider.getByRole("button", { name: "Publicar escala" }).click();
  await expect(lider.getByText("Publicada", { exact: true })).toBeVisible();
  await expect(lider.getByRole("button", { name: "Publicar escala" })).toHaveCount(0);
  await expect(lider.getByRole("button", { name: "Publicada" })).toHaveCount(0);

  // Atalhos no fim da tela.
  await expect(lider.getByRole("link", { name: "Repertório" })).toHaveAttribute("href", new RegExp(`/escalas/${eventoId}/[0-9]+/repertorio$`));
  await lider.getByRole("link", { name: "Chat do culto" }).click();
  await expect(lider).toHaveURL(new RegExp(`/chat/${eventoId}$`));
});
