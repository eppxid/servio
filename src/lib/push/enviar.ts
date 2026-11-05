import { and, eq, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";

export interface PayloadPush {
  titulo: string;
  corpo: string;
  url: string;
}

export interface Inscricao {
  endpoint: string;
  chaveP256dh: string;
  chaveAuth: string;
}

/** Envia uma mensagem a uma inscrição; rejeita com `statusCode` quando o serviço de push recusa. */
export type EnviadorPush = (inscricao: Inscricao, payload: PayloadPush) => Promise<void>;

/** Inscrição que o serviço de push informa como inexistente. */
export function inscricaoExpirada(erro: unknown): boolean {
  const codigo = (erro as { statusCode?: number } | null)?.statusCode;
  return codigo === 404 || codigo === 410;
}

/** Envia o payload a todas as inscrições dos usuários da igreja; apaga as que respondem 404 ou 410. */
export async function enviarParaUsuarios(
  db: AnyDb,
  igrejaId: number,
  usuarioIds: number[],
  payload: PayloadPush,
  enviar: EnviadorPush,
): Promise<{ enviados: number; apagados: number }> {
  if (usuarioIds.length === 0) return { enviados: 0, apagados: 0 };
  const inscricoes = await db
    .select()
    .from(t.pushInscricoes)
    .where(
      and(eq(t.pushInscricoes.igrejaId, igrejaId), inArray(t.pushInscricoes.usuarioId, usuarioIds)),
    );
  let enviados = 0;
  let apagados = 0;
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await enviar(i, payload);
        enviados++;
      } catch (e) {
        if (inscricaoExpirada(e)) {
          await db.delete(t.pushInscricoes).where(eq(t.pushInscricoes.id, i.id));
          apagados++;
        } else {
          console.error("push: falha ao enviar", (e as Error)?.message);
        }
      }
    }),
  );
  return { enviados, apagados };
}
