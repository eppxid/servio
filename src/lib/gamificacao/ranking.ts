export interface LinhaRanking {
  usuarioId: number;
  nome: string;
  pontos: number;
  aparecerNoRanking: boolean;
}

export interface PosicaoRanking {
  posicao: number;
  usuarioId: number;
  nome: string;
  pontos: number;
}

export const TAMANHO_TOP = 10;

/**
 * Ranking visto por `quem`: só entra quem aceita aparecer, mais o próprio usuário
 * (que vê a sua posição mesmo com o ranking desligado ou fora do top).
 * Empate divide a mesma posição.
 */
export function montarRanking(linhas: LinhaRanking[], quem: number, tamanhoTop = TAMANHO_TOP) {
  const visiveis = linhas
    .filter((l) => l.aparecerNoRanking || l.usuarioId === quem)
    .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
  const todos: PosicaoRanking[] = [];
  visiveis.forEach((l, i) => {
    const anterior = todos[i - 1];
    const posicao = anterior && anterior.pontos === l.pontos ? anterior.posicao : i + 1;
    todos.push({ posicao, usuarioId: l.usuarioId, nome: l.nome, pontos: l.pontos });
  });
  return {
    top: todos.slice(0, tamanhoTop),
    minha: todos.find((p) => p.usuarioId === quem) ?? null,
  };
}
