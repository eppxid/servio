import { describe, expect, it } from "vitest";
import { sugerirEscala, type EventoSugestao, type VagaSugestao } from "./sugestao";

// Domingos de novembro/2026, 19h–21h em São Paulo (22h–00h UTC).
const domingo = (dia: number, id: number): EventoSugestao => ({
  id,
  inicio: new Date(`2026-11-${String(dia).padStart(2, "0")}T22:00:00Z`),
  fim: new Date(`2026-11-${String(dia + 1).padStart(2, "0")}T00:00:00Z`),
});
const eventos = [domingo(1, 1), domingo(8, 2), domingo(15, 3), domingo(22, 4), domingo(29, 5)];

/** N vagas da função em cada evento; itemId sequencial. */
function vagas(evs: readonly EventoSugestao[], porFuncao: Record<number, number>): VagaSugestao[] {
  let id = 100;
  return evs.flatMap((e) =>
    Object.entries(porFuncao).flatMap(([f, n]) =>
      Array.from({ length: n }, () => ({ itemId: id++, eventoId: e.id, funcaoId: Number(f) })),
    ),
  );
}

function contar(r: { usuarioId: number }[]) {
  const c = new Map<number, number>();
  for (const a of r) c.set(a.usuarioId, (c.get(a.usuarioId) ?? 0) + 1);
  return c;
}

describe("sugerirEscala", () => {
  it("preenche N vagas da mesma função com pessoas diferentes", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 2, 20: 1 }),
      elegiveis: new Map([
        [10, [1, 2, 3]],
        [20, [3, 4]],
      ]),
      indisponibilidades: [],
    });
    expect(r.semCandidato).toEqual([]);
    expect(r.atribuicoes).toHaveLength(3);
    expect(new Set(r.atribuicoes.map((a) => a.usuarioId)).size).toBe(3);
    expect(r.atribuicoes.filter((a) => a.funcaoId === 10).map((a) => a.itemId)).toEqual([100, 101]);
  });

  it("usa só os elegíveis da função (aprovados)", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 1 }),
      elegiveis: new Map([[10, [7]]]),
      indisponibilidades: [],
    });
    expect(r.atribuicoes.map((a) => a.usuarioId)).toEqual([7]);
  });

  it("equilibra no mês: diferença de no máximo 1 escala", () => {
    const r = sugerirEscala({
      eventos,
      vagas: vagas(eventos, { 10: 1, 20: 1 }),
      elegiveis: new Map([
        [10, [1, 2, 3]],
        [20, [1, 2, 3, 4]],
      ]),
      indisponibilidades: [],
    });
    expect(r.atribuicoes).toHaveLength(10);
    const c = contar(r.atribuicoes);
    const valores = [1, 2, 3, 4].map((u) => c.get(u) ?? 0);
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
  });

  it("respeita folga (indisponibilidade)", () => {
    const r = sugerirEscala({
      eventos,
      vagas: vagas(eventos, { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [{ usuarioId: 1, dataInicio: "2026-11-01", dataFim: "2026-11-20" }],
    });
    const porEvento = new Map(r.atribuicoes.map((a) => [a.eventoId, a.usuarioId]));
    expect([porEvento.get(1), porEvento.get(2), porEvento.get(3)]).toEqual([2, 2, 2]);
    expect(porEvento.get(4)).toBe(1);
  });

  it("não escala quem já está no mesmo culto (escolha do líder ou outra função)", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 1, 20: 1 }),
      elegiveis: new Map([
        [10, [1, 2]],
        [20, [1, 3]],
      ]),
      indisponibilidades: [],
      ocupacoes: [{ usuarioId: 1, eventoId: 1, inicio: eventos[0].inicio, fim: eventos[0].fim }],
    });
    expect(r.atribuicoes.map((a) => [a.funcaoId, a.usuarioId])).toEqual([
      [10, 2],
      [20, 3],
    ]);
  });

  it("respeita conflito de horário e um evento por dia", () => {
    const manha: EventoSugestao = { id: 7, inicio: new Date("2026-11-01T12:00:00Z"), fim: new Date("2026-11-01T14:00:00Z") };
    const r = sugerirEscala({
      eventos: [manha, eventos[0]],
      vagas: vagas([manha, eventos[0]], { 10: 1 }),
      elegiveis: new Map([[10, [1]]]),
      indisponibilidades: [],
    });
    expect(r.atribuicoes.map((a) => a.eventoId)).toEqual([7]);
    expect(r.semCandidato.map((v) => v.eventoId)).toEqual([1]);

    const outro = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      ocupacoes: [{ usuarioId: 1, eventoId: 99, inicio: new Date("2026-11-01T23:00:00Z"), fim: null }],
    });
    expect(outro.atribuicoes[0].usuarioId).toBe(2);
  });

  it("respeita o limite mensal contando o histórico do mês", () => {
    const r = sugerirEscala({
      eventos,
      vagas: vagas(eventos, { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      limiteMensal: 2,
      historico: [{ usuarioId: 1, inicio: new Date("2026-11-05T22:00:00Z") }],
    });
    const c = contar(r.atribuicoes);
    expect(c.get(1)).toBe(1);
    expect(c.get(2)).toBe(2);
    expect(r.semCandidato).toHaveLength(2);
  });

  it("rodízio: quem serviu menos nos últimos 60 dias vem primeiro", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      historico: [
        { usuarioId: 1, inicio: new Date("2026-10-04T22:00:00Z") },
        // Mais de 60 dias antes: não conta.
        { usuarioId: 2, inicio: new Date("2026-08-01T22:00:00Z") },
        { usuarioId: 2, inicio: new Date("2026-08-02T22:00:00Z") },
      ],
    });
    expect(r.atribuicoes[0].usuarioId).toBe(2);
  });

  it("desempate: menos no mês, depois sem escala no dia anterior", () => {
    const sabado = new Date("2026-10-31T22:00:00Z");
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      ocupacoes: [{ usuarioId: 1, eventoId: 50, inicio: sabado, fim: null }],
    });
    expect(r.atribuicoes[0].usuarioId).toBe(2);

    const mes = sugerirEscala({
      eventos: [eventos[1]],
      vagas: vagas([eventos[1]], { 10: 1 }),
      elegiveis: new Map([[10, [1, 2]]]),
      indisponibilidades: [],
      historico: [
        { usuarioId: 1, inicio: new Date("2026-10-11T22:00:00Z") },
        { usuarioId: 2, inicio: new Date("2026-11-01T22:00:00Z") },
      ],
    });
    // Empatados em 60 dias (1 cada): 1 tem menos no mês de novembro.
    expect(mes.atribuicoes[0].usuarioId).toBe(1);
  });

  it("vaga sem candidato fica no resumo", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: vagas([eventos[0]], { 10: 2 }),
      elegiveis: new Map([[10, [1]]]),
      indisponibilidades: [],
    });
    expect(r.atribuicoes).toEqual([{ itemId: 100, eventoId: 1, funcaoId: 10, usuarioId: 1 }]);
    expect(r.semCandidato).toEqual([{ itemId: 101, eventoId: 1, funcaoId: 10 }]);
  });

  it("função com menos candidatos é preenchida primeiro", () => {
    const r = sugerirEscala({
      eventos: [eventos[0]],
      vagas: [
        { itemId: 1, eventoId: 1, funcaoId: 20 },
        { itemId: 2, eventoId: 1, funcaoId: 10 },
      ],
      elegiveis: new Map([
        [10, [1]],
        [20, [1, 2]],
      ]),
      indisponibilidades: [],
    });
    expect(r.atribuicoes.map((a) => [a.funcaoId, a.usuarioId])).toEqual([
      [10, 1],
      [20, 2],
    ]);
  });

  it("é determinística: mesma entrada (em qualquer ordem) = mesma saída", () => {
    const base = {
      eventos,
      elegiveis: new Map([
        [10, [3, 1, 2]],
        [20, [4, 2]],
      ]),
      indisponibilidades: [],
      limiteMensal: 3,
    };
    const v = vagas(eventos, { 10: 2, 20: 1 });
    const a = sugerirEscala({ ...base, vagas: v });
    const b = sugerirEscala({ ...base, eventos: [...eventos].reverse(), vagas: [...v].reverse() });
    expect(b).toEqual(a);
  });
});
