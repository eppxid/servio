import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

let db: ReturnType<typeof drizzle<typeof schema>>;
let igrejaId: number;
let ministerioId: number;
let funcaoId: number;
let recorrenciaId: number;
let membroId: number;

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [ig] = await db.insert(schema.igrejas).values({ nome: "Igreja" }).returning();
  igrejaId = ig.id;
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: "U", email: "u@x.com", senhaHash: "x" })
    .returning();
  const [m] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  ministerioId = m.id;
  expect(m.limiteMensal).toBe(4);
  const [f] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId, nome: "Voz" }).returning();
  funcaoId = f.id;
  const [r] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "19:00" })
    .returning();
  recorrenciaId = r.id;
  expect(r.nome).toBe("Culto");
  const [mm] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: u.id, ministerioId })
    .returning();
  membroId = mm.id;
});

describe("migração 0008 (app v2)", () => {
  it("membro_funcoes sem status vira 'aprovada'", async () => {
    const [v] = await db
      .insert(schema.membroFuncoes)
      .values({ igrejaId, membroId, funcaoId })
      .returning();
    expect(v.status).toBe("aprovada");
  });

  it("vagas_modelo recusa quantidade 0", async () => {
    await expect(
      db.insert(schema.vagasModelo).values({ igrejaId, recorrenciaId, ministerioId, funcaoId, quantidade: 0 }),
    ).rejects.toThrow();
  });

  it("vagas_modelo aceita quantidade > 0 e recusa duplicata", async () => {
    const v = { igrejaId, recorrenciaId, ministerioId, funcaoId, quantidade: 2 };
    await db.insert(schema.vagasModelo).values(v);
    await expect(db.insert(schema.vagasModelo).values(v)).rejects.toThrow();
  });
});
