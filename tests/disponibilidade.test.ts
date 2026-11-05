import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import {
  diasDaSemanaNoMes,
  estaIndisponivel,
  indisponiveisNoPeriodo,
  type Indisponibilidade,
} from "@/lib/disponibilidade";

const lista: Indisponibilidade[] = [
  { usuarioId: 1, dataInicio: "2026-11-10", dataFim: "2026-11-15" },
];

describe("estaIndisponivel", () => {
  it("lista vazia nunca bloqueia", () => {
    expect(estaIndisponivel(1, "2026-11-10", "2026-11-10", [])).toBe(false);
  });
  it("sobreposição parcial: começa antes, termina dentro", () => {
    expect(estaIndisponivel(1, "2026-11-08", "2026-11-11", lista)).toBe(true);
  });
  it("sobreposição parcial: começa dentro, termina depois", () => {
    expect(estaIndisponivel(1, "2026-11-14", "2026-11-20", lista)).toBe(true);
  });
  it("limite de dia é inclusivo nas duas pontas", () => {
    expect(estaIndisponivel(1, "2026-11-15", null, lista)).toBe(true);
    expect(estaIndisponivel(1, "2026-11-05", "2026-11-10", lista)).toBe(true);
    expect(estaIndisponivel(1, "2026-11-16", null, lista)).toBe(false);
    expect(estaIndisponivel(1, "2026-11-01", "2026-11-09", lista)).toBe(false);
  });
  it("ignora período de outro usuário", () => {
    expect(estaIndisponivel(2, "2026-11-12", null, lista)).toBe(false);
  });
  it("usa o dia no fuso de São Paulo", () => {
    // 01:00 UTC de 16/11 ainda é 15/11 (22h) em São Paulo
    expect(estaIndisponivel(1, new Date("2026-11-16T01:00:00Z"), null, lista)).toBe(true);
    expect(estaIndisponivel(1, new Date("2026-11-16T04:00:00Z"), null, lista)).toBe(false);
  });
});

describe("diasDaSemanaNoMes", () => {
  it("lista os domingos de novembro/2026", () => {
    expect(diasDaSemanaNoMes(2026, 11, 0)).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
  });
  it("conta terças de fevereiro bissexto de 2028", () => {
    expect(diasDaSemanaNoMes(2028, 2, 2)).toHaveLength(5);
  });
});

describe("indisponiveisNoPeriodo", () => {
  let banco: AnyDb;
  let min1: number;
  let min2: number;

  beforeAll(async () => {
    const pg = drizzle(new PGlite(), { schema });
    await migrate(pg, { migrationsFolder: "./drizzle" });
    banco = pg as unknown as AnyDb;
    const [ig] = await banco.insert(schema.igrejas).values({ nome: "T" }).returning();
    const [outra] = await banco.insert(schema.igrejas).values({ nome: "Outra" }).returning();
    const novoUsuario = async (igrejaId: number, email: string) =>
      (
        await banco
          .insert(schema.usuarios)
          .values({ igrejaId, nome: email, email, senhaHash: "x" })
          .returning()
      )[0].id;
    const [m1] = await banco
      .insert(schema.ministerios)
      .values({ igrejaId: ig.id, nome: "A" })
      .returning();
    const [m2] = await banco
      .insert(schema.ministerios)
      .values({ igrejaId: ig.id, nome: "B" })
      .returning();
    min1 = m1.id;
    min2 = m2.id;
    const aprovado = await novoUsuario(ig.id, "a@x.com");
    const pendente = await novoUsuario(ig.id, "p@x.com");
    const forasteiro = await novoUsuario(outra.id, "f@x.com");
    await banco.insert(schema.membrosMinisterio).values([
      { igrejaId: ig.id, usuarioId: aprovado, ministerioId: min1, status: "aprovado" },
      { igrejaId: ig.id, usuarioId: pendente, ministerioId: min1, status: "pendente" },
    ]);
    await banco.insert(schema.indisponibilidades).values([
      {
        igrejaId: ig.id,
        usuarioId: aprovado,
        dataInicio: "2026-11-10",
        dataFim: "2026-11-12",
        motivo: "viagem",
      },
      { igrejaId: ig.id, usuarioId: pendente, dataInicio: "2026-11-10", dataFim: "2026-11-12" },
      { igrejaId: outra.id, usuarioId: forasteiro, dataInicio: "2026-11-10", dataFim: "2026-11-12" },
    ]);
  });

  it("devolve só membros aprovados do ministério, sem o motivo", async () => {
    const r = await indisponiveisNoPeriodo(min1, "2026-11-11", "2026-11-11", banco);
    expect(r).toHaveLength(1);
    expect(r[0]).not.toHaveProperty("motivo");
    expect(r[0].dataInicio).toBe("2026-11-10");
  });
  it("acesso negado: ministério sem membros aprovados não devolve nada", async () => {
    expect(await indisponiveisNoPeriodo(min2, "2026-11-11", null, banco)).toEqual([]);
  });
  it("período fora da janela não devolve", async () => {
    expect(await indisponiveisNoPeriodo(min1, "2026-11-13", "2026-11-20", banco)).toEqual([]);
  });
});
