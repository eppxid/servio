import { expect, test, type Browser, type Page } from "@playwright/test";

// Roda por último (ordem alfabética): usa o admin criado por fluxo-principal.spec.ts.
const SENHA = "senha-e2e-12345";

async function entrar(browser: Browser, modo?: "lider"): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (modo) await contexto.addCookies([{ name: "servio_modo", value: modo, url: "http://localhost:3100" }]);
  const pagina = await contexto.newPage();
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail").fill("admin@e2e.local");
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).not.toHaveURL(/\/entrar/);
  return pagina;
}

test("login cai no início do modo e não há menu Mais", async ({ browser }) => {
  const voluntario = await entrar(browser);
  await expect(voluntario).toHaveURL(/\/inicio$/);
  await expect(voluntario.getByRole("button", { name: "Mais opções" })).toHaveCount(0);

  const lider = await entrar(browser, "lider");
  await expect(lider).toHaveURL(/\/lider\/cultos$/);
  await expect(lider.getByRole("button", { name: "Mais opções" })).toHaveCount(0);
});

test("telas antigas redirecionam para as abas novas", async ({ browser }) => {
  const admin = await entrar(browser);
  await expect(admin).toHaveURL(/\/inicio/);
  const casos: [string, RegExp][] = [
    ["/ministerios", /\/lider\/equipe$/],
    ["/ministerios/1", /\/lider\/equipe\?ministerio=1&aba=membros$/],
    ["/eventos", /\/lider\/cultos$/],
    ["/eventos?mes=2026-12", /\/lider\/cultos\?mes=2026-12$/],
    ["/agenda/trocas", /\/lider\/escalar$/],
    ["/escalas", /\/lider\/escalar$/],
    ["/escalas/1/1", /\/lider\/cultos\/1$/],
  ];
  for (const [de, para] of casos) {
    await admin.goto(de);
    await expect(admin, de).toHaveURL(para);
  }
});

test("Perfil tem Tema e Meus pontos e medalhas", async ({ browser }) => {
  const admin = await entrar(browser);
  await admin.goto("/perfil");
  await expect(admin.getByRole("group", { name: "Tema" }).getByRole("button", { name: "Escuro" })).toBeVisible();
  await admin.getByRole("link", { name: /Meus pontos e medalhas/ }).click();
  await expect(admin).toHaveURL(/\/reconhecimento/);
});

// Conta as chamadas de startViewTransition e guarda o html[data-nav] visto em cada uma.
const espiarTransicao = `(() => {
  window.__vt = [];
  const original = document.startViewTransition?.bind(document);
  if (original) document.startViewTransition = (cb) => { window.__vt.push(document.documentElement.dataset.nav); return original(cb); };
})()`;

async function entrarComEspiao(browser: Browser, reducedMotion: "reduce" | "no-preference", dirVideo?: string) {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion,
    ...(dirVideo ? { recordVideo: { dir: dirVideo, size: { width: 390, height: 844 } } } : {}),
  });
  const pagina = await contexto.newPage();
  await pagina.addInitScript(espiarTransicao);
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail").fill("admin@e2e.local");
  await pagina.getByLabel("Senha", { exact: true }).fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/inicio$/);
  await pagina.evaluate(() => ((window as unknown as { __vt: unknown[] }).__vt = []));
  return pagina;
}
const transicoes = (p: Page) => p.evaluate(() => (window as unknown as { __vt: (string | undefined)[] }).__vt);
const aba = (p: Page, nome: string) => p.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: nome });
// Um clique durante a transição anterior navega seco; o teste espera ela acabar.
const parado = (p: Page) => expect(p.locator("html")).not.toHaveAttribute("data-nav", /.+/);

test("trocar de aba roda a transição com a direção; movimento reduzido não roda", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  await aba(p, "Agenda").click();
  await expect(p).toHaveURL(/\/agenda$/);
  await parado(p);
  await aba(p, "Início").click();
  await expect(p).toHaveURL(/\/inicio$/);
  await parado(p);
  await p.goBack();
  await expect(p).toHaveURL(/\/agenda$/);
  expect(await transicoes(p)).toEqual(["aba-dir", "aba-esq", "tras"]);
  await expect(p.locator("html")).not.toHaveAttribute("data-nav", /.+/);

  const reduzido = await entrarComEspiao(browser, "reduce");
  await aba(reduzido, "Agenda").click();
  await expect(reduzido).toHaveURL(/\/agenda$/);
  expect(await transicoes(reduzido)).toEqual([]);
  await p.context().close();
  await reduzido.context().close();
});

test("clique na aba marca a troca a caminho na rede lenta e limpa quando a tela chega", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  await p.route(
    (url) => url.searchParams.has("_rsc"),
    async (rota) => {
      await new Promise((r) => setTimeout(r, process.env.PRINT_CARREGANDO ? 3000 : 800));
      await rota.continue();
    },
  );
  const html = p.locator("html");
  await aba(p, "Agenda").click();
  await expect(html).toHaveAttribute("data-carregando", "", { timeout: 100 });
  await expect(aba(p, "Agenda")).toHaveAttribute("data-indo", "");
  if (process.env.PRINT_CARREGANDO) {
    // Durante a View Transition (até 1 s) a captura sai em branco; o print espera ela acabar, com a resposta ainda atrasada.
    await p.waitForTimeout(1300);
    await p.screenshot({ path: process.env.PRINT_CARREGANDO });
  }
  await expect(p).toHaveURL(/\/agenda$/);
  await expect(html).not.toHaveAttribute("data-carregando", /.*/);
  await expect(aba(p, "Agenda")).not.toHaveAttribute("data-indo", /.*/);
  await p.context().close();
});

// Gravação para conferência humana: VIDEO_DIR=<pasta> pnpm e2e (pula quando a variável não existe).
test("vídeo: três abas e um detalhe com ida e volta", async ({ browser }) => {
  test.skip(!process.env.VIDEO_DIR, "defina VIDEO_DIR para gravar");
  const p = await entrarComEspiao(browser, "no-preference", process.env.VIDEO_DIR);
  for (const nome of ["Agenda", "Folgas", "Perfil", "Início"]) {
    await aba(p, nome).click();
    await expect(p).toHaveURL(new RegExp(`/${nome === "Início" ? "inicio" : nome.toLowerCase()}$`));
    await p.waitForTimeout(700);
  }
  await p.goto("/perfil");
  await p.getByRole("link", { name: /Meus pontos e medalhas/ }).click();
  await expect(p).toHaveURL(/\/reconhecimento/);
  await p.waitForTimeout(700);
  await p.goBack();
  await expect(p).toHaveURL(/\/perfil$/);
  await p.waitForTimeout(700);
  await p.context().close();
});
