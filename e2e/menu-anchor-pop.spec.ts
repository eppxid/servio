import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Tarefa 072: o menu suspenso cresce do canto do âncora e encolhe de volta (Anchor Pop).
// O BotaoTema não está montado em nenhuma tela hoje; o teste monta um botão igual a ele e chama motion.menu().
const PASTA = process.env.PRINTS_MOVIMENTO ?? "E:/Devs/Servio-teste-movimento";
const TELAS = [
  { nome: "celular", viewport: { width: 390, height: 844 } },
  { nome: "desktop", viewport: { width: 1280, height: 800 } },
];

async function preparar(p: Page, motionOff: boolean) {
  await p.goto("/entrar");
  if (motionOff) await p.evaluate(() => (document.documentElement.dataset.motion = "off"));
  await p.evaluate(() => localStorage.setItem("ui:theme", "light"));
  await p.evaluate(() => (document.documentElement.dataset.theme = "light"));
  if (!(await p.evaluate(() => !!(window as any).motion))) await p.addScriptTag({ url: "/ui/motion.js" });
  await p.evaluate(() => {
    const b = document.createElement("button");
    b.id = "botao-tema";
    b.type = "button";
    b.setAttribute("aria-label", "Tema");
    b.setAttribute("aria-haspopup", "menu");
    b.textContent = "T";
    b.style.cssText = "position:fixed;top:12px;right:12px;z-index:90;width:44px;height:44px";
    b.onclick = () => {
      const m = (window as any).motion;
      m.menu(
        b,
        [["light", "Claro"], ["dark", "Escuro"], ["system", "Sistema"]].map(([v, label]) => ({
          label,
          checked: v === "light",
          run: () => m.theme(v, b),
        })),
      );
    };
    document.body.append(b);
  });
}

test.describe("menu Anchor Pop", () => {
  mkdirSync(PASTA, { recursive: true });

  for (const tela of TELAS) {
    test(`abre do canto do botão e encolhe ao escolher (${tela.nome})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: tela.viewport, deviceScaleFactor: 2, locale: "pt-BR" });
      const p = await ctx.newPage();
      await preparar(p, false);
      await p.getByRole("button", { name: "Tema" }).click();
      const menu = p.locator(".menu");
      await expect(menu).toBeVisible();
      // Botão no canto superior direito: o menu abre abaixo e é empurrado para a esquerda.
      const origem = await menu.evaluate((e) => (e as HTMLElement).style.transformOrigin);
      expect(origem, "transform-origin").toContain("top"); // o navegador normaliza para "right top"
      expect(origem).toContain("right");
      // Durante a entrada a escala é menor que 1.
      const escala = await menu.evaluate((e) => {
        const a = e.getAnimations()[0];
        a.pause();
        a.currentTime = 80;
        return new DOMMatrix(getComputedStyle(e).transform).a;
      });
      expect(escala).toBeLessThan(1);
      expect(escala).toBeGreaterThan(0.8);
      await p.screenshot({ path: `${PASTA}/072-${tela.nome}-entrada.png` });
      await menu.evaluate((e) => e.getAnimations()[0].play());
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${PASTA}/072-${tela.nome}-aberto.png` });

      await menu.getByRole("menuitemradio", { name: "Escuro" }).click();
      await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(menu).toHaveCount(0);
      await ctx.close();
    });
  }

  test("sem movimento (data-motion=off) abre e fecha sem animação", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: TELAS[0].viewport, locale: "pt-BR" });
    const p = await ctx.newPage();
    await preparar(p, true);
    await p.getByRole("button", { name: "Tema" }).click();
    const menu = p.locator(".menu");
    await expect(menu).toBeVisible();
    const dur = await menu.evaluate((e) => e.getAnimations().map((a) => Number(a.effect?.getComputedTiming().duration)));
    expect(dur.every((x) => x === 0)).toBe(true);
    await p.keyboard.press("Escape");
    await expect(menu).toHaveCount(0, { timeout: 500 });
    await ctx.close();
  });
});
