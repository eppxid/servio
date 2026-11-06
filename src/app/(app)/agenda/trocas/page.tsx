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
import { Cabecalho } from "@/components/Cabecalho";

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
    <div className="space-y-5">
      <Cabecalho eyebrow="Modo líder" titulo="Trocas" />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && <p className="alerta alerta--good">{ok}</p>}

      {ministerios.length === 0 ? (
        <p className="card text-sm text-muted">Só líderes aprovam trocas.</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="card__title">Aguardando aprovação</h2>
            {pedidos.length === 0 && <p className="text-sm text-muted">Nenhum pedido.</p>}
            {pedidos.map((p) => (
              <form key={p.id} action={decidirTrocaAcao} className="card space-y-2 text-sm">
                <input type="hidden" name="troca" value={p.id} />
                <p>
                  {p.ministerio} · {p.titulo}, {formatInTimeZone(p.inicio, FUSO, "dd/MM HH:mm")}: {p.solicitante} →{" "}
                  {p.substituto} ({p.funcao})
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button name="acao" value="aprovar" className="btn btn--primary btn--block">
                    Aprovar
                  </button>
                  <button name="acao" value="recusar" className="btn btn--danger btn--block">
                    Recusar
                  </button>
                </div>
              </form>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="card__title">Aprovação automática</h2>
            {ministerios.map((m) => (
              <form key={m.id} action={trocaAutomaticaAcao} className="card flex items-center justify-between gap-3 text-sm">
                <input type="hidden" name="ministerio" value={m.id} />
                <input type="hidden" name="ligada" value={auto.get(m.id) ? "0" : "1"} />
                <span>
                  {m.nome}: {auto.get(m.id) ? "ligada" : "desligada"}
                </span>
                <button className="btn">{auto.get(m.id) ? "Desligar" : "Ligar"}</button>
              </form>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
