"use client";

import { useRef, useState } from "react";
import { gradeDoMes, hojeIso, nomeDoDia, nomeDoMes, somarMes } from "./calendario-grade";
import { IconeApp } from "./icones";

export interface DiaDoCalendario {
  /** Conteúdo abaixo do número (pílula "Mídia 3/4", ponto…). */
  marcador?: React.ReactNode;
  /** `minha` = tenho escala; `folga` = marquei indisponível. */
  tipo?: "minha" | "folga";
  /** Texto extra para leitor de tela ("2 de 4 vagas preenchidas"). */
  rotulo?: string;
}

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const DESLIZE_MIN = 50; // px na horizontal para trocar de mês com o gesto

/**
 * Calendário mensal: setas e gesto lateral trocam o mês; toque no dia chama `aoEscolherDia`.
 * O mês é controlado (`mes` + `aoMudarMes`) ou interno (`mesInicial`).
 */
export function Calendario({
  mes: mesControlado,
  mesInicial,
  aoMudarMes,
  dias = {},
  selecionado,
  aoEscolherDia,
  legenda,
}: {
  mes?: string;
  mesInicial?: string;
  aoMudarMes?: (mes: string) => void;
  dias?: Record<string, DiaDoCalendario>;
  selecionado?: string | null;
  aoEscolherDia?: (dataIso: string) => void;
  legenda?: React.ReactNode;
}) {
  const hoje = hojeIso();
  const [mesInterno, setMesInterno] = useState(mesInicial ?? hoje.slice(0, 7));
  const mes = mesControlado ?? mesInterno;
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizou = useRef(false);

  const irPara = (n: number) => {
    const novo = somarMes(mes, n);
    if (mesControlado === undefined) setMesInterno(novo);
    aoMudarMes?.(novo);
  };

  return (
    <div className="cal">
      <div className="cal__nav">
        <button type="button" onClick={() => irPara(-1)} aria-label="Mês anterior">
          <IconeApp nome="esq" />
        </button>
        <b aria-live="polite">{nomeDoMes(mes)}</b>
        <button type="button" onClick={() => irPara(1)} aria-label="Próximo mês">
          <IconeApp nome="dir" />
        </button>
      </div>
      <div className="cal__dow" aria-hidden="true">
        {SEMANA.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div
        className="cal__grid"
        role="group"
        aria-label={nomeDoMes(mes)}
        onPointerDown={(e) => {
          toque.current = { x: e.clientX, y: e.clientY };
          deslizou.current = false;
        }}
        onPointerUp={(e) => {
          const t = toque.current;
          toque.current = null;
          if (!t) return;
          const dx = e.clientX - t.x;
          if (Math.abs(dx) > DESLIZE_MIN && Math.abs(dx) > Math.abs(e.clientY - t.y) * 1.5) {
            deslizou.current = true;
            irPara(dx < 0 ? 1 : -1);
          }
        }}
        onPointerCancel={() => (toque.current = null)}
      >
        {gradeDoMes(mes).map((c) => {
          if (c.foraDoMes) {
            return (
              <span key={c.iso} className="day is-out" aria-hidden="true">
                <span className="n">{c.dia}</span>
              </span>
            );
          }
          const info = dias[c.iso];
          const classe = [
            "day",
            c.iso === hoje && "is-today",
            c.iso === selecionado && "is-sel",
            info?.tipo === "minha" && "is-mine",
            info?.tipo === "folga" && "is-off",
          ]
            .filter(Boolean)
            .join(" ");
          const conteudo = (
            <>
              <span className="n">{c.dia}</span>
              {info?.marcador}
            </>
          );
          if (!aoEscolherDia) {
            return (
              <div key={c.iso} className={classe} aria-current={c.iso === hoje ? "date" : undefined}>
                {conteudo}
              </div>
            );
          }
          const rotulo = [nomeDoDia(c.iso), info?.tipo === "folga" && "folga", info?.tipo === "minha" && "tenho escala", info?.rotulo]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={c.iso}
              type="button"
              className={classe}
              aria-label={rotulo}
              aria-pressed={c.iso === selecionado}
              aria-current={c.iso === hoje ? "date" : undefined}
              onClick={() => {
                if (deslizou.current) return;
                aoEscolherDia(c.iso);
              }}
            >
              {conteudo}
            </button>
          );
        })}
      </div>
      {legenda && <div className="cal__leg">{legenda}</div>}
    </div>
  );
}
