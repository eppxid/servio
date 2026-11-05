import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { listarEscalasFuturas, ministeriosDoLider, type StatusEscala } from "@/lib/escala/nucleo";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { sugerirMesAcao } from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const ROTULO: Record<StatusEscala, { texto: string; cor: string }> = {
  sem_escala: { texto: "Sem escala", cor: "chip--plain" },
  rascunho: { texto: "Rascunho", cor: "chip--warn" },
  publicada: { texto: "Publicada", cor: "chip--good" },
};

export default async function Escalas({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const banco = db() as unknown as AnyDb;
  const [ministerios, lista] = await Promise.all([
    ministeriosDoLider(banco, ator),
    listarEscalasFuturas(banco, ator),
  ]);
  const { erro, ok } = await searchParams;
  const mesAtual = formatInTimeZone(new Date(), FUSO, "yyyy-MM");

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Próximos 60 dias" titulo="Escalas" />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && <p className="alerta alerta--good">{ok}</p>}

      {ministerios.length === 0 ? (
        <p className="card text-sm text-muted">Você não lidera nenhum ministério.</p>
      ) : (
        <>
          <form action={sugerirMesAcao} className="card space-y-3">
            <h2 className="card__title">Sugerir mês</h2>
            <p className="text-xs text-muted">
              Preenche as vagas vazias com quem tem menos escalas, sem conflito. Fica como rascunho.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select name="ministerio" className="campo" aria-label="Ministério">
                {ministerios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <input name="mes" type="month" required defaultValue={mesAtual} className="campo" aria-label="Mês" />
            </div>
            <button type="submit" className="btn btn--primary btn--block">
              Sugerir
            </button>
          </form>

          {lista.length === 0 && <p className="card text-sm text-muted">Nenhum evento nos próximos 60 dias.</p>}
          <ul className="grid items-start gap-4 md:grid-cols-2" data-enter>
            {lista.map(({ evento, ministerios: ms }) => (
              <li key={evento.id} className="card">
                <span className="card__title block">{evento.titulo}</span>
                <span className="text-sm text-muted">
                  {formatInTimeZone(evento.inicio, FUSO, "dd/MM HH:mm")}
                </span>
                <ul className="mt-3 space-y-1">
                  {ms.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/escalas/${evento.id}/${m.id}`}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--r-tile)] px-2 text-sm hover:bg-well"
                      >
                        {m.nome}
                        <span className={`chip ${ROTULO[m.status].cor}`}>
                          {ROTULO[m.status].texto}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
