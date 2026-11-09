import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Última da ordem alfabética: usa a igreja e o admin criados por fluxo-principal.spec.ts.
// Valida as tarefas 048–051 juntas, em celular (390×844). Prints e vídeo vão para PRINTS_V3.
const SENHA = "senha-e2e-12345";
const CELULAR = { width: 390, height: 844 };
const PASTA = process.env.PRINTS_V3 ?? "E:\\Devs\\Servio-teste-v3";

async function print(pagina: Page, nome: string) {
  await pagina.waitForTimeout(500);
  await pagina.screenshot({ path: `${PASTA}/${nome}.png` });
}

/** Um aparelho = um contexto com cookies próprios. */
async function aparelho(browser: Browser, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  return (await browser.newContext({ viewport: CELULAR, deviceScaleFactor: 2, ...extra })).newPage();
}

async function entrarComSenha(p: Page, email: string) {
  await p.goto("/entrar");
  await p.getByLabel("E-mail").fill(email);
  await p.getByLabel("Senha", { exact: true }).fill(SENHA);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p).not.toHaveURL(/\/entrar/);
}

// PNG 8×4 montado na hora (o navegador recorta e converte para WebP).
function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function bloco(tipo: string, dados: Buffer) {
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}
function criarPng(l: number, a: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(a, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(l * 3, 0).map((_, i) => (i % 3 === 0 ? 200 : 40))]);
  const bruto = Buffer.concat(Array.from({ length: a }, () => linha));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(bruto)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = criarPng(8, 4);

test("movimento, foto e convite com papel juntos: líder, admin e voluntário no celular", async ({ browser }) => {
  mkdirSync(PASTA, { recursive: true });

  // 1. Admin cria o ministério e convida Líder, Administrador e Voluntário.
  const admin = await aparelho(browser);
  await entrarComSenha(admin, "admin@e2e.local");
  await admin.goto("/lider/equipe?aba=ministerios");
  await admin.getByLabel("Nome do novo ministério").fill("Voz V3");
  await admin.getByRole("button", { name: "Criar ministério" }).click();
  await expect(admin.locator("summary", { hasText: "Voz V3" })).toBeVisible();
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  await expect(admin).toHaveURL(/aba=membros/);
  const equipe = admin.url();
  const ministerio = new URL(equipe).searchParams.get("ministerio");
  const convidar = async (nome: string, papel: string) => {
    await admin.goto(equipe);
    await admin.getByLabel("Nome", { exact: true }).fill(nome);
    await admin.getByLabel("Sobrenome").fill("Teste");
    await admin.getByLabel("Papel").selectOption({ label: papel });
    await admin.getByRole("button", { name: "Gerar convite" }).click();
    await expect(admin.getByLabel("Link do convite")).toHaveValue(/\/acesso\/[0-9a-f]{64}$/);
    return new URL(await admin.getByLabel("Link do convite").inputValue()).pathname;
  };
  const linkLider = await convidar("Lia", "Líder do ministério");
  await expect(admin.getByText("Convite para Lia").getByText("Líder")).toBeVisible();
  await print(admin, "01-admin-convite-lider");
  const linkAdmin = await convidar("Alex", "Administrador");
  await expect(admin.getByText("Convite para Alex").getByText("Admin")).toBeVisible();
  await print(admin, "02-admin-convite-admin");
  const linkVol = await convidar("Vera", "Voluntário");

  // 2. Cada um abre o link no próprio aparelho; o admin novo define e-mail e senha.
  const lia = await aparelho(browser);
  await lia.goto(linkLider);
  await lia.getByRole("checkbox").check();
  await lia.getByRole("button", { name: "Entrar" }).click();
  await expect(lia.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  const alex = await aparelho(browser);
  await alex.goto(linkAdmin);
  await expect(alex.getByText("Defina e-mail e senha de administrador.")).toBeVisible();
  await print(alex, "03-alex-define-acesso");
  await alex.getByRole("checkbox").check();
  await alex.getByLabel("E-mail").fill("alex-v3@e2e.local");
  await alex.getByLabel("Senha", { exact: true }).fill(SENHA);
  await alex.getByRole("button", { name: "Entrar" }).click();
  await expect(alex.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  const vera = await aparelho(browser);
  await vera.goto(linkVol);
  await vera.getByRole("checkbox").check();
  await vera.getByRole("button", { name: "Entrar" }).click();
  await expect(vera.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();

  // 3. A voluntária envia a foto; ela aparece no topo, no Início e na Equipe da líder.
  await vera.goto("/perfil#foto");
  await vera.getByTestId("foto-arquivo").setInputFiles({ name: "vera.png", mimeType: "image/png", buffer: PNG });
  await expect(vera.getByAltText("Prévia da nova foto")).toBeVisible();
  await vera.getByRole("button", { name: "Salvar foto" }).click();
  await expect(vera.getByText("Foto salva")).toBeVisible();
  const urlFoto = (await vera.getByTestId("foto-previa").getAttribute("src"))!;
  expect(urlFoto).toMatch(/^\/api\/foto\/\d+\?v=\d+$/);
  const veraId = urlFoto.match(/\/api\/foto\/(\d+)/)![1];
  await print(vera, "04-vera-perfil-com-foto");
  await expect(vera.locator(".top img[src^='/api/foto/']")).toBeVisible();
  await vera.goto("/inicio");
  await expect(vera.locator(".top img[src^='/api/foto/']")).toBeVisible();
  await print(vera, "05-vera-inicio-topo");

  await lia.context().addCookies([{ name: "servio_modo", value: "lider", url: "http://localhost:3100" }]);
  await lia.goto(`/lider/equipe?ministerio=${ministerio}&aba=membros`);
  await expect(lia.getByRole("button", { name: /Vera Teste/ }).locator("img[src^='/api/foto/']")).toBeVisible();
  await print(lia, "06-lia-equipe-com-foto");

  // 4. Aparelho novo do admin Alex: a líder não aprova; o outro admin aprova.
  const alexNovo = await aparelho(browser);
  await alexNovo.goto(linkAdmin);
  await expect(alexNovo.getByRole("heading", { name: "Você é Alex Teste?" })).toBeVisible();
  await alexNovo.getByRole("button", { name: "Sim, sou eu" }).click();
  await expect(alexNovo.getByRole("heading", { name: "Aguardando outro administrador" })).toBeVisible();
  await print(alexNovo, "07-alex-aparelho-novo-espera");

  await lia.goto(`/lider/equipe?ministerio=${ministerio}&aba=membros`);
  await expect(lia.getByRole("button", { name: "Aprovar aparelho de Alex Teste" })).toHaveCount(0);
  await print(lia, "08-lia-nao-aprova-admin");

  await admin.goto(`/lider/equipe?ministerio=${ministerio}&aba=membros`);
  await expect(admin.getByText("Aparelho novo para Alex Teste")).toBeVisible();
  await admin.getByRole("button", { name: "Aprovar aparelho de Alex Teste" }).click();
  await expect(alexNovo).toHaveURL(/\/inicio/, { timeout: 15_000 });
  await print(alexNovo, "09-alex-aparelho-novo-entrou");

  // 5. Movimento: troca de abas, abrir/voltar do culto, com vídeo; depois movimento reduzido.
  const espiao = `(() => {
    window.__vt = [];
    const o = document.startViewTransition?.bind(document);
    if (o) document.startViewTransition = (cb) => { window.__vt.push(document.documentElement.dataset.nav); return o(cb); };
  })()`;
  const transicoes = (p: Page) => p.evaluate(() => (window as unknown as { __vt: (string | undefined)[] }).__vt);
  const parado = (p: Page) => expect(p.locator("html")).not.toHaveAttribute("data-nav", /.+/);
  const comMovimento = async (reducedMotion: "no-preference" | "reduce", video: boolean) => {
    const p = await aparelho(browser, {
      reducedMotion,
      ...(video ? { recordVideo: { dir: PASTA, size: CELULAR } } : {}),
    });
    await p.addInitScript(espiao);
    await entrarComSenha(p, "admin@e2e.local");
    await p.goto("/inicio");
    await p.evaluate(() => ((window as unknown as { __vt: unknown[] }).__vt = []));
    return p;
  };
  const aba = (p: Page, nome: string) => p.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: nome });

  const m = await comMovimento("no-preference", true);
  await aba(m, "Agenda").click();
  await expect(m).toHaveURL(/\/agenda$/);
  await parado(m);
  await m.waitForTimeout(600);
  await aba(m, "Início").click();
  await expect(m).toHaveURL(/\/inicio$/);
  await parado(m);
  await m.waitForTimeout(600);
  expect(await transicoes(m)).toEqual(["aba-dir", "aba-esq"]);

  // Abrir um culto do modo líder e voltar: entra pela direita, volta para a direita.
  await m.context().addCookies([{ name: "servio_modo", value: "lider", url: "http://localhost:3100" }]);
  await m.goto("/lider/cultos");
  const culto = m.locator("a[href^='/lider/cultos/']").first();
  await expect(culto).toBeVisible();
  await m.evaluate(() => ((window as unknown as { __vt: unknown[] }).__vt = []));
  await culto.click();
  await expect(m).toHaveURL(/\/lider\/cultos\/\d+/);
  await parado(m);
  await m.waitForTimeout(600);
  await print(m, "10-culto-aberto");
  await m.goBack();
  await expect(m).toHaveURL(/\/lider\/cultos$/);
  await parado(m);
  await m.waitForTimeout(600);
  expect(await transicoes(m)).toEqual(["frente", "tras"]);
  await m.context().close(); // fecha o contexto para o vídeo ser gravado em disco

  const reduzido = await comMovimento("reduce", false);
  await aba(reduzido, "Agenda").click();
  await expect(reduzido).toHaveURL(/\/agenda$/);
  await aba(reduzido, "Perfil").click();
  await expect(reduzido).toHaveURL(/\/perfil$/);
  expect(await transicoes(reduzido)).toEqual([]);
  await reduzido.context().close();

  // 6. A voluntária exclui a conta: a foto some (a rota devolve 404 para o admin logado).
  expect((await admin.request.get(urlFoto)).status()).toBe(200);
  await vera.goto("/perfil/privacidade");
  await vera.getByLabel(/Para confirmar, digite/).fill("EXCLUIR");
  await print(vera, "11-vera-excluir-conta");
  await vera.getByRole("button", { name: "Excluir minha conta" }).click();
  await expect(vera).toHaveURL(/\/entrar/);
  expect((await admin.request.get(`/api/foto/${veraId}`)).status()).toBe(404);
});
