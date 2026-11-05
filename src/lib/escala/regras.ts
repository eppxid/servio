import { dataLocal } from "@/lib/recorrencia";

/** Duração assumida quando o evento não tem horário de fim. */
export const DURACAO_PADRAO_MS = 2 * 60 * 60 * 1000;

export interface Intervalo {
  inicio: Date;
  fim: Date | null;
}

/** Compromisso já existente de um usuário (outra escala, de qualquer ministério). */
export interface Ocupacao extends Intervalo {
  usuarioId: number;
  eventoId: number;
}

function fimEfetivo(i: Intervalo): number {
  return (i.fim ?? new Date(i.inicio.getTime() + DURACAO_PADRAO_MS)).getTime();
}

/** Dois eventos se sobrepõem no horário (encostar no limite não conta). */
export function horariosSobrepoem(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < fimEfetivo(b) && b.inicio.getTime() < fimEfetivo(a);
}

/**
 * O usuário já está escalado em horário sobreposto (inclui outro ministério no mesmo evento).
 * A lista de ocupações não deve conter a própria escala que está sendo montada.
 */
export function temConflito(
  usuarioId: number,
  evento: Intervalo & { id: number },
  ocupacoes: readonly Ocupacao[],
): boolean {
  return ocupacoes.some(
    (o) => o.usuarioId === usuarioId && horariosSobrepoem(o, evento),
  );
}

/** O usuário já está escalado no mesmo dia (fuso de São Paulo). */
export function mesmoDia(
  usuarioId: number,
  evento: Intervalo & { id: number },
  ocupacoes: readonly Ocupacao[],
): boolean {
  const dia = dataLocal(evento.inicio);
  return ocupacoes.some(
    (o) => o.usuarioId === usuarioId && dataLocal(o.inicio) === dia,
  );
}
