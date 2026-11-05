import { describe, expect, it } from "vitest";
import { sugerirEscala, type EventoSugestao } from "./sugestao";

// Domingos de novembro/2026, 19h–21h em São Paulo (22h–00h UTC).
const domingo = (dia: number, id: number): EventoSugestao => ({
  id,
  inicio: new Date(`2026-11-${String(dia).padStart(2, "0")}T22:00:00Z`),
  fim: new Date(`2026-11-${String(dia + 1).padStart(2, "0")}T00:00:00Z`),
});
const eventos = [domingo(1, 1), domingo(8, 2), domingo(15, 3), domingo(22, 4), domingo(29, 5)];

function contar(r: { usuarioId: number | null }[]) {
  const c = new Map<number, number>();
  for (const a of r) if (a.usuarioId !== null) c.set(a.usuarioId, (c.get(a.usuarioId) ?? 0) + 1);
  return c;
}

describe("sugerirEscala", () => {
  it("equilibra: diferença de no máximo 1 escala entre elegíveis", () => {
    const elegiveis = new Map([
      [10, [1, 2, 3]],
      [20, [1, 2, 3, 4]],
    ]);
    const r = sugerirEscala({ eventos, funcoes: [10, 20], elegiveis, indisponibilidades: [] });
    expect(r).toHaveLength(10);
    expect(r.every((a) => a.usuarioId !== null)).toBe(true);
    const c = contar(r);
    const valores = [1, 2, 3, 4].map((u) => c.get(u) ?? 0);
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
  });

  it("equilibra contando as escalas que cada um já tem no período", () => {
    const r = sugerirEscala({
      eventos: eventos.slice(0, 2),
      funcoes: [10],
      elegiveis: new Map([[10, [1, 2, 3]]]),
      indisponibilidades: [],
      contagemInicial: new Map([[1, 2]]),
    });
    expect(r.map((a) => a.usuarioId)).toEqual([2, 3]);
  });

  it("respeita indisponibilidade", () => {
    const r = sugerirEscala({
      eventos,
      funcoes: [10],
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [{ usuarioId: 1, dataInicio: "2026-11-01", dataFim: "2026-11-20" }],
    });
    const porEvento = new Map(r.map((a) => [a.eventoId, a.usuarioId]));
    expect([porEvento.get(1), porEvento.get(2), porEvento.get(3)]).toEqual([2, 2, 2]);
    expect(porEvento.get(4)).toBe(1);
  });

  it("respeita conflito de horário com escala de outro ministério", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      funcoes: [10],
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      ocupacoes: [
        { usuarioId: 1, eventoId: 99, inicio: new Date("2026-11-01T23:00:00Z"), fim: null },
      ],
    });
    expect(r[0].usuarioId).toBe(2);
  });

  it("não põe a mesma pessoa em dois eventos no mesmo dia", () => {
    const manha: EventoSugestao = { id: 7, inicio: new Date("2026-11-01T12:00:00Z"), fim: new Date("2026-11-01T14:00:00Z") };
    const r = sugerirEscala({
      eventos: [manha, eventos[0]],
      funcoes: [10],
      elegiveis: new Map([[10, [1]]]),
      indisponibilidades: [],
    });
    expect(r.map((a) => a.usuarioId)).toEqual([1, null]);
  });

  it("não repete a pessoa em duas funções do mesmo evento", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      funcoes: [10, 20],
      elegiveis: new Map([
        [10, [1]],
        [20, [1, 2]],
      ]),
      indisponibilidades: [],
    });
    expect(r).toEqual([
      { eventoId: 1, funcaoId: 10, usuarioId: 1 },
      { eventoId: 1, funcaoId: 20, usuarioId: 2 },
    ]);
  });

  it("mantém as escolhas fixas do líder e conta para o equilíbrio", () => {
    const r = sugerirEscala({
      eventos: eventos.slice(0, 2),
      funcoes: [10],
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      fixas: [{ eventoId: 1, funcaoId: 10, usuarioId: 2 }],
    });
    expect(r.map((a) => a.usuarioId)).toEqual([2, 1]);
  });
});
