import { estaIndisponivel, type Indisponibilidade } from "@/lib/disponibilidade";
import { mesmoDia, temConflito, type Intervalo, type Ocupacao } from "@/lib/escala/regras";
import { dataLocal } from "@/lib/recorrencia";

export interface EventoSugestao extends Intervalo {
  id: number;
}

/** Uma vaga vazia de uma escala (item sem pessoa). */
export interface VagaSugestao {
  itemId: number;
  eventoId: number;
  funcaoId: number;
}

export interface AtribuicaoVaga extends VagaSugestao {
  usuarioId: number;
}

export interface EntradaSugestao {
  eventos: readonly EventoSugestao[];
  /** Vagas vazias a preencher (N itens por função, vindos do modelo). */
  vagas: readonly VagaSugestao[];
  /** funcaoId → usuários aprovados no ministério com a função `aprovada`. */
  elegiveis: ReadonlyMap<number, readonly number[]>;
  indisponibilidades: readonly Indisponibilidade[];
  /**
   * Compromissos que já existem (qualquer ministério, inclusive as escolhas do líder
   * nos eventos sugeridos): geram conflito de horário, mesmo dia e mesmo culto.
   */
  ocupacoes?: readonly Ocupacao[];
  /**
   * Escalas que cada pessoa já tem neste ministério (mês e 60 dias antes):
   * base do rodízio e do limite mensal.
   */
  historico?: readonly { usuarioId: number; inicio: Date }[];
  /** Máximo de escalas por pessoa no mês, neste ministério. */
  limiteMensal?: number;
}

export interface SaidaSugestao {
  atribuicoes: AtribuicaoVaga[];
  semCandidato: VagaSugestao[];
}

const JANELA_RODIZIO_MS = 60 * 24 * 60 * 60 * 1000;

function diaAnterior(dia: string) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Preenche as vagas vazias do período. Ordem das vagas: data do evento, depois função com
 * menos candidatos, depois id do item. Candidato = elegível para a função, sem folga no dia,
 * fora do mesmo culto, sem conflito de horário nem outro evento no mesmo dia e abaixo do
 * limite mensal. Ordem dos candidatos: menos escalas nos 60 dias antes do evento, menos
 * escalas no mês, sem escala no dia anterior, menor id. Vaga sem candidato fica vazia e
 * volta em `semCandidato`. Função pura e determinística.
 */
export function sugerirEscala(entrada: EntradaSugestao): SaidaSugestao {
  const eventos = new Map(entrada.eventos.map((e) => [e.id, e]));
  const ocupacoes: Ocupacao[] = [...(entrada.ocupacoes ?? [])];
  const historico = [...(entrada.historico ?? [])];
  const limite = entrada.limiteMensal ?? Number.POSITIVE_INFINITY;
  const qtdCandidatos = (funcaoId: number) => entrada.elegiveis.get(funcaoId)?.length ?? 0;

  const vagas = entrada.vagas
    .filter((v) => eventos.has(v.eventoId))
    .sort(
      (a, b) =>
        eventos.get(a.eventoId)!.inicio.getTime() - eventos.get(b.eventoId)!.inicio.getTime() ||
        a.eventoId - b.eventoId ||
        qtdCandidatos(a.funcaoId) - qtdCandidatos(b.funcaoId) ||
        a.funcaoId - b.funcaoId ||
        a.itemId - b.itemId,
    );

  const atribuicoes: AtribuicaoVaga[] = [];
  const semCandidato: VagaSugestao[] = [];
  for (const vaga of vagas) {
    const evento = eventos.get(vaga.eventoId)!;
    const dia = dataLocal(evento.inicio);
    const mes = dia.slice(0, 7);
    const ontem = diaAnterior(dia);
    const desde = evento.inicio.getTime() - JANELA_RODIZIO_MS;

    const noMes = (u: number) =>
      historico.filter((h) => h.usuarioId === u && dataLocal(h.inicio).startsWith(mes)).length;
    const em60Dias = (u: number) =>
      historico.filter(
        (h) => h.usuarioId === u && h.inicio.getTime() >= desde && h.inicio.getTime() < evento.inicio.getTime(),
      ).length;
    const ontemEscalado = (u: number) =>
      ocupacoes.some((o) => o.usuarioId === u && dataLocal(o.inicio) === ontem) ? 1 : 0;

    const candidatos = (entrada.elegiveis.get(vaga.funcaoId) ?? [])
      .filter(
        (u) =>
          !ocupacoes.some((o) => o.usuarioId === u && o.eventoId === evento.id) &&
          !estaIndisponivel(u, evento.inicio, evento.fim, entrada.indisponibilidades) &&
          !temConflito(u, evento, ocupacoes) &&
          !mesmoDia(u, evento, ocupacoes) &&
          noMes(u) < limite,
      )
      .map((u) => ({ u, c60: em60Dias(u), mes: noMes(u), ontem: ontemEscalado(u) }))
      .sort((a, b) => a.c60 - b.c60 || a.mes - b.mes || a.ontem - b.ontem || a.u - b.u);

    const escolhido = candidatos[0]?.u;
    if (escolhido === undefined) {
      semCandidato.push(vaga);
      continue;
    }
    atribuicoes.push({ ...vaga, usuarioId: escolhido });
    ocupacoes.push({ usuarioId: escolhido, eventoId: evento.id, inicio: evento.inicio, fim: evento.fim });
    historico.push({ usuarioId: escolhido, inicio: evento.inicio });
  }
  return { atribuicoes, semCandidato };
}
