"use client";

import { useEffect, useId, useRef } from "react";
import { IconeApp } from "./icones";

const LIMITE_ARRASTO = 90; // px para baixo que fecham a folha
const VELOCIDADE_FECHA = 0.6; // px/ms: um peteleco rápido também fecha

/**
 * Folha inferior (bottom sheet) sobre `<dialog>` modal: o navegador cuida do foco preso, do fundo
 * inerte, do Esc e da volta do foco ao botão que abriu. Toque fora ou arrastar a alça para baixo fecha.
 */
export function FolhaInferior({
  aberta,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const arrasto = useRef<{ y: number; t: number; dy: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.style.translate = "";
      d.showModal();
    } else if (!aberta && d.open) d.close();
  }, [aberta]);

  const soltar = () => {
    const a = arrasto.current;
    const d = ref.current;
    arrasto.current = null;
    if (!a || !d) return;
    d.style.transition = "";
    const velocidade = a.dy / Math.max(1, performance.now() - a.t);
    if (a.dy > LIMITE_ARRASTO || velocidade > VELOCIDADE_FECHA) aoFechar();
    else d.style.translate = "";
  };

  return (
    <dialog
      ref={ref}
      className="folha"
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClose={() => {
        if (aberta) aoFechar();
      }}
      // O próprio <dialog> só recebe o clique quando ele cai no fundo (o conteúdo ocupa a folha inteira).
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div className="folha__painel">
        <div
          className="folha__alca"
          onPointerDown={(e) => {
            if ((e.target as Element).closest("button")) return;
            arrasto.current = { y: e.clientY, t: performance.now(), dy: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
            if (ref.current) ref.current.style.transition = "none";
          }}
          onPointerMove={(e) => {
            const a = arrasto.current;
            if (!a || !ref.current) return;
            a.dy = Math.max(0, e.clientY - a.y);
            ref.current.style.translate = `0 ${a.dy}px`;
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <span className="folha__grab" aria-hidden="true" />
          <div className="folha__head">
            <h2 id={idTitulo}>{titulo}</h2>
            {descricao && <p>{descricao}</p>}
          </div>
          <button type="button" className="folha__fechar" aria-label="Fechar" onClick={aoFechar}>
            <IconeApp nome="fechar" />
          </button>
        </div>
        <div className="folha__corpo">{children}</div>
        {rodape && <div className="folha__rodape">{rodape}</div>}
      </div>
    </dialog>
  );
}
