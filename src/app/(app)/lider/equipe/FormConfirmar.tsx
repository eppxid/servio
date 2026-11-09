"use client";

import type { FormEvent, ReactNode } from "react";

/** Formulário de ação do servidor que pede confirmação antes de enviar. */
export function FormConfirmar({
  action,
  pergunta,
  aoEnviar,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  pergunta: string;
  /** Roda só depois da confirmação. */
  aoEnviar?: () => void;
  children: ReactNode;
}) {
  const confirmar = (e: FormEvent) => {
    if (!window.confirm(pergunta)) e.preventDefault();
    else aoEnviar?.();
  };
  return (
    <form action={action} onSubmit={confirmar}>
      {children}
    </form>
  );
}
