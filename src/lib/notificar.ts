export type TipoNotificacao = "escala_publicada" | "aviso_chat";

export interface Notificacao {
  tipo: TipoNotificacao;
  eventoId: number;
  usuarioIds: number[];
}

/** Avisa os usuários. Ainda vazia: a tarefa 008 implementa o envio (Web Push). */
export async function notificar(_notificacao: Notificacao): Promise<void> {}
