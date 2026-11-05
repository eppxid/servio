import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroChat, enviarMensagem, listarMensagens } from "@/lib/chat/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import * as aviso from "@/lib/notificar";

let db: AnyDb;
let igrejaId: number;
let eventoId: number;
let escalado: Ator;
let outroEscalado: Ator;
let foraDaEscala: Ator;
let lider: Ator;
let liderOutro: Ator;
let admin: Ator;
let outraIgreja: Ator;

async function usuario(igreja: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId: igreja, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId: igreja, papelGlobal } as Ator;
}

async function lidera(a: Ator, ministerioId: number) {
  await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: a.id, ministerioId, papel: "lider", status: "aprovado" });
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "A" }).returning();
  const [{ id: igrejaB }] = await db.insert(schema.igrejas).values({ nome: "B" }).returning();
  escalado = await usuario(igrejaId, "escalado@x.com");
  outroEscalado = await usuario(igrejaId, "outro@x.com");
  foraDaEscala = await usuario(igrejaId, "fora@x.com");
  lider = await usuario(igrejaId, "lider@x.com");
  liderOutro = await usuario(igrejaId, "lider2@x.com");
  admin = await usuario(igrejaId, "admin@x.com", "admin");
  outraIgreja = await usuario(igrejaB, "b@x.com", "admin");

  const [louvor] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  const [midia] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Mídia" }).returning();
  const [vocal] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: louvor.id, nome: "Vocal" }).returning();
  await lidera(lider, louvor.id);
  await lidera(liderOutro, midia.id);

  const [ev] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto", inicio: new Date("2026-12-06T22:00:00Z") })
    .returning();
  eventoId = ev.id;
  const [escala] = await db
    .insert(schema.escalas)
    .values({ igrejaId, eventoId, ministerioId: louvor.id, status: "publicada" })
    .returning();
  await db.insert(schema.escalaItens).values([
    { igrejaId, escalaId: escala.id, funcaoId: vocal.id, usuarioId: escalado.id },
    { igrejaId, escalaId: escala.id, funcaoId: vocal.id, usuarioId: outroEscalado.id },
  ]);
});

describe("chat da escala", () => {
  it("usuário fora da escala recebe acesso negado (403)", async () => {
    await expect(listarMensagens(db, foraDaEscala, eventoId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(enviarMensagem(db, foraDaEscala, eventoId, "oi")).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("líder de outro ministério e admin de outra igreja são negados", async () => {
    await expect(listarMensagens(db, liderOutro, eventoId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(listarMensagens(db, outraIgreja, eventoId)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("escalado, líder e admin conversam; polling filtra por data", async () => {
    await enviarMensagem(db, escalado, eventoId, "  chego cedo  ");
    await enviarMensagem(db, lider, eventoId, "ok");
    await enviarMensagem(db, admin, eventoId, "<b>oi</b>");
    const todas = await listarMensagens(db, outroEscalado, eventoId);
    expect(todas.map((m) => m.texto)).toEqual(["chego cedo", "ok", "<b>oi</b>"]);
    const depois = await listarMensagens(db, escalado, eventoId, todas[1].criadoEm);
    expect(depois.every((m) => m.criadoEm > todas[1].criadoEm)).toBe(true);
  });

  it("valida vazio e limite de 1000 caracteres", async () => {
    await expect(enviarMensagem(db, escalado, eventoId, "   ")).rejects.toBeInstanceOf(ErroChat);
    await expect(enviarMensagem(db, escalado, eventoId, "a".repeat(1001))).rejects.toBeInstanceOf(ErroChat);
    await expect(enviarMensagem(db, escalado, eventoId, "a".repeat(1000))).resolves.toBeTruthy();
  });

  it("só líder marca aviso e o aviso notifica os escalados", async () => {
    await expect(enviarMensagem(db, escalado, eventoId, "aviso", true)).rejects.toBeInstanceOf(ErroAcesso);
    const espiao = vi.spyOn(aviso, "notificar");
    await enviarMensagem(db, lider, eventoId, "Ensaio às 18h", true);
    expect(espiao).toHaveBeenCalledOnce();
    const chamada = espiao.mock.calls[0][0];
    expect(chamada.tipo).toBe("aviso_chat");
    expect(chamada.usuarioIds.sort()).toEqual([escalado.id, outroEscalado.id].sort());
    const m = (await listarMensagens(db, escalado, eventoId)).find((x) => x.texto === "Ensaio às 18h");
    expect(m?.aviso).toBe(true);
  });
});
