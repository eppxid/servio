import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  autenticar,
  hashSenha,
  temPapel,
  trocarSenha,
  usuarioDaSessao,
  verificarSenha,
  type AnyDb,
} from "@/lib/auth-core";

let db: AnyDb;
let usuarioId: number;
let igrejaId: number;

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  const [igreja] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  igrejaId = igreja.id;
  const [u] = await db
    .insert(schema.usuarios)
    .values({
      igrejaId,
      nome: "Ana",
      email: "ana@exemplo.com",
      senhaHash: await hashSenha("senha-correta-1"),
    })
    .returning();
  usuarioId = u.id;
});

describe("senha", () => {
  it("gera hash bcrypt com custo 12 e verifica", async () => {
    const hash = await hashSenha("abcdefgh");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verificarSenha("abcdefgh", hash)).toBe(true);
    expect(await verificarSenha("outra-coisa", hash)).toBe(false);
  });
});

describe("limite de tentativas", () => {
  it("bloqueia a 6ª tentativa em 15 min, mesmo com a senha certa", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    for (let i = 0; i < 5; i++) {
      const r = await autenticar(db, "Ana@Exemplo.com", "errada", new Date(t0.getTime() + i * 1000));
      expect(r).toEqual({ ok: false, motivo: "invalido" });
    }
    const sexta = await autenticar(db, "ana@exemplo.com", "senha-correta-1", new Date(t0.getTime() + 6000));
    expect(sexta).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("libera depois de 15 min e zera o contador no sucesso", async () => {
    const depois = new Date("2026-01-01T10:16:00Z");
    const r = await autenticar(db, "ana@exemplo.com", "senha-correta-1", depois);
    expect(r.ok).toBe(true);
    const outra = await autenticar(db, "ana@exemplo.com", "errada", depois);
    expect(outra).toEqual({ ok: false, motivo: "invalido" });
  });

  it("mensagem igual para e-mail inexistente", async () => {
    const r = await autenticar(db, "ninguem@exemplo.com", "qualquer-coisa");
    expect(r).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("sessão", () => {
  it("troca de senha invalida a sessão antiga", async () => {
    const [antes] = await db.select().from(schema.usuarios);
    expect(await usuarioDaSessao(db, usuarioId, antes.sessaoVersao)).not.toBeNull();

    await trocarSenha(db, usuarioId, "nova-senha-123");

    expect(await usuarioDaSessao(db, usuarioId, antes.sessaoVersao)).toBeNull();
    const [depois] = await db.select().from(schema.usuarios);
    expect(await usuarioDaSessao(db, usuarioId, depois.sessaoVersao)).not.toBeNull();
    expect(await verificarSenha("nova-senha-123", depois.senhaHash)).toBe(true);
  });

  it("recusa senha com menos de 8 caracteres", async () => {
    await expect(trocarSenha(db, usuarioId, "curta")).rejects.toThrow();
  });
});

describe("papéis", () => {
  it("voluntário não tem papel de líder nem admin (acesso negado)", async () => {
    const u = { id: usuarioId, igrejaId, papelGlobal: "voluntario" as const };
    expect(await temPapel(db, u, "voluntario")).toBe(true);
    expect(await temPapel(db, u, "lider")).toBe(false);
    expect(await temPapel(db, u, "admin")).toBe(false);
  });

  it("líder só vale no ministério onde é líder aprovado", async () => {
    const [m1] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
    const [m2] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Mídia" }).returning();
    await db.insert(schema.membrosMinisterio).values({
      igrejaId,
      usuarioId,
      ministerioId: m1.id,
      papel: "lider",
      status: "aprovado",
    });
    const u = { id: usuarioId, igrejaId, papelGlobal: "voluntario" as const };
    expect(await temPapel(db, u, "lider", m1.id)).toBe(true);
    expect(await temPapel(db, u, "lider", m2.id)).toBe(false);
  });
});
