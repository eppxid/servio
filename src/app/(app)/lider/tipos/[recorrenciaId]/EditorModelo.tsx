"use client";

import { useState, useTransition } from "react";
import type { ModeloMinisterio } from "../../cultos/vagas-culto";
import estilo from "./modelo.module.css";

const MAXIMO = 20;

/**
 * Modelo de vagas de um ministério neste tipo de culto: quantidade por função com − / +.
 * A ação chega por prop (ver `VagasMinisterio`): evita uma segunda cópia do módulo do banco.
 * Serve também para as vagas de um culto só: passe `alvoId` (o id do culto) e `legenda`.
 */
export function EditorModelo({
  recorrenciaId,
  alvoId,
  legenda = "por culto",
  ministerio,
  salvar: salvarModelo,
}: {
  recorrenciaId?: number;
  alvoId?: number;
  legenda?: string;
  ministerio: ModeloMinisterio;
  salvar: (
    recorrenciaId: number,
    ministerioId: number,
    vagas: { funcaoId: number; quantidade: number }[],
  ) => Promise<{ erro?: string }>;
}) {
  const [qtd, setQtd] = useState(() => new Map(ministerio.funcoes.map((f) => [f.id, f.quantidade])));
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const total = [...qtd.values()].reduce((a, b) => a + b, 0);
  const mudar = (id: number, delta: number) => {
    setMsg(null);
    setQtd((atual) => new Map(atual).set(id, Math.min(MAXIMO, Math.max(0, (atual.get(id) ?? 0) + delta))));
  };
  const salvar = () =>
    iniciar(async () => {
      const r = await salvarModelo(
        (alvoId ?? recorrenciaId)!,
        ministerio.id,
        ministerio.funcoes.map((f) => ({ funcaoId: f.id, quantidade: qtd.get(f.id) ?? 0 })),
      );
      setMsg(r.erro ? { erro: true, texto: r.erro } : { erro: false, texto: "Vagas salvas" });
    });

  return (
    <section aria-label={ministerio.nome} style={{ display: "grid", gap: 10 }}>
      <div>
        <h2 className="title" style={{ fontSize: "var(--fs-2xl)" }}>
          {ministerio.nome}
        </h2>
        <p className="eyebrow">{total} {total === 1 ? "vaga" : "vagas"} {legenda}</p>
      </div>
      {ministerio.funcoes.length === 0 ? (
        <p className="list vazio">Cadastre as funções do ministério para definir as vagas.</p>
      ) : (
        <div className="list">
          {ministerio.funcoes.map((f) => (
            <div key={f.id} className="row">
              <span className="row__tx">
                <b>{f.nome}</b>
              </span>
              <span className={estilo.passo}>
                <button type="button" aria-label={`Menos uma vaga de ${f.nome}`} onClick={() => mudar(f.id, -1)} disabled={(qtd.get(f.id) ?? 0) === 0}>
                  −
                </button>
                <output aria-label={`Vagas de ${f.nome}`}>{qtd.get(f.id) ?? 0}</output>
                <button type="button" aria-label={`Mais uma vaga de ${f.nome}`} onClick={() => mudar(f.id, 1)} disabled={(qtd.get(f.id) ?? 0) >= MAXIMO}>
                  +
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {msg && (
        <p role={msg.erro ? "alert" : "status"} className={msg.erro ? "alerta alerta--bad" : "alerta alerta--good"}>
          {msg.texto}
        </p>
      )}
      {ministerio.funcoes.length > 0 && (
        <button type="button" className="tbtn tbtn--p" style={{ height: 48 }} disabled={pendente} onClick={salvar}>
          Salvar vagas de {ministerio.nome}
        </button>
      )}
    </section>
  );
}
