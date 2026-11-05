export type TipoNotificacao =
  | "escala_publicada"
  | "troca_pedida"
  | "troca_aceita"
  | "troca_recusada"
  | "troca_aprovada";

export interface Notificacao {
  tipo: TipoNotificacao;
  eventoId: number;
  usuarioIds: number[];
}

/** Avisa os usuários. Ainda vazia: a tarefa 008 implementa o envio (Web Push). */
export async function notificar(_notificacao: Notificacao): Promise<void> {}
