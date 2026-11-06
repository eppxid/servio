import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const SENHA = "senha-e2e-12345";
const PRINTS = "ESPECS/prints-021";

// Roda depois de fluxo-principal.spec.ts (ordem alfabética, 1 worker): a igreja e o admin
// admin@e2e.local já existem, e o assistente abre em /lider/configurar como na produção.
test("assistente guiado: Mídia + culto com vagas + convite; convidado escolhe Iluminação", async ({
  browser,
}) => {
  mkdirSync(PRINTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await ctx.newPage();
  await admin.goto("/entrar");
  await admin.getByLabel("E-mail").fill("admin@e2e.local");
  await admin.getByLabel("Senha", { exact: true }).fill(SENHA);
  await admin.getByRole("button", { name: "Entrar" }).click();
  await expect(admin).not.toHaveURL(/\/entrar/);

  // Passo 1: ministério e funções.
  await admin.goto("/lider/configurar");
  await expect(admin.getByText("Passo 1 de 3")).toBeVisible();
  await admin.getByLabel("Nome do ministério").fill("Mídia");
  for (const f of ["Projeção", "Transmissão", "Iluminação"]) {
    await admin.getByRole("button", { name: f, exact: true }).click();
  }
  await admin.screenshot({ path: `${PRINTS}/cel-passo-1-ministerio.png` });
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();

  // Passo 2: tipo de culto com vagas por função.
  await expect(admin.getByText("Passo 2 de 3")).toBeVisible();
  const ministerioId = new URL(admin.url()).searchParams.get("m");
  await admin.getByLabel("Nome do culto").fill("Culto de domingo 18h");
  await admin.getByLabel("Quantidade de Projeção").fill("2");
  await admin.getByLabel("Quantidade de Transmissão").fill("1");
  await admin.getByLabel("Quantidade de Iluminação").fill("1");
  await admin.screenshot({ path: `${PRINTS}/cel-passo-2-cultos.png` });
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();

  // Passo 3: link do convite e botão do WhatsApp.
  await expect(admin.getByText("Passo 3 de 3")).toBeVisible();
  await admin.getByRole("button", { name: "Gerar link do convite" }).click();
  await expect(admin.getByRole("link", { name: "Enviar no WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=.*%2Fconvite%2F[0-9a-f]{64}/,
  );
  await admin.screenshot({ path: `${PRINTS}/cel-passo-3-convidar.png` });
  const link = await admin.getByLabel("Link do convite").inputValue();

  // Convidado cria a conta, escolhe Iluminação e envia o pedido.
  const conv = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await conv.goto(new URL(link).pathname);
  await conv.getByLabel("Nome", { exact: true }).fill("Convidado Guiado");
  await conv.getByLabel("E-mail").fill("guiado@e2e.local");
  await conv.getByLabel("Senha", { exact: true }).fill(SENHA);
  await conv.getByRole("checkbox").check();
  await conv.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await expect(conv.getByRole("heading", { name: "Escolha onde quer servir" })).toBeVisible();
  await conv.getByRole("checkbox", { name: "Iluminação" }).check();
  await conv.screenshot({ path: `${PRINTS}/cel-convite-funcoes.png` });
  await conv.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(conv.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();

  // O admin vê o pedido pendente. O status `desejada` da função fica coberto nos testes de src/lib/servir
  // (o PGlite aceita uma conexão só, então o e2e não consulta o banco).
  await admin.goto(`/ministerios/${ministerioId}`);
  await expect(admin.getByRole("heading", { name: "Pendentes (1)" })).toBeVisible();
  await expect(admin.getByText("guiado@e2e.local")).toBeVisible();
});
