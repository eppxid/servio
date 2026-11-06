import { and, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";

export const NOME_TIPO_MAX = 60;

/** Troca o nome do tipo de culto. Só admin (mesma regra de criar culto) e só da própria igreja. */
export async function renomearTipo(db: AnyDb, ator: Ator, recorrenciaId: number, nome: string): Promise<string> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  const limpo = nome.trim();
  if (limpo.length < 1 || limpo.length > NOME_TIPO_MAX) {
    throw new RangeError(`O nome deve ter de 1 a ${NOME_TIPO_MAX} caracteres`);
  }
  const [rec] = await db
    .update(t.recorrencias)
    .set({ nome: limpo })
    .where(and(eq(t.recorrencias.id, recorrenciaId), eq(t.recorrencias.igrejaId, ator.igrejaId)))
    .returning({ id: t.recorrencias.id });
  if (!rec) throw new ErroAcesso();
  return limpo;
}
