"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_MODO, INICIO_DO_MODO, lerModo } from "./modo-comum";

const UM_ANO = 60 * 60 * 24 * 365;

/** Chave "Modo líder": grava a escolha e leva ao Início do modo. */
export async function definirModo(form: FormData) {
  const modo = lerModo(String(form.get("modo") ?? ""));
  (await cookies()).set(COOKIE_MODO, modo, { path: "/", maxAge: UM_ANO, sameSite: "lax" });
  redirect(INICIO_DO_MODO[modo]);
}
