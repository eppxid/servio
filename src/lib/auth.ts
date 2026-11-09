import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";
import { lerAparelhoCookie } from "@/lib/acesso/cookie";
import { temPapel, usuarioDaSessao, type Papel } from "./auth-core";

export interface DadosSessao {
  usuarioId?: number;
  sessaoVersao?: number;
  /** Aparelho que abriu a sessão (acesso por link pessoal); revogar o aparelho derruba a sessão. */
  aparelhoId?: number;
}

const TRINTA_DIAS = 60 * 60 * 24 * 30;

function opcoes(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET precisa ter 32 caracteres ou mais");
  }
  return {
    password,
    cookieName: "escala_sessao",
    ttl: TRINTA_DIAS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TRINTA_DIAS,
      path: "/",
    },
  };
}

export async function sessao() {
  return getIronSession<DadosSessao>(await cookies(), opcoes());
}

export async function usuarioAtual() {
  const s = await sessao();
  if (!s.usuarioId || s.sessaoVersao === undefined) return null;
  if (s.aparelhoId !== undefined) {
    const [aparelho] = await db()
      .select({ id: aparelhos.id })
      .from(aparelhos)
      .where(and(eq(aparelhos.id, s.aparelhoId), eq(aparelhos.usuarioId, s.usuarioId), isNull(aparelhos.revogadoEm)))
      .limit(1);
    if (!aparelho) return null;
  }
  return usuarioDaSessao(db(), s.usuarioId, s.sessaoVersao);
}

export async function exigirUsuario() {
  const usuario = await usuarioAtual();
  if (!usuario) {
    // Server Component não grava cookie: com aparelho conhecido, o route handler reabre a sessão.
    redirect((await lerAparelhoCookie()) ? "/acesso/reentrar" : "/entrar");
  }
  return usuario;
}

export async function exigirPapel(papel: Papel, ministerioId?: number) {
  const usuario = await exigirUsuario();
  if (!(await temPapel(db(), usuario, papel, ministerioId))) redirect("/inicio");
  return usuario;
}
