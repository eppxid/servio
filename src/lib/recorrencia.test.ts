import { describe, expect, it } from "vitest";
import { gerarOcorrencias } from "./recorrencia";

const domingo = { diaSemana: 0, horaInicio: "19:00", horaFim: "21:00" };

describe("gerarOcorrencias", () => {
  it("gera um culto por semana", () => {
    // 01/11/2026 é domingo
    const r = gerarOcorrencias(
      domingo,
      new Date("2026-11-01T00:00:00-03:00"),
      new Date("2026-11-30T23:59:00-03:00"),
    );
    expect(r.map((o) => o.inicio.toISOString())).toEqual([
      "2026-11-01T22:00:00.000Z",
      "2026-11-08T22:00:00.000Z",
      "2026-11-15T22:00:00.000Z",
      "2026-11-22T22:00:00.000Z",
      "2026-11-29T22:00:00.000Z",
    ]);
    expect(r[0].fim?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("respeita a data fim (inclusive)", () => {
    const r = gerarOcorrencias(
      { ...domingo, ate: "2026-11-15" },
      new Date("2026-11-01T00:00:00-03:00"),
      new Date("2026-12-31T00:00:00-03:00"),
    );
    expect(r).toHaveLength(3);
    expect(r[2].inicio.toISOString()).toBe("2026-11-15T22:00:00.000Z");
  });

  it("atravessa a virada de mês e de ano", () => {
    // quartas-feiras: 30/12/2026 e 06/01/2027
    const r = gerarOcorrencias(
      { diaSemana: 3, horaInicio: "20:00" },
      new Date("2026-12-28T00:00:00-03:00"),
      new Date("2027-01-10T00:00:00-03:00"),
    );
    expect(r.map((o) => o.inicio.toISOString())).toEqual([
      "2026-12-30T23:00:00.000Z",
      "2027-01-06T23:00:00.000Z",
    ]);
    expect(r[0].fim).toBeNull();
  });

  it("usa o fuso de São Paulo: culto das 21h não cai no dia seguinte", () => {
    const r = gerarOcorrencias(
      { diaSemana: 6, horaInicio: "21:30" },
      new Date("2026-11-07T00:00:00-03:00"),
      new Date("2026-11-07T23:59:00-03:00"),
    );
    expect(r).toHaveLength(1);
    expect(r[0].inicio.toISOString()).toBe("2026-11-08T00:30:00.000Z");
  });

  it("ignora ocorrência anterior a 'de' no mesmo dia", () => {
    const r = gerarOcorrencias(
      domingo,
      new Date("2026-11-01T20:00:00-03:00"),
      new Date("2026-11-02T00:00:00-03:00"),
    );
    expect(r).toHaveLength(0);
  });
});
