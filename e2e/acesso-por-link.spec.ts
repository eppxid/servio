import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const SENHA = "senha-e2e-12345";
const URL_BANCO = `postgres://postgres:postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? "54329"}/postgres?max=1`;
const CELULAR = { width: 390, height: 844 };
/** Pasta dos prints do uso real; sem a variável, o teste não grava prints. */
const PRINTS = process.env.PRINTS_047;

const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_WHATSAPP = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.10";

async function print(pagina: Page, nome: string) {
  if (!PRINTS) return;
  await pagina.waitForTimeout(500);
  await pagina.screenshot({ path: `${PRINTS}/${nome}.png` });
}

/** Um aparelho = um contexto (cookies próprios) com o user agent dele. */
async function aparelho(browser: Browser, userAgent?: string): Promise<Page> {
  return (await browser.newContext({ viewport: CELULAR, deviceScaleFactor: 2, userAgent })).newPage();
}

/**
 * Roda antes de `fluxo-principal.spec.ts` (ordem alfabética, 1 worker), que espera o banco vazio.
 * Se este teste criou a igreja, apaga tudo no fim para devolver o banco limpo.
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

test("acesso por link de ponta a ponta: convite, aparelho novo, outra pessoa, revogação e instalação", async ({ browser }) => {
  // 1. Líder (admin) entra, ou cria a igreja se o banco está vazio.
  const lider = await aparelho(browser);
  await lider.goto("/entrar");
  if (/\/primeiro-acesso/.test(lider.url())) {
    igrejaCriadaAqui = true;
    await lider.getByLabel("Nome da igreja").fill("Igreja Acesso E2E");
    await lider.getByLabel("Seu nome").fill("Admin E2E");
    await lider.getByLabel("E-mail").fill("admin@e2e.local");
    await lider.getByLabel("Senha", { exact: true }).fill(SENHA);
    await lider.getByRole("checkbox").check();
    await lider.getByRole("button", { name: "Criar" }).click();
    await expect(lider).toHaveURL(/\/lider\/configurar/);
  } else {
    await lider.getByLabel("E-mail").fill("admin@e2e.local");
    await lider.getByLabel("Senha", { exact: true }).fill(SENHA);
    await lider.getByRole("button", { name: "Entrar" }).click();
    await expect(lider).not.toHaveURL(/\/entrar/);
  }
  await lider.goto("/lider/equipe?aba=ministerios");
  await lider.getByLabel("Nome do novo ministério").fill("Recepção Link");
  await lider.getByRole("button", { name: "Criar ministério" }).click();
  await expect(lider.locator("summary", { hasText: "Recepção Link" })).toBeVisible();

  // 2. Líder gera o convite pessoal e lê o link exibido.
  await lider.getByRole("link", { name: "Membros", exact: true }).click();
  await lider.getByLabel("Nome", { exact: true }).fill("Helena");
  await lider.getByLabel("Sobrenome").fill("Prado");
  await lider.getByRole("button", { name: "Gerar convite" }).click();
  const link = new URL(await lider.getByLabel("Link do convite").inputValue()).pathname;
  expect(link).toMatch(/^\/acesso\/[0-9a-f]{64}$/);
  await print(lider, "01-lider-convite");

  // 3. Aparelho A (Android): instrução de instalação, consentimento, boas-vindas e /inicio.
  const a = await aparelho(browser, UA_ANDROID);
  await a.goto(link);
  await expect(a.getByRole("heading", { name: "Olá, Helena!" })).toBeVisible();
  await expect(a.getByText("Abra no Chrome.")).toBeVisible();
  await print(a, "02-voluntaria-primeiro-uso");
  await a.getByRole("checkbox").check();
  await a.getByRole("button", { name: "Entrar" }).click();
  await expect(a.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();
  await a.getByRole("link", { name: "Continuar" }).click();
  await a.goto("/inicio");
  await expect(a).toHaveURL(/\/inicio/);
  await print(a, "03-voluntaria-inicio");

  // 4. Aparelho B (iPhone): instrução do Safari, "Sim, sou eu" e espera.
  const b = await aparelho(browser, UA_IPHONE);
  await b.goto(link);
  await expect(b.getByRole("heading", { name: "Você é Helena Prado?" })).toBeVisible();
  await print(b, "04-aparelho-novo-pergunta");
  await b.getByRole("button", { name: "Sim, sou eu" }).click();
  await expect(b.getByRole("heading", { name: "Aguardando o líder" })).toBeVisible();
  await expect(b.getByText("Abra no Safari.")).toBeVisible();
  await print(b, "05-aparelho-novo-espera");

  // 5. Pessoa C: "Não sou", nome e sobrenome.
  const c = await aparelho(browser);
  await c.goto(link);
  await c.getByRole("link", { name: "Não sou" }).click();
  await c.getByLabel("Nome", { exact: true }).fill("Davi");
  await c.getByLabel("Sobrenome").fill("Gama");
  await c.getByRole("button", { name: /Pedir/ }).click();
  await expect(c.getByText("Pedido enviado ao líder")).toBeVisible();

  // 6. Navegador interno do WhatsApp: aviso para abrir no Chrome, sem formulário.
  const zap = await aparelho(browser, UA_WHATSAPP);
  await zap.goto(link);
  await expect(zap.getByRole("heading", { name: "Abra em outro navegador" })).toBeVisible();
  await expect(zap.getByText(/Abra este link no Chrome/)).toBeVisible();
  await expect(zap.getByRole("button", { name: "Sim, sou eu" })).toHaveCount(0);
  await print(zap, "06-navegador-whatsapp");

  // 7. Líder vê os dois pedidos e aprova o aparelho: B entra sozinho.
  await lider.goto("/lider/equipe?aba=membros");
  await expect(lider.getByText("Aparelho novo para Helena Prado")).toBeVisible();
  await expect(lider.getByText("Pediu um convite (abriu o link de Helena Prado)")).toBeVisible();
  await print(lider, "07-lider-pedidos");
  await lider.getByRole("button", { name: "Aprovar aparelho de Helena Prado" }).click();
  await expect(lider.getByText("Aparelho novo para Helena Prado")).toHaveCount(0);
  await expect(b).toHaveURL(/\/inicio/, { timeout: 15_000 });
  await print(b, "08-aparelho-novo-entrou");

  // 8. Líder gera o convite do pedido de C: formulário preenchido; C entra com o link novo.
  await lider.getByRole("link", { name: "Gerar convite" }).first().click();
  await expect(lider.getByLabel("Nome", { exact: true })).toHaveValue("Davi");
  await expect(lider.getByLabel("Sobrenome")).toHaveValue("Gama");
  await lider.getByRole("button", { name: "Gerar convite" }).click();
  const linkDavi = new URL(await lider.getByLabel("Link do convite").inputValue()).pathname;
  expect(linkDavi).not.toBe(link);
  await c.goto(linkDavi);
  await expect(c.getByRole("heading", { name: "Olá, Davi!" })).toBeVisible();
  await c.getByRole("checkbox").check();
  await c.getByRole("button", { name: "Entrar" }).click();
  await expect(c.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  // 9. Líder revoga o aparelho B: a próxima navegação de B cai em /entrar; A continua dentro.
  await lider.goto("/lider/equipe?aba=membros");
  await lider.getByRole("button", { name: /Helena Prado/ }).click();
  await lider.getByText("Aparelhos (2)").click();
  await lider.getByRole("button", { name: /Revogar iPhone.* de Helena Prado/ }).click();
  await expect(lider.getByText("Aparelhos (1)")).toBeVisible();
  await b.goto("/agenda");
  await expect(b).toHaveURL(/\/entrar/);
  await expect(b.getByText("Recebeu um link do líder?")).toBeVisible();
  await print(b, "09-aparelho-revogado-entrar");
  await a.goto("/agenda");
  await expect(a).not.toHaveURL(/\/entrar/);

  // 10. Sair revoga o aparelho atual: sem o cookie, nada reabre a sessão sozinho.
  await a.goto("/perfil");
  await a.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(a).toHaveURL(/\/entrar/);
  await a.goto("/agenda");
  await expect(a).toHaveURL(/\/entrar/);
});
