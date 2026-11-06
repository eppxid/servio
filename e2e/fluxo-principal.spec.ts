import { expect, test, type Browser, type Page } from "@playwright/test";

const SENHA = "senha-e2e-12345";

async function novaPagina(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Cadastro pelo link de convite: cria a conta e pede entrada no ministério. */
async function cadastrarPorConvite(pagina: Page, link: string, nome: string, email: string) {
  await pagina.goto(link);
  await pagina.getByLabel("Nome", { exact: true }).fill(nome);
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("checkbox").check();
  await pagina.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await expect(pagina.getByRole("heading", { name: "Escolha onde quer servir" })).toBeVisible();
  await pagina.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(pagina.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();
}

/** Data e hora de São Paulo de um instante, no formato dos campos do formulário. */
function dataHoraSp(d: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}`, mes: `${partes.year}-${partes.month}` };
}

test("admin cria ministério, voluntário entra por convite, líder aprova, escala publicada, voluntário confirma e faz check-in", async ({
  browser,
}) => {
  // 1. Admin cria a igreja.
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

  // 2. Admin cria o ministério e a função, e gera o convite.
  await admin.goto("/ministerios");
  const novo = admin.locator("form", { hasText: "Novo ministério" });
  await novo.getByLabel("Nome").fill("Louvor E2E");
  await novo.getByRole("button", { name: "Criar" }).click();
  await admin.getByRole("link", { name: "Louvor E2E" }).click();
  await admin.getByLabel("Nova função").fill("Vocal");
  await admin.getByRole("button", { name: "Adicionar" }).click();
  await expect(admin.getByLabel("Nome da função")).toHaveValue("Vocal");
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  await expect(admin).toHaveURL(/convite=[0-9a-f]{64}/);
  const token = new URL(admin.url()).searchParams.get("convite");
  const link = `/convite/${token}`;
  const urlMinisterio = admin.url().split("?")[0];

  // 3. Futuro líder entra pelo convite; o admin aprova (sem função) e o torna líder.
  const lider = await novaPagina(browser);
  await cadastrarPorConvite(lider, link, "Lider E2E", "lider@e2e.local");
  await admin.goto(urlMinisterio);
  await admin.getByRole("button", { name: "Aprovar" }).click();
  await expect(admin.getByRole("heading", { name: "Membros (1)" })).toBeVisible();
  await admin.goto("/ministerios");
  await admin.getByText("Gerenciar").click();
  await admin.getByLabel("Pessoa").selectOption({ label: "Lider E2E" });
  await admin.getByLabel("Papel").selectOption({ label: "Líder" });
  await admin.getByRole("button", { name: "Definir papel" }).click();

  // 4. Voluntário entra pelo convite.
  const voluntario = await novaPagina(browser);
  await cadastrarPorConvite(voluntario, link, "Voluntario E2E", "voluntario@e2e.local");

  // 5. Líder aprova o voluntário com a função Vocal.
  await lider.goto(urlMinisterio);
  await expect(lider.getByRole("heading", { name: "Pendentes (1)" })).toBeVisible();
  await lider.locator("section", { hasText: "Pendentes" }).getByRole("checkbox", { name: "Vocal" }).check();
  await lider.getByRole("button", { name: "Aprovar" }).click();
  await expect(lider.getByRole("heading", { name: "Pendentes (0)" })).toBeVisible();

  // 6. Admin cria um evento que começa em 1 hora (o check-in abre 2 horas antes).
  const { data, hora, mes } = dataHoraSp(new Date(Date.now() + 60 * 60 * 1000));
  await admin.goto("/eventos/novo");
  await admin.getByLabel("Título").fill("Culto E2E");
  await admin.getByLabel("Data (do primeiro culto)").fill(data);
  await admin.getByLabel("Início").fill(hora);
  await admin.getByRole("button", { name: "Salvar" }).click();
  await expect(admin).toHaveURL(/\/eventos/);

  // 7. Líder abre Escalar, sugere o mês, vê o resumo, desfaz, sugere de novo e publica o mês.
  await lider.goto(`/lider/escalar?mes=${mes}`);
  const linkCulto = lider.getByRole("link", { name: /Culto E2E/ });
  const eventoId = (await linkCulto.getAttribute("href"))!.split("/").pop();
  if (process.env.E2E_PRINTS) {
    for (const tema of ["light", "dark"] as const) {
      await lider.emulateMedia({ colorScheme: tema });
      await lider.waitForTimeout(400);
      await lider.screenshot({ path: `${process.env.E2E_PRINTS}/escalar-vagas-${tema}.png`, fullPage: true });
    }
    await lider.emulateMedia({ colorScheme: "light" });
  }
  await lider.getByRole("button", { name: "Sugerir escala do mês" }).click();
  await expect(lider.getByText(/1 de 1 vaga preenchida/)).toBeVisible();
  if (process.env.E2E_PRINTS) {
    for (const tema of ["light", "dark"] as const) {
      await lider.emulateMedia({ colorScheme: tema });
      await lider.waitForTimeout(400);
      await lider.screenshot({ path: `${process.env.E2E_PRINTS}/escalar-resumo-${tema}.png`, fullPage: true });
    }
    await lider.emulateMedia({ colorScheme: "light" });
  }
  await lider.getByRole("button", { name: "Desfazer" }).click();
  await expect(lider.getByText(/Sugestão desfeita: 1 vaga esvaziada/)).toBeVisible();
  await lider.getByRole("button", { name: "Sugerir escala do mês" }).click();
  await expect(lider.getByText(/1 de 1 vaga preenchida/)).toBeVisible();
  await lider.getByRole("button", { name: "Publicar mês" }).click();
  if (process.env.E2E_PRINTS) {
    await lider.waitForTimeout(700);
    await lider.screenshot({ path: `${process.env.E2E_PRINTS}/escalar-publicar.png` });
  }
  await lider.getByRole("button", { name: "Publicar e avisar" }).click();
  await expect(lider.getByText(/Mês publicado: 1 escala publicada/)).toBeVisible();

  // 8. Voluntário confirma e faz check-in.
  await voluntario.goto("/inicio");
  await expect(voluntario.getByText("Culto E2E")).toBeVisible();
  await voluntario.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(voluntario.getByText("Presença confirmada")).toBeVisible();
  await expect(voluntario.getByText(/^Confirmado/)).toBeVisible();
  await voluntario.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(voluntario.getByText(/check-in às \d\d:\d\d/)).toBeVisible();

  // 9. Líder vê o voluntário presente.
  await lider.goto(`/escalas/${eventoId}/${urlMinisterio.split("/").pop()}`);
  await expect(lider.getByText(/Vocal: Voluntario E2E/)).toBeVisible();
  await expect(lider.getByText(/Presente \d\d:\d\d/)).toBeVisible();
});
