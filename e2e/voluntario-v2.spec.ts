import { criarMinisterioComConvite } from "./ajuda-equipe";
import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";

// Roda depois de fluxo-principal.spec.ts (ordem alfabética, 1 worker): usa o admin `admin@e2e.local`.
// Cria o próprio ministério e a própria voluntária; as escalas entram direto no banco.
const SENHA = "senha-e2e-12345";
const CELULAR = { width: 390, height: 844 };
const PRINTS = process.env.E2E_PRINTS_036;

function dataEmDias(dias: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + dias * 86_400_000));
}

async function novaPagina(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: CELULAR, deviceScaleFactor: 2 })).newPage();
}

async function entrar(browser: Browser, email: string): Promise<Page> {
  const pagina = await novaPagina(browser);
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).not.toHaveURL(/\/entrar/);
  return pagina;
}

test("voluntária responde pelo Início, abre o dia na Agenda, usa o Chat e não vê 'Aprovar trocas'", async ({ browser }) => {
  if (PRINTS) mkdirSync(PRINTS, { recursive: true });
  const admin = await entrar(browser, "admin@e2e.local");
  const { id: ministerioId, link } = await criarMinisterioComConvite(admin, "Apoio V036", "Recepção");

  const cadastro = await novaPagina(browser);
  await cadastro.goto(link);
  await cadastro.getByLabel("Nome", { exact: true }).fill("Vera Apoio");
  await cadastro.getByLabel("E-mail").fill("vera.apoio@e2e.local");
  await cadastro.getByLabel("Senha", { exact: true }).fill(SENHA);
  await cadastro.getByRole("checkbox").check();
  await cadastro.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await cadastro.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(cadastro.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();

  // Duas escalas publicadas com a Vera pendente: a próxima (em 3 dias) e outra (em 12 dias).
  const proximo = new Date(Date.now() + 3 * 86_400_000);
  const outro = new Date(Date.now() + 12 * 86_400_000);
  const diaOutro = dataEmDias(12);
  await admin.waitForTimeout(2500); // o PGlite atende uma conexão só; espera o app soltar a dele
  await expect(async () => {
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${process.env.PG_LOCAL_PORT}/postgres`, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx`update membros_ministerio set status = 'aprovado'
          where ministerio_id = ${ministerioId} and usuario_id = (select id from usuarios where email = 'vera.apoio@e2e.local')`;
        const [vera] = await tx`select id, igreja_id from usuarios where email = 'vera.apoio@e2e.local'`;
        const [funcao] = await tx`select id from funcoes where ministerio_id = ${ministerioId} and nome = 'Recepção'`;
        for (const [titulo, inicio] of [["Culto A V036", proximo], ["Culto B V036", outro]] as const) {
          const [evento] = await tx`insert into eventos (igreja_id, titulo, inicio) values (${vera.igreja_id}, ${titulo}, ${inicio}) returning id`;
          const [escala] = await tx`insert into escalas (igreja_id, evento_id, ministerio_id, status)
            values (${vera.igreja_id}, ${evento.id}, ${ministerioId}, 'publicada') returning id`;
          await tx`insert into escala_itens (igreja_id, escala_id, funcao_id, usuario_id)
            values (${vera.igreja_id}, ${escala.id}, ${funcao.id}, ${vera.id})`;
        }
      });
    } finally {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }).toPass({ timeout: 20_000 });

  const vera = await entrar(browser, "vera.apoio@e2e.local");
  await vera.goto("/inicio");
  const cartao = vera.getByRole("region", { name: "Próxima escala" });
  await expect(cartao.getByText("Culto A V036")).toBeVisible();
  await expect(cartao.getByRole("link", { name: "Chat da equipe" })).toBeVisible();
  await expect(cartao.getByText("Repertório ainda vazio")).toBeVisible();
  if (PRINTS) {
    await vera.waitForTimeout(1200);
    await vera.screenshot({ path: `${PRINTS}/036-inicio.png` });
  }

  // Responder → Agenda já com o dia aberto, sem procurar no calendário.
  await vera.getByRole("link", { name: /Culto B V036/ }).click();
  await expect(vera).toHaveURL(new RegExp(`/agenda[?]dia=${diaOutro}`));
  const folha = vera.getByRole("dialog");
  await expect(folha.getByText("Culto B V036")).toBeVisible();
  await expect(folha.getByText("Repertório ainda vazio")).toBeVisible();
  await expect(vera.getByText("Aprovar trocas")).toHaveCount(0);
  if (PRINTS) {
    await vera.waitForTimeout(1200);
    await vera.screenshot({ path: `${PRINTS}/036-agenda.png` });
  }
  await folha.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(vera.getByText("Presença confirmada")).toBeVisible();

  // Chat a partir do dia aberto: 2 toques (dia, Chat da equipe).
  await vera.goto(`/agenda?dia=${diaOutro}`);
  await vera.getByRole("dialog").getByRole("link", { name: "Chat da equipe" }).click();
  await expect(vera).toHaveURL(/\/chat\/\d+/);
  await vera.getByLabel("Mensagem").fill("Cheguei mais cedo para ajudar");
  await vera.getByRole("button", { name: "Enviar" }).click();
  await expect(vera.getByText("Cheguei mais cedo para ajudar")).toBeVisible();
});
