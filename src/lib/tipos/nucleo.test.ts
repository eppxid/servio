import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import type { Ator } from "@/lib/ministerios/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { renomearTipo } from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let tipo: number;
let tipoOutraIgreja: number;
let admin: Ator;
let voluntario: Ator;

const nomeDe = async (id: number) =>
  (await db.select().from(schema.recorrencias).where(eq(schema.recorrencias.id, id)))[0].nome;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  const [a, b] = await db.insert(schema.igrejas).values([{ nome: "A" }, { nome: "B" }]).returning();
  igrejaId = a.id;
  [{ id: tipo }] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "19:00", nome: "Culto" })
    .returning();
  [{ id: tipoOutraIgreja }] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId: b.id, diaSemana: 0, horaInicio: "19:00", nome: "Culto" })
    .returning();
  const [u1, u2] = await db
    .insert(schema.usuarios)
    .values([
      { igrejaId, nome: "adm", email: "adm@x.com", senhaHash: "x", papelGlobal: "admin" },
      { igrejaId, nome: "vol", email: "vol@x.com", senhaHash: "x", papelGlobal: "voluntario" },
    ])
    .returning();
  admin = { id: u1.id, igrejaId, papelGlobal: "admin" } as Ator;
  voluntario = { id: u2.id, igrejaId, papelGlobal: "voluntario" } as Ator;
});

describe("renomearTipo", () => {
  it("renomeia e aplica trim", async () => {
    expect(await renomearTipo(db, admin, tipo, "  Culto de domingo ")).toBe("Culto de domingo");
    expect(await nomeDe(tipo)).toBe("Culto de domingo");
  });
  it("recusa nome vazio ou longo", async () => {
    await expect(renomearTipo(db, admin, tipo, "   ")).rejects.toBeInstanceOf(RangeError);
    await expect(renomearTipo(db, admin, tipo, "x".repeat(61))).rejects.toBeInstanceOf(RangeError);
    expect(await nomeDe(tipo)).toBe("Culto de domingo");
  });
  it("recusa ator sem permissão", async () => {
    await expect(renomearTipo(db, voluntario, tipo, "Outro")).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("recusa tipo de outra igreja", async () => {
    await expect(renomearTipo(db, admin, tipoOutraIgreja, "Invasão")).rejects.toBeInstanceOf(ErroAcesso);
    expect(await nomeDe(tipoOutraIgreja)).toBe("Culto");
  });
});
