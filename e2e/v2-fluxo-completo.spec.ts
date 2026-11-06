import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

const SENHA = "senha-e2e-12345";
const CELULAR = { width: 390, height: 844 };
/** Pasta dos prints do guia (`docs/prints`); sem a variável, o teste não grava prints. */
const PRINTS = process.env.GUIA_PRINTS;

async function print(pagina: Page, nome: string) {
  if (!PRINTS) return;
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `${PRINTS}/${nome}.png` });
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

/** Convidado cria a conta pelo link e escolhe as funções desejadas. */
async function aceitarConvite(browser: Browser, link: string, nome: string, email: string, funcoes: string[], prints = false) {
  const pagina = await novaPagina(browser);
  await pagina.goto(new URL(link).pathname);
  await pagina.getByLabel("Nome", { exact: true }).fill(nome);
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("checkbox").check();
  if (prints) await print(pagina, "05-convite-conta");
  await pagina.getByRole("button", { name: "Criar conta e pedir para entrar" }).click();
  await expect(pagina.getByRole("heading", { name: "Escolha onde quer servir" })).toBeVisible();
  for (const f of funcoes) await pagina.getByRole("checkbox", { name: f }).check();
  if (prints) await print(pagina, "06-convite-funcoes");
  await pagina.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(pagina.getByRole("heading", { name: "Pedido enviado" })).toBeVisible();
  if (prints) await print(pagina, "07-convite-enviado");
  return pagina;
}

/** Primeiro domingo com culto das 18h ainda por vir, em São Paulo (`AAAA-MM-DD`). */
function primeiroDomingo(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const horaSp = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  for (let n = 0; n < 8; n++) {
    const iso = fmt.format(new Date(Date.now() + n * 86_400_000));
    const domingo = new Date(`${iso}T12:00:00Z`).getUTCDay() === 0;
    if (domingo && (n > 0 || horaSp < 17)) return iso;
  }
  throw new Error("sem domingo");
}

/**
 * Fluxo completo da especificação da v2 (ESPECS/2026-11-06-app-v2-desenho.md, "Testes e aceite"), no
 * celular. Roda por último (ordem alfabética, 1 worker): a igreja e o admin `admin@e2e.local` vêm do
 * `fluxo-principal.spec.ts`; o assistente abre em /lider/configurar como no primeiro acesso.
 */
test("v2 de ponta a ponta: assistente, convite, aprovação, calendário, sugestão, publicação, confirmação, folga e troca", async ({
  browser,
}) => {
  if (PRINTS) mkdirSync(PRINTS, { recursive: true });
  const domingo = primeiroDomingo();
  const mes = domingo.slice(0, 7);
  const diaDoDomingo = new RegExp(`^domingo, ${Number(domingo.slice(8))} de `);

  // 1. Admin (líder novo da Mídia) faz o assistente: ministério, culto 2+1+1, convite.
  const admin = await entrar(browser, "admin@e2e.local");
  await admin.goto("/lider/configurar");
  await expect(admin.getByText("Passo 1 de 3")).toBeVisible();
  await admin.getByLabel("Nome do ministério").fill("Mídia");
  for (const f of ["Projeção", "Transmissão", "Iluminação"]) {
    await admin.getByRole("button", { name: f, exact: true }).click();
  }
  await print(admin, "01-assistente-ministerio");
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();

  await expect(admin.getByText("Passo 2 de 3")).toBeVisible();
  const ministerioId = new URL(admin.url()).searchParams.get("m");
  await admin.getByLabel("Nome do culto").fill("Culto de domingo 18h");
  await admin.getByLabel("Quantidade de Projeção").fill("2");
  await admin.getByLabel("Quantidade de Transmissão").fill("1");
  await admin.getByLabel("Quantidade de Iluminação").fill("1");
  await print(admin, "02-assistente-culto");
  await admin.getByRole("button", { name: "Salvar e continuar" }).click();

  await expect(admin.getByText("Passo 3 de 3")).toBeVisible();
  await admin.getByRole("button", { name: "Gerar link do convite" }).click();
  await expect(admin.getByRole("link", { name: "Enviar no WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=.*%2Fconvite%2F[0-9a-f]{64}/,
  );
  await print(admin, "03-assistente-convite");
  const link = await admin.getByLabel("Link do convite").inputValue();
  await admin.getByRole("link", { name: "Concluir" }).click();
  await expect(admin).toHaveURL(/\/lider\/cultos/);
  await print(admin, "04-cultos-depois-do-assistente");

  // 2. Dois voluntários novos entram pelo convite e escolhem Iluminação.
  const ana = await aceitarConvite(browser, link, "Ana Mídia", "ana.midia@e2e.local", ["Iluminação"], true);
  const bruno = await aceitarConvite(browser, link, "Bruno Mídia", "bruno.midia@e2e.local", ["Iluminação"]);

  // 3. O líder aprova a entrada e a função de cada um na Equipe.
  await admin.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Equipe" }).click();
  await admin.getByRole("navigation", { name: "Ministério" }).getByRole("link", { name: "Mídia" }).click();
  await expect(admin.getByText("2 pessoas querem servir em Iluminação")).toBeVisible();
  await print(admin, "08-equipe-pedidos");
  for (const nome of ["Ana Mídia", "Bruno Mídia"]) {
    await admin.getByRole("button", { name: `Aprovar entrada de ${nome}` }).click();
    await admin.getByRole("button", { name: `Aprovar Iluminação para ${nome}` }).click();
    await expect(admin.getByRole("button", { name: `Aprovar Iluminação para ${nome}` })).toHaveCount(0);
  }
  await expect(admin.getByRole("button", { name: /Ana Mídia/ })).toContainText("Iluminação");
  await print(admin, "09-equipe-membros");

  // 4. Calendário de Cultos: o domingo mostra Mídia 0/4.
  await admin.goto(`/lider/cultos?mes=${mes}`);
  await admin.getByRole("button", { name: diaDoDomingo }).click();
  const culto = admin.getByRole("link", { name: /Culto de domingo 18h/ });
  await expect(culto.getByText("Mídia 0/4")).toBeVisible();
  await print(admin, "10-cultos-calendario");

  // 5. Escalar: sugere o mês, vê o resumo e publica.
  await admin.goto(`/lider/escalar?ministerio=${ministerioId}&mes=${mes}`);
  await expect(admin.getByRole("link", { name: "Mídia", exact: true })).toHaveAttribute("aria-current", "page");
  await print(admin, "11-escalar");
  await admin.getByRole("button", { name: "Sugerir escala do mês" }).click();
  await expect(admin.getByText(/de \d+ vagas? preenchidas?/)).toBeVisible();
  await print(admin, "12-escalar-resumo");
  await admin.getByRole("button", { name: "Publicar mês" }).click();
  await print(admin, "13-escalar-publicar");
  await admin.getByRole("button", { name: "Publicar e avisar" }).click();
  await expect(admin.getByText(/Mês publicado: \d+ escalas? publicadas?/)).toBeVisible();

  // O domingo passa a ter a Iluminação preenchida. Com 1 vaga por culto, o rodízio alterna Ana e Bruno
  // (o culto avulso do fluxo-principal, hoje, também ganha a vaga de Iluminação da Mídia).
  await admin.goto(`/lider/cultos?mes=${mes}`);
  await admin.getByRole("button", { name: diaDoDomingo }).click();
  await expect(culto.getByText("Mídia 1/4")).toBeVisible();
  await culto.click();
  await expect(admin.getByRole("group", { name: "Iluminação" }).getByText(/^(Ana|Bruno) Mídia$/)).toBeVisible();
  await print(admin, "14-culto-publicado");

  // 6. Ana vê a próxima escala (Iluminação da Mídia) no Início e confirma.
  await ana.goto("/inicio");
  const cartao = ana.getByRole("region", { name: "Próxima escala" });
  await expect(cartao.getByText("Iluminação")).toBeVisible();
  await expect(cartao.getByText("Mídia")).toBeVisible();
  await print(ana, "15-inicio-escala");
  await ana.getByRole("button", { name: "Confirmar presença" }).click();
  await expect(ana.getByText("Presença confirmada")).toBeVisible();
  await print(ana, "16-inicio-confirmada");

  // 7. Ana marca uma folga no mês seguinte.
  await ana.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Folgas" }).click();
  await ana.getByRole("button", { name: "Próximo mês" }).click();
  await ana.getByRole("button", { name: /, 10 de / }).click();
  await ana.getByRole("button", { name: "Marcar folga" }).click();
  await expect(ana.getByText("Folga marcada")).toBeVisible();
  await print(ana, "17-folgas");

  // 8. Ana pede troca da próxima escala dela para o Bruno; ele aceita; o líder aprova.
  await ana.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Agenda" }).click();
  await expect(ana.getByText("Toque num dia marcado")).toBeVisible();
  await ana.getByRole("button", { name: /tenho escala/ }).first().click();
  await ana.getByText("Pedir troca", { exact: true }).click();
  await ana.getByLabel("Substituto").selectOption({ label: "Bruno Mídia" });
  await print(ana, "18-agenda-pedir-troca");
  await ana.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(ana.getByText("Pedido de troca enviado")).toBeVisible();

  await bruno.goto("/inicio");
  await expect(bruno.getByText(/Ana Mídia pede para você assumir/)).toBeVisible();
  await print(bruno, "19-inicio-troca-recebida");
  await bruno.getByRole("button", { name: "Aceitar" }).click();
  await expect(bruno.getByText("Troca aceita")).toBeVisible();

  await admin.getByRole("button", { name: "Mais opções" }).click();
  await admin.getByRole("navigation", { name: "Mais telas" }).getByRole("link", { name: "Trocas" }).click();
  await expect(admin.getByText(/Ana Mídia → Bruno Mídia \(Iluminação\)/)).toBeVisible();
  await print(admin, "20-trocas-aprovar");
  await admin.getByRole("button", { name: "Aprovar" }).click();
  await expect(admin.getByText("Troca aprovada")).toBeVisible();

  await expect(admin.getByText("Nenhum pedido.")).toBeVisible();
});
