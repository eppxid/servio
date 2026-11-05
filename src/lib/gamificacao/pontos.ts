/** Regras de pontuação num lugar só: ajuste os valores aqui. */
export const REGRAS_PONTOS = {
  escalaConfirmada: 10,
  checkin: 5,
  trocaSubstituto: 15,
  recusaTardia: -5,
  /** Recusa com menos que isso de antecedência do evento perde pontos. */
  antecedenciaRecusaMs: 48 * 60 * 60 * 1000,
} as const;

export type TipoLancamento = "escala_confirmada" | "checkin" | "troca_substituto" | "recusa_tardia";

/** Um fato que gera pontos; `em` é o início do evento a que o fato se refere. */
export interface Lancamento {
  tipo: TipoLancamento;
  em: Date;
}

export const PONTOS_POR_TIPO: Record<TipoLancamento, number> = {
  escala_confirmada: REGRAS_PONTOS.escalaConfirmada,
  checkin: REGRAS_PONTOS.checkin,
  troca_substituto: REGRAS_PONTOS.trocaSubstituto,
  recusa_tardia: REGRAS_PONTOS.recusaTardia,
};

export interface ItemHistorico {
  eventoInicio: Date;
  status: "pendente" | "confirmado" | "recusado";
  checkinEm: Date | null;
  /** Quando o voluntário recusou; sem esse dado a recusa não gera penalidade. */
  recusadoEm?: Date | null;
}

export function recusaTardia(eventoInicio: Date, recusadoEm: Date): boolean {
  return eventoInicio.getTime() - recusadoEm.getTime() < REGRAS_PONTOS.antecedenciaRecusaMs;
}

/** Converte o histórico do voluntário em lançamentos. `trocasSubstituto` traz o início do evento de cada troca aceita. */
export function lancamentosDe(itens: ItemHistorico[], trocasSubstituto: Date[]): Lancamento[] {
  const l: Lancamento[] = [];
  for (const i of itens) {
    if (i.status === "confirmado") l.push({ tipo: "escala_confirmada", em: i.eventoInicio });
    if (i.status !== "recusado" && i.checkinEm) l.push({ tipo: "checkin", em: i.eventoInicio });
    if (i.status === "recusado" && i.recusadoEm && recusaTardia(i.eventoInicio, i.recusadoEm)) {
      l.push({ tipo: "recusa_tardia", em: i.eventoInicio });
    }
  }
  for (const em of trocasSubstituto) l.push({ tipo: "troca_substituto", em });
  return l;
}

export function calcularPontos(lancamentos: Lancamento[], de?: Date, ate?: Date): number {
  let total = 0;
  for (const l of lancamentos) {
    if (de && l.em < de) continue;
    if (ate && l.em >= ate) continue;
    total += PONTOS_POR_TIPO[l.tipo];
  }
  return total;
}
