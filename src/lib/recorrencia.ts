import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export const FUSO = "America/Sao_Paulo";
export const DIAS_A_GERAR = 90;

export interface RegraRecorrencia {
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
  /** "HH:mm" no fuso de São Paulo */
  horaInicio: string;
  horaFim?: string | null;
  /** "YYYY-MM-DD", último dia (inclusive) em que a regra vale */
  ate?: string | null;
}

export interface Ocorrencia {
  inicio: Date;
  fim: Date | null;
}

/** Data civil ("YYYY-MM-DD") de um instante, no fuso de São Paulo. */
export function dataLocal(instante: Date): string {
  return formatInTimeZone(instante, FUSO, "yyyy-MM-dd");
}

/** Soma dias a uma data civil sem passar por fuso (aritmética em UTC). */
function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diaDaSemana(data: string): number {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

/**
 * Gera as ocorrências concretas da regra semanal no intervalo [de, ate] (inclusive),
 * com horários interpretados em America/Sao_Paulo. Função pura.
 */
export function gerarOcorrencias(regra: RegraRecorrencia, de: Date, ate: Date): Ocorrencia[] {
  const ocorrencias: Ocorrencia[] = [];
  const ultimoDia = dataLocal(ate);
  const limiteRegra = regra.ate ?? null;
  let dia = dataLocal(de);

  while (dia <= ultimoDia) {
    if (limiteRegra && dia > limiteRegra) break;
    if (diaDaSemana(dia) === regra.diaSemana) {
      const inicio = fromZonedTime(`${dia}T${regra.horaInicio}:00`, FUSO);
      const fim = regra.horaFim ? fromZonedTime(`${dia}T${regra.horaFim}:00`, FUSO) : null;
      if (inicio >= de && inicio <= ate) {
        ocorrencias.push({ inicio, fim: fim && fim > inicio ? fim : null });
      }
    }
    dia = somarDias(dia, 1);
  }
  return ocorrencias;
}
