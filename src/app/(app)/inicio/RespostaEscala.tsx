"use client";

import { useState } from "react";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { checkinNoInicio, confirmarNoInicio, recusarNoInicio } from "./acoes";
import css from "./inicio.module.css";

/**
 * Resposta da próxima escala com 1 toque: Confirmar fica no polegar; Recusar abre a folha
 * inferior com o aviso de 48 h antes de gravar.
 */
export function RespostaEscala({
  itemId,
  status,
  dentroDe48h,
  podeCheckin,
  jaFezCheckin,
}: {
  itemId: number;
  status: "pendente" | "confirmado" | "recusado";
  dentroDe48h: boolean;
  podeCheckin: boolean;
  jaFezCheckin: boolean;
}) {
  const [recusando, setRecusando] = useState(false);
  const unico = status !== "pendente" && !(podeCheckin && !jaFezCheckin);
  // Quem já fez check-in está no culto: não há mais o que responder.
  if (jaFezCheckin) return null;
  return (
    <>
      <div className={`${css.acoes} ${unico ? css.unico : ""}`}>
        <button type="button" className={`${css.grande} ${css.nao}`} onClick={() => setRecusando(true)}>
          {status === "pendente" ? "Recusar" : "Não posso mais"}
        </button>
        {status === "pendente" && (
          <form action={confirmarNoInicio}>
            <input type="hidden" name="item" value={itemId} />
            <button type="submit" className={`${css.grande} ${css.sim}`} aria-label="Confirmar presença">
              Confirmar
            </button>
          </form>
        )}
        {podeCheckin && status === "confirmado" && !jaFezCheckin && (
          <form action={checkinNoInicio}>
            <input type="hidden" name="item" value={itemId} />
            <button type="submit" className={`${css.grande} ${css.sim}`}>
              Fazer check-in
            </button>
          </form>
        )}
      </div>
      <FolhaInferior
        aberta={recusando}
        aoFechar={() => setRecusando(false)}
        titulo="Recusar esta escala?"
        descricao={
          dentroDe48h
            ? "Faltam menos de 48 horas. O líder tem pouco tempo para achar alguém: avise-o também."
            : "Avise com 48 horas ou mais para o líder achar um substituto."
        }
        rodape={
          <form action={recusarNoInicio}>
            <input type="hidden" name="item" value={itemId} />
            <button type="submit" className="tbtn tbtn--p" style={{ width: "100%" }}>
              Sim, recusar
            </button>
          </form>
        }
      >
        <p className="muted" style={{ padding: "0 12px" }}>
          O líder recebe o aviso e escolhe outra pessoa.
        </p>
      </FolhaInferior>
    </>
  );
}
