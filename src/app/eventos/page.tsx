import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { exigirPapel } from "@/lib/auth";
import { FUSO } from "@/lib/recorrencia";
import {
  deslocarMes,
  formatarDia,
  formatarHora,
  inicioDaSemana,
  limitesMes,
  mesValido,
  rotuloMes,
} from "./mes";

export const dynamic = "force-dynamic";

export default async function Eventos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const admin = await exigirPapel("admin");
  const mes = mesValido((await searchParams).mes);
  const { inicio, fim } = limitesMes(mes);

  const lista = await db()
    .select()
    .from(eventos)
    .where(
      and(eq(eventos.igrejaId, admin.igrejaId), gte(eventos.inicio, inicio), lt(eventos.inicio, fim)),
    )
    .orderBy(asc(eventos.inicio));

  const semanas = new Map<string, typeof lista>();
  for (const e of lista) {
    const chave = inicioDaSemana(formatInTimeZone(e.inicio, FUSO, "yyyy-MM-dd"));
    semanas.set(chave, [...(semanas.get(chave) ?? []), e]);
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Eventos</h1>
        <Link href="/eventos/novo" className="botao">
          Novo
        </Link>
      </header>

      <nav aria-label="Mês" className="flex items-center justify-between text-sm">
        <Link href={`/eventos?mes=${deslocarMes(mes, -1)}`}>← Anterior</Link>
        <strong>{rotuloMes(mes)}</strong>
        <Link href={`/eventos?mes=${deslocarMes(mes, 1)}`}>Próximo →</Link>
      </nav>

      {lista.length === 0 && <p className="text-sm text-slate-600">Nenhum evento neste mês.</p>}

      {[...semanas.entries()].map(([domingo, itens]) => (
        <section key={domingo} aria-label={`Semana de ${domingo}`} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">
            Semana de {domingo.split("-").reverse().slice(0, 2).join("/")}
          </h2>
          <ul className="space-y-2">
            {itens.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/eventos/${e.id}`}
                  className="block rounded-lg border border-slate-200 p-3"
                >
                  <span className="block font-medium">{e.titulo}</span>
                  <span className="text-sm text-slate-600">
                    {formatarDia(e.inicio)} · {formatarHora(e.inicio)}
                    {e.fim ? `–${formatarHora(e.fim)}` : ""}
                    {e.recorrenciaId ? " · semanal" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
