import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { linkConviteDoMinisterio } from "./ajuda-equipe";

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
  admin.once("dialog", (d) => d.accept());
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

  // 4. Convite pessoal: nome e sobrenome, folha nativa de compartilhar e, sem ela, WhatsApp + cópia.
  await admin.addInitScript(() => {
    (window as unknown as { __compartilhado: unknown[] }).__compartilhado = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (dados: unknown) => {
        (window as unknown as { __compartilhado: unknown[] }).__compartilhado.push(dados);
      },
    });
  });
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  await admin.getByLabel("Nome", { exact: true }).fill("Carla");
  await admin.getByLabel("Sobrenome").fill("Beta");
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  await expect(admin).toHaveURL(/\/lider\/equipe\?.*aba=membros.*acesso=[0-9a-f]{64}/);
  const linkPessoal = await admin.getByLabel("Link do convite").inputValue();
  expect(linkPessoal).toMatch(/\/acesso\/[0-9a-f]{64}$/);
  await admin.reload();
  await admin.getByRole("button", { name: "Compartilhar" }).click();
  const enviados = await admin.evaluate(() => (window as unknown as { __compartilhado: unknown[] }).__compartilhado);
  expect(enviados).toEqual([{ title: "Servio", text: "Olá, Carla! Seu link de acesso ao Servio:", url: linkPessoal }]);
  await print(admin, "convite-pessoal");

  const semShare = await novaPagina(browser);
  await semShare.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: undefined }));
  await semShare.context().addCookies(await admin.context().cookies());
  await semShare.goto(admin.url());
  const wa = semShare.getByRole("link", { name: "Enviar por WhatsApp" });
  await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*Carla.*%2Facesso%2F[0-9a-f]{64}$/);
  expect(decodeURIComponent((await wa.getAttribute("href")) ?? "")).not.toMatch(/Alfa|ministério|igreja/i);
  await expect(semShare.getByRole("button", { name: "Copiar link" })).toBeVisible();
  await semShare.close();
  const linkLegado = await linkConviteDoMinisterio(admin, idMinisterio!);

  // 5. Voluntária usa o convite e pede entrada.
  const voluntaria = await novaPagina(browser);
  await voluntaria.goto(linkLegado);
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

  // 8. Pedidos de acesso e aparelhos: Carla entra, abre o link em outro aparelho e o líder decide.
  const carla = await novaPagina(browser);
  await carla.goto(new URL(linkPessoal).pathname);
  await carla.getByRole("checkbox").check();
  await carla.getByRole("button", { name: "Entrar" }).click();
  await expect(carla.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  const novoAparelho = await novaPagina(browser);
  await novoAparelho.goto(new URL(linkPessoal).pathname);
  await novoAparelho.getByRole("button", { name: "Sim, sou eu" }).click();
  await expect(novoAparelho.getByRole("heading", { name: "Aguardando o líder" })).toBeVisible();

  const outra = await novaPagina(browser);
  await outra.goto(new URL(linkPessoal).pathname);
  await outra.getByRole("link", { name: "Não sou" }).click();
  await outra.getByLabel("Nome", { exact: true }).fill("Davi");
  await outra.getByLabel("Sobrenome").fill("Gama");
  await outra.getByRole("button", { name: /Pedir/ }).click();
  await expect(outra.getByRole("heading", { name: "Pedido enviado ao líder" })).toBeVisible();

  await admin.goto(`/lider/equipe?ministerio=${idMinisterio}&aba=membros`);
  await expect(admin.getByText("Aparelho novo para Carla Beta")).toBeVisible();
  await expect(admin.getByText("Pediu um convite (abriu o link de Carla Beta)")).toBeVisible();
  await print(admin, "pedidos-de-acesso");

  // Aprovar: o aparelho novo entra sozinho.
  await admin.getByRole("button", { name: "Aprovar aparelho de Carla Beta" }).click();
  await expect(admin.getByText("Aparelho novo para Carla Beta")).toHaveCount(0);
  await expect(novoAparelho).toHaveURL(/\/inicio/, { timeout: 15_000 });

  // Gerar convite de um pedido: o formulário vem preenchido e o pedido some da lista.
  await admin.getByRole("link", { name: "Gerar convite" }).first().click();
  await expect(admin.getByLabel("Nome", { exact: true })).toHaveValue("Davi");
  await expect(admin.getByLabel("Sobrenome")).toHaveValue("Gama");
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  await expect(admin.getByLabel("Link do convite")).toHaveValue(/\/acesso\/[0-9a-f]{64}$/);
  await expect(admin.getByText("Pediu um convite")).toHaveCount(0);

  // Aparelhos da Carla: dois (o primeiro e o aprovado); revogar tira da lista e derruba a sessão.
  await admin.getByRole("button", { name: /Carla Beta/ }).click();
  await admin.getByText("Aparelhos (2)").click();
  await print(admin, "aparelhos");
  await admin.getByRole("button", { name: /Revogar .* de Carla Beta/ }).first().click();
  await expect(admin.getByText("Aparelhos (1)")).toBeVisible();

  // Gerar link de acesso para um membro que já existe.
  await admin.getByRole("button", { name: "Gerar link de acesso" }).click();
  await expect(admin.getByLabel("Link do convite")).toHaveValue(/\/acesso\/[0-9a-f]{64}$/);
});
