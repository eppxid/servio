"use client";

import { useState } from "react";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { salvarOndeServir } from "./acoes";

export interface MinisterioParaServir {
  id: number;
  nome: string;
  /** Situação do membro no ministério; nulo = ainda não pediu. */
  situacao: "pendente" | "aprovado" | null;
  funcoes: { id: number; nome: string; status: "desejada" | "aprovada" | null }[];
}

/** Chips de funções por ministério. `aprovada` aparece marcada e travada; `desejada` pode ser retirada. */
export function FormServir({ ministerios }: { ministerios: MinisterioParaServir[] }) {
  const [marcadas, setMarcadas] = useState(
    () => new Set(ministerios.flatMap((m) => m.funcoes.filter((f) => f.status === "desejada").map((f) => `${m.id}:${f.id}`))),
  );
  const alternar = (chave: string) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });

  if (ministerios.length === 0) return <p className="list vazio">Sua igreja ainda não cadastrou ministérios.</p>;

  return (
    <form action={salvarOndeServir} className="space-y-4">
      {ministerios.map((m) => (
        <section key={m.id} className="card space-y-3" aria-label={m.nome}>
          <h2 className="card__title">{m.nome}</h2>
          {m.situacao === "pendente" && <p className="chip chip--warn">Pedido aguardando o líder</p>}
          {m.situacao === "aprovado" && <p className="chip chip--good">Você é membro</p>}
          {m.funcoes.length === 0 ? (
            <p className="text-sm text-muted">Este ministério ainda não tem funções cadastradas.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {m.funcoes.map((f) => {
                const chave = `${m.id}:${f.id}`;
                const aprovada = f.status === "aprovada";
                const ativa = aprovada || marcadas.has(chave);
                return (
                  <label
                    key={f.id}
                    className={ativa ? "tbtn tbtn--p" : "tbtn"}
                    style={{ cursor: aprovada ? "default" : "pointer", opacity: aprovada ? 0.85 : 1 }}
                  >
                    <input
                      type="checkbox"
                      name="f"
                      value={chave}
                      checked={ativa}
                      disabled={aprovada}
                      onChange={() => alternar(chave)}
                      className="sr-only"
                    />
                    {f.nome}
                    {aprovada && <small> · aprovada</small>}
                    {f.status === "desejada" && marcadas.has(chave) && <small> · pedida</small>}
                  </label>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <AcaoPrincipal type="submit">Salvar pedido</AcaoPrincipal>
    </form>
  );
}
