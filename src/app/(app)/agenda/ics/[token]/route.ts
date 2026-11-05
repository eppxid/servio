import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { icsDoToken } from "@/lib/trocas/ics";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const corpo = await icsDoToken(db() as unknown as AnyDb, token);
  if (corpo === null) return new Response("Não encontrado", { status: 404 });
  return new Response(corpo, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
