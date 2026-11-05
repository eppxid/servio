import { estaIndisponivel, type Indisponibilidade } from "@/lib/disponibilidade";
import { mesmoDia, temConflito, type Intervalo, type Ocupacao } from "@/lib/escala/regras";

export interface EventoSugestao extends Intervalo {
  id: number;
}

export interface Atribuicao {
  eventoId: number;
  funcaoId: number;
  usuarioId: number | null;
}

export interface EntradaSugestao {
  eventos: readonly EventoSugestao[];
  /** Ids das funções do ministério; cada função = uma vaga por evento. */
  funcoes: readonly number[];
  /** funcaoId → usuários aprovados que têm a função. */
  elegiveis: ReadonlyMap<number, readonly number[]>;
  indisponibilidades: readonly Indisponibilidade[];
  /** Compromissos que já existem fora desta sugestão (outros ministérios, escalas publicadas). */
  ocupacoes?: readonly Ocupacao[];
  /** Escolhas já feitas pelo líder (rascunho): ficam como estão. */
  fixas?: readonly Atribuicao[];
  /** Escalas que cada usuário já tem no período (entram na conta do equilíbrio). */
  contagemInicial?: ReadonlyMap<number, number>;
}

/**
 * Distribui os voluntários nas vagas do período de forma equilibrada.
 * Quem tem menos escalas no período vem primeiro; empate = menor id (determinístico).
 * Respeita indisponibilidade, conflito de horário, um evento por dia por pessoa
 * e uma função por pessoa no mesmo evento. Vaga sem candidato fica com `usuarioId: null`.
 * Função pura.
 */
export function sugerirEscala(entrada: EntradaSugestao): Atribuicao[] {
  const contagem = new Map(entrada.contagemInicial ?? []);
  const ocupacoes: Ocupacao[] = [...(entrada.ocupacoes ?? [])];
  const fixas = new Map<string, number | null>();
  const chave = (eventoId: number, funcaoId: number) => `${eventoId}:${funcaoId}`;
  const eventos = [...entrada.eventos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  for (const f of entrada.fixas ?? []) {
    fixas.set(chave(f.eventoId, f.funcaoId), f.usuarioId);
    if (f.usuarioId === null) continue;
    const ev = eventos.find((e) => e.id === f.eventoId);
    if (!ev) continue;
    contagem.set(f.usuarioId, (contagem.get(f.usuarioId) ?? 0) + 1);
    ocupacoes.push({ usuarioId: f.usuarioId, eventoId: ev.id, inicio: ev.inicio, fim: ev.fim });
  }

  const resultado: Atribuicao[] = [];
  for (const evento of eventos) {
    const noEvento = new Set(
      (entrada.fixas ?? []).filter((f) => f.eventoId === evento.id && f.usuarioId !== null).map((f) => f.usuarioId),
    );
    // Funções com menos candidatos primeiro: evita gastar a única pessoa possível em outra vaga.
    const funcoes = [...entrada.funcoes].sort(
      (a, b) => (entrada.elegiveis.get(a)?.length ?? 0) - (entrada.elegiveis.get(b)?.length ?? 0),
    );
    const doEvento = new Map<number, number | null>();
    for (const funcaoId of funcoes) {
      const k = chave(evento.id, funcaoId);
      if (fixas.has(k) && fixas.get(k) !== null) {
        doEvento.set(funcaoId, fixas.get(k)!);
        continue;
      }
      const candidatos = (entrada.elegiveis.get(funcaoId) ?? []).filter(
        (u) =>
          !noEvento.has(u) &&
          !estaIndisponivel(u, evento.inicio, evento.fim, entrada.indisponibilidades) &&
          !temConflito(u, evento, ocupacoes) &&
          !mesmoDia(u, evento, ocupacoes),
      );
      candidatos.sort((a, b) => (contagem.get(a) ?? 0) - (contagem.get(b) ?? 0) || a - b);
      const escolhido = candidatos[0] ?? null;
      doEvento.set(funcaoId, escolhido);
      if (escolhido !== null) {
        noEvento.add(escolhido);
        contagem.set(escolhido, (contagem.get(escolhido) ?? 0) + 1);
        ocupacoes.push({ usuarioId: escolhido, eventoId: evento.id, inicio: evento.inicio, fim: evento.fim });
      }
    }
    for (const funcaoId of entrada.funcoes) {
      resultado.push({ eventoId: evento.id, funcaoId, usuarioId: doEvento.get(funcaoId) ?? null });
    }
  }
  return resultado;
}
