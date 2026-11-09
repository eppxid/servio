import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const CUSTO_BCRYPT = 12;
export const SENHA_MINIMA = 8;
export const MAX_TENTATIVAS = 5;
export const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

const HASH_FALSO = bcrypt.hashSync("senha-inexistente", CUSTO_BCRYPT);

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

/** Conta criada por link pessoal não tem senha: nunca confere. */
export function verificarSenha(senha: string, hash: string | null): Promise<boolean> {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(senha, hash);
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashEmail(email: string): string {
  return createHash("sha256").update(normalizarEmail(email)).digest("hex");
}

async function errosRecentes(db: AnyDb, email: string, agora: Date): Promise<number> {
  const desde = new Date(agora.getTime() - JANELA_TENTATIVAS_MS);
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tentativasLogin)
    .where(
      and(
        eq(schema.tentativasLogin.emailHash, hashEmail(email)),
        gt(schema.tentativasLogin.criadoEm, desde),
      ),
    );
  return linha?.n ?? 0;
}

export type ResultadoLogin =
  | { ok: true; usuario: typeof schema.usuarios.$inferSelect }
  | { ok: false; motivo: "invalido" | "bloqueado" };

export async function autenticar(
  db: AnyDb,
  email: string,
  senha: string,
  agora: Date = new Date(),
): Promise<ResultadoLogin> {
  if ((await errosRecentes(db, email, agora)) >= MAX_TENTATIVAS) {
    return { ok: false, motivo: "bloqueado" };
  }

  const [usuario] = await db
    .select()
    .from(schema.usuarios)
    .where(eq(schema.usuarios.email, normalizarEmail(email)))
    .limit(1);

  const confere = await verificarSenha(senha, usuario?.senhaHash ?? HASH_FALSO);
  if (!usuario || !confere || usuario.anonimizadoEm) {
    await db
      .insert(schema.tentativasLogin)
      .values({ emailHash: hashEmail(email), criadoEm: agora });
    return { ok: false, motivo: "invalido" };
  }

  await db
    .delete(schema.tentativasLogin)
    .where(eq(schema.tentativasLogin.emailHash, hashEmail(email)));
  return { ok: true, usuario };
}

/** Troca a senha e invalida as sessões abertas (sessao_versao + 1). */
export async function trocarSenha(db: AnyDb, usuarioId: number, novaSenha: string): Promise<void> {
  if (novaSenha.length < SENHA_MINIMA) throw new Error("Senha curta demais");
  await db
    .update(schema.usuarios)
    .set({
      senhaHash: await hashSenha(novaSenha),
      sessaoVersao: sql`${schema.usuarios.sessaoVersao} + 1`,
    })
    .where(eq(schema.usuarios.id, usuarioId));
}

/** Devolve o usuário só se a versão da sessão ainda vale. */
export async function usuarioDaSessao(db: AnyDb, usuarioId: number, sessaoVersao: number) {
  const [usuario] = await db
    .select()
    .from(schema.usuarios)
    .where(eq(schema.usuarios.id, usuarioId))
    .limit(1);
  if (!usuario || usuario.anonimizadoEm || usuario.sessaoVersao !== sessaoVersao) return null;
  return usuario;
}

export type Papel = "admin" | "lider" | "voluntario";

/** Admin vale para tudo. Líder: global ou líder aprovado do ministério pedido. */
export async function temPapel(
  db: AnyDb,
  usuario: { id: number; igrejaId: number; papelGlobal: Papel },
  papel: Papel,
  ministerioId?: number,
): Promise<boolean> {
  if (usuario.papelGlobal === "admin") return true;
  if (papel === "voluntario") return true;
  if (papel === "admin") return false;

  const condicoes = [
    eq(schema.membrosMinisterio.usuarioId, usuario.id),
    eq(schema.membrosMinisterio.igrejaId, usuario.igrejaId),
    eq(schema.membrosMinisterio.papel, "lider"),
    eq(schema.membrosMinisterio.status, "aprovado"),
  ];
  if (ministerioId !== undefined) {
    condicoes.push(eq(schema.membrosMinisterio.ministerioId, ministerioId));
  } else if (usuario.papelGlobal === "lider") {
    return true;
  }
  const [achou] = await db
    .select({ id: schema.membrosMinisterio.id })
    .from(schema.membrosMinisterio)
    .where(and(...condicoes))
    .limit(1);
  return Boolean(achou);
}
