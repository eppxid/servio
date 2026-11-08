"use client";

import type { FormEvent, ReactNode } from "react";

/** Formulário de ação do servidor que pede confirmação antes de enviar. */
export function FormConfirmar({
  action,
  pergunta,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  pergunta: string;
  children: ReactNode;
}) {
  const confirmar = (e: FormEvent) => {
    if (!window.confirm(pergunta)) e.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirmar}>
      {children}
    </form>
  );
}
