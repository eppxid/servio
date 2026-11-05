import { NextResponse } from "next/server";
import { db } from "@/db";
import { usuarioAtual } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { exportarDados } from "@/lib/lgpd/titular";

export const dynamic = "force-dynamic";

/** Portabilidade (LGPD art. 18 V): JSON com os dados do próprio titular. */
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const dados = await exportarDados(db() as unknown as AnyDb, usuario);
  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meus-dados.json"',
      "Cache-Control": "no-store",
    },
  });
}
