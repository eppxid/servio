import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { apagarAparelhoCookie, lerAparelhoCookie } from "@/lib/acesso/cookie";
import { aparelhoValido } from "@/lib/acesso/nucleo";
import type { AnyDb } from "@/lib/auth-core";
import { abrirSessao, guardarAceitePendente } from "@/lib/lgpd/sessao";
import { aceiteEmDia } from "@/lib/lgpd/termos";

export const dynamic = "force-dynamic";

/** Sessão vencida com aparelho conhecido: abre a sessão de novo (Server Component não grava cookie). */
export async function GET(req: Request) {
  const ir = (caminho: string) => NextResponse.redirect(new URL(caminho, req.url), 303);
  const token = await lerAparelhoCookie();
  if (!token) return ir("/entrar");

  const banco = db() as unknown as AnyDb;
  const aparelho = await aparelhoValido(banco, token);
  const [usuario] = aparelho
    ? await banco.select().from(usuarios).where(eq(usuarios.id, aparelho.usuarioId)).limit(1)
    : [];
  if (!aparelho || !usuario || usuario.anonimizadoEm) {
    await apagarAparelhoCookie();
    return ir("/entrar");
  }

  if (!aceiteEmDia(usuario)) {
    await guardarAceitePendente(usuario, aparelho.aparelhoId);
    return ir("/entrar/termos");
  }
  await abrirSessao(usuario, aparelho.aparelhoId);
  return ir("/inicio");
}
