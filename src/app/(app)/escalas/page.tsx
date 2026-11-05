import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { listarEscalasFuturas, ministeriosDoLider, type StatusEscala } from "@/lib/escala/nucleo";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { sugerirMesAcao } from "./acoes";

export const dynamic = "force-dynamic";

const ROTULO: Record<StatusEscala, { texto: string; cor: string }> = {
  sem_escala: { texto: "Sem escala", cor: "bg-slate-100 text-slate-600" },
  rascunho: { texto: "Rascunho", cor: "bg-amber-100 text-amber-800" },
  publicada: { texto: "Publicada", cor: "bg-green-100 text-green-800" },
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Escalas</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{ok}</p>}

      {ministerios.length === 0 ? (
        <p className="text-sm text-slate-600">Você não lidera nenhum ministério.</p>
      ) : (
        <>
          <form action={sugerirMesAcao} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <h2 className="font-semibold">Sugerir mês</h2>
            <p className="text-xs text-slate-500">
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
            <button type="submit" className="botao">
              Sugerir
            </button>
          </form>

          {lista.length === 0 && <p className="text-sm text-slate-600">Nenhum evento nos próximos 60 dias.</p>}
          <ul className="space-y-3">
            {lista.map(({ evento, ministerios: ms }) => (
              <li key={evento.id} className="rounded-lg border border-slate-200 p-3">
                <span className="block font-medium">{evento.titulo}</span>
                <span className="text-sm text-slate-600">
                  {formatInTimeZone(evento.inicio, FUSO, "dd/MM HH:mm")}
                </span>
                <ul className="mt-2 space-y-1">
                  {ms.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/escalas/${evento.id}/${m.id}`}
                        className="flex items-center justify-between text-sm"
                      >
                        {m.nome}
                        <span className={`rounded px-2 py-0.5 text-xs ${ROTULO[m.status].cor}`}>
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
