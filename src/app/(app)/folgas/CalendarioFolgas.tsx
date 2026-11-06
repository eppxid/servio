"use client";

import Link from "next/link";
import { useState } from "react";
import { Calendario } from "@/components/app/Calendario";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { nomeDoDia } from "@/components/app/calendario-grade";

export function CalendarioFolgas() {
  const [dia, setDia] = useState<string | null>(null);
  return (
    <>
      <Calendario selecionado={dia} aoEscolherDia={setDia} legenda={<span>Toque no dia em que você não pode servir.</span>} />
      <FolhaInferior
        aberta={dia !== null}
        aoFechar={() => setDia(null)}
        titulo={dia ? `Folga em ${nomeDoDia(dia)}?` : "Folga"}
        descricao="O líder não escala você nos dias de folga."
        rodape={
          <Link href="/perfil" className="tbtn tbtn--p" style={{ width: "100%" }}>
            Marcar no Perfil
          </Link>
        }
      >
        <p className="muted" style={{ padding: "0 12px" }}>
          Marcar a folga direto pelo calendário chega na próxima versão. Hoje, registre as datas em Perfil.
        </p>
      </FolhaInferior>
    </>
  );
}
