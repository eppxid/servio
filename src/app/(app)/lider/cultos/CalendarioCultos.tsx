"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Calendario, type DiaDoCalendario } from "@/components/app/Calendario";
import { hojeIso, nomeDoDia } from "@/components/app/calendario-grade";
import { IconeApp } from "@/components/app/icones";

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
  const inicial = porDia.has(hoje) ? hoje : (cultos[0]?.data ?? null);
  const [escolhido, setEscolhido] = useState<{ mes: string; dia: string | null }>({ mes, dia: inicial });
  // Mês novo (veio do servidor): volta para o primeiro dia com culto.
  const dia = escolhido.mes === mes ? escolhido.dia : inicial;

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
  const doDia = dia ? (porDia.get(dia) ?? []) : [];

  return (
    <>
      <Calendario
        mes={mes}
        aoMudarMes={(novo) => router.push(`/lider/cultos?mes=${novo}`)}
        dias={dias}
        selecionado={dia}
        aoEscolherDia={(d) => setEscolhido({ mes, dia: d })}
        legenda={
          <>
            <span>
              <i style={{ ["--c" as string]: "var(--good)" }} /> Completo
            </span>
            <span>
              <i style={{ ["--c" as string]: "var(--warn)" }} /> Faltando gente
            </span>
            <span>
              <i style={{ ["--c" as string]: "var(--faint)" }} /> Sem escala
            </span>
          </>
        }
      />
      {cultos.length === 0 ? (
        <section className="list vazio">
          <p>Nenhum culto neste mês.</p>
        </section>
      ) : (
        <section className="list" aria-label={dia ? nomeDoDia(dia) : "Cultos"}>
          {doDia.length === 0 ? (
            <p className="vazio" style={{ padding: 16 }}>
              Sem culto neste dia. Toque num dia com marcação.
            </p>
          ) : (
            doDia.map((c) => (
              <Link key={c.eventoId} href={`/lider/cultos/${c.eventoId}`} className="row">
                <span className="row__tx">
                  <b>
                    {c.titulo} · {c.hora}
                  </b>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
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
