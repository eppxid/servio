import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { criarVagasDosEventos, salvarModeloVagas } from "@/lib/vagas/nucleo";
import { ajustarCultosAoModelo, dadosCulto, preencherVaga, publicarCulto } from "./vagas-culto";

vi.mock("@/lib/notificar", () => ({ notificar: vi.fn(async () => {}) }));

let db: AnyDb;
let igrejaId: number;
let lider: Ator;
let outroLider: Ator;
let ana: Ator;
let beto: Ator;
let carla: Ator;
let midia: number;
let outro: number;
let projecao: number;
let transmissao: number;
let tipo: number;
let eventoId: number;

async function usuario(email: string) {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal: "voluntario" })
    .returning();
  return { id: u.id, igrejaId, papelGlobal: "voluntario" } as Ator;
}

async function membro(ator: Ator, ministerioId: number, papel: "lider" | "voluntario", funcoes: number[] = []) {
  const [m] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: ator.id, ministerioId, papel, status: "aprovado" })
    .returning();
  for (const funcaoId of funcoes) {
    await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m.id, funcaoId, status: "aprovada" });
  }
}

async function itensDe(evento: number) {
  const [esc] = await db
    .select()
    .from(schema.escalas)
    .where(and(eq(schema.escalas.eventoId, evento), eq(schema.escalas.ministerioId, midia)));
  const itens = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
  return { esc, itens };
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  [{ id: midia }, { id: outro }] = await db
    .insert(schema.ministerios)
    .values([
      { igrejaId, nome: "Mídia" },
      { igrejaId, nome: "Louvor" },
    ])
    .returning();
  [{ id: projecao }, { id: transmissao }] = await db
    .insert(schema.funcoes)
    .values([
      { igrejaId, ministerioId: midia, nome: "Projeção" },
      { igrejaId, ministerioId: midia, nome: "Transmissão" },
    ])
    .returning();
  [{ id: tipo }] = await db
    .insert(schema.recorrencias)
    .values({ igrejaId, diaSemana: 0, horaInicio: "18:00", nome: "Culto de domingo" })
    .returning();
  lider = await usuario("lider@x.com");
  outroLider = await usuario("outro@x.com");
  ana = await usuario("ana@x.com");
  beto = await usuario("beto@x.com");
  carla = await usuario("carla@x.com");
  await membro(lider, midia, "lider");
  await membro(outroLider, outro, "lider");
  await membro(ana, midia, "voluntario", [projecao, transmissao]);
  await membro(beto, midia, "voluntario", [projecao]);
  await membro(carla, midia, "voluntario", [transmissao]);

  await salvarModeloVagas(db, lider, tipo, midia, [
    { funcaoId: projecao, quantidade: 2 },
    { funcaoId: transmissao, quantidade: 1 },
  ]);
  const [ev] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto", inicio: new Date("2099-03-01T21:00:00Z"), recorrenciaId: tipo })
    .returning();
  eventoId = ev.id;
  await criarVagasDosEventos(db, igrejaId, [eventoId]);
});

describe("dadosCulto", () => {
  it("lista as vagas por função e quem pode ocupá-las", async () => {
    const d = await dadosCulto(db, lider, eventoId);
    expect(d.ministerios).toHaveLength(1);
    const proj = d.ministerios[0].funcoes.find((f) => f.id === projecao)!;
    expect(proj.vagas).toHaveLength(2);
    expect(proj.candidatos.map((c) => c.nome).sort()).toEqual(["ana", "beto"]);
    expect(proj.candidatos.every((c) => c.bloqueio === null && c.noMes === 0)).toBe(true);
  });

  it("quem não lidera nada é negado", async () => {
    await expect(dadosCulto(db, ana, eventoId)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("preencherVaga", () => {
  it("preenche, troca e esvazia uma vaga", async () => {
    const [v1] = (await itensDe(eventoId)).itens.filter((i) => i.funcaoId === projecao);
    await preencherVaga(db, lider, v1.id, ana.id);
    expect((await itensDe(eventoId)).itens.find((i) => i.id === v1.id)!.usuarioId).toBe(ana.id);
    await preencherVaga(db, lider, v1.id, beto.id);
    expect((await itensDe(eventoId)).itens.find((i) => i.id === v1.id)!.usuarioId).toBe(beto.id);
    await preencherVaga(db, lider, v1.id, null);
    expect((await itensDe(eventoId)).itens.find((i) => i.id === v1.id)!.usuarioId).toBeNull();
  });

  it("recusa quem já ocupa outra vaga do culto e quem não tem a função", async () => {
    const [v1, v2] = (await itensDe(eventoId)).itens.filter((i) => i.funcaoId === projecao);
    await preencherVaga(db, lider, v1.id, ana.id);
    await expect(preencherVaga(db, lider, v2.id, ana.id)).rejects.toBeInstanceOf(ErroEscala);
    await expect(preencherVaga(db, lider, v2.id, carla.id)).rejects.toThrow("função");
    await preencherVaga(db, lider, v1.id, null);
  });

  it("recusa quem está de folga", async () => {
    await db
      .insert(schema.indisponibilidades)
      .values({ igrejaId, usuarioId: beto.id, dataInicio: "2099-03-01", dataFim: "2099-03-01" });
    const [v1] = (await itensDe(eventoId)).itens.filter((i) => i.funcaoId === projecao);
    await expect(preencherVaga(db, lider, v1.id, beto.id)).rejects.toThrow("folga");
    await db.delete(schema.indisponibilidades).where(eq(schema.indisponibilidades.usuarioId, beto.id));
  });

  it("líder de outro ministério é negado", async () => {
    const [v1] = (await itensDe(eventoId)).itens;
    await expect(preencherVaga(db, outroLider, v1.id, ana.id)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("publicarCulto", () => {
  it("exige ao menos uma vaga preenchida e depois publica", async () => {
    await expect(publicarCulto(db, lider, eventoId, midia)).rejects.toBeInstanceOf(ErroEscala);
    const [v1] = (await itensDe(eventoId)).itens.filter((i) => i.funcaoId === projecao);
    await preencherVaga(db, lider, v1.id, ana.id);
    await publicarCulto(db, lider, eventoId, midia);
    expect((await itensDe(eventoId)).esc.status).toBe("publicada");
  });
});

describe("ajustarCultosAoModelo", () => {
  it("tira vagas vazias que sobram e cria as que faltam nos cultos futuros em rascunho", async () => {
    const [ev] = await db
      .insert(schema.eventos)
      .values({ igrejaId, titulo: "Culto", inicio: new Date("2099-03-08T21:00:00Z"), recorrenciaId: tipo })
      .returning();
    await criarVagasDosEventos(db, igrejaId, [ev.id]);
    expect((await itensDe(ev.id)).itens).toHaveLength(3);

    await salvarModeloVagas(db, lider, tipo, midia, [
      { funcaoId: projecao, quantidade: 1 },
      { funcaoId: transmissao, quantidade: 0 },
    ]);
    await ajustarCultosAoModelo(db, lider, tipo, midia, new Date("2099-01-01T00:00:00Z"));
    const rasc = await itensDe(ev.id);
    expect(rasc.itens.map((i) => i.funcaoId)).toEqual([projecao]);

    await salvarModeloVagas(db, lider, tipo, midia, [{ funcaoId: transmissao, quantidade: 2 }]);
    await ajustarCultosAoModelo(db, lider, tipo, midia, new Date("2099-01-01T00:00:00Z"));
    expect((await itensDe(ev.id)).itens.filter((i) => i.funcaoId === transmissao)).toHaveLength(2);

    // A escala publicada do primeiro culto não muda.
    expect((await itensDe(eventoId)).itens).toHaveLength(3);
  });
});
