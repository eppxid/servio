"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Calendario, type DiaDoCalendario } from "@/components/app/Calendario";
import { nomeDoDia } from "@/components/app/calendario-grade";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { checkinAcao, confirmarEscala, pedirTrocaAcao, recusarEscala } from "./acoes";

export interface EscalaDoDia {
  itemId: number;
  dia: string;
  titulo: string;
  horario: string;
  ministerio: string;
  funcao: string;
  status: "pendente" | "confirmado" | "recusado";
  checkinHora: string | null;
  checkinAberto: boolean;
  colegas: string[];
  repertorio: string | null;
  troca: "aberta" | "aceita" | null;
  substitutos: { id: number; nome: string }[];
}

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;
const STATUS_CHIP = { pendente: "chip--warn", confirmado: "chip--good", recusado: "chip--bad" } as const;

/** Calendário do mês com meus dias de escala e folgas; o toque no dia abre os detalhes na folha inferior. */
export function CalendarioAgenda({ escalas, folgas }: { escalas: EscalaDoDia[]; folgas: string[] }) {
  const [dia, setDia] = useState<string | null>(null);
  // Cada ação recarrega a página com dados novos: fecha a folha.
  useEffect(() => setDia(null), [escalas]);
  const dias = useMemo(() => {
    const mapa: Record<string, DiaDoCalendario> = {};
    for (const f of folgas) mapa[f] = { tipo: "folga" };
    for (const e of escalas) if (e.status !== "recusado") mapa[e.dia] = { tipo: "minha", rotulo: e.titulo };
    return mapa;
  }, [escalas, folgas]);
  const doDia = dia ? escalas.filter((e) => e.dia === dia) : [];
  const folga = dia ? folgas.includes(dia) : false;

  return (
    <>
      <Calendario
        dias={dias}
        selecionado={dia}
        aoEscolherDia={setDia}
        legenda={
          <>
            <span>
              <i style={{ ["--c" as string]: "var(--primary)" }} /> Tenho escala
            </span>
            <span>
              <i className="off" /> Folga
            </span>
          </>
        }
      />
      <p className="text-sm text-muted">
        {escalas.some((e) => e.status !== "recusado")
          ? "Toque num dia marcado para confirmar, pedir troca ou ver quem serve com você."
          : "Nenhuma escala com você ainda. Quando o líder publicar, o dia aparece marcado aqui."}
      </p>
      <FolhaInferior
        aberta={dia !== null}
        aoFechar={() => setDia(null)}
        titulo={dia ? nomeDoDia(dia) : "Dia"}
        rodape={
          !folga && doDia.length === 0 ? (
            <Link href="/folgas" className="tbtn tbtn--soft" style={{ width: "100%" }}>
              Marcar folga
            </Link>
          ) : undefined
        }
      >
        {doDia.length === 0 && (
          <p className="muted" style={{ padding: "0 12px" }}>
            {folga ? "Você marcou folga neste dia." : "Nenhuma escala neste dia."}
          </p>
        )}
        {doDia.map((e) => (
          <div key={e.itemId} className="card space-y-3" style={{ margin: "0 8px 10px" }}>
            <div>
              <p className="card__title">{e.titulo}</p>
              <p className="text-sm text-muted">
                {e.horario} · {e.ministerio} · {e.funcao}
              </p>
              <p className="mt-2">
                <span className={`chip ${STATUS_CHIP[e.status]}`}>{STATUS[e.status]}</span>
                {e.checkinHora && <span className="text-xs text-muted"> check-in às {e.checkinHora}</span>}
              </p>
            </div>
            {e.colegas.length > 0 && <p className="text-xs text-muted">Com: {e.colegas.join(", ")}</p>}
            {e.repertorio && (
              <Link href={e.repertorio} className="link block text-sm">
                Repertório
              </Link>
            )}
            {e.troca && (
              <p className="alerta alerta--warn text-xs">
                Troca {e.troca === "aberta" ? "aguardando o substituto" : "aguardando o líder"}.
              </p>
            )}
            {e.status !== "recusado" && (
              <div className="grid grid-cols-2 gap-3">
                {e.status === "pendente" && (
                  <form action={confirmarEscala}>
                    <input type="hidden" name="item" value={e.itemId} />
                    <button className="tbtn tbtn--p" style={{ width: "100%" }}>
                      Confirmar
                    </button>
                  </form>
                )}
                <form action={recusarEscala}>
                  <input type="hidden" name="item" value={e.itemId} />
                  <button className="tbtn" style={{ width: "100%" }}>
                    Não posso
                  </button>
                </form>
              </div>
            )}
            {e.checkinAberto && e.status !== "recusado" && !e.checkinHora && (
              <form action={checkinAcao}>
                <input type="hidden" name="item" value={e.itemId} />
                <button className="tbtn tbtn--p" style={{ width: "100%" }}>
                  Fazer check-in
                </button>
              </form>
            )}
            {!e.troca && e.status !== "recusado" && (
              <details>
                <summary className="btn btn--sm cursor-pointer">Pedir troca</summary>
                {e.substitutos.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">Ninguém disponível com esta função.</p>
                ) : (
                  <form action={pedirTrocaAcao} className="mt-3 space-y-2">
                    <input type="hidden" name="item" value={e.itemId} />
                    <select name="substituto" className="campo" required aria-label="Substituto">
                      {e.substitutos.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                    <button className="tbtn tbtn--p" style={{ width: "100%" }}>
                      Enviar pedido
                    </button>
                  </form>
                )}
              </details>
            )}
          </div>
        ))}
      </FolhaInferior>
    </>
  );
}
