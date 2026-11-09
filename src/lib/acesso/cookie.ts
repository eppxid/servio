import { cookies } from "next/headers";

export const COOKIE_APARELHO = "servio_aparelho";
const QUATROCENTOS_DIAS = 60 * 60 * 24 * 400;

/** Token do aparelho (estritamente necessário para a autenticação; ver política de privacidade). */
export async function lerAparelhoCookie(): Promise<string | null> {
  return (await cookies()).get(COOKIE_APARELHO)?.value || null;
}

/** Só grava em Server Action ou Route Handler. */
export async function gravarAparelhoCookie(token: string) {
  (await cookies()).set(COOKIE_APARELHO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: QUATROCENTOS_DIAS,
    path: "/",
  });
}

export async function apagarAparelhoCookie() {
  (await cookies()).delete(COOKIE_APARELHO);
}
