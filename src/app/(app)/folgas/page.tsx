import { and, asc, eq, gte } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import { indisponibilidades } from "@/db/schema";
import { exigirUsuario } from "@/lib/auth";
import { FUSO } from "@/lib/recorrencia";
import { excluirIndisponibilidade, incluirDiasDaSemana } from "../perfil/acoes";
import { CalendarioFolgas } from "./CalendarioFolgas";

export const dynamic = "force-dynamic";

function diasDoPeriodo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${fim}T12:00:00Z`);
  for (let n = 0; d <= f && n < 366; n++, d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
  return dias;
}

const br = (iso: string) => iso.split("-").reverse().join("/");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export default async function Folgas({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { ok, erro } = await searchParams;
  const hoje = formatInTimeZone(new Date(), FUSO, "yyyy-MM-dd");
  const periodos = await db()
    .select({ id: indisponibilidades.id, inicio: indisponibilidades.dataInicio, fim: indisponibilidades.dataFim })
    .from(indisponibilidades)
    .where(
      and(
        eq(indisponibilidades.usuarioId, usuario.id),
        eq(indisponibilidades.igrejaId, usuario.igrejaId),
        gte(indisponibilidades.dataFim, hoje),
      ),
    )
    .orderBy(asc(indisponibilidades.dataInicio));
  const folgas = periodos.flatMap((p) => diasDoPeriodo(p.inicio, p.fim));

  return (
    <div className="tela">
      <Cabecalho eyebrow="Indisponibilidade" titulo="Folgas" />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="alerta alerta--good">
          {ok}
        </p>
      )}
      <CalendarioFolgas folgas={folgas} />
      <section data-enter>
        <h2 className="card__title" style={{ margin: "4px 4px 8px" }}>
          Próximas folgas
        </h2>
        {periodos.length === 0 ? (
          <p className="muted" style={{ padding: "0 4px" }}>
            Nenhuma folga marcada.
          </p>
        ) : (
          <div className="list">
            {periodos.map((p) => (
              <div key={p.id} className="row">
                <span className="row__tx">
                  <b>{p.inicio === p.fim ? br(p.inicio) : `${br(p.inicio)} a ${br(p.fim)}`}</b>
                </span>
                <form action={excluirIndisponibilidade} className="row__end">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="tbtn" aria-label={`Excluir folga ${br(p.inicio)}`}>
                    Excluir
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
      <details className="card">
        <summary className="card__title" style={{ cursor: "pointer" }}>
          Folga em todo dia da semana de um mês
        </summary>
        <form action={incluirDiasDaSemana} style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="rotulo">
              Dia da semana
              <select name="diaSemana" className="campo" defaultValue="0">
                {DIAS.map((nome, i) => (
                  <option key={nome} value={i}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="rotulo">
              Mês
              <input name="mes" type="month" required className="campo" />
            </label>
          </div>
          <input type="hidden" name="motivo" value="" />
          <button type="submit" className="tbtn tbtn--p">
            Marcar os dias
          </button>
        </form>
      </details>
    </div>
  );
}
