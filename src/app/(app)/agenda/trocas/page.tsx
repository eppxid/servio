import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { trocasParaAprovar } from "@/lib/trocas/nucleo";
import { decidirTrocaAcao, trocaAutomaticaAcao } from "../acoes";
import { eq } from "drizzle-orm";
import * as t from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function Trocas({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const banco = db() as unknown as AnyDb;
  const [pedidos, ministerios] = await Promise.all([trocasParaAprovar(banco, ator), ministeriosDoLider(banco, ator)]);
  const auto = ministerios.length
    ? new Map(
        (
          await banco
            .select({ id: t.ministerios.id, auto: t.ministerios.trocaAutomatica })
            .from(t.ministerios)
            .where(eq(t.ministerios.igrejaId, ator.igrejaId))
        ).map((m) => [m.id, m.auto]),
      )
    : new Map<number, boolean>();
  const { erro, ok } = await searchParams;

  return (
    <div className="space-y-6">
      <Link href="/agenda" className="text-sm">
        ← Agenda
      </Link>
      <h1 className="text-2xl font-bold">Trocas</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{ok}</p>}

      {ministerios.length === 0 ? (
        <p className="text-sm text-slate-600">Só líderes aprovam trocas.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold">Aguardando aprovação</h2>
            {pedidos.length === 0 && <p className="text-sm text-slate-600">Nenhum pedido.</p>}
            {pedidos.map((p) => (
              <form key={p.id} action={decidirTrocaAcao} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="hidden" name="troca" value={p.id} />
                <p>
                  {p.ministerio} · {p.titulo}, {formatInTimeZone(p.inicio, FUSO, "dd/MM HH:mm")}: {p.solicitante} →{" "}
                  {p.substituto} ({p.funcao})
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button name="acao" value="aprovar" className="botao">
                    Aprovar
                  </button>
                  <button name="acao" value="recusar" className="botao">
                    Recusar
                  </button>
                </div>
              </form>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Aprovação automática</h2>
            {ministerios.map((m) => (
              <form key={m.id} action={trocaAutomaticaAcao} className="flex items-center justify-between gap-3 text-sm">
                <input type="hidden" name="ministerio" value={m.id} />
                <input type="hidden" name="ligada" value={auto.get(m.id) ? "0" : "1"} />
                <span>
                  {m.nome}: {auto.get(m.id) ? "ligada" : "desligada"}
                </span>
                <button className="botao">{auto.get(m.id) ? "Desligar" : "Ligar"}</button>
              </form>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
