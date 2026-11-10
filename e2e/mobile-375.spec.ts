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
