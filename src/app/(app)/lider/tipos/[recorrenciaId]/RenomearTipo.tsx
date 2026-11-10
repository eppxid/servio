"use client";

import { useState, useTransition } from "react";

/** Campo para trocar o nome do tipo de culto. A ação chega por prop (mesmo motivo do `EditorModelo`). */
export function RenomearTipo({
  recorrenciaId,
  nome,
  renomear,
}: {
  recorrenciaId: number;
  nome: string;
  renomear: (recorrenciaId: number, nome: string) => Promise<{ erro?: string }>;
}) {
  const [valor, setValor] = useState(nome);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      const r = await renomear(recorrenciaId, valor);
      setMsg(r.erro ? { erro: true, texto: r.erro } : { erro: false, texto: "Nome salvo" });
    });

  return (
    <section aria-label="Nome do tipo" style={{ display: "grid", gap: 10 }}>
      <label className="eyebrow" htmlFor="nome-tipo">
        Nome do tipo de culto
      </label>
      <input
        id="nome-tipo"
        autoComplete="off"
        className="campo"
        value={valor}
        maxLength={60}
        onChange={(e) => {
          setMsg(null);
          setValor(e.target.value);
        }}
      />
      {msg && (
        <p role={msg.erro ? "alert" : "status"} className={msg.erro ? "alerta alerta--bad" : "alerta alerta--good"}>
          {msg.texto}
        </p>
      )}
      <button type="button" className="tbtn tbtn--p" style={{ height: 48 }} disabled={pendente} onClick={salvar}>
        Salvar nome
      </button>
    </section>
  );
}
