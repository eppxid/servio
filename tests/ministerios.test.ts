import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { hashSenha, type AnyDb } from "@/lib/auth-core";
import {
  ErroAcesso,
  aceitarConvite,
  cadastrarPorConvite,
  conviteValido,
  criarFuncao,
  criarMinisterio,
  decidirMembro,
  definirLider,
  definirSenhaTemporaria,
  gerarConvite,
  VALIDADE_CONVITE_MS,
  type Ator,
} from "@/lib/ministerios/nucleo";

let db: AnyDb;
let admin: Ator;
let lider: Ator;
let voluntario: Ator;
let outroLider: Ator;
let minId: number;
let outroMinId: number;

async function usuario(igrejaId: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email, email, senhaHash: await hashSenha("senha-12345"), papelGlobal })
    .returning();
  return { id: u.id, igrejaId, papelGlobal } as Ator;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  const [igreja] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  admin = await usuario(igreja.id, "admin@x.com", "admin");
  lider = await usuario(igreja.id, "lider@x.com");
  outroLider = await usuario(igreja.id, "lider2@x.com");
  voluntario = await usuario(igreja.id, "vol@x.com");
  minId = (await criarMinisterio(db, admin, "Louvor")).id;
  outroMinId = (await criarMinisterio(db, admin, "Mídia")).id;
  await definirLider(db, admin, minId, lider.id, true);
  await definirLider(db, admin, outroMinId, outroLider.id, true);
});

describe("convite", () => {
  it("recusa token expirado e aceita o válido", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const token = await gerarConvite(db, lider, minId, t0);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await conviteValido(db, token, new Date(t0.getTime() + VALIDADE_CONVITE_MS - 1000))).not.toBeNull();
    const depois = new Date(t0.getTime() + VALIDADE_CONVITE_MS + 1000);
    expect(await conviteValido(db, token, depois)).toBeNull();
    expect(await aceitarConvite(db, voluntario, token, depois)).toEqual({ ok: false, motivo: "invalido" });
    const r = await cadastrarPorConvite(db, token, { nome: "N", email: "n@x.com", senha: "senha-12345" }, depois);
    expect(r).toEqual({ ok: false, motivo: "invalido" });
  });

  it("cadastro por convite cria membro pendente; aprovação valida as funções", async () => {
    const token = await gerarConvite(db, lider, minId);
    const r = await cadastrarPorConvite(db, token, { nome: "Bia", email: "Bia@x.com", senha: "senha-12345" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [membro] = await db
      .select()
      .from(schema.membrosMinisterio)
      .where(eq(schema.membrosMinisterio.usuarioId, r.usuario.id));
    expect(membro.status).toBe("pendente");

    await criarFuncao(db, lider, minId, "Vocal");
    await criarFuncao(db, outroLider, outroMinId, "Câmera");
    const [vocal] = await db.select().from(schema.funcoes).where(eq(schema.funcoes.nome, "Vocal"));
    const [camera] = await db.select().from(schema.funcoes).where(eq(schema.funcoes.nome, "Câmera"));

    await expect(decidirMembro(db, lider, membro.id, true, [camera.id])).rejects.toBeInstanceOf(ErroAcesso);
    await decidirMembro(db, lider, membro.id, true, [vocal.id]);
    const [depois] = await db.select().from(schema.membrosMinisterio).where(eq(schema.membrosMinisterio.id, membro.id));
    expect(depois.status).toBe("aprovado");
  });

  it("e-mail já cadastrado não duplica a conta", async () => {
    const token = await gerarConvite(db, lider, minId);
    const r = await cadastrarPorConvite(db, token, { nome: "X", email: "vol@x.com", senha: "senha-12345" });
    expect(r).toEqual({ ok: false, motivo: "email_em_uso" });
  });
});

describe("acesso negado", () => {
  it("voluntário não executa ação de líder nem de admin", async () => {
    await expect(gerarConvite(db, voluntario, minId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(criarFuncao(db, voluntario, minId, "Baixo")).rejects.toBeInstanceOf(ErroAcesso);
    await expect(criarMinisterio(db, voluntario, "Novo")).rejects.toBeInstanceOf(ErroAcesso);
    await expect(definirLider(db, voluntario, minId, voluntario.id, true)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("líder de outro ministério não mexe neste", async () => {
    await expect(gerarConvite(db, outroLider, minId)).rejects.toBeInstanceOf(ErroAcesso);
    const [m] = await db.select().from(schema.membrosMinisterio).where(eq(schema.membrosMinisterio.usuarioId, lider.id));
    await expect(definirSenhaTemporaria(db, outroLider, m.id, "temporaria-1")).rejects.toBeInstanceOf(ErroAcesso);
    await expect(decidirMembro(db, voluntario, m.id, false)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("senha temporária", () => {
  it("marca troca obrigatória e derruba as sessões", async () => {
    const token = await gerarConvite(db, lider, minId);
    const r = await cadastrarPorConvite(db, token, { nome: "Caio", email: "caio@x.com", senha: "senha-12345" });
    if (!r.ok) throw new Error("cadastro falhou");
    const [m] = await db.select().from(schema.membrosMinisterio).where(eq(schema.membrosMinisterio.usuarioId, r.usuario.id));
    await definirSenhaTemporaria(db, lider, m.id, "temporaria-1");
    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, r.usuario.id));
    expect(u.trocarSenha).toBe(true);
    expect(u.sessaoVersao).toBe(r.usuario.sessaoVersao + 1);
  });
});
