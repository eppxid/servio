"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendario, type DiaDoCalendario } from "@/components/app/Calendario";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { hojeIso, nomeDoDia, semanaCurta } from "@/components/app/calendario-grade";
import { FolhaInferior } from "@/components/app/FolhaInferior";
import { useCascata } from "@/components/app/navegar";
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
  dentroDe48h: boolean;
  colegas: string[];
  repertorio: string | null;
  musicas: number;
  chat: string;
  troca: "aberta" | "aceita" | null;
  substitutos: { id: number; nome: string }[];
}

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;
const SELO = { pendente: ["Responder", "chip--warn"], confirmado: ["Confirmada", "chip--good"], recusado: ["Recusada", "chip--bad"] } as const;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_POR_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Agrupa dias `AAAA-MM-DD` consecutivos em períodos de folga. */
function periodosDeFolga(dias: string[]): { inicio: string; fim: string }[] {
  const ordenados = [...new Set(dias)].sort();
  const periodos: { inicio: string; fim: string }[] = [];
  for (const d of ordenados) {
    const ultimo = periodos.at(-1);
    const seguinte = ultimo && new Date(new Date(`${ultimo.fim}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    if (ultimo && seguinte === d) ultimo.fim = d;
    else periodos.push({ inicio: d, fim: d });
  }
  return periodos;
}

const STATUS_CHIP = { pendente: "chip--warn", confirmado: "chip--good", recusado: "chip--bad" } as const;

/** Calendário do mês com meus dias de escala e folgas; o toque no dia abre os detalhes na folha inferior. */
export function CalendarioAgenda({
  escalas,
  folgas,
  diaInicial = null,
}: {
  escalas: EscalaDoDia[];
  folgas: string[];
  /** Dia que já abre o detalhe (`/agenda?dia=AAAA-MM-DD`, vindo do Início). */
  diaInicial?: string | null;
}) {
  const [dia, setDia] = useState<string | null>(diaInicial);
  const [recusando, setRecusando] = useState<number | null>(null);
  const [mes, setMes] = useState((diaInicial ?? hojeIso()).slice(0, 7));
  const anteriores = useRef(escalas);
  // Cada ação recarrega a página com dados novos: fecha a folha (a montagem não conta).
  useEffect(() => {
    if (anteriores.current === escalas) return;
    anteriores.current = escalas;
    setDia(null);
  }, [escalas]);
  const dias = useMemo(() => {
    const mapa: Record<string, DiaDoCalendario> = {};
    for (const f of folgas) mapa[f] = { tipo: "folga" };
    for (const e of escalas) if (e.status !== "recusado") mapa[e.dia] = { tipo: "minha", rotulo: e.titulo };
    return mapa;
  }, [escalas, folgas]);
  // Lista "Em <mês>": minhas escalas e folgas do mês que o calendário mostra, na ordem das datas.
  const lista = useMemo(() => {
    const primeiro = `${mes}-01`;
    const itens: { dia: string; chave: string; escala?: EscalaDoDia; folgaAte?: string }[] = escalas
      .filter((e) => e.dia.startsWith(mes))
      .map((e) => ({ dia: e.dia, chave: `e${e.itemId}`, escala: e }));
    for (const p of periodosDeFolga(folgas)) {
      if (p.fim < primeiro || p.inicio.slice(0, 7) > mes) continue;
      const inicio = p.inicio < primeiro ? primeiro : p.inicio;
      itens.push({ dia: inicio, chave: `f${p.inicio}`, folgaAte: p.fim });
    }
    return itens.sort((a, b) => a.dia.localeCompare(b.dia));
  }, [escalas, folgas, mes]);
  const listaRef = useCascata<HTMLElement>(mes);
  const doDia = dia ? escalas.filter((e) => e.dia === dia) : [];
  const folga = dia ? folgas.includes(dia) : false;

  return (
    <>
      <Calendario
        mesInicial={diaInicial?.slice(0, 7)}
        aoMudarMes={setMes}
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
      <h2 className="sec">Em {MES_POR_EXTENSO[Number(mes.slice(5)) - 1]}</h2>
      <section ref={listaRef} className="list" aria-label={`Escalas e folgas em ${MES_POR_EXTENSO[Number(mes.slice(5)) - 1]}`}>
        {lista.length === 0 ? (
          <p className="vazio" style={{ padding: 16 }}>
            Nada neste mês.
          </p>
        ) : (
          lista.map((i) => (
            <button key={i.chave} type="button" className={`row${i.folgaAte ? " row--folga" : ""}`} onClick={() => setDia(i.dia)}>
              <span className="dt">
                <b>{Number(i.dia.slice(8))}</b>
                <span>{semanaCurta(i.dia)}</span>
              </span>
              <span className="row__tx">
                {i.escala ? (
                  <>
                    <b>{i.escala.funcao}</b>
                    <span>
                      {i.escala.titulo} · {i.escala.horario.slice(0, 5)}
                    </span>
                  </>
                ) : (
                  <b>
                    Folga{i.folgaAte && i.folgaAte !== i.dia ? ` até ${Number(i.folgaAte.slice(8))} ${MESES[Number(i.folgaAte.slice(5, 7)) - 1]}` : ""}
                  </b>
                )}
              </span>
              {i.escala && (
                <span className="row__end">
                  <span className={`chip ${SELO[i.escala.status][1]}`}>{SELO[i.escala.status][0]}</span>
                </span>
              )}
            </button>
          ))
        )}
      </section>
      <AcaoPrincipal href="/folgas" icone="folga">
        Marcar folga
      </AcaoPrincipal>
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
            {e.status !== "recusado" && (
              <Link href={e.chat} className="link block text-sm">
                Chat da equipe
              </Link>
            )}
            {e.repertorio ? (
              <Link href={e.repertorio} className="link block text-sm">
                Repertório{e.musicas > 0 ? ` (${e.musicas} ${e.musicas === 1 ? "música" : "músicas"})` : ""}
              </Link>
            ) : (
              <p className="text-sm text-muted">Repertório ainda vazio</p>
            )}
            {e.troca && (
              <p className="alerta alerta--warn text-xs">
                Troca {e.troca === "aberta" ? "aguardando o substituto" : "aguardando o líder"}.
              </p>
            )}
            {e.status !== "recusado" && !e.checkinHora && (
              <div className="grid grid-cols-2 gap-3">
                {e.status === "pendente" && (
                  <form action={confirmarEscala}>
                    <input type="hidden" name="item" value={e.itemId} />
                    <button className="tbtn tbtn--p" style={{ width: "100%" }}>
                      Confirmar
                    </button>
                  </form>
                )}
                <button type="button" className="tbtn" style={{ width: "100%" }} onClick={() => setRecusando(e.itemId)}>
                  Não posso
                </button>
              </div>
            )}
            {recusando === e.itemId && e.status !== "recusado" && (
              <form action={recusarEscala} className="alerta alerta--warn text-sm" style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="item" value={e.itemId} />
                <span>
                  {e.dentroDe48h
                    ? "Faltam menos de 48 horas. O líder tem pouco tempo para achar alguém: avise-o também."
                    : "O líder recebe o aviso e escolhe outra pessoa."}
                </span>
                <button className="tbtn tbtn--p">Sim, recusar</button>
              </form>
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
