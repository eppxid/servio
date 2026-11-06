/** Funções sugeridas pelo nome do ministério (comparação sem acento e sem caixa). */
const SUGESTOES: { chave: string; funcoes: string[] }[] = [
  { chave: "midia", funcoes: ["Projeção", "Transmissão", "Iluminação"] },
  { chave: "louvor", funcoes: ["Voz", "Violão", "Teclado", "Bateria", "Baixo"] },
  { chave: "recepcao", funcoes: ["Porta", "Corredor"] },
];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function funcoesSugeridas(nomeMinisterio: string): string[] {
  const n = normalizar(nomeMinisterio);
  if (!n) return [];
  return SUGESTOES.find((s) => n.includes(s.chave))?.funcoes ?? [];
}

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
