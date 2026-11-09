"use client";

import { useState } from "react";

export function CopiarLink() {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--block min-h-11"
      onClick={async () => {
        await navigator.clipboard.writeText(location.origin + location.pathname);
        setCopiado(true);
      }}
    >
      {copiado ? "Link copiado" : "Copiar link"}
    </button>
  );
}
