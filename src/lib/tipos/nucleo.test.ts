import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import type { Ator } from "@/lib/ministerios/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { FUSO, dataLocal, gerarOcorrencias } from "@/lib/recorrencia";
import { definirDataLimiteTipo, editarHorarioTipo, excluirTipo, renomearTipo } from "./nucleo";

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

// Cada teste cria o próprio tipo para não depender dos outros.
const diaEm = (dias: number) => dataLocal(new Date(Date.now() + dias * 24 * 60 * 60 * 1000));
const semanaDe = (data: string) => new Date(`${data}T00:00:00Z`).getUTCDay();

async function novoTipo(extra: Partial<typeof schema.recorrencias.$inferInsert> = {}) {
  const [r] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "19:00", nome: "Tipo", ...extra })
    .returning();
  return r.id;
}

/** `escala`: null = sem escala, false = rascunho, true = publicada. */
async function novoCulto(recorrenciaId: number, data: string, escala: boolean | null = null) {
  const [e] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto", inicio: fromZonedTime(`${data}T19:00:00`, FUSO), recorrenciaId })
    .returning();
  if (escala !== null) {
    const [min] = await db.insert(schema.ministerios).values({ igrejaId, nome: "M" }).returning();
    const [esc] = await db
      .insert(schema.escalas)
      .values({ igrejaId, eventoId: e.id, ministerioId: min.id, status: escala ? "publicada" : "rascunho" })
      .returning();
    const [f] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: min.id, nome: "F" }).returning();
    await db.insert(schema.escalaItens).values({ igrejaId, escalaId: esc.id, funcaoId: f.id });
  }
  return e.id;
}

const eventoDe = async (id: number) => (await db.select().from(schema.eventos).where(eq(schema.eventos.id, id)))[0];
const tipoDe = async (id: number) =>
  (await db.select().from(schema.recorrencias).where(eq(schema.recorrencias.id, id)))[0];

describe("editarHorarioTipo", () => {
  const novo = { diaSemana: 3, horaInicio: "20:00", horaFim: "21:30" };

  it("grava o tipo e move os cultos futuros em rascunho para o novo dia e horário", async () => {
    const data = diaEm(10);
    const id = await novoTipo({ diaSemana: semanaDe(data) });
    const culto = await novoCulto(id, data, false);
    await editarHorarioTipo(db, admin, id, novo);
    const rec = await tipoDe(id);
    expect([rec.diaSemana, rec.horaInicio, rec.horaFim]).toEqual([3, "20:00", "21:30"]);
    const e = await eventoDe(culto);
    const novoDia = dataLocal(e.inicio);
    expect(semanaDe(novoDia)).toBe(3);
    expect(e.inicio.toISOString()).toBe(fromZonedTime(`${novoDia}T20:00:00`, FUSO).toISOString());
    expect(e.fim?.toISOString()).toBe(fromZonedTime(`${novoDia}T21:30:00`, FUSO).toISOString());
    // continua na mesma semana (domingo a sábado)
    const dias = Math.abs(new Date(`${novoDia}T00:00:00Z`).getTime() - new Date(`${data}T00:00:00Z`).getTime());
    expect(dias).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });
  it("horaFim vazio vira null", async () => {
    const id = await novoTipo({ horaFim: "20:00" });
    await editarHorarioTipo(db, admin, id, { diaSemana: 1, horaInicio: "08:00", horaFim: "" as unknown as null });
    expect((await tipoDe(id)).horaFim).toBeNull();
  });
  it("não muda culto publicado nem culto passado", async () => {
    const futuro = diaEm(12);
    const id = await novoTipo({ diaSemana: semanaDe(futuro) });
    const publicado = await novoCulto(id, futuro, true);
    const passado = await novoCulto(id, diaEm(-20));
    const antes = [(await eventoDe(publicado)).inicio.getTime(), (await eventoDe(passado)).inicio.getTime()];
    await editarHorarioTipo(db, admin, id, novo);
    expect([(await eventoDe(publicado)).inicio.getTime(), (await eventoDe(passado)).inicio.getTime()]).toEqual(antes);
  });
  it("apaga o culto em rascunho cujo novo horário já passou", async () => {
    const hoje = diaEm(0);
    const id = await novoTipo({ diaSemana: semanaDe(hoje) });
    const [e] = await db
      .insert(schema.eventos)
      .values({ igrejaId, titulo: "Culto", inicio: fromZonedTime(`${hoje}T23:59:00`, FUSO), recorrenciaId: id })
      .returning();
    await editarHorarioTipo(db, admin, id, { diaSemana: semanaDe(hoje), horaInicio: "00:00", horaFim: null });
    expect(await eventoDe(e.id)).toBeUndefined();
  });
  it("apaga o culto em rascunho que o novo dia leva para depois da data limite", async () => {
    const d = diaEm(14);
    const domingo = new Date(`${d}T00:00:00Z`);
    domingo.setUTCDate(domingo.getUTCDate() - semanaDe(d));
    const ate = domingo.toISOString().slice(0, 10);
    const id = await novoTipo({ diaSemana: 0, ate });
    const culto = await novoCulto(id, ate, false);
    await editarHorarioTipo(db, admin, id, { diaSemana: 6, horaInicio: "19:00", horaFim: null });
    expect(await eventoDe(culto)).toBeUndefined();
  });
  it("recusa horário inválido, fim antes do início e dia fora de 0-6", async () => {
    const id = await novoTipo();
    await expect(editarHorarioTipo(db, admin, id, { ...novo, horaInicio: "25:00" })).rejects.toBeInstanceOf(RangeError);
    await expect(editarHorarioTipo(db, admin, id, { ...novo, horaFim: "7h" })).rejects.toBeInstanceOf(RangeError);
    await expect(
      editarHorarioTipo(db, admin, id, { ...novo, horaInicio: "20:00", horaFim: "19:00" }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(editarHorarioTipo(db, admin, id, { ...novo, diaSemana: 7 })).rejects.toBeInstanceOf(RangeError);
  });
  it("recusa quem não é admin e tipo de outra igreja", async () => {
    const id = await novoTipo();
    await expect(editarHorarioTipo(db, voluntario, id, novo)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(editarHorarioTipo(db, admin, tipoOutraIgreja, novo)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("definirDataLimiteTipo", () => {
  it("grava ate, remove cultos depois (rascunho e publicado) e mantém os até a data", async () => {
    const id = await novoTipo();
    const limite = diaEm(10);
    const ate = await novoCulto(id, limite);
    const rascunho = await novoCulto(id, diaEm(17), false);
    const publicado = await novoCulto(id, diaEm(24), true);
    expect(await definirDataLimiteTipo(db, admin, id, limite)).toEqual({ removidos: 2, publicados: 1 });
    expect((await tipoDe(id)).ate).toBe(limite);
    expect(await eventoDe(ate)).toBeDefined();
    expect(await eventoDe(rascunho)).toBeUndefined();
    expect(await eventoDe(publicado)).toBeUndefined();
  });
  it("null limpa a data limite", async () => {
    const id = await novoTipo({ ate: diaEm(30) });
    expect(await definirDataLimiteTipo(db, admin, id, null)).toEqual({ removidos: 0, publicados: 0 });
    expect((await tipoDe(id)).ate).toBeNull();
  });
  it("recusa data no passado ou inválida", async () => {
    const id = await novoTipo();
    await expect(definirDataLimiteTipo(db, admin, id, diaEm(-1))).rejects.toBeInstanceOf(RangeError);
    await expect(definirDataLimiteTipo(db, admin, id, "2030-02-31")).rejects.toBeInstanceOf(RangeError);
    await expect(definirDataLimiteTipo(db, admin, id, "amanhã")).rejects.toBeInstanceOf(RangeError);
  });
  it("recusa quem não é admin e tipo de outra igreja", async () => {
    const id = await novoTipo();
    await expect(definirDataLimiteTipo(db, voluntario, id, null)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(definirDataLimiteTipo(db, admin, tipoOutraIgreja, null)).rejects.toBeInstanceOf(ErroAcesso);
  });
  it("gerarOcorrencias não passa de ate", () => {
    const de = new Date();
    const limite = diaEm(20);
    const oc = gerarOcorrencias(
      { diaSemana: semanaDe(diaEm(3)), horaInicio: "19:00", ate: limite },
      de,
      new Date(de.getTime() + 90 * 24 * 60 * 60 * 1000),
    );
    expect(oc.length).toBeGreaterThan(0);
    expect(oc.every((o) => dataLocal(o.inicio) <= limite)).toBe(true);
  });
});

describe("excluirTipo", () => {
  it("apaga o tipo com vagas_modelo e os cultos futuros em rascunho; solta os publicados e passados", async () => {
    const id = await novoTipo();
    const rascunho = await novoCulto(id, diaEm(8), false);
    const publicado = await novoCulto(id, diaEm(15), true);
    const passado = await novoCulto(id, diaEm(-9));
    const [min] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
    const [fn] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: min.id, nome: "Voz" }).returning();
    await db
      .insert(schema.vagasModelo)
      .values({ igrejaId, recorrenciaId: id, ministerioId: min.id, funcaoId: fn.id, quantidade: 2 });

    await excluirTipo(db, admin, id);

    expect(await db.select().from(schema.recorrencias).where(eq(schema.recorrencias.id, id))).toHaveLength(0);
    expect(await db.select().from(schema.vagasModelo).where(eq(schema.vagasModelo.recorrenciaId, id))).toHaveLength(0);
    expect(await eventoDe(rascunho)).toBeUndefined();
    expect((await eventoDe(publicado)).recorrenciaId).toBeNull();
    expect((await eventoDe(passado)).recorrenciaId).toBeNull();
  });
  it("recusa quem não é admin e tipo de outra igreja", async () => {
    const id = await novoTipo();
    await expect(excluirTipo(db, voluntario, id)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(excluirTipo(db, admin, tipoOutraIgreja)).rejects.toBeInstanceOf(ErroAcesso);
    expect(await db.select().from(schema.recorrencias).where(eq(schema.recorrencias.id, tipoOutraIgreja))).toHaveLength(1);
  });
});
