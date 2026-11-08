import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

const SENHA = "senha-e2e-12345";
const CELULAR = { width: 390, height: 844 };
const PRINTS = "docs/prints";

async function novaPagina(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: CELULAR, deviceScaleFactor: 2 })).newPage();
}

async function aceitarConvite(browser: Browser, link: string, nome: string, email: string) {
  const pagina = await novaPagina(browser);
  await pagina.goto(new URL(link).pathname);
  await pagina.getByLabel("Nome", { exact: true }).fill(nome);
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("checkbox").check();
  await pagina.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await expect(pagina.getByRole("heading", { name: "Escolha onde quer servir" })).toBeVisible();
  await pagina.getByRole("checkbox", { name: "Iluminação" }).check();
  await pagina.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(pagina.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();
  return pagina;
}

/** Primeiro domingo com culto das 18h ainda por vir, em São Paulo (`AAAA-MM-DD`). */
function primeiroDomingo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const horaSp = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  for (let n = 0; n < 8; n++) {
    const iso = fmt.format(new Date(Date.now() + n * 86_400_000));
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 0 && (n > 0 || horaSp < 17)) return iso;
  }
  throw new Error("sem domingo");
}

/** Este spec roda antes dos outros (ordem alfabética): ao final apaga os dados, para o próximo abrir o primeiro acesso. */
test.afterAll(async () => {
  await expect(async () => {
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${process.env.PG_LOCAL_PORT}/postgres`, { max: 1 });
    try {
      const tabelas = await sql`select tablename from pg_tables where schemaname = 'public'`;
      if (tabelas.length > 0) {
        await sql.unsafe(`truncate ${tabelas.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
      }
    } finally {
      await sql.end({ timeout: 2 });
    }
  }).toPass({ timeout: 30_000 });
});

test("Cultos sem Sugerir e com Próximos; Escalar mostra a troca e o líder aprova ali", async ({ browser }) => {
  mkdirSync(PRINTS, { recursive: true });
  const domingo = primeiroDomingo();
  const mes = domingo.slice(0, 7);
  const diaDoDomingo = new RegExp(`^domingo, ${Number(domingo.slice(8))} de `);

  // 1. Primeiro acesso: igreja e admin.
  const admin = await novaPagina(browser);
  await admin.goto("/entrar");
  await expect(admin).toHaveURL(/\/primeiro-acesso/);
  await admin.getByLabel("Nome da igreja").fill("Igreja E2E");
  await admin.getByLabel("Seu nome").fill("Admin E2E");
  await admin.getByLabel("E-mail").fill("admin@e2e.local");
  await admin.getByLabel("Senha", { exact: true }).fill(SENHA);
  await admin.getByRole("checkbox").check();
  await admin.getByRole("button", { name: "Criar" }).click();
  await expect(admin).toHaveURL(/\/lider\/configurar/);

  // 2. Assistente: ministério Mídia, culto 2+1+1 e convite.
  await admin.getByLabel("Nome do ministério").fill("Mídia");
  for (const f of ["Projeção", "Transmissão", "Iluminação"]) await admin.getByRole("button", { name: f, exact: true }).click();
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(admin.getByText("Passo 2 de 3")).toBeVisible();
  const ministerioId = new URL(admin.url()).searchParams.get("ministerio");
  await admin.getByLabel("Nome do culto").fill("Culto de domingo 18h");
  await admin.getByLabel("Quantidade de Projeção").fill("2");
  await admin.getByLabel("Quantidade de Transmissão").fill("1");
  await admin.getByLabel("Quantidade de Iluminação").fill("1");
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(admin.getByText("Passo 3 de 3")).toBeVisible();
  await admin.getByRole("button", { name: "Gerar link do convite" }).click();
  const link = await admin.getByLabel("Link do convite").inputValue();
  await admin.getByRole("link", { name: "Concluir" }).click();
  await expect(admin).toHaveURL(/\/lider\/cultos/);

  // 3. Dois voluntários entram; o líder aprova entrada e função.
  const ana = await aceitarConvite(browser, link, "Ana Mídia", "ana.midia@e2e.local");
  const bruno = await aceitarConvite(browser, link, "Bruno Mídia", "bruno.midia@e2e.local");
  await admin.goto(`/lider/equipe?ministerio=${ministerioId}`);
  for (const nome of ["Ana Mídia", "Bruno Mídia"]) {
    await admin.getByRole("button", { name: `Aprovar entrada de ${nome}` }).click();
    await admin.getByRole("button", { name: `Aprovar Iluminação para ${nome}` }).click();
    await expect(admin.getByRole("button", { name: `Aprovar Iluminação para ${nome}` })).toHaveCount(0);
  }

  // 4. Cultos: sem "Sugerir"; a lista "Próximos" mostra o culto; a legenda tem 3 itens.
  await admin.goto(`/lider/cultos?mes=${mes}`);
  await expect(admin.getByRole("link", { name: "Sugerir escala do mês" })).toHaveCount(0);
  await expect(admin.getByRole("heading", { name: "Próximos" })).toBeVisible();
  await expect(admin.getByRole("link", { name: /Culto de domingo 18h/ }).first().getByText("Mídia 0/4")).toBeVisible();
  for (const texto of ["Completo", "Faltando gente", "Sem escala"]) await expect(admin.getByText(texto, { exact: true })).toBeVisible();
  await admin.screenshot({ path: `${PRINTS}/035-cultos.png` });
  // 042: Cultos no desktop (calendário à esquerda, Próximos + ação à direita), claro e escuro.
  await admin.setViewportSize({ width: 1440, height: 900 });
  for (const tema of ["light", "dark"] as const) {
    await admin.emulateMedia({ colorScheme: tema });
    await admin.waitForTimeout(400);
    await admin.screenshot({ path: `${PRINTS}/042-desk-cultos-${tema === "light" ? "claro" : "escuro"}.png` });
  }
  await admin.emulateMedia({ colorScheme: "light" });
  await admin.setViewportSize(CELULAR);
  // Escolher um dia troca a lista para o dia; "Ver próximos" volta.
  await admin.getByRole("button", { name: diaDoDomingo }).click();
  await expect(admin.getByRole("heading", { name: /^domingo, / })).toBeVisible();
  await admin.getByRole("button", { name: "Ver próximos" }).click();
  await expect(admin.getByRole("heading", { name: "Próximos" })).toBeVisible();

  // 5. Escalar: sem o botão "Cultos"; sugere e publica o mês.
  await admin.goto(`/lider/escalar?ministerio=${ministerioId}&mes=${mes}`);
  await expect(admin.locator(".tela").getByRole("link", { name: "Cultos", exact: true })).toHaveCount(0);
  await expect(admin.getByRole("heading", { name: "Trocas para aprovar" })).toHaveCount(0);
  await admin.getByRole("button", { name: "Sugerir escala do mês" }).click();
  await expect(admin.getByText(/de \d+ vagas? preenchidas?/)).toBeVisible();
  for (const tema of ["light", "dark"] as const) {
    await admin.emulateMedia({ colorScheme: tema });
    await admin.waitForTimeout(400);
    await admin.screenshot({ path: `${PRINTS}/042-escalar-${tema === "light" ? "claro" : "escuro"}.png` });
  }
  await admin.emulateMedia({ colorScheme: "light" });
  await admin.getByRole("button", { name: "Publicar mês" }).click();
  await admin.getByRole("button", { name: "Publicar e avisar" }).click();
  await expect(admin.getByText(/Mês publicado: \d+ escalas? publicadas?/)).toBeVisible();

  // 6. Ana pede troca para o Bruno; ele aceita.
  await ana.goto("/agenda");
  await expect(ana.getByRole("heading", { name: /^Em / })).toBeVisible();
  for (const tema of ["light", "dark"] as const) {
    await ana.emulateMedia({ colorScheme: tema });
    await ana.waitForTimeout(400);
    await ana.screenshot({ path: `${PRINTS}/042-agenda-${tema === "light" ? "claro" : "escuro"}.png` });
  }
  await ana.emulateMedia({ colorScheme: "light" });
  await ana.getByRole("button", { name: /tenho escala/ }).first().click();
  await ana.getByText("Pedir troca", { exact: true }).click();
  await ana.getByLabel("Substituto").selectOption({ label: "Bruno Mídia" });
  await ana.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(ana.getByText("Pedido de troca enviado")).toBeVisible();
  await bruno.goto("/inicio");
  await bruno.getByRole("button", { name: "Aceitar" }).click();
  await expect(bruno.getByText("Troca aceita")).toBeVisible();

  // 7. Escalar mostra a troca no topo, com contador, e o líder aprova ali.
  await admin.goto(`/lider/escalar?ministerio=${ministerioId}&mes=${mes}`);
  await expect(admin.getByRole("heading", { name: "Trocas para aprovar" })).toBeVisible();
  await expect(admin.getByLabel("1 troca")).toBeVisible();
  await expect(admin.getByText(/Ana Mídia → Bruno Mídia \(Iluminação\)/)).toBeVisible();
  await admin.screenshot({ path: `${PRINTS}/035-escalar.png` });
  await admin.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Trocas para aprovar" })).toHaveCount(0);
});
