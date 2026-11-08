"use client";

import { useState } from "react";
import estilo from "./equipe.module.css";

/** Link do convite com botão de copiar. */
export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className={estilo.copiar}>
      <input readOnly value={link} className="campo" aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="tbtn tbtn--soft"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopiado(true);
        }}
      >
        {copiado ? "Copiado" : "Copiar link"}
      </button>
    </div>
  );
}
