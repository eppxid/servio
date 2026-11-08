"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Calendario, type DiaDoCalendario } from "@/components/app/Calendario";
import { hojeIso, nomeDoDia } from "@/components/app/calendario-grade";
import { IconeApp } from "@/components/app/icones";
import estilo from "./cultos.module.css";

export interface CultoDoMes {
  eventoId: number;
  titulo: string;
  /** AAAA-MM-DD no fuso da igreja. */
  data: string;
  hora: string;
  ministerios: {
    id: number;
    nome: string;
    preenchidas: number;
    total: number;
    status: "completo" | "faltando" | "sem_escala";
  }[];
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const PROXIMOS = 5;

const CLASSE = { completo: "vg--ok", faltando: "vg--falta", sem_escala: "vg--sem" } as const;
const TEXTO = { completo: "completo", faltando: "faltando gente", sem_escala: "sem escala" } as const;

function Pilula({ m, completa }: { m: CultoDoMes["ministerios"][number]; completa?: boolean }) {
  const contagem = m.status === "sem_escala" ? "–" : `${m.preenchidas}/${m.total}`;
  return (
    <span className={`vg ${CLASSE[m.status]}`} title={`${m.nome}: ${TEXTO[m.status]}`}>
      {completa ? `${m.nome} ${contagem}` : (
        <>
          <span className="lg">{m.nome} </span>
          {contagem}
        </>
      )}
    </span>
  );
}

/** Calendário do mês com a pílula "Mídia 3/4" por ministério; o dia escolhido lista os cultos dele. */
export function CalendarioCultos({ mes, cultos }: { mes: string; cultos: CultoDoMes[] }) {
  const router = useRouter();
  const porDia = useMemo(() => {
    const mapa = new Map<string, CultoDoMes[]>();
    for (const c of cultos) mapa.set(c.data, [...(mapa.get(c.data) ?? []), c]);
    return mapa;
  }, [cultos]);

  const hoje = hojeIso();
  // Sem dia escolhido, a lista "Próximos" mostra os 5 próximos cultos do mês.
  const [escolhido, setEscolhido] = useState<{ mes: string; dia: string | null }>({ mes, dia: null });
  const dia = escolhido.mes === mes ? escolhido.dia : null;

  const dias: Record<string, DiaDoCalendario> = {};
  for (const [data, lista] of porDia) {
    const ministerios = lista.flatMap((c) => c.ministerios);
    dias[data] = {
      marcador: (
        <>
          {ministerios.map((m, i) => (
            <Pilula key={`${m.id}-${i}`} m={m} />
          ))}
        </>
      ),
      rotulo: ministerios.map((m) => `${m.nome} ${m.status === "sem_escala" ? "sem escala" : `${m.preenchidas} de ${m.total} vagas`}`).join(", "),
    };
  }
  const futuros = cultos.filter((c) => c.data >= hoje);
  const lista = dia ? (porDia.get(dia) ?? []) : (futuros.length > 0 ? futuros : cultos).slice(0, PROXIMOS);

  return (
    <>
      <Calendario
        mes={mes}
        aoMudarMes={(novo) => router.push(`/lider/cultos?mes=${novo}`)}
        dias={dias}
        selecionado={dia}
        aoEscolherDia={(d) => {
          setEscolhido({ mes, dia: d === dia ? null : d });
          // No celular a lista fica abaixo do calendário: rola até ela.
          requestAnimationFrame(() => document.getElementById("cultos-do-dia")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
        }}
        legenda={
          <span className={estilo.leg}>
            <span>
              <i className={estilo.ok} /> Completo
            </span>
            <span>
              <i className={estilo.falta} /> Faltando gente
            </span>
            <span>
              <i className={estilo.sem} /> Sem escala
            </span>
          </span>
        }
      />
      <div className={estilo.titulo}>
        <h2>{dia ? nomeDoDia(dia) : "Próximos"}</h2>
        {dia && (
          <button type="button" onClick={() => setEscolhido({ mes, dia: null })}>
            Ver próximos
          </button>
        )}
      </div>
      {cultos.length === 0 ? (
        <section className="list vazio">
          <p>Nenhum culto neste mês.</p>
        </section>
      ) : (
        <section id="cultos-do-dia" className="list" aria-label={dia ? nomeDoDia(dia) : "Próximos cultos"} style={{ scrollMarginBottom: 150 }}>
          {lista.length === 0 ? (
            <p className="vazio" style={{ padding: 16 }}>
              Sem culto neste dia. Toque num dia com marcação.
            </p>
          ) : (
            lista.map((c) => (
              <Link key={c.eventoId} href={`/lider/cultos/${c.eventoId}`} className={estilo.culto}>
                <span className={estilo.data}>
                  <b>{Number(c.data.slice(8))}</b>
                  <span>{SEMANA[new Date(`${c.data}T12:00:00Z`).getUTCDay()]}</span>
                </span>
                <span className={estilo.tx}>
                  <b>
                    {c.titulo} · {c.hora}
                  </b>
                  <span className={estilo.pilulas}>
                    {c.ministerios.map((m) => (
                      <Pilula key={m.id} m={m} completa />
                    ))}
                  </span>
                </span>
                <span className="row__end">
                  <IconeApp nome="dir" />
                </span>
              </Link>
            ))
          )}
        </section>
      )}
    </>
  );
}
