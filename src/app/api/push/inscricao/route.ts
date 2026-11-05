import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { pushInscricoes } from "@/db/schema";
import { usuarioAtual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Inscricao = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const dados = Inscricao.safeParse(await req.json().catch(() => null));
  if (!dados.success) return NextResponse.json({ erro: "Inscrição inválida" }, { status: 400 });
  const { endpoint, keys } = dados.data;
  await db()
    .insert(pushInscricoes)
    .values({
      igrejaId: usuario.igrejaId,
      usuarioId: usuario.id,
      endpoint,
      chaveP256dh: keys.p256dh,
      chaveAuth: keys.auth,
    })
    .onConflictDoUpdate({
      target: pushInscricoes.endpoint,
      set: {
        igrejaId: usuario.igrejaId,
        usuarioId: usuario.id,
        chaveP256dh: keys.p256dh,
        chaveAuth: keys.auth,
      },
    });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof corpo?.endpoint !== "string") {
    return NextResponse.json({ erro: "Endpoint obrigatório" }, { status: 400 });
  }
  await db()
    .delete(pushInscricoes)
    .where(and(eq(pushInscricoes.endpoint, corpo.endpoint), eq(pushInscricoes.usuarioId, usuario.id)));
  return NextResponse.json({ ok: true });
}
