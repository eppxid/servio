import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { limparDadosAntigos } from "@/lib/lgpd/limpeza";

export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Cron diário de retenção (vercel.json). */
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const apagados = await limparDadosAntigos(db() as unknown as AnyDb);
  return NextResponse.json({ apagados });
}
