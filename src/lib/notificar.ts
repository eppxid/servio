import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { enviarParaUsuarios } from "@/lib/push/enviar";
import { montarPayload, type TipoAviso } from "@/lib/push/mensagens";
import { enviadorWebPush } from "@/lib/push/web";

export type TipoNotificacao = Exclude<TipoAviso, "lembrete">;

export interface Notificacao {
  tipo: TipoNotificacao;
  eventoId: number;
  usuarioIds: number[];
}

/** Avisa os usuários por Web Push. Nunca lança: falha de aviso não derruba a operação de origem. */
export async function notificar(n: Notificacao): Promise<void> {
  try {
    const enviar = enviadorWebPush();
    if (!enviar || n.usuarioIds.length === 0) return;
    const banco = db() as unknown as AnyDb;
    const [evento] = await banco
      .select({ id: t.eventos.id, igrejaId: t.eventos.igrejaId, titulo: t.eventos.titulo, inicio: t.eventos.inicio })
      .from(t.eventos)
      .where(eq(t.eventos.id, n.eventoId))
      .limit(1);
    if (!evento) return;
    await enviarParaUsuarios(banco, evento.igrejaId, n.usuarioIds, montarPayload(n.tipo, evento), enviar);
  } catch (e) {
    console.error("notificar: falha", (e as Error)?.message);
  }
}
