"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendario, type DiaDoCalendario } from "@/components/app/Calendario";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { nomeDoDia } from "@/components/app/calendario-grade";
import { desmarcarFolga, marcarFolga } from "./acoes";

/** Toque no dia abre a folha para marcar (com período opcional) ou desmarcar a folga. */
export function CalendarioFolgas({ folgas }: { folgas: string[] }) {
  const [dia, setDia] = useState<string | null>(null);
  // Cada ação recarrega a página com dados novos: fecha a folha.
  useEffect(() => setDia(null), [folgas]);
  const dias = useMemo(() => {
    const mapa: Record<string, DiaDoCalendario> = {};
    for (const f of folgas) mapa[f] = { tipo: "folga" };
    return mapa;
  }, [folgas]);
  const marcada = dia ? folgas.includes(dia) : false;

  return (
    <>
      <Calendario
        dias={dias}
        selecionado={dia}
        aoEscolherDia={setDia}
        legenda={
          <span>
            <i className="off" /> Folga · toque no dia para marcar ou desmarcar
          </span>
        }
      />
      <FolhaInferior
        aberta={dia !== null}
        aoFechar={() => setDia(null)}
        titulo={dia ? (marcada ? `Folga em ${nomeDoDia(dia)}` : `Folga em ${nomeDoDia(dia)}?`) : "Folga"}
        descricao="O líder não escala você nos dias de folga."
      >
        {dia && (
          <form action={marcada ? desmarcarFolga : marcarFolga} className="space-y-3" style={{ padding: "0 12px 4px" }}>
            <input type="hidden" name="dia" value={dia} />
            {!marcada && (
              <label className="rotulo">
                Até (opcional, para um período)
                <input name="ate" type="date" min={dia} className="campo" />
              </label>
            )}
            <button type="submit" className="tbtn tbtn--p" style={{ width: "100%" }}>
              {marcada ? "Remover folga" : "Marcar folga"}
            </button>
          </form>
        )}
      </FolhaInferior>
    </>
  );
}
