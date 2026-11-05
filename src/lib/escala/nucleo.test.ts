import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import * as aviso from "@/lib/notificar";
import {
  ErroEscala,
  dadosMontagem,
  escalasPublicadasDoEvento,
  listarEscalasFuturas,
  salvarEscala,
  sugerirMes,
} from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let lider: Ator;
let outroLider: Ator;
let louvor: number;
let midia: number;
let vocal: number;
let camera: number;
const vol: Record<string, number> = {};
let culto: number;
let culto2: number;
let ensaio: number;

async function usuario(email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId, papelGlobal } as Ator;
}

async function membro(usuarioId: number, ministerioId: number, papel: "lider" | "voluntario", funcaoId?: number) {
  const [m] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId, ministerioId, papel, status: "aprovado" })
    .returning();
  if (funcaoId) await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m.id, funcaoId });
}

async function evento(titulo: string, inicio: string, fim: string) {
  const [e] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo, inicio: new Date(inicio), fim: new Date(fim) })
    .returning();
  return e.id;
}

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
  [{ id: vocal }, { id: camera }] = await db
    .insert(schema.funcoes)
    .values([
      { igrejaId, ministerioId: louvor, nome: "Vocal" },
      { igrejaId, ministerioId: midia, nome: "Câmera" },
    ])
    .returning();
  lider = await usuario("lider@x.com");
  outroLider = await usuario("lider2@x.com");
  await membro(lider.id, louvor, "lider");
  await membro(outroLider.id, midia, "lider");
  for (const nome of ["ana", "bia", "caio"]) {
    vol[nome] = (await usuario(`${nome}@x.com`)).id;
    await membro(vol[nome], louvor, "voluntario", vocal);
  }
  await membro(vol.caio, midia, "voluntario", camera);
  vol.sem = (await usuario("sem@x.com")).id;
  await membro(vol.sem, louvor, "voluntario");
  culto = await evento("Culto", "2099-03-01T22:00:00Z", "2099-03-02T00:00:00Z");
  ensaio = await evento("Ensaio", "2099-03-01T23:00:00Z", "2099-03-02T01:00:00Z");
  culto2 = await evento("Culto", "2099-03-08T22:00:00Z", "2099-03-09T00:00:00Z");
  await db
    .insert(schema.indisponibilidades)
    .values({ igrejaId, usuarioId: vol.ana, dataInicio: "2099-03-01", dataFim: "2099-03-01", motivo: "viagem" });
});

describe("acesso", () => {
  it("líder de outro ministério não monta nem salva a escala", async () => {
    await expect(dadosMontagem(db, outroLider, culto, louvor)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(salvarEscala(db, outroLider, culto, louvor, new Map(), true)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(sugerirMes(db, outroLider, louvor, "2099-03")).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("voluntário não vê escalas para montar", async () => {
    const ator = { id: vol.bia, igrejaId, papelGlobal: "voluntario" } as Ator;
    expect(await listarEscalasFuturas(db, ator)).toEqual([]);
    await expect(dadosMontagem(db, ator, culto, louvor)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("evento de outra igreja é negado", async () => {
    const [outra] = await db.insert(schema.igrejas).values({ nome: "Outra" }).returning();
    const [e] = await db
      .insert(schema.eventos)
      .values({ igrejaId: outra.id, titulo: "X", inicio: new Date("2099-03-01T22:00:00Z") })
      .returning();
    await expect(dadosMontagem(db, lider, e.id, louvor)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("montagem", () => {
  it("lista só quem tem a função e marca indisponível e conflito", async () => {
    await salvarEscala(db, outroLider, ensaio, midia, new Map([[camera, vol.caio]]), false);
    const d = await dadosMontagem(db, lider, culto, louvor);
    const cand = d.funcoes[0].candidatos;
    expect(cand.map((c) => c.usuarioId).sort()).toEqual([vol.ana, vol.bia, vol.caio].sort());
    expect(cand.find((c) => c.usuarioId === vol.ana)?.bloqueio).toBe("indisponivel");
    expect(cand.find((c) => c.usuarioId === vol.caio)?.bloqueio).toBe("conflito");
    expect(cand.find((c) => c.usuarioId === vol.bia)?.bloqueio).toBeNull();
  });

  it("recusa no servidor quem está bloqueado ou não tem a função", async () => {
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.ana]]), false)).rejects.toBeInstanceOf(ErroEscala);
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.caio]]), false)).rejects.toBeInstanceOf(ErroEscala);
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.sem]]), false)).rejects.toBeInstanceOf(ErroEscala);
  });

  it("publica: status publicada, itens pendentes e notifica", async () => {
    const espiao = vi.spyOn(aviso, "notificar");
    await salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.bia]]), true);
    const [esc] = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, culto));
    expect(esc.status).toBe("publicada");
    const itens = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
    expect(itens.map((i) => [i.usuarioId, i.status])).toEqual([[vol.bia, "pendente"]]);
    expect(espiao).toHaveBeenCalledWith({ tipo: "escala_publicada", eventoId: culto, usuarioIds: [vol.bia] });
    const pub = await escalasPublicadasDoEvento(db, igrejaId, culto);
    expect(pub).toEqual([{ ministerio: "Louvor", itens: [{ funcao: "Vocal", nome: "bia", status: "pendente" }] }]);
  });

  it("sugerir mês preenche só escalas não publicadas, como rascunho", async () => {
    const n = await sugerirMes(db, lider, louvor, "2099-03", new Date("2099-02-01T00:00:00Z"));
    expect(n).toBe(1);
    const [esc] = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, culto2));
    expect(esc.status).toBe("rascunho");
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
    // bia já tem 1 escala no mês: vai quem tem menos (ana, livre no dia 8).
    expect(item.usuarioId).toBe(vol.ana);
    const lista = await listarEscalasFuturas(db, lider, new Date("2099-02-28T00:00:00Z"), 30);
    const status = lista.map((l) => [l.evento.id, l.ministerios.find((m) => m.id === louvor)?.status]);
    expect(status).toEqual([
      [culto, "publicada"],
      [ensaio, "sem_escala"],
      [culto2, "rascunho"],
    ]);
  });
});
