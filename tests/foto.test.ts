import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { hashSenha, type AnyDb } from "@/lib/auth-core";
import { ErroFoto, lerFoto, removerFoto, salvarFoto, versoesDeFoto } from "@/lib/foto/nucleo";
import { excluirPropriaConta, exportarDados } from "@/lib/lgpd/titular";

let db: AnyDb;
let igrejaA: number;
let igrejaB: number;
let ana: { id: number; igrejaId: number };
let bia: { id: number; igrejaId: number };
let leitorA: { id: number; igrejaId: number };
let leitorB: { id: number; igrejaId: number };

const webp = (tamanho = 64) => {
  const b = new Uint8Array(tamanho);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  b[20] = 7;
  return b;
};

async function usuario(igrejaId: number, nome: string, comSenha = true) {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome, email: `${nome}@x.com`, senhaHash: comSenha ? await hashSenha("senha-certa-123") : null })
    .returning();
  return { id: u.id, igrejaId };
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaA }] = await db.insert(schema.igrejas).values({ nome: "A" }).returning();
  [{ id: igrejaB }] = await db.insert(schema.igrejas).values({ nome: "B" }).returning();
  ana = await usuario(igrejaA, "ana");
  bia = await usuario(igrejaA, "bia");
  leitorA = await usuario(igrejaA, "leitora");
  leitorB = await usuario(igrejaB, "forasteiro");
});

describe("foto da pessoa", () => {
  it("WebP válido salva e a mesma igreja lê", async () => {
    await salvarFoto(db, ana, webp());
    const lida = await lerFoto(db, leitorA, ana.id);
    expect(lida?.length).toBe(64);
    expect(lida?.[20]).toBe(7);
  });

  it("PNG e JPEG são recusados", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0]);
    for (const b of [png, jpeg]) {
      await expect(salvarFoto(db, bia, b)).rejects.toMatchObject({ motivo: "formato" });
    }
  });

  it("mais de 150 KB é recusado; 150 KB exatos passam", async () => {
    await expect(salvarFoto(db, bia, webp(150 * 1024 + 1))).rejects.toBeInstanceOf(ErroFoto);
    await expect(salvarFoto(db, bia, webp(150 * 1024 + 1))).rejects.toMatchObject({ motivo: "tamanho" });
    await expect(salvarFoto(db, bia, webp(150 * 1024))).resolves.toBeUndefined();
    await removerFoto(db, bia);
  });

  it("outra igreja, leitor sem sessão e leitor anonimizado não leem", async () => {
    expect(await lerFoto(db, leitorB, ana.id)).toBeNull();
    expect(await lerFoto(db, null, ana.id)).toBeNull();
    expect(await lerFoto(db, { ...leitorA, anonimizadoEm: new Date() }, ana.id)).toBeNull();
  });

  it("trocar atualiza a versão e remover apaga", async () => {
    const antes = (await versoesDeFoto(db, [ana.id])).get(ana.id)!;
    await salvarFoto(db, ana, webp(80), new Date(antes + 5000));
    expect((await versoesDeFoto(db, [ana.id])).get(ana.id)).toBe(antes + 5000);
    await removerFoto(db, ana);
    expect(await lerFoto(db, leitorA, ana.id)).toBeNull();
    expect((await versoesDeFoto(db, [ana.id])).has(ana.id)).toBe(false);
  });

  it("exportação traz a foto e exclusão de conta apaga", async () => {
    const dono = await usuario(igrejaA, "dono", false);
    const ator = { ...dono, papelGlobal: "voluntario" as const, senhaHash: null };
    expect((await exportarDados(db, ator)).foto).toBeNull();
    await salvarFoto(db, dono, webp(40));
    const exp = await exportarDados(db, ator);
    expect(exp.foto).toMatch(/^data:image\/webp;base64,/);
    expect(Buffer.from(exp.foto!.split(",")[1], "base64").length).toBe(40);

    await excluirPropriaConta(db, ator, "EXCLUIR", "exclusao");
    expect(await db.select().from(schema.fotos).where(eq(schema.fotos.usuarioId, dono.id))).toHaveLength(0);
  });
});
