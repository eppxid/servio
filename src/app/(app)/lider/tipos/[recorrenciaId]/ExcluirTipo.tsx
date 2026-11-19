"use client";

import { useState, useTransition } from "react";
import estilo from "./modelo.module.css";

/** Botão de excluir o tipo, com confirmação. A ação chega por prop e redireciona para a lista. */
export function ExcluirTipo({
  recorrenciaId,
  excluir,
}: {
  recorrenciaId: number;
  excluir: (recorrenciaId: number) => Promise<{ erro?: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const confirmar = () =>
    iniciar(async () => {
      const r = await excluir(recorrenciaId);
      if (r?.erro) setErro(r.erro);
    });

  return (
    <section aria-label="Excluir tipo" style={{ display: "grid", gap: 10 }}>
      {!aberto ? (
        <button type="button" className={`tbtn ${estilo.perigo}`} style={{ height: 48 }} onClick={() => setAberto(true)}>
          Excluir tipo de culto
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmar exclusão" className="alerta alerta--bad" style={{ display: "grid", gap: 10 }}>
          <p>Os cultos futuros sem escala publicada serão apagados. Cultos passados e publicados ficam.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className={`tbtn ${estilo.perigo}`} disabled={pendente} onClick={confirmar}>
              Sim, excluir
            </button>
            <button type="button" className="tbtn" disabled={pendente} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
    </section>
  );
}
