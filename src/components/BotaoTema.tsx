"use client";

import { useRef } from "react";
import { Icone } from "./Icones";

const TEMAS = [
  { valor: "light", label: "Claro" },
  { valor: "dark", label: "Escuro" },
  { valor: "system", label: "Sistema" },
];

export function BotaoTema() {
  const ref = useRef<HTMLButtonElement>(null);
  const abrir = () => {
    const m = window.motion;
    const botao = ref.current;
    if (!m || !botao) return;
    const atual = localStorage.getItem("ui:theme") ?? "light";
    m.menu(
      botao,
      TEMAS.map((t) => ({ label: t.label, checked: t.valor === atual, run: () => m.theme(t.valor, botao) })),
    );
  };
  return (
    <button ref={ref} type="button" onClick={abrir} className="btn btn--icon btn--ghost" aria-label="Tema" aria-haspopup="menu">
      <Icone nome="tema" />
    </button>
  );
}
