import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "YYYY-MM" válido, ou o mês atual (São Paulo) se vier vazio ou inválido. */
export function mesValido(bruto: string | undefined, agora = new Date()): string {
  if (bruto && /^\d{4}-(0[1-9]|1[0-2])$/.test(bruto)) return bruto;
  return formatInTimeZone(agora, FUSO, "yyyy-MM");
}

export function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** Limites [inicio, fim) do mês, à meia-noite de São Paulo. */
export function limitesMes(mes: string): { inicio: Date; fim: Date } {
  return {
    inicio: fromZonedTime(`${mes}-01T00:00:00`, FUSO),
    fim: fromZonedTime(`${deslocarMes(mes, 1)}-01T00:00:00`, FUSO),
  };
}

/** Domingo da semana da data civil "YYYY-MM-DD". */
export function inicioDaSemana(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function formatarHora(d: Date): string {
  return formatInTimeZone(d, FUSO, "HH:mm");
}

export function formatarDia(d: Date): string {
  const diaSemana = Number(formatInTimeZone(d, FUSO, "i")) % 7;
  return `${formatInTimeZone(d, FUSO, "dd/MM")} · ${DIAS[diaSemana]}`;
}
