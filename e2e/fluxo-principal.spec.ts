import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { aprovarEntrada, criarMinisterioComConvite, darFuncoes, tornarLider } from "./ajuda-equipe";

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

  // 2. Admin cria o ministério e a função, e gera o convite (tudo na Equipe).
  const { id: ministerioId, link } = await criarMinisterioComConvite(admin, "Louvor E2E", "Vocal");

  // 3. Futuro líder entra pelo convite; o admin aprova (sem função) e o torna líder.
  const lider = await novaPagina(browser);
  await cadastrarPorConvite(lider, link, "Lider E2E", "lider@e2e.local");
  await aprovarEntrada(admin, ministerioId, "Lider E2E");
  await expect(admin.getByRole("heading", { name: "Membros (1)" })).toBeVisible();
  await tornarLider(admin, "Louvor E2E", "Lider E2E");

  // 4. Voluntário entra pelo convite.
  const voluntario = await novaPagina(browser);
  await cadastrarPorConvite(voluntario, link, "Voluntario E2E", "voluntario@e2e.local");

  // 5. Líder aprova o voluntário e marca a função Vocal.
  await lider.goto(`/lider/equipe?ministerio=${ministerioId}`);
  await expect(lider.getByRole("link", { name: /Pedidos/ })).toContainText("1");
  await aprovarEntrada(lider, ministerioId, "Voluntario E2E");
  await darFuncoes(lider, "Voluntario E2E", ["Vocal"]);

  // 6. Admin cria um evento que começa em 1 hora (o check-in abre 2 horas antes).
  const { data, hora, mes } = dataHoraSp(new Date(Date.now() + 60 * 60 * 1000));
  await admin.goto("/eventos/novo");
  await admin.getByLabel("Título").fill("Culto E2E");
  await admin.getByLabel("Data (do primeiro culto)").fill(data);
  await admin.getByLabel("Início").fill(hora);
  await admin.getByRole("button", { name: "Salvar" }).click();
  await expect(admin).toHaveURL(/\/lider\/cultos/);

  // 7. Líder abre Escalar, sugere o mês, vê o resumo, desfaz, sugere de novo e publica o mês.
  await lider.goto(`/lider/escalar?mes=${mes}`);
  const linkCulto = lider.getByRole("link", { name: /Culto E2E/ });
  const eventoId = (await linkCulto.getAttribute("href"))!.split("/").pop();
  // Culto avulso nasce sem vagas e a sugestão não as inventa: define 1 vaga de Vocal direto no banco.
  // O PGlite atende uma conexão por vez e o app mantém a dele por instantes: tenta de novo se a nossa cair.
  await expect(async () => {
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${process.env.PG_LOCAL_PORT}/postgres`, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        const [esc] = await tx`insert into escalas (igreja_id, evento_id, ministerio_id)
          select igreja_id, ${Number(eventoId)}, ${ministerioId} from eventos where id = ${Number(eventoId)}
          on conflict do nothing returning id, igreja_id`;
        if (!esc) return;
        await tx`insert into escala_itens (igreja_id, escala_id, funcao_id)
          select ${esc.igreja_id}, ${esc.id}, id from funcoes where ministerio_id = ${ministerioId} and nome = 'Vocal'`;
      });
    } finally {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }).toPass({ timeout: 20_000 });
  await lider.reload();
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
  await lider.goto(`/escalas/${eventoId}/${ministerioId}`);
  await expect(lider).toHaveURL(new RegExp(`/lider/cultos/${eventoId}$`));
  await expect(lider.getByRole("button", { name: /Voluntario E2E, Vocal: Confirmou/ })).toBeVisible();
});
