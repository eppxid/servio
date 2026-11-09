import { NextResponse } from "next/server";
import { db } from "@/db";
import { lerAparelhoCookie } from "@/lib/acesso/cookie";
import { situacaoDoPedido } from "@/lib/acesso/nucleo";
import type { AnyDb } from "@/lib/auth-core";

export const dynamic = "force-dynamic";

/** Situação do pedido; só responde a quem tem o cookie do aparelho que pediu. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const token = await lerAparelhoCookie();
  if (!Number.isInteger(id) || id <= 0 || !token) return new NextResponse(null, { status: 404 });
  const r = await situacaoDoPedido(db() as unknown as AnyDb, id, token);
  if (!r) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ status: r.status }, { headers: { "cache-control": "no-store" } });
}
