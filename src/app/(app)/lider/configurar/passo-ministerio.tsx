"use client";

import { useState } from "react";
import { funcoesSugeridas } from "./sugestoes";

/** Passo 1: nome do ministério, chips de funções sugeridas e campo livre. Envia `funcoes` repetido. */
export function PassoMinisterio() {
  const [nome, setNome] = useState("");
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [livre, setLivre] = useState("");
  const todas = [...new Set([...funcoesSugeridas(nome), ...escolhidas])];

  function alternar(f: string) {
    setEscolhidas((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
  }
  function adicionarLivre() {
    const f = livre.trim();
    if (f && !escolhidas.includes(f)) setEscolhidas([...escolhidas, f]);
    setLivre("");
  }

  return (
    <div className="space-y-4">
      <label className="rotulo">
        Nome do ministério
        <input
          name="ministerio"
          autoComplete="off"
          className="campo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          placeholder="Ex.: Mídia"
          required
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="rotulo">Funções (toque para marcar)</legend>
        <div className="flex flex-wrap gap-2">
          {todas.length === 0 && <p className="text-sm text-muted">Digite o nome do ministério ou adicione abaixo.</p>}
          {todas.map((f) => {
            const marcada = escolhidas.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={marcada}
                onClick={() => alternar(f)}
                className={`btn btn--sm ${marcada ? "btn--primary" : ""}`}
              >
                {f}
              </button>
            );
          })}
        </div>
        {escolhidas.map((f) => (
          <input key={f} type="hidden" name="funcoes" value={f} />
        ))}
        <div className="flex gap-2">
          <input
            className="campo"
            aria-label="Outra função"
            autoComplete="off"
            value={livre}
            maxLength={80}
            placeholder="Outra função"
            onChange={(e) => setLivre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionarLivre();
              }
            }}
          />
          <button type="button" className="btn" onClick={adicionarLivre}>
            Adicionar
          </button>
        </div>
      </fieldset>
    </div>
  );
}
