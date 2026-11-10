import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

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
  // As abas têm prefetch completo: recarregar deixa o da Agenda ainda a caminho (atrasado), fora do cache.
  await p.reload();
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

// Marca o instante em que html[data-carregando] entra e sai (performance.now), para medir sem o atraso do Playwright.
const espiarCarregando = `(() => {
  window.__carga = [];
  new MutationObserver(() => {
    const ligado = document.documentElement.hasAttribute("data-carregando");
    const ultimo = window.__carga[window.__carga.length - 1];
    if (!ultimo || ultimo.ligado !== ligado) window.__carga.push({ ligado, t: performance.now() });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-carregando"] });
})()`;

/** Duração (ms) da última barra de carregamento: do clique (marca ligada) até a tela nova (marca desligada). */
async function ultimaCarga(p: Page) {
  return p.evaluate(() => {
    const c = (window as unknown as { __carga: { ligado: boolean; t: number }[] }).__carga;
    const fim = c.length - 1;
    if (fim < 1 || c[fim].ligado || !c[fim - 1].ligado) return null;
    return c[fim].t - c[fim - 1].t;
  });
}

test("aba já visitada abre do cache: sem requisição RSC e sem barra de carregamento", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  await p.evaluate(espiarCarregando);
  // Só a navegação conta; o prefetch (cabeçalho next-router-prefetch) pode ir ao servidor.
  const navegacoes: string[] = [];
  await p.route(
    (url) => url.searchParams.has("_rsc"),
    async (rota) => {
      if (!rota.request().headers()["next-router-prefetch"]) navegacoes.push(new URL(rota.request().url()).pathname);
      await new Promise((r) => setTimeout(r, 800));
      await rota.continue();
    },
  );
  const html = p.locator("html");
  const ir = async (nome: string, caminho: RegExp) => {
    navegacoes.length = 0;
    await aba(p, nome).click();
    await expect(p).toHaveURL(caminho);
    await expect(html).not.toHaveAttribute("data-carregando", /.*/);
    await parado(p);
    return { ms: await ultimaCarga(p), rsc: [...navegacoes] };
  };
  const primeira = await ir("Agenda", /\/agenda$/);
  await ir("Folgas", /\/folgas$/);
  const segunda = await ir("Agenda", /\/agenda$/);
  console.log(`[055] Agenda com RSC +800 ms: 1ª visita ${primeira.ms?.toFixed(0)} ms, 2ª visita ${segunda.ms?.toFixed(0)} ms`);
  expect(segunda.rsc).toEqual([]);
  expect(segunda.ms).not.toBeNull();
  expect(segunda.ms!).toBeLessThanOrEqual(150);
  await p.context().close();
});

test("salvar o perfil e voltar ao Perfil mostra o dado novo", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  const meusDados = p.locator("form").filter({ has: p.getByRole("heading", { name: "Meus dados" }) });
  const telefone = meusDados.getByLabel(/Telefone/);
  await aba(p, "Perfil").click();
  await expect(p).toHaveURL(/\/perfil$/);
  const antes = await telefone.inputValue();
  await parado(p);
  // O Perfil já está no cache do cliente; salvar precisa invalidar.
  await aba(p, "Início").click();
  await expect(p).toHaveURL(/\/inicio$/);
  await parado(p);
  await aba(p, "Perfil").click();
  await expect(p).toHaveURL(/\/perfil$/);
  const novo = `(11) 9${String(Date.now()).slice(-8)}`;
  await telefone.fill(novo);
  await meusDados.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p).toHaveURL(/\/perfil\?ok=/);
  await parado(p);
  await aba(p, "Início").click();
  await expect(p).toHaveURL(/\/inicio$/);
  await parado(p);
  await aba(p, "Perfil").click();
  await expect(p).toHaveURL(/\/perfil$/);
  await expect(telefone).toHaveValue(novo);
  // Devolve o telefone de antes para os testes seguintes.
  await telefone.fill(antes);
  await meusDados.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p).toHaveURL(/\/perfil\?ok=/);
  await p.context().close();
});

const centroInd = (p: Page) =>
  p.locator(".tabbar__ind").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  });
// Na barra lateral (sticky) a tela nova pode mudar a altura do topo no meio da troca: mede em relação à barra.
const centroRelativo = (p: Page) =>
  p.locator(".tabbar__ind").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const n = el.parentElement!.getBoundingClientRect();
    return { x: r.x - n.x + r.width / 2, y: r.y - n.y + r.height / 2 };
  });

test("a pílula da aba sai na hora do toque, antes da tela nova chegar", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  // Sem View Transition (Firefox, Safari antigo) a pílula anda durante a espera; com ela, ver o teste seguinte.
  await p.addInitScript("document.startViewTransition = undefined");
  await p.route(
    (url) => url.searchParams.has("_rsc"),
    async (rota) => {
      await new Promise((r) => setTimeout(r, 800));
      await rota.continue();
    },
  );
  await p.reload();
  await expect(p.locator(".tabbar__ind")).toHaveCSS("opacity", "1");
  await p.waitForTimeout(600);
  const antes = await centroInd(p);
  const alvo = await aba(p, "Agenda").locator(".pill").boundingBox();
  const centroAlvo = alvo!.x + alvo!.width / 2;
  await aba(p, "Agenda").click();
  await p.waitForTimeout(100);
  const depois = await centroInd(p);
  // Ainda no Início: a tela nova não chegou e a pílula já anda em direção à Agenda.
  expect(new URL(p.url()).pathname).toBe("/inicio");
  expect(depois.x).toBeGreaterThan(antes.x + 5);
  expect(depois.x).toBeLessThan(centroAlvo + 20);
  await expect(aba(p, "Agenda")).toHaveClass(/is-active/);
  if (process.env.PRINT_PILULA) {
    // Meio do deslize: dá para ver a pílula esticada (borda da frente já longe, a de trás atrasada).
    await p.waitForTimeout(0);
    await p.screenshot({ path: `${process.env.PRINT_PILULA}-meio.png`, clip: { x: 0, y: 844 - 110, width: 390, height: 110 } });
  }
  await expect(p).toHaveURL(/\/agenda$/);
  await p.waitForTimeout(700);
  const fim = await centroInd(p);
  expect(Math.abs(fim.x - centroAlvo)).toBeLessThan(2);
  expect(Math.abs(fim.w - alvo!.width)).toBeLessThan(2);
  if (process.env.PRINT_PILULA) await p.screenshot({ path: `${process.env.PRINT_PILULA}-fim.png`, clip: { x: 0, y: 844 - 110, width: 390, height: 110 } });
  await p.context().close();
});

test("com View Transition a pílula anda durante a espera e a troca de tela ainda anima", async ({ browser }) => {
  // VIDEO_PILULA_VT=<arquivo .webm>: grava a evidência (rede lenta, View Transition ligada).
  const video = process.env.VIDEO_PILULA_VT;
  const p = await entrarComEspiao(browser, "no-preference", video ? path.dirname(video) : undefined);
  // A transição começa só com a tela nova pronta (navegar.ts, tarefa 071): o toque não congela a página.
  // Toda resposta RSC (prefetch inclusive) só sai 800 ms depois do clique: a Agenda não vem do cache.
  let clicou!: (t: number) => void;
  const clique = new Promise<number>((r) => (clicou = r));
  await p.route(
    (url) => url.searchParams.has("_rsc"),
    async (rota) => {
      const t = await clique;
      await new Promise((r) => setTimeout(r, Math.max(0, t + 800 - Date.now())));
      await rota.continue();
    },
  );
  await p.reload();
  await expect(p.locator(".tabbar__ind")).toHaveCSS("opacity", "1");
  await p.waitForTimeout(600);
  await p.evaluate(() => ((window as unknown as { __vt: unknown[] }).__vt = []));
  const antes = await centroInd(p);
  const alvo = await aba(p, "Agenda").locator(".pill").boundingBox();
  const centroAlvo = alvo!.x + alvo!.width / 2;
  clicou(Date.now());
  await aba(p, "Agenda").click();
  await p.waitForTimeout(100);
  const depois = await centroInd(p);
  expect(new URL(p.url()).pathname).toBe("/inicio");
  expect(depois.x).toBeGreaterThan(antes.x + 5);
  expect(depois.x).toBeLessThan(centroAlvo + 20);
  // Ainda esperando a resposta: nenhuma transição começou e a pílula já chegou perto da aba.
  await p.waitForTimeout(400);
  expect(new URL(p.url()).pathname).toBe("/inicio");
  expect(await transicoes(p)).toEqual([]);
  expect(Math.abs((await centroInd(p)).x - centroAlvo)).toBeLessThan(6);
  await expect(p).toHaveURL(/\/agenda$/);
  await parado(p);
  expect(await transicoes(p)).toEqual(["aba-dir"]);
  await p.waitForTimeout(300);
  const fim = await centroInd(p);
  expect(Math.abs(fim.x - centroAlvo)).toBeLessThan(2);
  expect(Math.abs(fim.w - alvo!.width)).toBeLessThan(2);
  await expect(aba(p, "Agenda")).toHaveClass(/is-active/);
  const gravacao = p.video();
  await p.context().close();
  if (video && gravacao) {
    fs.mkdirSync(path.dirname(video), { recursive: true });
    await gravacao.saveAs(video);
    await gravacao.delete();
  }
});

test("a pílula acompanha o pathname no voltar e fica esticada só no caminho", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  const larguraParada = (await centroInd(p)).w;
  await aba(p, "Perfil").click();
  await p.waitForTimeout(150);
  // Esticada no meio do caminho: mais larga que parada.
  expect((await centroInd(p)).w).toBeGreaterThan(larguraParada + 4);
  await expect(p).toHaveURL(/\/perfil$/);
  await p.waitForTimeout(700);
  await p.goBack();
  await expect(p).toHaveURL(/\/inicio$/);
  await p.waitForTimeout(700);
  const alvo = await aba(p, "Início").locator(".pill").boundingBox();
  const fim = await centroInd(p);
  expect(Math.abs(fim.x - (alvo!.x + alvo!.width / 2))).toBeLessThan(2);
  expect(Math.abs(fim.w - larguraParada)).toBeLessThan(2);
  await p.context().close();
});

test("desktop: a pílula desce pela barra lateral e fica parada na aba ativa", async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await contexto.newPage();
  await p.addInitScript("document.startViewTransition = undefined");
  await p.goto("/entrar");
  await p.getByLabel("E-mail").fill("admin@e2e.local");
  await p.getByLabel("Senha", { exact: true }).fill(SENHA);
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p).toHaveURL(/\/inicio$/);
  await p.waitForTimeout(500);
  const antes = await centroRelativo(p);
  await aba(p, "Perfil").click();
  await p.waitForTimeout(120);
  const meio = await centroRelativo(p);
  expect(meio.y).toBeGreaterThan(antes.y + 5);
  expect(Math.abs(meio.x - antes.x)).toBeLessThan(1);
  if (process.env.PRINT_PILULA) await p.screenshot({ path: `${process.env.PRINT_PILULA}-desktop-meio.png`, clip: { x: 0, y: 0, width: 200, height: 460 } });
  await expect(p).toHaveURL(/\/perfil$/);
  await p.waitForTimeout(700);
  const alvo = await aba(p, "Perfil").locator(".pill").boundingBox();
  const fim = await centroInd(p);
  expect(Math.abs(fim.y - (alvo!.y + alvo!.height / 2))).toBeLessThan(2);
  expect(Math.abs(fim.h - alvo!.height)).toBeLessThan(2);
  if (process.env.PRINT_PILULA) await p.screenshot({ path: `${process.env.PRINT_PILULA}-desktop-fim.png`, clip: { x: 0, y: 0, width: 200, height: 460 } });
  await contexto.close();
});

// Guarda o atraso de cada animação de entrada da cascata (motion.enter: translateY 8 px) no instante em que nasce.
const espiarCascata = `(() => {
  window.__cascata = [];
  const animar = Element.prototype.animate;
  Element.prototype.animate = function (quadros, opcoes) {
    if (Array.isArray(quadros) && String(quadros[0]?.transform).includes("translateY(8px)") && this.closest("main"))
      window.__cascata.push(Number(opcoes?.delay ?? 0));
    return animar.call(this, quadros, opcoes);
  };
})()`;
const cascataVista = (p: Page) => p.evaluate(() => (window as unknown as { __cascata: number[] }).__cascata.splice(0));

test("troca de aba: os blocos da tela nova entram em cascata; movimento desligado não anima", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  await p.evaluate(espiarCascata);
  await aba(p, "Agenda").click();
  await expect(p).toHaveURL(/\/agenda$/);
  await expect.poll(async () => (await p.evaluate(() => (window as unknown as { __cascata: number[] }).__cascata.length))).toBeGreaterThan(2);
  const atrasos = await cascataVista(p);
  expect(atrasos[0]).toBe(0);
  for (let i = 1; i < atrasos.length; i++) expect(atrasos[i]).toBeGreaterThanOrEqual(atrasos[i - 1]);
  expect(atrasos[1]).toBeGreaterThan(0);
  // Do 8º item em diante entram juntos: o atraso para em 7 × 35 ms.
  expect(Math.max(...atrasos)).toBeLessThanOrEqual(7 * 35);
  // A troca de aba esmaece a tela antiga, sem deslize.
  expect(await transicoes(p)).toEqual(["aba-dir"]);
  await parado(p);

  // Filtro dentro da tela: trocar o mês da Agenda faz a lista nova entrar em cascata.
  await p.getByRole("button", { name: "Próximo mês" }).click();
  await expect.poll(async () => (await cascataVista(p)).length).toBeGreaterThan(0);

  await p.evaluate(() => (document.documentElement.dataset.motion = "off"));
  await cascataVista(p);
  await aba(p, "Folgas").click();
  await expect(p).toHaveURL(/\/folgas$/);
  await p.waitForTimeout(300);
  expect(await cascataVista(p)).toEqual([]);
  const animadas = await p.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => el.getAnimations().some((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))).length,
  );
  expect(animadas).toBe(0);
  await p.context().close();
});

// Gravação para conferência humana: VIDEO_057=<pasta> pnpm e2e (pula quando a variável não existe).
test("vídeo 057: três trocas de aba e uma troca de filtro", async ({ browser }) => {
  test.skip(!process.env.VIDEO_057, "defina VIDEO_057 para gravar");
  const p = await entrarComEspiao(browser, "no-preference", process.env.VIDEO_057);
  await p.waitForTimeout(900);
  for (const [nome, caminho] of [["Folgas", /\/folgas$/], ["Perfil", /\/perfil$/], ["Agenda", /\/agenda$/]] as const) {
    await aba(p, nome).click();
    await expect(p).toHaveURL(caminho);
    await p.waitForTimeout(1100);
  }
  await p.getByRole("button", { name: "Próximo mês" }).click();
  await p.waitForTimeout(1100);
  await p.context().close();
});

test("a pílula anima só com transform: left/right/top/bottom do style não mudam", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "no-preference");
  await p.addInitScript("document.startViewTransition = undefined");
  await p.reload();
  await expect(p.locator(".tabbar__ind")).toHaveCSS("opacity", "1");
  await p.waitForTimeout(600);
  const estilo = () =>
    p.locator(".tabbar__ind").evaluate((el) => {
      const s = (el as HTMLElement).style;
      return { borda: [s.left, s.right, s.top, s.bottom].join("|"), transform: s.transform, animando: el.getAnimations().length };
    });
  const antes = await estilo();
  await aba(p, "Agenda").click();
  const instantes = [];
  for (const espera of [30, 90, 150]) {
    await p.waitForTimeout(espera);
    instantes.push(await estilo());
  }
  expect(instantes.some((i) => i.animando > 0)).toBe(true);
  for (const i of instantes) expect(i.borda).toBe(antes.borda);
  expect(instantes[0].transform).not.toBe(antes.transform);
  await p.context().close();
});

test("movimento reduzido: a pílula pula para a aba nova sem animação", async ({ browser }) => {
  const p = await entrarComEspiao(browser, "reduce");
  await expect(p.locator(".tabbar__ind")).toHaveCSS("opacity", "1");
  await aba(p, "Agenda").click();
  await expect(aba(p, "Agenda")).toHaveClass(/is-active/);
  expect(await p.locator(".tabbar__ind").evaluate((el) => el.getAnimations().length)).toBe(0);
  const alvo = await aba(p, "Agenda").locator(".pill").boundingBox();
  const c = await centroInd(p);
  expect(Math.abs(c.x - (alvo!.x + alvo!.width / 2))).toBeLessThan(2);
  await p.context().close();
});
