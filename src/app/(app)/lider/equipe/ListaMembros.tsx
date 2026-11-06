"use client";

import { useState } from "react";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { IconeApp } from "@/components/app/icones";
import { alterarPapel, salvarFuncoesDoMembro } from "./actions";

export interface MembroLinha {
  id: number;
  usuarioId: number;
  nome: string;
  papel: "lider" | "voluntario";
  funcaoIds: number[];
  escalasNoMes: number;
}

/** Membros aprovados; tocar numa linha abre a folha para editar funções e papel. */
export function ListaMembros({
  ministerioId,
  membros,
  funcoes,
  admin,
}: {
  ministerioId: number;
  membros: MembroLinha[];
  funcoes: { id: number; nome: string }[];
  admin: boolean;
}) {
  const [aberto, setAberto] = useState<MembroLinha | null>(null);
  const nomeDe = (id: number) => funcoes.find((f) => f.id === id)?.nome;

  return (
    <>
      <div className="list">
        {membros.map((m) => (
          <button
            key={m.id}
            type="button"
            className="row"
            style={{ width: "100%", background: "none", border: 0, textAlign: "left", font: "inherit", color: "inherit" }}
            onClick={() => setAberto(m)}
          >
            <span className="row__tx">
              <b>
                {m.nome}
                {m.papel === "lider" ? " · líder" : ""}
              </b>
              <span>
                {m.funcaoIds.map(nomeDe).filter(Boolean).join(", ") || "Sem funções"} · {m.escalasNoMes}{" "}
                {m.escalasNoMes === 1 ? "escala" : "escalas"} no mês
              </span>
            </span>
            <span className="row__end">
              <IconeApp nome="dir" />
            </span>
          </button>
        ))}
        {membros.length === 0 && (
          <p className="row" style={{ color: "var(--muted)" }}>
            Ninguém na equipe ainda.
          </p>
        )}
      </div>

      <FolhaInferior
        aberta={aberto !== null}
        aoFechar={() => setAberto(null)}
        titulo={aberto?.nome ?? ""}
        descricao={aberto ? `${aberto.escalasNoMes} escala(s) neste mês` : undefined}
      >
        {aberto && (
          <div style={{ display: "grid", gap: 14, padding: "4px 12px" }}>
            <form action={salvarFuncoesDoMembro} onSubmit={() => setAberto(null)} style={{ display: "grid", gap: 6 }}>
              <input type="hidden" name="membro" value={aberto.id} />
              <b>Funções aprovadas</b>
              {funcoes.map((f) => (
                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <input type="checkbox" name="funcoes" value={f.id} defaultChecked={aberto.funcaoIds.includes(f.id)} className="caixa" />
                  {f.nome}
                </label>
              ))}
              {funcoes.length === 0 && <p style={{ color: "var(--muted)" }}>O ministério ainda não tem funções.</p>}
              <button type="submit" className="tbtn tbtn--p" style={{ justifySelf: "start" }}>
                Salvar funções
              </button>
            </form>
            {admin && (
              <form action={alterarPapel} onSubmit={() => setAberto(null)}>
                <input type="hidden" name="ministerio" value={ministerioId} />
                <input type="hidden" name="usuario" value={aberto.usuarioId} />
                <input type="hidden" name="lider" value={aberto.papel === "lider" ? "0" : "1"} />
                <button type="submit" className="tbtn tbtn--soft">
                  {aberto.papel === "lider" ? "Tirar de líder" : "Tornar líder"}
                </button>
              </form>
            )}
          </div>
        )}
      </FolhaInferior>
    </>
  );
}
