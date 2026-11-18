import { expect, test, type Page } from "@playwright/test";

// Checklist mobile-375 (docs/mobile-375.md). Roda sozinho ou depois das outras specs: reaproveita a igreja se já existir.
const SENHA = "senha-e2e-12345";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

async function entrarComoAdmin(p: Page) {
  await p.goto("/entrar");
  if (/\/primeiro-acesso/.test(p.url())) {
    await p.getByLabel("Nome da igreja").fill("Igreja Mobile E2E");
    await p.getByLabel("Seu nome").fill("Admin E2E");
    await p.getByLabel("E-mail").fill("admin@e2e.local");
    await p.getByLabel("Senha", { exact: true }).fill(SENHA);
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: "Criar" }).click();
    await expect(p).toHaveURL(/\/lider\/configurar/);
  } else {
    await p.getByLabel("E-mail").fill("admin@e2e.local");
    await p.getByLabel("Senha", { exact: true }).fill(SENHA);
    await p.getByRole("button", { name: "Entrar" }).click();
    await expect(p).not.toHaveURL(/\/entrar/);
  }
}

/** Regras 1, 3 e 4 medidas no DOM: rolagem horizontal, fonte dos campos e alvo de toque. */
async function medir(p: Page) {
  return p.evaluate(() => {
    const visivel = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const emTexto = (e: Element) => !!e.closest("p, li, .prose, .text-sm") && e.tagName === "A" && !e.classList.contains("btn");
    const campos = [...document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select")]
      .filter(visivel)
      .map((e) => ({ el: e.outerHTML.slice(0, 80), fonte: parseFloat(getComputedStyle(e).fontSize) }))
      .filter((c) => c.fonte < 16);
    const alvos = [...document.querySelectorAll("button, a.btn")]
      .filter((e) => visivel(e) && !emTexto(e))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { el: e.outerHTML.slice(0, 80), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((a) => a.w < 44 || a.h < 44);
    return { largura: document.documentElement.scrollWidth, campos, alvos };
  });
}

test("375px: sem rolagem horizontal, campos ≥16px e alvos ≥44px nas telas principais", async ({ page }) => {
  await page.goto("/entrar");
  if (!/\/primeiro-acesso/.test(page.url())) {
    const m = await medir(page);
    expect.soft(m.largura, "/entrar largura").toBeLessThanOrEqual(375);
    expect.soft(m.campos, "/entrar campos <16px").toEqual([]);
    expect.soft(m.alvos, "/entrar alvos <44px").toEqual([]);
  }

  await entrarComoAdmin(page);
  for (const rota of ["/inicio", "/painel", "/perfil", "/lider/equipe"]) {
    await page.goto(rota);
    await page.waitForLoadState("networkidle");
    const m = await medir(page);
    expect.soft(m.largura, `${rota} largura`).toBeLessThanOrEqual(375);
    expect.soft(m.campos, `${rota} campos <16px`).toEqual([]);
    expect.soft(m.alvos, `${rota} alvos <44px`).toEqual([]);
  }
});

test("375px /painel: tabela em cartões e valor grande numa linha", async ({ page }) => {
  await entrarComoAdmin(page);
  await page.goto("/painel");
  if (await page.getByRole("alert").filter({ hasText: "Acesso negado" }).count()) {
    // O painel exige ao menos um ministério.
    await page.goto("/lider/equipe?aba=ministerios");
    await page.getByLabel("Nome do novo ministério").fill("Mobile 375");
    await page.getByRole("button", { name: "Criar ministério" }).click();
    await expect(page.locator("summary", { hasText: "Mobile 375" })).toBeVisible();
    await page.goto("/painel");
  }
  await page.waitForLoadState("networkidle");

  const tabela = page.locator("table.table");
  if (await tabela.count()) {
    await expect(tabela.locator("tbody tr").first()).toHaveCSS("display", "block");
    await expect(tabela.locator("tbody td").first()).toHaveCSS("display", "flex");
    await expect(tabela.locator("thead")).toHaveCSS("position", "absolute");
  }

  const valores = page.locator(".stat__val");
  expect(await valores.count()).toBeGreaterThan(0);
  for (const v of await valores.all()) {
    const { h, linha } = await v.evaluate((e) => {
      const s = getComputedStyle(e);
      const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.1;
      return { h: e.getBoundingClientRect().height, linha: lh };
    });
    expect(h).toBeLessThanOrEqual(linha * 1.5);
  }
});

test("375px /agenda e /folgas: abas no fundo da tela e fim do conteúdo acima do botão e das abas", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await entrarComoAdmin(page);
  for (const rota of ["/agenda", "/folgas"]) {
    await page.goto(rota);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const caixa = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const tela = document.querySelector("main .tela");
      const fimConteudo = Math.max(
        ...[...(tela?.children ?? [])]
          .filter((e) => !e.matches(".cta-espaco, .cta, dialog, script") && e.getBoundingClientRect().height > 0)
          .map((e) => e.getBoundingClientRect().bottom),
      );
      return { janela: window.innerHeight, abas: caixa(".tabbar"), cta: caixa("main .cta"), fimConteudo };
    });
    expect(m.abas, `${rota} sem abas`).not.toBeNull();
    expect(m.fimConteudo, `${rota} sem conteúdo medido`).toBeGreaterThan(0);
    expect.soft(Math.round(m.abas!.bottom), `${rota} abas fora do fundo`).toBe(m.janela);
    const limite = m.cta ? m.cta.top : m.abas!.top;
    expect.soft(m.fimConteudo, `${rota} conteúdo por baixo do botão/abas`).toBeLessThanOrEqual(limite);
    if (m.cta) expect.soft(m.cta.bottom, `${rota} botão por cima das abas`).toBeLessThanOrEqual(m.abas!.top);
  }
});

test("375px /agenda: viewport visual deslocada (iPhone) — abas e botão descem até o fundo visível", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // Simula o estado do WebKit no iPhone: a área visível 187 px abaixo da viewport de layout.
  await page.addInitScript(() => {
    const ouvintes: Record<string, (() => void)[]> = {};
    const falsa = {
      offsetTop: 187,
      offsetLeft: 0,
      scale: 1,
      get height() {
        return window.innerHeight;
      },
      get width() {
        return window.innerWidth;
      },
      addEventListener: (t: string, f: () => void) => (ouvintes[t] ??= []).push(f),
      removeEventListener: () => {},
    };
    Object.defineProperty(window, "visualViewport", { get: () => falsa, configurable: true });
  });
  await entrarComoAdmin(page);
  await page.goto("/agenda");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--fundo-ajuste"))).toBe("187px");
  const m = await page.evaluate(() => ({
    janela: window.innerHeight,
    abas: document.querySelector(".tabbar")!.getBoundingClientRect().bottom,
    cta: document.querySelector("main .cta")?.getBoundingClientRect().bottom ?? null,
  }));
  expect(Math.round(m.abas)).toBe(m.janela + 187);
  if (m.cta !== null) expect(Math.round(m.cta)).toBeLessThanOrEqual(m.janela + 187);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.screenshot({ path: "docs/prints/073-agenda-fim.png" });
});
