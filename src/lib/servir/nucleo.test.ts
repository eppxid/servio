import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import {
  aprovarFuncao,
  aprovarMembro,
  minhasPreferencias,
  pedidosPendentes,
  pedirParaServir,
  recomendacoes,
  recusarFuncao,
} from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let outraIgrejaId: number;
let louvor: number;
let midia: number;
let vocal: number;
let violao: number;
let camera: number;
let lider: Ator;
let liderMidia: Ator;
let admin: Ator;
let ana: Ator;
let bia: Ator;
let estranho: Ator;

async function usuario(nome: string, papelGlobal: Ator["papelGlobal"] = "voluntario", igreja = igrejaId) {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId: igreja, nome, email: `${nome}@x.com`, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId: igreja, papelGlobal } as Ator;
}

async function membroDe(u: Ator, ministerioId: number) {
  const [m] = await db
    .select()
    .from(schema.membrosMinisterio)
    .where(and(eq(schema.membrosMinisterio.usuarioId, u.id), eq(schema.membrosMinisterio.ministerioId, ministerioId)));
  return m;
}

async function statusFuncao(u: Ator, ministerioId: number, funcaoId: number) {
  const m = await membroDe(u, ministerioId);
  const [f] = await db
    .select()
    .from(schema.membroFuncoes)
    .where(and(eq(schema.membroFuncoes.membroId, m.id), eq(schema.membroFuncoes.funcaoId, funcaoId)));
  return f?.status;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  [{ id: outraIgrejaId }] = await db.insert(schema.igrejas).values({ nome: "Outra" }).returning();
  [{ id: louvor }] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  [{ id: midia }] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Mídia" }).returning();
  [{ id: vocal }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: louvor, nome: "Vocal" }).returning();
  [{ id: violao }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: louvor, nome: "Violão" }).returning();
  [{ id: camera }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: midia, nome: "Câmera" }).returning();
  lider = await usuario("lider");
  liderMidia = await usuario("lidermidia");
  admin = await usuario("admin", "admin");
  ana = await usuario("ana");
  bia = await usuario("bia");
  estranho = await usuario("estranho", "admin", outraIgrejaId);
  for (const [u, min] of [[lider, louvor], [liderMidia, midia]] as const) {
    await db
      .insert(schema.membrosMinisterio)
      .values({ igrejaId, usuarioId: u.id, ministerioId: min, papel: "lider", status: "aprovado" });
  }
});

describe("pedir para servir", () => {
  it("cria membro pendente com funções desejadas", async () => {
    await pedirParaServir(db, ana, louvor, [vocal, violao]);
    expect((await membroDe(ana, louvor)).status).toBe("pendente");
    expect(await statusFuncao(ana, louvor, vocal)).toBe("desejada");
    expect(await statusFuncao(ana, louvor, violao)).toBe("desejada");
  });

  it("recusa função de outro ministério e ministério de outra igreja", async () => {
    await expect(pedirParaServir(db, bia, louvor, [camera])).rejects.toThrow(ErroAcesso);
    await expect(pedirParaServir(db, estranho, louvor, [vocal])).rejects.toThrow(ErroAcesso);
    expect(await membroDe(bia, louvor)).toBeUndefined();
  });

  it("lista as preferências do usuário", async () => {
    const prefs = await minhasPreferencias(db, ana);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ ministerio: "Louvor", status: "pendente" });
    expect(prefs[0].funcoes.map((f) => [f.nome, f.status])).toEqual([
      ["Violão", "desejada"],
      ["Vocal", "desejada"],
    ]);
    expect(await minhasPreferencias(db, bia)).toEqual([]);
  });
});

describe("aprovação", () => {
  it("voluntário, líder de outro ministério e outra igreja não aprovam", async () => {
    const m = await membroDe(ana, louvor);
    await expect(aprovarMembro(db, bia, m.id)).rejects.toThrow(ErroAcesso);
    await expect(aprovarFuncao(db, liderMidia, m.id, vocal)).rejects.toThrow(ErroAcesso);
    await expect(aprovarFuncao(db, estranho, m.id, vocal)).rejects.toThrow(ErroAcesso);
    await expect(pedidosPendentes(db, bia, louvor)).rejects.toThrow(ErroAcesso);
    await expect(pedidosPendentes(db, estranho, louvor)).rejects.toThrow(ErroAcesso);
  });

  it("ninguém aprova a si mesmo", async () => {
    await pedirParaServir(db, admin, louvor, [vocal]);
    const m = await membroDe(admin, louvor);
    await expect(aprovarMembro(db, admin, m.id)).rejects.toThrow(ErroAcesso);
    await expect(aprovarFuncao(db, admin, m.id, vocal)).rejects.toThrow(ErroAcesso);
  });

  it("líder vê os pedidos pendentes", async () => {
    const pedidos = await pedidosPendentes(db, lider, louvor);
    const daAna = pedidos.find((p) => p.nome === "ana");
    expect(daAna?.funcoesDesejadas.map((f) => f.nome)).toEqual(["Violão", "Vocal"]);
  });

  it("recomendações contam desejadas ainda não aprovadas", async () => {
    await pedirParaServir(db, bia, louvor, [vocal]);
    const r = await recomendacoes(db, lider, louvor);
    expect(r.map((x) => [x.funcao, x.desejam])).toEqual([
      ["Violão", 1],
      ["Vocal", 3],
    ]);
    await expect(recomendacoes(db, bia, louvor)).rejects.toThrow(ErroAcesso);
  });

  it("líder aprova função e membro; recusa remove a desejada", async () => {
    const m = await membroDe(ana, louvor);
    await aprovarFuncao(db, lider, m.id, vocal);
    expect(await statusFuncao(ana, louvor, vocal)).toBe("aprovada");
    expect((await membroDe(ana, louvor)).status).toBe("aprovado");
    await recusarFuncao(db, lider, m.id, violao);
    expect(await statusFuncao(ana, louvor, violao)).toBeUndefined();
    const r = await recomendacoes(db, lider, louvor);
    expect(r.find((x) => x.funcao === "Vocal")?.desejam).toBe(2);
  });

  it("aprovarMembro aprova sem aprovar as funções", async () => {
    const m = await membroDe(bia, louvor);
    await aprovarMembro(db, lider, m.id);
    expect((await membroDe(bia, louvor)).status).toBe("aprovado");
    expect(await statusFuncao(bia, louvor, vocal)).toBe("desejada");
  });

  it("não rebaixa função aprovada e permite função nova a membro aprovado", async () => {
    await pedirParaServir(db, ana, louvor, [vocal, violao]);
    expect(await statusFuncao(ana, louvor, vocal)).toBe("aprovada");
    expect(await statusFuncao(ana, louvor, violao)).toBe("desejada");
    expect((await membroDe(ana, louvor)).status).toBe("aprovado");
  });

  it("recusar não apaga função já aprovada", async () => {
    const m = await membroDe(ana, louvor);
    await recusarFuncao(db, lider, m.id, vocal);
    expect(await statusFuncao(ana, louvor, vocal)).toBe("aprovada");
  });

  it("admin aprova em qualquer ministério da própria igreja", async () => {
    const m = await membroDe(bia, louvor);
    await aprovarFuncao(db, admin, m.id, vocal);
    expect(await statusFuncao(bia, louvor, vocal)).toBe("aprovada");
  });
});
