import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";

export type ChaveMedalha =
  | "primeira_escala"
  | "presencas_10"
  | "presencas_25"
  | "presencas_50"
  | "semanas_4"
  | "trocas_5";

export const MEDALHAS: Record<ChaveMedalha, { nome: string; descricao: string }> = {
  primeira_escala: { nome: "Primeira escala", descricao: "Confirmou a primeira escala" },
  presencas_10: { nome: "10 presenças", descricao: "10 check-ins feitos" },
  presencas_25: { nome: "25 presenças", descricao: "25 check-ins feitos" },
  presencas_50: { nome: "50 presenças", descricao: "50 check-ins feitos" },
  semanas_4: { nome: "4 semanas seguidas", descricao: "Presença em 4 semanas seguidas" },
  trocas_5: { nome: "5 trocas", descricao: "Assumiu 5 trocas como substituto" },
};

export interface HistoricoMedalhas {
  /** Início do evento de cada escala confirmada. */
  confirmadas: Date[];
  /** Início do evento de cada presença (check-in feito). */
  presencas: Date[];
  /** Início do evento de cada troca aceita como substituto. */
  trocasSubstituto: Date[];
}

export interface MedalhaGanha {
  chave: ChaveMedalha;
  nome: string;
  descricao: string;
  em: Date;
}

const porData = (a: Date, b: Date) => a.getTime() - b.getTime();

/** Índice da semana (segunda a domingo) no fuso da igreja; semanas seguidas têm índices seguidos. */
export function indiceSemana(d: Date): number {
  const dia = formatInTimeZone(d, FUSO, "yyyy-MM-dd");
  const dias = Math.floor(Date.parse(`${dia}T00:00:00Z`) / 86_400_000);
  // 1970-01-01 foi quinta: +3 alinha o início da semana na segunda.
  return Math.floor((dias + 3) / 7);
}

/** Data em que o voluntário completou `n` semanas seguidas com presença; null se nunca. */
export function dataSequenciaSemanas(presencas: Date[], n: number): Date | null {
  const primeiraDaSemana = new Map<number, Date>();
  for (const p of [...presencas].sort(porData)) {
    const s = indiceSemana(p);
    if (!primeiraDaSemana.has(s)) primeiraDaSemana.set(s, p);
  }
  const semanas = [...primeiraDaSemana.keys()].sort((a, b) => a - b);
  let corrida = 0;
  for (let i = 0; i < semanas.length; i++) {
    corrida = i > 0 && semanas[i] === semanas[i - 1] + 1 ? corrida + 1 : 1;
    if (corrida >= n) return primeiraDaSemana.get(semanas[i])!;
  }
  return null;
}

export function calcularMedalhas(h: HistoricoMedalhas): MedalhaGanha[] {
  const confirmadas = [...h.confirmadas].sort(porData);
  const presencas = [...h.presencas].sort(porData);
  const trocas = [...h.trocasSubstituto].sort(porData);
  const achadas: Array<[ChaveMedalha, Date | undefined | null]> = [
    ["primeira_escala", confirmadas[0]],
    ["presencas_10", presencas[9]],
    ["presencas_25", presencas[24]],
    ["presencas_50", presencas[49]],
    ["semanas_4", dataSequenciaSemanas(presencas, 4)],
    ["trocas_5", trocas[4]],
  ];
  return achadas
    .filter((a): a is [ChaveMedalha, Date] => a[1] != null)
    .map(([chave, em]) => ({ chave, ...MEDALHAS[chave], em }))
    .sort((a, b) => b.em.getTime() - a.em.getTime());
}
