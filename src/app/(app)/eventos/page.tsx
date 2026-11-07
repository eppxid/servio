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
import { Cabecalho } from "@/components/Cabecalho";

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
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Eventos">
        <Link href="/lider/cultos" className="tbtn">
          ← Cultos
        </Link>
        <Link href="/eventos/novo" className="tbtn tbtn--soft">
          Novo
        </Link>
      </Cabecalho>

      <nav aria-label="Mês" className="flex items-center justify-between text-sm">
        <Link href={`/eventos?mes=${deslocarMes(mes, -1)}`} className="btn btn--sm">
          ← Anterior
        </Link>
        <strong>{rotuloMes(mes)}</strong>
        <Link href={`/eventos?mes=${deslocarMes(mes, 1)}`} className="btn btn--sm">
          Próximo →
        </Link>
      </nav>

      {lista.length === 0 && <p className="text-sm text-muted">Nenhum evento neste mês.</p>}

      {[...semanas.entries()].map(([domingo, itens]) => (
        <section key={domingo} aria-label={`Semana de ${domingo}`} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">
            Semana de {domingo.split("-").reverse().slice(0, 2).join("/")}
          </h2>
          <ul className="space-y-2">
            {itens.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/eventos/${e.id}`}
                  className="block rounded-[var(--r-tile)] border border-line bg-surface p-3 hover:bg-well"
                >
                  <span className="block font-medium">{e.titulo}</span>
                  <span className="text-sm text-muted">
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
    </div>
  );
}
