import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { enviarParaUsuarios } from "./enviar";
import { enviarLembretes } from "./lembretes";

let db: AnyDb;
let igrejaId: number;
let u1: number;
let u2: number;

const payload = { titulo: "t", corpo: "c", url: "/agenda" };

async function inscrever(usuarioId: number, endpoint: string) {
  await db
    .insert(schema.pushInscricoes)
    .values({ igrejaId, usuarioId, endpoint, chaveP256dh: "p", chaveAuth: "a" });
}

async function endpoints() {
  return (await db.select().from(schema.pushInscricoes)).map((i) => i.endpoint).sort();
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "A" }).returning();
  const novo = async (email: string) =>
    (
      await db
        .insert(schema.usuarios)
        .values({ igrejaId, nome: email, email, senhaHash: "x", papelGlobal: "voluntario" })
        .returning()
    )[0].id;
  u1 = await novo("a@x.com");
  u2 = await novo("b@x.com");
});

describe("enviarParaUsuarios", () => {
  it("apaga a inscrição que responde 410 e a que responde 404, mantém as demais", async () => {
    await inscrever(u1, "https://push/ok");
    await inscrever(u1, "https://push/gone");
    await inscrever(u2, "https://push/notfound");
    await inscrever(u2, "https://push/erro");
    const enviar = vi.fn(async (i: { endpoint: string }) => {
      if (i.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (i.endpoint.endsWith("notfound")) throw Object.assign(new Error("nf"), { statusCode: 404 });
      if (i.endpoint.endsWith("erro")) throw Object.assign(new Error("x"), { statusCode: 500 });
    });
    const r = await enviarParaUsuarios(db, igrejaId, [u1, u2], payload, enviar);
    expect(r).toEqual({ enviados: 1, apagados: 2 });
    expect(await endpoints()).toEqual(["https://push/erro", "https://push/ok"]);
  });

  it("não envia a usuário fora da lista", async () => {
    const enviar = vi.fn(async () => {});
    await enviarParaUsuarios(db, igrejaId, [u2], payload, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe("enviarLembretes", () => {
  it("avisa só os escalados em escala publicada de eventos do dia seguinte", async () => {
    const [min] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Som" }).returning();
    const [fn] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: min.id, nome: "Op" }).returning();
    const [amanha] = await db
      .insert(schema.eventos)
      .values({ igrejaId, titulo: "Culto", inicio: new Date("2026-11-06T22:00:00Z") })
      .returning();
    const [depois] = await db
      .insert(schema.eventos)
      .values({ igrejaId, titulo: "Outro", inicio: new Date("2026-11-07T22:00:00Z") })
      .returning();
    for (const [ev, status] of [
      [amanha, "publicada"],
      [depois, "publicada"],
    ] as const) {
      const [esc] = await db
        .insert(schema.escalas)
        .values({ igrejaId, eventoId: ev.id, ministerioId: min.id, status })
        .returning();
      await db.insert(schema.escalaItens).values({ igrejaId, escalaId: esc.id, funcaoId: fn.id, usuarioId: u1 });
    }
    const enviar = vi.fn(async () => {});
    // 05/11 15:00 em Brasília: amanhã = 06/11
    const n = await enviarLembretes(db, enviar, new Date("2026-11-05T18:00:00Z"));
    expect(n).toBeGreaterThan(0);
    const corpos = enviar.mock.calls.map((c) => (c as unknown as [unknown, { corpo: string }])[1].corpo);
    expect(corpos.every((c) => c.startsWith("Culto"))).toBe(true);
  });
});
