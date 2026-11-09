import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";
import { sessao } from "@/lib/auth";
import { apagarAparelhoCookie, lerAparelhoCookie } from "@/lib/acesso/cookie";
import { hashToken } from "@/lib/acesso/nucleo";

/** Sair = esquecer este aparelho. Sem isso o cookie do aparelho reabriria a sessão sozinho. */
export async function POST(req: Request) {
  const token = await lerAparelhoCookie();
  if (token) {
    await db()
      .update(aparelhos)
      .set({ revogadoEm: new Date() })
      .where(and(eq(aparelhos.tokenHash, hashToken(token)), isNull(aparelhos.revogadoEm)));
    await apagarAparelhoCookie();
  }
  const s = await sessao();
  s.destroy();
  return NextResponse.redirect(new URL("/entrar", req.url), 303);
}
