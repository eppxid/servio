import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Mede as telas principais em 3G lento e CPU 4x (docs/performance.md). Só falha se a tela não carregar;
// tempo acima da meta apenas é registrado. Roda sozinho ou depois das outras specs: reaproveita a igreja se já existir.
const SENHA = "senha-e2e-12345";
const META_MS = 4000;

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

async function entrarComoAdmin(p: Page) {
  await p.goto("/entrar");
  if (/\/primeiro-acesso/.test(p.url())) {
    await p.getByLabel("Nome da igreja").fill("Igreja Rede Lenta E2E");
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

type Linha = { tela: string; rota: string; ms: number | null; kbJs: number; semLazy: number; esqueleto: boolean; erro?: string };

test("rede 3G lenta + CPU 4x: tempo até o conteúdo e KB de JS nas telas principais", async ({ page }) => {
  await entrarComoAdmin(page);

  // Descobre um culto para o chat (a tela de culto do líder liga ao chat pelo mesmo id).
  await page.goto("/lider/cultos");
  const href = await page.locator('a[href^="/lider/cultos/"]').first().getAttribute("href", { timeout: 5000 }).catch(() => null);
  const eventoId = href?.split("/").pop();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const telas = [
    { tela: "Início / agenda do voluntário", rota: "/inicio" },
    { tela: "Cultos do líder", rota: "/lider/cultos" },
    { tela: "Escalar um culto", rota: "/lider/escalar" },
    ...(eventoId ? [{ tela: "Chat do culto", rota: `/chat/${eventoId}` }] : []),
    { tela: "Perfil", rota: "/perfil" },
  ];

  const linhas: Linha[] = [];
  for (const { tela, rota } of telas) {
    const linha: Linha = { tela, rota, ms: null, kbJs: 0, semLazy: 0, esqueleto: false };
    try {
      const t0 = Date.now();
      await page.goto(rota, { waitUntil: "commit", timeout: 60_000 });
      await page.locator("main h1").first().waitFor({ state: "visible", timeout: 60_000 });
      linha.ms = Date.now() - t0;
      await page.waitForLoadState("load", { timeout: 60_000 });
      const m = await page.evaluate(() => {
        const rec = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const bytes = rec
          .filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name))
          .reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
        const semLazy = [...document.querySelectorAll("img")].filter((i) => i.loading !== "lazy").length;
        const esqueleto = !!document.querySelector('[aria-busy="true"], .skeleton, .esqueleto');
        return { bytes, semLazy, esqueleto };
      });
      linha.kbJs = Math.round(m.bytes / 1024);
      linha.semLazy = m.semLazy;
      linha.esqueleto = m.esqueleto;
    } catch (e) {
      linha.erro = (e as Error).message.split("\n")[0];
    }
    linhas.push(linha);
    console.log(`[rede-lenta] ${tela} ${rota}: ${linha.ms ?? "FALHOU"} ms, ${linha.kbJs} KB JS, img sem lazy ${linha.semLazy}${linha.erro ? ` (${linha.erro})` : ""}`);
  }

  mkdirSync(".next/e2e-results", { recursive: true });
  writeFileSync(".next/e2e-results/rede-lenta.json", JSON.stringify({ metaMs: META_MS, linhas }, null, 2));

  const falhas = linhas.filter((l) => l.ms === null);
  expect(falhas, "telas que não carregaram").toEqual([]);
});
