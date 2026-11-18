import { describe, expect, it } from "vitest";
import { ajusteDoFundo } from "./fundo-visual";

const base = { topoVisual: 0, alturaVisual: 812, escala: 1, fundoBarra: 812, ajusteAtual: 0 };

describe("ajusteDoFundo", () => {
  it("barra já no fundo: sem ajuste", () => {
    expect(ajusteDoFundo(base)).toBe(0);
  });

  it("viewport visual deslocada para baixo: desce a barra o que falta", () => {
    expect(ajusteDoFundo({ ...base, topoVisual: 187 })).toBe(187);
  });

  it("viewport de layout menor que a visual: desce a barra", () => {
    expect(ajusteDoFundo({ ...base, fundoBarra: 640 })).toBe(172);
  });

  it("desconta o ajuste já aplicado (não acumula)", () => {
    expect(ajusteDoFundo({ ...base, topoVisual: 187, fundoBarra: 812 + 187, ajusteAtual: 187 })).toBe(187);
  });

  it("teclado aberto (fundo visível acima): não sobe a barra", () => {
    expect(ajusteDoFundo({ ...base, alturaVisual: 480 })).toBe(0);
  });

  it("campo em foco com viewport deslocada: não ajusta (barra fica atrás do teclado)", () => {
    expect(ajusteDoFundo({ ...base, topoVisual: 187, campoEmFoco: true })).toBe(0);
  });

  it("zoom de pinça: não ajusta", () => {
    expect(ajusteDoFundo({ ...base, topoVisual: 187, escala: 2 })).toBe(0);
  });

  it("diferença menor que 1px: sem ajuste", () => {
    expect(ajusteDoFundo({ ...base, alturaVisual: 812.4 })).toBe(0);
  });
});
