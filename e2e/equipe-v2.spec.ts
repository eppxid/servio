import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const SENHA = "senha-e2e-12345";
const URL_BANCO = `postgres://postgres:postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? "54329"}/postgres?max=1`;
const CELULAR = { width: 390, height: 844 };
/** Pasta dos prints (`docs/prints`); sem a variável, o teste não grava prints. */
const PRINTS = process.env.PRINTS_033;

async function print(pagina: Page, nome: string) {
  if (!PRINTS) return;
  await pagina.waitForTimeout(500);
  await pagina.screenshot({ path: `${PRINTS}/033-${nome}.png` });
}

async function novaPagina(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: CELULAR, deviceScaleFactor: 2 })).newPage();
}

/**
 * Este arquivo roda antes de `fluxo-principal.spec.ts` (ordem alfabética, 1 worker), que espera o
 * banco vazio. Se a igreja não existe, o teste cria uma e, no fim, apaga tudo para devolver o banco limpo.
 */
let igrejaCriadaAqui = false;

test.afterAll(async () => {
  if (!igrejaCriadaAqui) return;
  await new Promise((r) => setTimeout(r, 2500)); // o PGlite aceita uma conexão: espera o app soltar a dele
  const sql = postgres(URL_BANCO, { max: 1 });
  try {
    await sql`truncate table igrejas restart identity cascade`;
  } finally {
    await sql.end();
  }
});

test("líder gere a equipe inteira na aba Equipe; admin cria e arquiva ministério ali", async ({ browser }) => {
  // 1. Admin entra (ou cria a igreja, se o banco está vazio).
  const admin = await novaPagina(browser);
  await admin.goto("/entrar");
  if (/\/primeiro-acesso/.test(admin.url())) {
    igrejaCriadaAqui = true;
    await admin.getByLabel("Nome da igreja").fill("Igreja E2E");
    await admin.getByLabel("Seu nome").fill("Admin E2E");
    await admin.getByLabel("E-mail").fill("admin@e2e.local");
    await admin.getByLabel("Senha", { exact: true }).fill(SENHA);
    await admin.getByRole("checkbox").check();
    await admin.getByRole("button", { name: "Criar" }).click();
    await expect(admin).toHaveURL(/\/lider\/configurar/);
  } else {
    await admin.getByLabel("E-mail").fill("admin@e2e.local");
    await admin.getByLabel("Senha", { exact: true }).fill(SENHA);
    await admin.getByRole("button", { name: "Entrar" }).click();
    await expect(admin).not.toHaveURL(/\/entrar/);
  }

  // 2. Admin cria dois ministérios na aba Ministérios e arquiva um.
  await admin.goto("/lider/equipe?aba=ministerios");
  for (const nome of ["Equipe Alfa", "Equipe Descartável"]) {
    await admin.getByLabel("Nome do novo ministério").fill(nome);
    await admin.getByRole("button", { name: "Criar ministério" }).click();
    await expect(admin.getByText(nome, { exact: true }).first()).toBeVisible();
  }
  await print(admin, "ministerios");
  await admin.locator("summary", { hasText: "Equipe Descartável" }).click();
  await admin.getByRole("button", { name: "Arquivar Equipe Descartável" }).click();
  await expect(admin.getByText("Equipe Descartável", { exact: true })).toHaveCount(0);

  // 3. Funções: adicionar, renomear e excluir.
  await admin.getByRole("link", { name: "Funções", exact: true }).click();
  await expect(admin).toHaveURL(/aba=funcoes/);
  const idMinisterio = new URL(admin.url()).searchParams.get("ministerio");
  expect(idMinisterio).toBeTruthy();
  for (const nome of ["Iluminação", "Descartada"]) {
    await admin.getByLabel("Nova função").fill(nome);
    await admin.getByRole("button", { name: "Adicionar" }).click();
    await expect(admin.getByLabel(`Nome da função ${nome}`)).toBeVisible();
  }
  await admin.getByLabel("Nome da função Iluminação").fill("Luz e projeção");
  await admin.getByRole("button", { name: "Salvar Iluminação" }).click();
  await expect(admin.getByLabel("Nome da função Luz e projeção")).toBeVisible();
  await admin.getByRole("button", { name: "Excluir Descartada" }).click();
  await expect(admin.getByLabel("Nome da função Descartada")).toHaveCount(0);
  await print(admin, "funcoes");

  // 4. Convite: gerar e copiar o link sem sair da Equipe.
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  await expect(admin).toHaveURL(/\/lider\/equipe\?.*aba=membros.*convite=[0-9a-f]{64}/);
  const link = await admin.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/convite\/[0-9a-f]{64}$/);

  // 5. Voluntária usa o convite e pede entrada.
  const voluntaria = await novaPagina(browser);
  await voluntaria.goto(link);
  await voluntaria.getByLabel("Nome", { exact: true }).fill("Ana Alfa");
  await voluntaria.getByLabel("E-mail").fill("ana-alfa@e2e.local");
  await voluntaria.getByLabel("Senha", { exact: true }).fill(SENHA);
  await voluntaria.getByRole("checkbox").check();
  await voluntaria.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await voluntaria.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(voluntaria.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();

  // 6. Líder vê o pedido na aba Pedidos e aprova a entrada.
  await admin.goto(`/lider/equipe?ministerio=${idMinisterio}`);
  await expect(admin.getByRole("link", { name: /Pedidos/ })).toContainText("1");
  await expect(admin.getByText("Quer entrar no ministério")).toBeVisible();
  await print(admin, "pedidos");
  await admin.getByRole("button", { name: "Aprovar entrada de Ana Alfa" }).click();
  await expect(admin.getByText("Quer entrar no ministério")).toHaveCount(0);

  // Acesso negado: voluntária não abre a Equipe do líder.
  await voluntaria.goto("/lider/equipe");
  await expect(voluntaria).toHaveURL(/\/inicio/);

  // 7. Membros: marcar função na folha e definir senha temporária.
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  const linha = admin.getByRole("button", { name: /Ana Alfa/ });
  await expect(linha).toContainText("Sem funções");
  await print(admin, "membros");
  await linha.click();
  await admin.getByLabel("Luz e projeção").check();
  await admin.getByRole("button", { name: "Salvar funções" }).click();
  await expect(admin.getByRole("button", { name: /Ana Alfa/ })).toContainText("Luz e projeção");
  await admin.getByRole("button", { name: /Ana Alfa/ }).click();
  await expect(admin.getByRole("button", { name: "Tirar do ministério" })).toBeVisible();
  await print(admin, "membro-folha");
  await admin.getByLabel("Senha temporária").fill("temporaria-9");
  await admin.getByRole("button", { name: "Definir" }).click();
  await expect(admin.getByText("Senha temporária definida")).toBeVisible();
});
