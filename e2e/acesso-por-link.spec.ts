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

test("admin convida administrador e promove membro: e-mail e senha antes de entrar", async ({ browser }) => {
  // 1. Admin entra (a igreja vem do teste anterior ou é criada agora) e abre um ministério.
  const admin = await aparelho(browser);
  await admin.goto("/entrar");
  if (/\/primeiro-acesso/.test(admin.url())) {
    igrejaCriadaAqui = true;
    await admin.getByLabel("Nome da igreja").fill("Igreja Acesso E2E");
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
  await admin.goto("/lider/equipe?aba=ministerios");
  await admin.getByLabel("Nome do novo ministério").fill("Mídia Convite");
  await admin.getByRole("button", { name: "Criar ministério" }).click();
  await expect(admin.locator("summary", { hasText: "Mídia Convite" })).toBeVisible();
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  await expect(admin).toHaveURL(/aba=membros/);
  const equipe = admin.url();
  const convidar = async (nome: string, papel: string) => {
    await admin.goto(equipe);
    await admin.getByLabel("Nome", { exact: true }).fill(nome);
    await admin.getByLabel("Sobrenome").fill("Prado");
    await admin.getByLabel("Papel").selectOption({ label: papel });
    await admin.getByRole("button", { name: "Gerar convite" }).click();
    await expect(admin.getByLabel("Link do convite")).toHaveValue(/\/acesso\/[0-9a-f]{64}$/);
    return new URL(await admin.getByLabel("Link do convite").inputValue()).pathname;
  };

  // 2. Convite de administrador: o link gerado leva o selo Admin.
  const linkAdmin = await convidar("Joana", "Administrador");
  await expect(admin.getByText("Convite para Joana").getByText("Admin")).toBeVisible();

  // 3. A pessoa consente, define e-mail e senha e entra.
  const joana = await aparelho(browser, UA_ANDROID);
  await joana.goto(linkAdmin);
  await expect(joana.getByText("Defina e-mail e senha de administrador.")).toBeVisible();
  await joana.getByRole("checkbox").check();
  await joana.getByLabel("E-mail").fill("admin@e2e.local");
  await joana.getByLabel("Senha", { exact: true }).fill(SENHA);
  await joana.getByRole("button", { name: "Entrar" }).click();
  await expect(joana.getByText("Este e-mail já está em uso.")).toBeVisible();
  await joana.getByRole("checkbox").check();
  await joana.getByLabel("E-mail").fill("joana@e2e.local");
  await joana.getByLabel("Senha", { exact: true }).fill(SENHA);
  await joana.getByRole("button", { name: "Entrar" }).click();
  await expect(joana.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  // 4. Entra com o modo líder e vê o selo Admin na Equipe.
  await joana.goto(equipe);
  await expect(joana.getByRole("switch", { name: "Modo líder" })).toBeVisible();
  await expect(joana.getByRole("button", { name: /Joana Prado/ })).toContainText("Admin");

  // 5. A senha definida abre a conta em outro aparelho.
  const senhaJoana = await aparelho(browser);
  await senhaJoana.goto("/entrar");
  await senhaJoana.getByLabel("E-mail").fill("joana@e2e.local");
  await senhaJoana.getByLabel("Senha", { exact: true }).fill(SENHA);
  await senhaJoana.getByRole("button", { name: "Entrar" }).click();
  await expect(senhaJoana).not.toHaveURL(/\/entrar/);

  // 6. Voluntário promovido na ficha: no próximo acesso define e-mail e senha.
  const linkRui = await convidar("Rui", "Voluntário");
  const rui = await aparelho(browser);
  await rui.goto(linkRui);
  await rui.getByRole("checkbox").check();
  await rui.getByRole("button", { name: "Entrar" }).click();
  await expect(rui.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  await admin.goto(equipe);
  await admin.getByRole("button", { name: /Rui Prado/ }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Tornar administrador" }).click();
  await expect(admin.getByRole("button", { name: /Rui Prado/ })).toContainText("Admin");

  await rui.goto("/inicio");
  await expect(rui).toHaveURL(/\/convite\/trocar-senha/);
  await expect(rui.getByRole("heading", { name: "Defina e-mail e senha de administrador" })).toBeVisible();
  await rui.getByLabel("E-mail").fill("rui@e2e.local");
  await rui.getByLabel("Senha", { exact: true }).fill(SENHA);
  await rui.getByRole("button", { name: "Salvar" }).click();
  await expect(rui).not.toHaveURL(/\/convite\/trocar-senha/);
  await rui.goto("/inicio");
  await expect(rui).toHaveURL(/\/inicio/);

  // 7. Tirar de administrador: o selo some.
  await admin.goto(equipe);
  await admin.getByRole("button", { name: /Rui Prado/ }).click();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Tirar de administrador" }).click();
  await expect(admin.getByRole("button", { name: /Rui Prado/ })).not.toContainText("Admin");
});
