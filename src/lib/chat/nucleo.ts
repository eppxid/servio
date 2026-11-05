import { and, asc, eq, gt, inArray } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";

export const MAX_TEXTO = 1000;
export class ErroChat extends Error {}

/** Escalas publicadas do evento (evento de outra igreja = vazio). */
async function escalasDoEvento(db: AnyDb, ator: Ator, eventoId: number) {
  return db
    .select({ id: t.escalas.id, ministerioId: t.escalas.ministerioId })
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.eventoId, eventoId),
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.status, "publicada"),
      ),
    );
}

export interface AcessoChat {
  lider: boolean;
}

/** Escalado no evento, líder de ministério escalado nele ou admin; senão ErroAcesso (403). */
export async function exigirAcessoChat(db: AnyDb, ator: Ator, eventoId: number): Promise<AcessoChat> {
  const [evento] = await db
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!evento) throw new ErroAcesso();
  if (ator.papelGlobal === "admin") return { lider: true };

  const escalas = await escalasDoEvento(db, ator, eventoId);
  if (escalas.length === 0) throw new ErroAcesso();

  const [lidera] = await db
    .select({ id: t.membrosMinisterio.id })
    .from(t.membrosMinisterio)
    .where(
      and(
        eq(t.membrosMinisterio.usuarioId, ator.id),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
        eq(t.membrosMinisterio.papel, "lider"),
        eq(t.membrosMinisterio.status, "aprovado"),
        inArray(
          t.membrosMinisterio.ministerioId,
          escalas.map((e) => e.ministerioId),
        ),
      ),
    )
    .limit(1);
  if (lidera) return { lider: true };

  const [escalado] = await db
    .select({ id: t.escalaItens.id })
    .from(t.escalaItens)
    .where(
      and(
        eq(t.escalaItens.usuarioId, ator.id),
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        inArray(
          t.escalaItens.escalaId,
          escalas.map((e) => e.id),
        ),
      ),
    )
    .limit(1);
  if (!escalado) throw new ErroAcesso();
  return { lider: false };
}

export async function listarMensagens(db: AnyDb, ator: Ator, eventoId: number, depois?: Date) {
  await exigirAcessoChat(db, ator, eventoId);
  const condicoes = [eq(t.mensagens.eventoId, eventoId), eq(t.mensagens.igrejaId, ator.igrejaId)];
  if (depois) condicoes.push(gt(t.mensagens.criadoEm, depois));
  return db
    .select({
      id: t.mensagens.id,
      usuarioId: t.mensagens.usuarioId,
      autor: t.usuarios.nome,
      texto: t.mensagens.texto,
      aviso: t.mensagens.aviso,
      criadoEm: t.mensagens.criadoEm,
    })
    .from(t.mensagens)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.mensagens.usuarioId))
    .where(and(...condicoes))
    .orderBy(asc(t.mensagens.criadoEm), asc(t.mensagens.id));
}

export async function enviarMensagem(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  texto: string,
  aviso = false,
) {
  const acesso = await exigirAcessoChat(db, ator, eventoId);
  const limpo = texto.trim();
  if (!limpo) throw new ErroChat("Mensagem vazia");
  if (limpo.length > MAX_TEXTO) throw new ErroChat(`Máximo de ${MAX_TEXTO} caracteres`);
  if (aviso && !acesso.lider) throw new ErroAcesso();

  const [m] = await db
    .insert(t.mensagens)
    .values({ igrejaId: ator.igrejaId, eventoId, usuarioId: ator.id, texto: limpo, aviso })
    .returning();

  if (aviso) {
    const escalas = await escalasDoEvento(db, ator, eventoId);
    const itens = escalas.length
      ? await db
          .select({ usuarioId: t.escalaItens.usuarioId })
          .from(t.escalaItens)
          .where(
            and(
              eq(t.escalaItens.igrejaId, ator.igrejaId),
              inArray(
                t.escalaItens.escalaId,
                escalas.map((e) => e.id),
              ),
            ),
          )
      : [];
    const ids = [...new Set(itens.map((i) => i.usuarioId))].filter(
      (id): id is number => id !== null && id !== ator.id,
    );
    await notificar({ tipo: "aviso_chat", eventoId, usuarioIds: ids });
  }
  return m;
}
