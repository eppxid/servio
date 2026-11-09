import { and, eq, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";

export const FOTO_MAX_BYTES = 150 * 1024;

export class ErroFoto extends Error {
  constructor(
    public motivo: "formato" | "tamanho",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

type Dono = { id: number; igrejaId: number };
type Leitor = Dono & { anonimizadoEm?: Date | null };

/** WebP começa com "RIFF" + 4 bytes de tamanho + "WEBP". */
export function ehWebp(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const txt = (de: number) => String.fromCharCode(...bytes.slice(de, de + 4));
  return txt(0) === "RIFF" && txt(8) === "WEBP";
}

export async function salvarFoto(db: AnyDb, usuario: Dono, bytes: Uint8Array, agora = new Date()) {
  if (!ehWebp(bytes)) throw new ErroFoto("formato", "Envie a foto em WebP");
  if (bytes.length > FOTO_MAX_BYTES) throw new ErroFoto("tamanho", "A foto passa de 150 KB");
  const conteudo = Buffer.from(bytes);
  await db
    .insert(t.fotos)
    .values({ usuarioId: usuario.id, igrejaId: usuario.igrejaId, conteudo, atualizadoEm: agora })
    .onConflictDoUpdate({ target: t.fotos.usuarioId, set: { conteudo, atualizadoEm: agora } });
}

export async function removerFoto(db: AnyDb, usuario: Dono) {
  await db.delete(t.fotos).where(and(eq(t.fotos.usuarioId, usuario.id), eq(t.fotos.igrejaId, usuario.igrejaId)));
}

/** Só quem está logado na mesma igreja lê; sem leitor ou anonimizado → null. */
export async function lerFoto(db: AnyDb, leitor: Leitor | null | undefined, usuarioId: number) {
  if (!leitor || leitor.anonimizadoEm) return null;
  const [f] = await db
    .select({ conteudo: t.fotos.conteudo })
    .from(t.fotos)
    .where(and(eq(t.fotos.usuarioId, usuarioId), eq(t.fotos.igrejaId, leitor.igrejaId)))
    .limit(1);
  return f ? f.conteudo : null;
}

/** usuarioId → timestamp de atualizado_em (para montar `?v=` na URL da foto). */
export async function versoesDeFoto(db: AnyDb, usuarioIds: number[]) {
  const mapa = new Map<number, number>();
  if (!usuarioIds.length) return mapa;
  const linhas = await db
    .select({ usuarioId: t.fotos.usuarioId, atualizadoEm: t.fotos.atualizadoEm })
    .from(t.fotos)
    .where(inArray(t.fotos.usuarioId, usuarioIds));
  for (const l of linhas) mapa.set(l.usuarioId, l.atualizadoEm.getTime());
  return mapa;
}
