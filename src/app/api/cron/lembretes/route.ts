import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { enviarLembretes } from "@/lib/push/lembretes";
import { enviadorWebPush } from "@/lib/push/web";

export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const enviar = enviadorWebPush();
  if (!enviar) return NextResponse.json({ erro: "VAPID não configurado" }, { status: 503 });
  const enviados = await enviarLembretes(db() as unknown as AnyDb, enviar);
  return NextResponse.json({ enviados });
}
