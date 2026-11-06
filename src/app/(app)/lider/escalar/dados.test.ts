import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";
import { criarVagasDosEventos, salvarModeloVagas } from "@/lib/vagas/nucleo";
import { dadosEscalar, publicarMes } from "./dados";

vi.mock("@/lib/notificar", () => ({ notificar: vi.fn(async () => {}) }));

let db: AnyDb;
let igrejaId: number;
let lider: Ator;
let outro: Ator;
let ana: Ator;
let midia: number;
let projecao: number;
let ev1: number;
let ev2: number;

async function usuario(email: string) {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal: "voluntario" })
    .returning();
  return { id: u.id, igrejaId, papelGlobal: "voluntario" } as Ator;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  [{ id: midia }] = await db.insert(schema.ministerios).values([{ igrejaId, nome: "Mídia" }]).returning();
  [{ id: projecao }] = await db.insert(schema.funcoes).values([{ igrejaId, ministerioId: midia, nome: "Projeção" }]).returning();
  const [tipo] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "18:00", nome: "Culto" })
    .returning();
  lider = await usuario("lider@x.com");
  outro = await usuario("outro@x.com");
  ana = await usuario("ana@x.com");
  await db.insert(schema.membrosMinisterio).values({ igrejaId, usuarioId: lider.id, ministerioId: midia, papel: "lider", status: "aprovado" });
  await salvarModeloVagas(db, lider, tipo.id, midia, [{ funcaoId: projecao, quantidade: 1 }]);
  const evs = await db
    .insert(schema.eventos)
    .values([
      { igrejaId, titulo: "Culto 1", inicio: new Date("2099-03-01T21:00:00Z"), recorrenciaId: tipo.id },
      { igrejaId, titulo: "Culto 2", inicio: new Date("2099-03-08T21:00:00Z"), recorrenciaId: tipo.id },
    ])
    .returning();
  [ev1, ev2] = evs.map((e) => e.id);
  await criarVagasDosEventos(db, igrejaId, [ev1, ev2]);
});

describe("publicarMes", () => {
  it("publica só o rascunho com pessoa, avisa os escalados e deixa o vazio", async () => {
    const [esc] = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, ev1));
    await db.update(schema.escalaItens).set({ usuarioId: ana.id }).where(eq(schema.escalaItens.escalaId, esc.id));
    const antes = await dadosEscalar(db, lider, "2099-03");
    expect(antes.ministerioId).toBe(midia);
    expect(antes.cultos.map((c) => `${c.preenchidas}/${c.total}`)).toEqual(["1/1", "0/1"]);
    expect(antes.rascunhos).toBe(1);

    expect(await publicarMes(db, lider, midia, "2099-03")).toBe(1);
    expect(notificar).toHaveBeenCalledWith({ tipo: "escala_publicada", eventoId: ev1, usuarioIds: [ana.id] });
    const estados = await db.select().from(schema.escalas);
    expect(estados.find((e) => e.eventoId === ev1)!.status).toBe("publicada");
    expect(estados.find((e) => e.eventoId === ev2)!.status).toBe("rascunho");
    expect((await dadosEscalar(db, lider, "2099-03")).rascunhos).toBe(0);
    expect(await publicarMes(db, lider, midia, "2099-03")).toBe(0);
  });

  it("quem não lidera o ministério é negado", async () => {
    await expect(publicarMes(db, outro, midia, "2099-03")).rejects.toBeInstanceOf(ErroAcesso);
  });
});
