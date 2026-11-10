import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { usuarioAtual } from "@/lib/auth";
import { lerFoto, tipoDaFoto } from "@/lib/foto/nucleo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  const { usuarioId } = await params;
  const id = Number(usuarioId);
  const leitor = await usuarioAtual();
  if (!leitor || !Number.isInteger(id)) return new Response(null, { status: 404 });
  const conteudo = await lerFoto(db() as unknown as AnyDb, leitor, id);
  if (!conteudo) return new Response(null, { status: 404 });
  const bytes = new Uint8Array(conteudo);
  return new Response(bytes, {
    headers: {
      "Content-Type": tipoDaFoto(bytes) ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
