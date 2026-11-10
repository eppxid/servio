import { describe, expect, it } from "vitest";
import { podeUsarVidro, type AmbienteVidro } from "./vidro";

const chromeAndroid: AmbienteVidro = {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
  marcas: ["Chromium", "Google Chrome", "Not=A?Brand"],
  hardwareConcurrency: 8,
  reducaoTransparencia: false,
  reducaoMovimento: false,
  contrasteAlto: false,
};

describe("podeUsarVidro", () => {
  it("liga no Chromium Android", () => expect(podeUsarVidro(chromeAndroid)).toBe(true));
  it("desliga em qualquer navegador no iOS", () => {
    const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130 Mobile/15E148";
    expect(podeUsarVidro({ ...chromeAndroid, userAgent: ios })).toBe(false);
  });
  it("desliga no Firefox (sem marcas Chromium)", () => {
    expect(podeUsarVidro({ ...chromeAndroid, marcas: [], userAgent: "Mozilla/5.0 Firefox/130.0" })).toBe(false);
  });
  it("desliga com reduced-transparency, reduced-motion ou contraste alto", () => {
    expect(podeUsarVidro({ ...chromeAndroid, reducaoTransparencia: true })).toBe(false);
    expect(podeUsarVidro({ ...chromeAndroid, reducaoMovimento: true })).toBe(false);
    expect(podeUsarVidro({ ...chromeAndroid, contrasteAlto: true })).toBe(false);
  });
  it("desliga com 4 núcleos ou menos", () => {
    expect(podeUsarVidro({ ...chromeAndroid, hardwareConcurrency: 4 })).toBe(false);
    expect(podeUsarVidro({ ...chromeAndroid, hardwareConcurrency: 5 })).toBe(true);
  });
});
