import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { exigirPapel } from "@/lib/auth";
import { FUSO } from "@/lib/recorrencia";
import { editarEvento, excluirRegra, gerarProximos } from "../acoes";

export const dynamic = "force-dynamic";

export default async function DetalheEvento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const admin = await exigirPapel("admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [evento] = await db()
    .select()
    .from(eventos)
    .where(and(eq(eventos.id, id), eq(eventos.igrejaId, admin.igrejaId)));
  if (!evento) notFound();
  const { erro } = await searchParams;

  const f = (d: Date, p: string) => formatInTimeZone(d, FUSO, p);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <Link href={`/eventos?mes=${f(evento.inicio, "yyyy-MM")}`} className="text-sm">
        ← Eventos
      </Link>
      <h1 className="text-2xl font-bold">{evento.titulo}</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <form action={editarEvento} className="space-y-4">
        <input type="hidden" name="id" value={evento.id} />
        <label className="block space-y-1 text-sm">
          Título
          <input
            name="titulo"
            required
            maxLength={120}
            defaultValue={evento.titulo}
            className="campo"
          />
        </label>
        <label className="block space-y-1 text-sm">
          Data
          <input
            name="data"
            type="date"
            required
            defaultValue={f(evento.inicio, "yyyy-MM-dd")}
            className="campo"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            Início
            <input
              name="horaInicio"
              type="time"
              required
              defaultValue={f(evento.inicio, "HH:mm")}
              className="campo"
            />
          </label>
          <label className="block space-y-1 text-sm">
            Fim
            <input
              name="horaFim"
              type="time"
              defaultValue={evento.fim ? f(evento.fim, "HH:mm") : ""}
              className="campo"
            />
          </label>
        </div>
        <button type="submit" className="botao">
          Salvar esta ocorrência
        </button>
        {evento.recorrenciaId && (
          <p className="text-xs text-slate-500">
            A alteração vale só para este dia; a regra semanal não muda.
          </p>
        )}
      </form>

      {evento.recorrenciaId && (
        <section aria-label="Recorrência" className="space-y-3 border-t border-slate-200 pt-4">
          <h2 className="font-semibold">Repete toda semana</h2>
          <form action={gerarProximos}>
            <input type="hidden" name="recorrenciaId" value={evento.recorrenciaId} />
            <button type="submit" className="botao">
              Gerar próximos 90 dias
            </button>
          </form>
          <form action={excluirRegra}>
            <input type="hidden" name="recorrenciaId" value={evento.recorrenciaId} />
            <button type="submit" className="botao">
              Excluir regra e ocorrências futuras
            </button>
          </form>
          <p className="text-xs text-slate-500">
            Ocorrências futuras com escala publicada são mantidas como eventos avulsos.
          </p>
        </section>
      )}

      <section id="escalas-do-evento" aria-label="Escalas do evento"></section>
    </main>
  );
}
