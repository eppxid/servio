import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { carregarPainel } from "@/lib/indicadores/consulta";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";

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
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
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

  const cartoes: [string, string][] = [
    ["Escalas publicadas", String(i.escalasPublicadas)],
    ["Taxa de confirmação", pct(i.taxaConfirmacao)],
    ["Taxa de presença", pct(i.taxaPresenca)],
    ["Trocas pedidas", String(i.trocasPedidas)],
    ["Trocas aprovadas", String(i.trocasAprovadas)],
    ["Voluntários aprovados", String(i.voluntariosAprovados)],
    ["Sem escala há mais de 60 dias", String(i.voluntariosSemEscala)],
  ];
  const maiorMes = Math.max(1, ...painel.presencaMensal.map((p) => p.confirmados));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Painel</h1>

      <form method="get" className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
        <label className="text-xs text-slate-600">
          De
          <input type="date" name="de" defaultValue={filtro.de} className="campo" />
        </label>
        <label className="text-xs text-slate-600">
          Até
          <input type="date" name="ate" defaultValue={filtro.ate} className="campo" />
        </label>
        <label className="col-span-2 text-xs text-slate-600">
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
        <button type="submit" className="botao col-span-2">
          Filtrar
        </button>
      </form>

      <ul className="grid grid-cols-2 gap-2">
        {cartoes.map(([rotulo, valor]) => (
          <li key={rotulo} className="rounded-lg border border-slate-200 p-3">
            <span className="block text-2xl font-bold">{valor}</span>
            <span className="text-xs text-slate-600">{rotulo}</span>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="font-semibold">Presença por mês</h2>
        {painel.presencaMensal.length === 0 ? (
          <p className="text-sm text-slate-600">Sem eventos passados com confirmação no período.</p>
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
                  className="h-3 rounded bg-slate-100"
                  style={{ width: `${(p.confirmados / maiorMes) * 100}%` }}
                  role="img"
                  aria-label={`${p.presentes} presentes de ${p.confirmados} confirmados`}
                >
                  <div className="h-3 rounded bg-green-600" style={{ width: `${(p.presentes / p.confirmados) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Escalas por voluntário</h2>
          <a href={csv("voluntarios")} className="text-sm underline">
            Baixar CSV
          </a>
        </div>
        {painel.porVoluntario.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhuma escala publicada no período.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-600">
                <th className="py-1">Voluntário</th>
                <th>Total</th>
                <th>Conf.</th>
                <th>Pres.</th>
                <th>Rec.</th>
              </tr>
            </thead>
            <tbody>
              {painel.porVoluntario.map((l) => (
                <tr key={l.usuarioId} className="border-t border-slate-100">
                  <td className="py-1">{l.nome}</td>
                  <td>{l.total}</td>
                  <td>{l.confirmadas}</td>
                  <td>{l.presencas}</td>
                  <td>{l.recusas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Vagas abertas (próximos 30 dias)</h2>
          <a href={csv("vagas")} className="text-sm underline">
            Baixar CSV
          </a>
        </div>
        {painel.vagas.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhuma vaga aberta.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {painel.vagas.map((v, n) => (
              <li key={n} className="flex justify-between border-t border-slate-100 py-1">
                <span>
                  {v.ministerio} · {v.funcao}
                </span>
                <span className="text-slate-600">{formatInTimeZone(v.quando, FUSO, "dd/MM HH:mm")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
