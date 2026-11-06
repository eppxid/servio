import { and, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { limitesDoMes, ministeriosDoLider } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";
import { dataLocal } from "@/lib/recorrencia";
import { preenchimentoDoMes } from "@/lib/vagas/nucleo";

export interface CultoComVaga {
  eventoId: number;
  titulo: string;
  /** AAAA-MM-DD no fuso da igreja. */
  data: string;
  inicio: Date;
  preenchidas: number;
  total: number;
  status: "completo" | "faltando" | "sem_escala";
}

export interface DadosEscalar {
  ministerios: { id: number; nome: string }[];
  ministerioId: number | null;
  /** Cultos do mês no ministério, em ordem de data. */
  cultos: CultoComVaga[];
  /** Escalas em rascunho com ao menos uma pessoa: o que "Publicar mês" publica. */
  rascunhos: number;
}

/** Cultos do mês do ministério escolhido (o primeiro que o ator lidera, se nenhum vier) e o que falta publicar. */
export async function dadosEscalar(db: AnyDb, ator: Ator, mes: string, ministerioPedido?: number): Promise<DadosEscalar> {
  const ministerios = await ministeriosDoLider(db, ator);
  const ministerioId = ministerios.find((m) => m.id === ministerioPedido)?.id ?? ministerios[0]?.id ?? null;
  if (ministerioId === null) return { ministerios: [], ministerioId, cultos: [], rascunhos: 0 };
  const eventos = await preenchimentoDoMes(db, ator, mes);
  const cultos: CultoComVaga[] = [];
  for (const e of eventos) {
    const m = e.ministerios.find((x) => x.ministerioId === ministerioId);
    if (!m) continue;
    cultos.push({
      eventoId: e.eventoId,
      titulo: e.titulo,
      data: dataLocal(e.inicio),
      inicio: e.inicio,
      preenchidas: m.preenchidas,
      total: m.total,
      status: m.status,
    });
  }
  const paraPublicar = await rascunhosDoMes(db, ator, ministerioId, mes);
  return { ministerios: ministerios.map((m) => ({ id: m.id, nome: m.nome })), ministerioId, cultos, rascunhos: paraPublicar.length };
}

/** Escalas em rascunho do mês, de cultos futuros, com ao menos uma pessoa que não recusou. */
async function rascunhosDoMes(db: AnyDb, ator: Ator, ministerioId: number, mes: string, agora = new Date()) {
  const lim = limitesDoMes(mes);
  const de = lim.de > agora ? lim.de : agora;
  const escalas = await db
    .select({ id: t.escalas.id, eventoId: t.escalas.eventoId })
    .from(t.escalas)
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.ministerioId, ministerioId),
        eq(t.escalas.status, "rascunho"),
        gte(t.eventos.inicio, de),
        lt(t.eventos.inicio, lim.ate),
      ),
    );
  if (escalas.length === 0) return [];
  const itens = await db
    .select({ escalaId: t.escalaItens.escalaId, usuarioId: t.escalaItens.usuarioId })
    .from(t.escalaItens)
    .where(
      and(
        inArray(t.escalaItens.escalaId, escalas.map((e) => e.id)),
        isNotNull(t.escalaItens.usuarioId),
        ne(t.escalaItens.status, "recusado"),
      ),
    );
  const pessoas = new Map<number, number[]>();
  for (const i of itens) pessoas.set(i.escalaId, [...(pessoas.get(i.escalaId) ?? []), i.usuarioId!]);
  return escalas.flatMap((e) => {
    const usuarios = [...new Set(pessoas.get(e.id) ?? [])];
    return usuarios.length ? [{ ...e, usuarios }] : [];
  });
}

/**
 * Publica as escalas em rascunho do mês do ministério (cultos futuros, com ao menos uma pessoa) e avisa
 * os escalados de cada culto. Escala vazia fica em rascunho. Devolve quantas publicou.
 */
export async function publicarMes(db: AnyDb, ator: Ator, ministerioId: number, mes: string, agora = new Date()) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  const lista = await rascunhosDoMes(db, ator, ministerioId, mes, agora);
  if (lista.length === 0) return 0;
  const feitas = await db
    .update(t.escalas)
    .set({ status: "publicada" })
    .where(and(inArray(t.escalas.id, lista.map((e) => e.id)), eq(t.escalas.status, "rascunho")))
    .returning({ id: t.escalas.id });
  const publicadas = new Set(feitas.map((f) => f.id));
  for (const e of lista) {
    if (publicadas.has(e.id)) await notificar({ tipo: "escala_publicada", eventoId: e.eventoId, usuarioIds: e.usuarios });
  }
  return publicadas.size;
}
