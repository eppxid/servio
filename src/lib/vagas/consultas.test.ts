import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { criarVagasDosEventos } from "./nucleo";

// Conta as consultas pelo logger do Drizzle: cada SQL enviado ao banco passa por logQuery.
let consultas = 0;
let db: AnyDb;
let igrejaId: number;
let tipo: number;
let ministerios: number[];

async function eventos(n: number, dia0: number) {
  const linhas = await db
    .insert(schema.eventos)
    .values(
      Array.from({ length: n }, (_, i) => ({
        igrejaId,
        titulo: "Culto",
        inicio: new Date(`2099-06-${String(dia0 + i).padStart(2, "0")}T22:00:00Z`),
        recorrenciaId: tipo,
      })),
    )
    .returning({ id: schema.eventos.id });
  return linhas.map((l) => l.id);
}

async function contar(fn: () => Promise<unknown>) {
  consultas = 0;
  await fn();
  return consultas;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema, logger: { logQuery: () => void consultas++ } });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  ministerios = (
    await db
      .insert(schema.ministerios)
      .values(["Louvor", "Mídia", "Recepção"].map((nome) => ({ igrejaId, nome })))
      .returning()
  ).map((m) => m.id);
  const funcoes = await db
    .insert(schema.funcoes)
    .values(ministerios.map((ministerioId) => ({ igrejaId, ministerioId, nome: "Função" })))
    .returning();
  [{ id: tipo }] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "19:00", nome: "Culto de domingo" })
    .returning();
  await db.insert(schema.vagasModelo).values(
    funcoes.map((f) => ({ igrejaId, recorrenciaId: tipo, ministerioId: f.ministerioId, funcaoId: f.id, quantidade: 2 })),
  );
});

describe("criarVagasDosEventos: consultas em lote", () => {
  it("4 eventos × 3 ministérios fazem o mesmo número de consultas que 1 evento", async () => {
    const um = await eventos(1, 1);
    const quatro = await eventos(4, 10);

    const n1 = await contar(() => criarVagasDosEventos(db, igrejaId, um));
    const n4 = await contar(() => criarVagasDosEventos(db, igrejaId, quatro));
    expect(n4).toBe(n1);
    expect(n4).toBeLessThanOrEqual(6);

    const escalas = await db.select().from(schema.escalas).where(inArray(schema.escalas.eventoId, quatro));
    expect(escalas).toHaveLength(4 * ministerios.length);
    const itens = await db
      .select()
      .from(schema.escalaItens)
      .where(inArray(schema.escalaItens.escalaId, escalas.map((e) => e.id)));
    expect(itens).toHaveLength(4 * ministerios.length * 2);
  });
});
