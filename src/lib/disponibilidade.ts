import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { indisponibilidades, membrosMinisterio, ministerios } from "@/db/schema";
import type { AnyDb } from "./auth-core";

/** Período de indisponibilidade de um usuário; datas no formato "YYYY-MM-DD". */
export interface Indisponibilidade {
  usuarioId: number;
  dataInicio: string;
  dataFim: string;
}

export type DataEntrada = Date | string;

const FUSO = "America/Sao_Paulo";
const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Converte Date (no fuso America/Sao_Paulo) ou "YYYY-MM-DD" em "YYYY-MM-DD". */
export function diaSaoPaulo(valor: DataEntrada): string {
  return typeof valor === "string" ? valor.slice(0, 10) : formatoDia.format(valor);
}

/**
 * Diz se o usuário tem indisponibilidade que se sobrepõe ao período [inicio, fim].
 * Compara por dia inteiro no fuso America/Sao_Paulo; os limites contam (inclusivo).
 * `fim` ausente = período de um dia só (o de `inicio`).
 */
export function estaIndisponivel(
  usuarioId: number,
  inicio: DataEntrada,
  fim: DataEntrada | null | undefined,
  lista: readonly Indisponibilidade[],
): boolean {
  const di = diaSaoPaulo(inicio);
  const df = fim ? diaSaoPaulo(fim) : di;
  return lista.some((i) => i.usuarioId === usuarioId && i.dataInicio <= df && i.dataFim >= di);
}

/**
 * Indisponibilidades dos membros aprovados do ministério que se sobrepõem a [inicio, fim].
 * Não devolve o motivo: o líder só vê "indisponível".
 * `banco` existe para teste; em produção usa a conexão padrão.
 */
export async function indisponiveisNoPeriodo(
  ministerioId: number,
  inicio: DataEntrada,
  fim: DataEntrada | null | undefined,
  banco: AnyDb = db() as unknown as AnyDb,
): Promise<Indisponibilidade[]> {
  const di = diaSaoPaulo(inicio);
  const df = fim ? diaSaoPaulo(fim) : di;
  return banco
    .select({
      usuarioId: indisponibilidades.usuarioId,
      dataInicio: indisponibilidades.dataInicio,
      dataFim: indisponibilidades.dataFim,
    })
    .from(indisponibilidades)
    .innerJoin(
      membrosMinisterio,
      and(
        eq(membrosMinisterio.usuarioId, indisponibilidades.usuarioId),
        eq(membrosMinisterio.igrejaId, indisponibilidades.igrejaId),
      ),
    )
    .innerJoin(
      ministerios,
      and(
        eq(ministerios.id, membrosMinisterio.ministerioId),
        eq(ministerios.igrejaId, membrosMinisterio.igrejaId),
      ),
    )
    .where(
      and(
        eq(membrosMinisterio.ministerioId, ministerioId),
        eq(membrosMinisterio.status, "aprovado"),
        lte(indisponibilidades.dataInicio, df),
        gte(indisponibilidades.dataFim, di),
      ),
    );
}

/** Datas "YYYY-MM-DD" de todos os dias da semana (0 = domingo) no mês (1-12). */
export function diasDaSemanaNoMes(ano: number, mes: number, diaSemana: number): string[] {
  const dias: string[] = [];
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= total; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === diaSemana) {
      dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return dias;
}
