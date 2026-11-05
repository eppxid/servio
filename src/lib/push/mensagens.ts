import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";
import type { PayloadPush } from "./enviar";

export type TipoAviso =
  | "escala_publicada"
  | "aviso_chat"
  | "troca_pedida"
  | "troca_aceita"
  | "troca_recusada"
  | "troca_aprovada"
  | "lembrete";

const TITULOS: Record<TipoAviso, string> = {
  escala_publicada: "Escala publicada",
  aviso_chat: "Aviso do líder",
  troca_pedida: "Pedido de troca",
  troca_aceita: "Troca aceita",
  troca_recusada: "Troca recusada",
  troca_aprovada: "Troca aprovada",
  lembrete: "Lembrete: você serve amanhã",
};

export function montarPayload(
  tipo: TipoAviso,
  evento: { id: number; titulo: string; inicio: Date },
): PayloadPush {
  const quando = formatInTimeZone(evento.inicio, FUSO, "dd/MM 'às' HH:mm");
  return {
    titulo: TITULOS[tipo],
    corpo: `${evento.titulo} — ${quando}`,
    url: tipo === "aviso_chat" ? `/chat/${evento.id}` : "/agenda",
  };
}
