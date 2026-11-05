import { fromZonedTime } from "date-fns-tz";
import { and, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { dataLocal, FUSO } from "@/lib/recorrencia";
import { enviarParaUsuarios, type EnviadorPush } from "./enviar";
import { montarPayload } from "./mensagens";

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Avisa os escalados (não recusados) em escalas publicadas dos eventos do dia seguinte, fuso de Brasília. */
export async function enviarLembretes(
  db: AnyDb,
  enviar: EnviadorPush,
  agora: Date = new Date(),
): Promise<number> {
  const hoje = dataLocal(agora);
  const inicio = fromZonedTime(`${somarDias(hoje, 1)}T00:00:00`, FUSO);
  const fim = fromZonedTime(`${somarDias(hoje, 2)}T00:00:00`, FUSO);

  const linhas = await db
    .selectDistinct({
      eventoId: t.eventos.id,
      igrejaId: t.eventos.igrejaId,
      titulo: t.eventos.titulo,
      inicio: t.eventos.inicio,
      usuarioId: t.escalaItens.usuarioId,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalas.status, "publicada"),
        isNotNull(t.escalaItens.usuarioId),
        ne(t.escalaItens.status, "recusado"),
        gte(t.eventos.inicio, inicio),
        lt(t.eventos.inicio, fim),
      ),
    );

  const porEvento = new Map<number, { igrejaId: number; titulo: string; inicio: Date; ids: number[] }>();
  for (const l of linhas) {
    const e = porEvento.get(l.eventoId) ?? {
      igrejaId: l.igrejaId,
      titulo: l.titulo,
      inicio: l.inicio,
      ids: [],
    };
    e.ids.push(l.usuarioId as number);
    porEvento.set(l.eventoId, e);
  }
  let enviados = 0;
  for (const [id, e] of porEvento) {
    const r = await enviarParaUsuarios(
      db,
      e.igrejaId,
      e.ids,
      montarPayload("lembrete", { id, titulo: e.titulo, inicio: e.inicio }),
      enviar,
    );
    enviados += r.enviados;
  }
  return enviados;
}
