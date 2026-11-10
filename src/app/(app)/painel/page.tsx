import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { carregarPainel } from "@/lib/indicadores/consulta";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function Painel({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; ministerio?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const q = await searchParams;
  let painel;
  try {
    painel = await carregarPainel(db() as unknown as AnyDb, ator, {
      de: q.de,
      ate: q.ate,
      ministerioId: q.ministerio ? idSeguro(q.ministerio) : undefined,
    });
  } catch (e) {
    if (e instanceof ErroAcesso) {
      return (
        <p role="alert" className="alerta alerta--bad">
          Acesso negado (403). O painel é só para administradores e líderes.
        </p>
      );
    }
    throw e;
  }

  const { indicadores: i, filtro } = painel;
  const consulta = new URLSearchParams({ de: filtro.de, ate: filtro.ate });
  if (filtro.ministerioId) consulta.set("ministerio", String(filtro.ministerioId));
  const csv = (tipo: string) => `/api/painel/csv?tipo=${tipo}&${consulta.toString()}`;

  const cartoes: { rotulo: string; valor: number; sufixo?: string }[] = [
    { rotulo: "Escalas publicadas", valor: i.escalasPublicadas },
    { rotulo: "Taxa de confirmação", valor: Math.round(i.taxaConfirmacao * 100), sufixo: "%" },
    { rotulo: "Taxa de presença", valor: Math.round(i.taxaPresenca * 100), sufixo: "%" },
    { rotulo: "Trocas pedidas", valor: i.trocasPedidas },
    { rotulo: "Trocas aprovadas", valor: i.trocasAprovadas },
    { rotulo: "Voluntários aprovados", valor: i.voluntariosAprovados },
    { rotulo: "Sem escala há mais de 60 dias", valor: i.voluntariosSemEscala },
  ];
  const maiorMes = Math.max(1, ...painel.presencaMensal.map((p) => p.confirmados));

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Indicadores" titulo="Painel" />

      <form method="get" className="card grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="rotulo">
          De
          <input type="date" name="de" defaultValue={filtro.de} className="campo" />
        </label>
        <label className="rotulo">
          Até
          <input type="date" name="ate" defaultValue={filtro.ate} className="campo" />
        </label>
        <label className="rotulo">
          Ministério
          <select name="ministerio" defaultValue={filtro.ministerioId ?? ""} className="campo">
            <option value="">Todos</option>
            {painel.ministerios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Filtrar
        </button>
      </form>

      <ul className="stats" data-enter>
        {cartoes.map((c) => (
          <li key={c.rotulo} className="stat">
            <span className="stat__label">{c.rotulo}</span>
            <span className="stat__val block" data-count={c.valor} data-suffix={c.sufixo}>
              {c.valor}
              {c.sufixo}
            </span>
          </li>
        ))}
      </ul>

      <section className="card space-y-3">
        <h2 className="card__title">Presença por mês</h2>
        {painel.presencaMensal.length === 0 ? (
          <p className="text-sm text-muted">Sem eventos passados com confirmação no período.</p>
        ) : (
          <ul className="space-y-2">
            {painel.presencaMensal.map((p) => (
              <li key={p.mes} className="text-sm">
                <div className="flex justify-between">
                  <span>{p.mes.split("-").reverse().join("/")}</span>
                  <span>
                    {p.presentes}/{p.confirmados} ({pct(p.presentes / p.confirmados)})
                  </span>
                </div>
                <div
                  className="bar !h-3"
                  style={{ width: `${(p.confirmados / maiorMes) * 100}%` }}
                  role="img"
                  aria-label={`${p.presentes} presentes de ${p.confirmados} confirmados`}
                >
                  <i style={{ "--v": `${(p.presentes / p.confirmados) * 100}%`, "--c": "var(--good)" } as React.CSSProperties} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <div className="card__head !mb-0">
          <h2 className="card__title">Escalas por voluntário</h2>
          <a href={csv("voluntarios")} className="btn btn--sm">
            Baixar CSV
          </a>
        </div>
        {painel.porVoluntario.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma escala publicada no período.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Voluntário</th>
                <th>Total</th>
                <th>Conf.</th>
                <th>Pres.</th>
                <th>Rec.</th>
              </tr>
            </thead>
            <tbody>
              {painel.porVoluntario.map((l) => (
                <tr key={l.usuarioId}>
                  <td data-label="Voluntário">{l.nome}</td>
                  <td data-label="Total">{l.total}</td>
                  <td data-label="Confirmadas">{l.confirmadas}</td>
                  <td data-label="Presentes">{l.presencas}</td>
                  <td data-label="Recusas">{l.recusas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card space-y-3">
        <div className="card__head !mb-0">
          <h2 className="card__title">Vagas abertas (próximos 30 dias)</h2>
          <a href={csv("vagas")} className="btn btn--sm">
            Baixar CSV
          </a>
        </div>
        {painel.vagas.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma vaga aberta.</p>
        ) : (
          <ul className="text-sm">
            {painel.vagas.map((v, n) => (
              <li key={n} className="flex justify-between gap-3 border-t border-line py-2">
                <span>
                  {v.ministerio} · {v.funcao}
                </span>
                <span className="text-muted whitespace-nowrap">{formatInTimeZone(v.quando, FUSO, "dd/MM HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
