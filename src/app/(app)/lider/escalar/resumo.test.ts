import { describe, expect, it } from "vitest";
import { descreverFaltas, resumoDaSugestao } from "./resumo";

describe("resumoDaSugestao", () => {
  it("lista as faltas agrupadas por função, em ordem de data", () => {
    const faltas = [
      { funcao: "Iluminação", data: "2026-11-22" },
      { funcao: "Projeção", data: "2026-11-29" },
      { funcao: "Iluminação", data: "2026-11-15" },
    ];
    expect(descreverFaltas(faltas)).toBe("Iluminação, 15/11 e 22/11; Projeção, 29/11");
    expect(resumoDaSugestao(20, 17, faltas)).toBe(
      "17 de 20 vagas preenchidas; 3 sem candidato (Iluminação, 15/11 e 22/11; Projeção, 29/11).",
    );
  });
  it("sem faltas, só a contagem", () => {
    expect(resumoDaSugestao(4, 4, [])).toBe("4 de 4 vagas preenchidas.");
  });
  it("sem vagas, avisa", () => {
    expect(resumoDaSugestao(0, 0, [])).toBe("Nenhuma vaga aberta para sugerir neste mês.");
  });
  it("três datas na mesma função", () => {
    expect(descreverFaltas(["01", "08", "15"].map((d) => ({ funcao: "Som", data: `2026-11-${d}` })))).toBe(
      "Som, 01/11, 08/11 e 15/11",
    );
  });
  it("duas vagas da mesma função no mesmo dia aparecem uma vez", () => {
    const faltas = ["08", "08", "15", "15"].map((d) => ({ funcao: "Projeção", data: `2026-11-${d}` }));
    expect(resumoDaSugestao(4, 0, faltas)).toBe("0 de 4 vagas preenchidas; 4 sem candidato (Projeção, 08/11 e 15/11).");
  });
});
