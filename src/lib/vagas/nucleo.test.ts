import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import {
  copiarVagasDeTipo,
  criarVagasDosEventos,
  definirVagasDoCulto,
  preenchimentoDoMes,
  salvarModeloVagas,
} from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let admin: Ator;
let liderLouvor: Ator;
let liderMidia: Ator;
let voluntario: Ator;
let louvor: number;
let midia: number;
let vocal: number;
let violao: number;
let camera: number;
let tipo: number;
let outroTipo: number;

async function usuario(email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId, papelGlobal } as Ator;
}

async function lidera(ator: Ator, ministerioId: number) {
  await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: ator.id, ministerioId, papel: "lider", status: "aprovado" });
}

async function evento(inicio: string, recorrenciaId: number | null) {
  const [e] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto", inicio: new Date(inicio), recorrenciaId })
    .returning();
  return e.id;
}

async function itens(eventoId: number, ministerioId: number) {
  const [esc] = await db
    .select()
    .from(schema.escalas)
    .where(and(eq(schema.escalas.eventoId, eventoId), eq(schema.escalas.ministerioId, ministerioId)));
  if (!esc) return null;
  const linhas = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
  return { escala: esc, itens: linhas };
}

const conta = (linhas: { funcaoId: number }[], funcaoId: number) =>
  linhas.filter((l) => l.funcaoId === funcaoId).length;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  [{ id: louvor }, { id: midia }] = await db
    .insert(schema.ministerios)
    .values([
      { igrejaId, nome: "Louvor" },
      { igrejaId, nome: "Mídia" },
    ])
    .returning();
  [{ id: vocal }, { id: violao }, { id: camera }] = await db
    .insert(schema.funcoes)
    .values([
      { igrejaId, ministerioId: louvor, nome: "Vocal" },
      { igrejaId, ministerioId: louvor, nome: "Violão" },
      { igrejaId, ministerioId: midia, nome: "Câmera" },
    ])
    .returning();
  [{ id: tipo }, { id: outroTipo }] = await db
    .insert(schema.recorrencias)
    .values([
      { igrejaId, diaSemana: 0, horaInicio: "19:00", nome: "Culto de domingo" },
      { igrejaId, diaSemana: 3, horaInicio: "20:00", nome: "Culto de quarta" },
    ])
    .returning();
  admin = await usuario("admin@x.com", "admin");
  liderLouvor = await usuario("l1@x.com");
  liderMidia = await usuario("l2@x.com");
  voluntario = await usuario("vol@x.com");
  await lidera(liderLouvor, louvor);
  await lidera(liderMidia, midia);
});

describe("salvarModeloVagas", () => {
  it("grava quantidades por função e quantidade 0 remove", async () => {
    await salvarModeloVagas(db, liderLouvor, tipo, louvor, [
      { funcaoId: vocal, quantidade: 3 },
      { funcaoId: violao, quantidade: 1 },
    ]);
    await salvarModeloVagas(db, liderLouvor, tipo, louvor, [{ funcaoId: violao, quantidade: 0 }]);
    const modelo = await db.select().from(schema.vagasModelo).where(eq(schema.vagasModelo.recorrenciaId, tipo));
    expect(modelo.map((m) => [m.funcaoId, m.quantidade])).toEqual([[vocal, 3]]);
  });

  it("líder de outro ministério, voluntário e função alheia são negados", async () => {
    await expect(
      salvarModeloVagas(db, liderMidia, tipo, louvor, [{ funcaoId: vocal, quantidade: 1 }]),
    ).rejects.toBeInstanceOf(ErroAcesso);
    await expect(
      salvarModeloVagas(db, voluntario, tipo, louvor, [{ funcaoId: vocal, quantidade: 1 }]),
    ).rejects.toBeInstanceOf(ErroAcesso);
    await expect(
      salvarModeloVagas(db, liderLouvor, tipo, louvor, [{ funcaoId: camera, quantidade: 1 }]),
    ).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("admin salva em qualquer ministério; quantidade negativa é recusada", async () => {
    await salvarModeloVagas(db, admin, tipo, midia, [{ funcaoId: camera, quantidade: 2 }]);
    await expect(
      salvarModeloVagas(db, admin, tipo, midia, [{ funcaoId: camera, quantidade: -1 }]),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("criarVagasDosEventos", () => {
  it("cria escala em rascunho com N itens vazios por função", async () => {
    const e = await evento("2099-03-01T22:00:00Z", tipo);
    await criarVagasDosEventos(db, igrejaId, [e]);
    const l = await itens(e, louvor);
    expect(l!.escala.status).toBe("rascunho");
    expect(conta(l!.itens, vocal)).toBe(3);
    expect(l!.itens.every((i) => i.usuarioId === null)).toBe(true);
    expect(conta((await itens(e, midia))!.itens, camera)).toBe(2);
  });

  it("é idempotente", async () => {
    const e = await evento("2099-03-08T22:00:00Z", tipo);
    await criarVagasDosEventos(db, igrejaId, [e]);
    await criarVagasDosEventos(db, igrejaId, [e]);
    expect((await itens(e, louvor))!.itens).toHaveLength(3);
  });

  it("completa o que falta quando o modelo cresce, sem apagar quem já está escalado", async () => {
    const e = await evento("2099-03-15T22:00:00Z", tipo);
    await criarVagasDosEventos(db, igrejaId, [e]);
    const antes = await itens(e, louvor);
    await db
      .update(schema.escalaItens)
      .set({ usuarioId: voluntario.id })
      .where(eq(schema.escalaItens.id, antes!.itens[0].id));
    await salvarModeloVagas(db, liderLouvor, tipo, louvor, [
      { funcaoId: vocal, quantidade: 4 },
      { funcaoId: violao, quantidade: 1 },
    ]);
    await criarVagasDosEventos(db, igrejaId, [e]);
    const depois = await itens(e, louvor);
    expect(conta(depois!.itens, vocal)).toBe(4);
    expect(conta(depois!.itens, violao)).toBe(1);
    expect(depois!.itens.filter((i) => i.usuarioId === voluntario.id)).toHaveLength(1);
  });

  it("não toca escala publicada", async () => {
    const e = await evento("2099-03-22T22:00:00Z", tipo);
    await criarVagasDosEventos(db, igrejaId, [e]);
    await db
      .update(schema.escalas)
      .set({ status: "publicada" })
      .where(and(eq(schema.escalas.eventoId, e), eq(schema.escalas.ministerioId, louvor)));
    await salvarModeloVagas(db, liderLouvor, tipo, louvor, [{ funcaoId: vocal, quantidade: 6 }]);
    await criarVagasDosEventos(db, igrejaId, [e]);
    const l = await itens(e, louvor);
    expect(l!.escala.status).toBe("publicada");
    expect(conta(l!.itens, vocal)).toBe(4);
    await salvarModeloVagas(db, liderLouvor, tipo, louvor, [{ funcaoId: vocal, quantidade: 4 }]);
  });

  it("evento avulso (sem série) e evento de série sem modelo não ganham escala", async () => {
    const avulso = await evento("2099-03-29T22:00:00Z", null);
    const semModelo = await evento("2099-03-29T23:00:00Z", outroTipo);
    await criarVagasDosEventos(db, igrejaId, [avulso, semModelo]);
    expect(await itens(avulso, louvor)).toBeNull();
    expect(await itens(semModelo, louvor)).toBeNull();
  });
});

describe("copiarVagasDeTipo", () => {
  it("copia o modelo para um culto avulso (admin: todos os ministérios)", async () => {
    const avulso = await evento("2099-04-05T22:00:00Z", null);
    await copiarVagasDeTipo(db, admin, avulso, tipo);
    expect(conta((await itens(avulso, louvor))!.itens, vocal)).toBe(4);
    expect(conta((await itens(avulso, midia))!.itens, camera)).toBe(2);
  });

  it("líder copia só os ministérios que lidera", async () => {
    const avulso = await evento("2099-04-12T22:00:00Z", null);
    await copiarVagasDeTipo(db, liderMidia, avulso, tipo);
    expect(await itens(avulso, louvor)).toBeNull();
    expect(conta((await itens(avulso, midia))!.itens, camera)).toBe(2);
  });

  it("voluntário e evento de outra igreja são negados", async () => {
    const avulso = await evento("2099-04-19T22:00:00Z", null);
    await expect(copiarVagasDeTipo(db, voluntario, avulso, tipo)).rejects.toBeInstanceOf(ErroAcesso);
    const [outra] = await db.insert(schema.igrejas).values({ nome: "Outra" }).returning();
    const [alheio] = await db
      .insert(schema.eventos)
      .values({ igrejaId: outra.id, titulo: "X", inicio: new Date("2099-04-19T22:00:00Z") })
      .returning();
    await expect(copiarVagasDeTipo(db, admin, alheio.id, tipo)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("preenchimentoDoMes", () => {
  it("conta preenchidas × total e classifica o status por ministério", async () => {
    const e = await evento("2099-05-03T22:00:00Z", tipo);
    await criarVagasDosEventos(db, igrejaId, [e]);
    const l = await itens(e, louvor);
    const [a, b, c] = l!.itens;
    await db.update(schema.escalaItens).set({ usuarioId: voluntario.id }).where(eq(schema.escalaItens.id, a.id));
    await db
      .update(schema.escalaItens)
      .set({ usuarioId: voluntario.id, status: "recusado" })
      .where(eq(schema.escalaItens.id, b.id));
    await db.update(schema.escalaItens).set({ usuarioId: voluntario.id }).where(eq(schema.escalaItens.id, c.id));
    const m = await itens(e, midia);
    for (const i of m!.itens) {
      await db.update(schema.escalaItens).set({ usuarioId: voluntario.id }).where(eq(schema.escalaItens.id, i.id));
    }
    const avulso = await evento("2099-05-10T22:00:00Z", null);

    const mes = await preenchimentoDoMes(db, admin, "2099-05");
    const doEvento = mes.find((x) => x.eventoId === e)!;
    const dl = doEvento.ministerios.find((x) => x.ministerioId === louvor)!;
    expect([dl.preenchidas, dl.total, dl.status]).toEqual([2, 5, "faltando"]);
    const dm = doEvento.ministerios.find((x) => x.ministerioId === midia)!;
    expect([dm.preenchidas, dm.total, dm.status]).toEqual([2, 2, "completo"]);
    const semEscala = mes.find((x) => x.eventoId === avulso)!;
    expect(semEscala.ministerios.every((x) => x.status === "sem_escala" && x.total === 0)).toBe(true);
  });

  it("líder só vê os ministérios que lidera; outro mês vem vazio", async () => {
    const mes = await preenchimentoDoMes(db, liderMidia, "2099-05");
    expect(mes.length).toBeGreaterThan(0);
    expect(mes.every((x) => x.ministerios.length === 1 && x.ministerios[0].ministerioId === midia)).toBe(true);
    expect(await preenchimentoDoMes(db, admin, "2098-01")).toEqual([]);
  });

  it("voluntário é negado e mês inválido é recusado", async () => {
    await expect(preenchimentoDoMes(db, voluntario, "2099-05")).rejects.toBeInstanceOf(ErroAcesso);
    await expect(preenchimentoDoMes(db, admin, "2099-13")).rejects.toBeInstanceOf(RangeError);
  });
});

describe("copiarVagasDeTipo sem vagas", () => {
  it("tipo sem vagas para o ministério do líder é recusado com a mensagem", async () => {
    const e = await evento("2099-06-01T22:00:00Z", null);
    await expect(copiarVagasDeTipo(db, liderLouvor, e, outroTipo)).rejects.toThrow(
      "O tipo Culto de quarta não tem vagas para Louvor.",
    );
    await expect(copiarVagasDeTipo(db, liderLouvor, e, outroTipo)).rejects.toBeInstanceOf(ErroEscala);
    expect(await itens(e, louvor)).toBeNull();
  });
});

describe("definirVagasDoCulto", () => {
  it("culto sem escala: cria rascunho com os itens pedidos", async () => {
    const e = await evento("2099-07-01T22:00:00Z", null);
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [
      { funcaoId: vocal, quantidade: 2 },
      { funcaoId: violao, quantidade: 0 },
    ]);
    const l = await itens(e, louvor);
    expect(l!.escala.status).toBe("rascunho");
    expect(conta(l!.itens, vocal)).toBe(2);
    expect(conta(l!.itens, violao)).toBe(0);
  });

  it("sem escala e tudo em 0: recusa", async () => {
    const e = await evento("2099-07-02T22:00:00Z", null);
    await expect(definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 0 }])).rejects.toThrow(
      "Defina pelo menos 1 vaga.",
    );
    expect(await itens(e, louvor)).toBeNull();
  });

  it("acrescenta vaga e tira vaga vazia", async () => {
    const e = await evento("2099-07-03T22:00:00Z", null);
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 2 }]);
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [
      { funcaoId: vocal, quantidade: 1 },
      { funcaoId: violao, quantidade: 1 },
    ]);
    const l = await itens(e, louvor);
    expect(conta(l!.itens, vocal)).toBe(1);
    expect(conta(l!.itens, violao)).toBe(1);
  });

  it("recusa tirar vaga com pessoa, mas tira a vazia", async () => {
    const e = await evento("2099-07-04T22:00:00Z", null);
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 2 }]);
    const antes = await itens(e, louvor);
    await db.update(schema.escalaItens).set({ usuarioId: voluntario.id }).where(eq(schema.escalaItens.id, antes!.itens[0].id));
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 1 }]);
    const meio = await itens(e, louvor);
    expect(meio!.itens.map((i) => i.usuarioId)).toEqual([voluntario.id]);
    await expect(definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 0 }])).rejects.toThrow(
      "Não dá para tirar uma vaga que já tem pessoa.",
    );
    expect(conta((await itens(e, louvor))!.itens, vocal)).toBe(1);
  });

  it("recusa escala publicada", async () => {
    const e = await evento("2099-07-05T22:00:00Z", null);
    await definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 1 }]);
    await db.update(schema.escalas).set({ status: "publicada" }).where(eq(schema.escalas.eventoId, e));
    await expect(definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: vocal, quantidade: 2 }])).rejects.toBeInstanceOf(
      ErroEscala,
    );
    expect(conta((await itens(e, louvor))!.itens, vocal)).toBe(1);
  });

  it("recusa líder de outro ministério, voluntário e função alheia", async () => {
    const e = await evento("2099-07-06T22:00:00Z", null);
    const v = [{ funcaoId: vocal, quantidade: 1 }];
    await expect(definirVagasDoCulto(db, liderMidia, e, louvor, v)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(definirVagasDoCulto(db, voluntario, e, louvor, v)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(
      definirVagasDoCulto(db, liderLouvor, e, louvor, [{ funcaoId: camera, quantidade: 1 }]),
    ).rejects.toBeInstanceOf(ErroAcesso);
  });
});
