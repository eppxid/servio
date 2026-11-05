"use client";

import { useState } from "react";

export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2">
      <input
        readOnly
        value={link}
        className="campo"
        aria-label="Link do convite"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn btn--block"
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
