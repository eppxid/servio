"use client";

import { IconeApp } from "./icones";

const TEMAS = [
  { valor: "light", rotulo: "Claro" },
  { valor: "dark", rotulo: "Escuro" },
  { valor: "system", rotulo: "Sistema" },
];

/** Linha "Tema" do Perfil: Claro, Escuro ou Sistema. */
export function TemaPerfil() {
  return (
    <div className="card">
      <h2 className="card__title">Tema</h2>
      <div className="tema-opcoes" role="group" aria-label="Tema">
        <IconeApp nome="tema" />
        {TEMAS.map((t) => (
          <button key={t.valor} type="button" className="tbtn" onClick={(e) => window.motion?.theme(t.valor, e.currentTarget)}>
            {t.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
