import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { limitesDoMes } from "@/lib/escala/nucleo";
import { detalheMinisterio, type Ator } from "@/lib/ministerios/nucleo";
import { pedidosPendentes, recomendacoes } from "@/lib/servir/nucleo";

/** "YYYY-MM" de hoje no fuso de São Paulo. */
function mesAtual() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

/** Tudo que a tela Equipe mostra para um ministério. */
export async function carregarEquipe(ator: Ator, ministerioId: number) {
  const banco = db() as unknown as AnyDb;
  const detalhe = await detalheMinisterio(banco, ator, ministerioId);
  if (!detalhe) return null;
  const [pedidos, recs] = await Promise.all([
    pedidosPendentes(banco, ator, ministerioId),
    recomendacoes(banco, ator, ministerioId),
  ]);
  const { de, ate } = limitesDoMes(mesAtual());
  const ids = detalhe.membros.map((m) => m.id);
  const usuarios = await banco
    .select({ membroId: t.membrosMinisterio.id, usuarioId: t.membrosMinisterio.usuarioId })
    .from(t.membrosMinisterio)
    .where(inArray(t.membrosMinisterio.id, ids.length ? ids : [0]));
  const contagens = await banco
    .select({ usuarioId: t.escalaItens.usuarioId, total: sql<number>`count(*)`.mapWith(Number) })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalas.ministerioId, ministerioId),
        eq(t.escalas.igrejaId, ator.igrejaId),
        ne(t.escalaItens.status, "recusado"),
        gte(t.eventos.inicio, de),
        lt(t.eventos.inicio, ate),
      ),
    )
    .groupBy(t.escalaItens.usuarioId);
  const membros = detalhe.membros
    .filter((m) => m.status === "aprovado")
    .map((m) => {
      const usuarioId = usuarios.find((u) => u.membroId === m.id)?.usuarioId ?? 0;
      return {
        ...m,
        usuarioId,
        escalasNoMes: contagens.find((c) => c.usuarioId === usuarioId)?.total ?? 0,
      };
    });
  return {
    ministerio: detalhe.ministerio,
    funcoes: detalhe.funcoes,
    membros,
    pedidos,
    recomendacoes: recs.filter((r) => r.desejam > 0),
  };
}

export type Equipe = NonNullable<Awaited<ReturnType<typeof carregarEquipe>>>;
