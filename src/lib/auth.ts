import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { temPapel, usuarioDaSessao, type Papel } from "./auth-core";

export interface DadosSessao {
  usuarioId?: number;
  sessaoVersao?: number;
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
  return usuarioDaSessao(db(), s.usuarioId, s.sessaoVersao);
}

export async function exigirUsuario() {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

export async function exigirPapel(papel: Papel, ministerioId?: number) {
  const usuario = await exigirUsuario();
  if (!(await temPapel(db(), usuario, papel, ministerioId))) redirect("/agenda");
  return usuario;
}
