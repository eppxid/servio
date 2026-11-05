import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";

export const DIAS_SEM_ESCALA = 60;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface ItemLinha {
  escalaStatus: "rascunho" | "publicada";
  eventoInicio: Date;
  funcaoNome: string;
  ministerioNome: string;
  usuarioId: number | null;
  usuarioNome: string | null;
  status: "pendente" | "confirmado" | "recusado";
  checkinEm: Date | null;
}

export interface EscalaLinha {
  status: "rascunho" | "publicada";
}

export interface TrocaLinha {
  status: "aberta" | "aceita" | "aprovada" | "recusada";
}

export interface VoluntarioLinha {
  usuarioId: number;
  nome: string;
  /** Início do evento mais recente em que a pessoa foi escalada (qualquer período). */
  ultimaEscala: Date | null;
}

export interface Indicadores {
  escalasPublicadas: number;
  taxaConfirmacao: number;
  taxaPresenca: number;
  trocasPedidas: number;
  trocasAprovadas: number;
  voluntariosAprovados: number;
  voluntariosSemEscala: number;
}

export interface LinhaVoluntario {
  usuarioId: number;
  nome: string;
  total: number;
  confirmadas: number;
  presencas: number;
  recusas: number;
}

export interface LinhaVaga {
  quando: Date;
  ministerio: string;
  funcao: string;
}

export interface PontoPresenca {
  mes: string;
  confirmados: number;
  presentes: number;
}

/** Divisão que devolve 0 quando o divisor é 0. */
export function razao(parte: number, total: number): number {
  return total === 0 ? 0 : parte / total;
}

/** Itens de escalas publicadas com voluntário atribuído. */
function itensValidos(itens: ItemLinha[]): ItemLinha[] {
  return itens.filter((i) => i.escalaStatus === "publicada" && i.usuarioId !== null);
}

/** Confirmados de eventos que já passaram: base da taxa de presença. */
function confirmadosPassados(itens: ItemLinha[], agora: Date): ItemLinha[] {
  return itensValidos(itens).filter((i) => i.status === "confirmado" && i.eventoInicio < agora);
}

export function taxaConfirmacao(itens: ItemLinha[]): number {
  const validos = itensValidos(itens);
  return razao(validos.filter((i) => i.status === "confirmado").length, validos.length);
}

export function taxaPresenca(itens: ItemLinha[], agora: Date): number {
  const base = confirmadosPassados(itens, agora);
  return razao(base.filter((i) => i.checkinEm !== null).length, base.length);
}

export function voluntariosSemEscala(voluntarios: VoluntarioLinha[], agora: Date): number {
  const limite = agora.getTime() - DIAS_SEM_ESCALA * DIA_MS;
  return voluntarios.filter((v) => v.ultimaEscala === null || v.ultimaEscala.getTime() < limite).length;
}

export function calcularIndicadores(
  entrada: { itens: ItemLinha[]; escalas: EscalaLinha[]; trocas: TrocaLinha[]; voluntarios: VoluntarioLinha[] },
  agora: Date,
): Indicadores {
  return {
    escalasPublicadas: entrada.escalas.filter((e) => e.status === "publicada").length,
    taxaConfirmacao: taxaConfirmacao(entrada.itens),
    taxaPresenca: taxaPresenca(entrada.itens, agora),
    trocasPedidas: entrada.trocas.length,
    trocasAprovadas: entrada.trocas.filter((t) => t.status === "aprovada").length,
    voluntariosAprovados: entrada.voluntarios.length,
    voluntariosSemEscala: voluntariosSemEscala(entrada.voluntarios, agora),
  };
}

/** Escalas por voluntário em ordem decrescente de total (empate: nome). */
export function escalasPorVoluntario(itens: ItemLinha[], agora: Date): LinhaVoluntario[] {
  const mapa = new Map<number, LinhaVoluntario>();
  for (const i of itensValidos(itens)) {
    const id = i.usuarioId as number;
    const l = mapa.get(id) ?? {
      usuarioId: id,
      nome: i.usuarioNome ?? "",
      total: 0,
      confirmadas: 0,
      presencas: 0,
      recusas: 0,
    };
    l.total++;
    if (i.status === "confirmado") l.confirmadas++;
    if (i.status === "recusado") l.recusas++;
    if (i.status === "confirmado" && i.eventoInicio < agora && i.checkinEm) l.presencas++;
    mapa.set(id, l);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Vagas sem voluntário (ou com recusa) de agora até 30 dias à frente. */
export function vagasAbertas(itens: ItemLinha[], agora: Date, dias = 30): LinhaVaga[] {
  const fim = agora.getTime() + dias * DIA_MS;
  return itens
    .filter(
      (i) =>
        (i.usuarioId === null || i.status === "recusado") &&
        i.eventoInicio >= agora &&
        i.eventoInicio.getTime() <= fim,
    )
    .sort((a, b) => a.eventoInicio.getTime() - b.eventoInicio.getTime())
    .map((i) => ({ quando: i.eventoInicio, ministerio: i.ministerioNome, funcao: i.funcaoNome }));
}

/** Presença por mês (fuso de São Paulo): confirmados de eventos passados e quantos fizeram check-in. */
export function presencaPorMes(itens: ItemLinha[], agora: Date): PontoPresenca[] {
  const mapa = new Map<string, PontoPresenca>();
  for (const i of confirmadosPassados(itens, agora)) {
    const mes = formatInTimeZone(i.eventoInicio, FUSO, "yyyy-MM");
    const p = mapa.get(mes) ?? { mes, confirmados: 0, presentes: 0 };
    p.confirmados++;
    if (i.checkinEm) p.presentes++;
    mapa.set(mes, p);
  }
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}
