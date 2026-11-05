import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";

/** Texto da escala para colar no WhatsApp. */
export function textoEscala(
  evento: { titulo: string; inicio: Date },
  ministerio: string,
  itens: readonly { funcao: string; nome: string | null }[],
): string {
  const quando = formatInTimeZone(evento.inicio, FUSO, "dd/MM 'às' HH:mm");
  const linhas = itens.map((i) => `• ${i.funcao}: ${i.nome ?? "(vago)"}`);
  return [`*Escala ${ministerio}*`, `${evento.titulo} — ${quando}`, "", ...linhas].join("\n");
}

/** Link wa.me que abre o WhatsApp com o texto pronto (o usuário escolhe o contato ou grupo). */
export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
