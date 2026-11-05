import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { carregarReconhecimento } from "@/lib/gamificacao/consulta";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { mudarRanking } from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function Reconhecimento() {
  const usuario = await exigirUsuarioSemTroca();
  const r = await carregarReconhecimento(db(), usuario);

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Seu serviço" titulo="Reconhecimento" />

      <ul className="stats" data-enter>
        <li className="stat">
          <span className="stat__label">Meus pontos</span>
          <span className="stat__val block" data-count={r.pontos}>
            {r.pontos}
          </span>
        </li>
        <li className="stat">
          <span className="stat__label">Medalhas</span>
          <span className="stat__val block" data-count={r.medalhas.length}>
            {r.medalhas.length}
          </span>
        </li>
        <li className="stat">
          <span className="stat__label">Agradecimentos recebidos</span>
          <span className="stat__val block" data-count={r.recebidos.length}>
            {r.recebidos.length}
          </span>
        </li>
      </ul>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="card__title">Minhas medalhas</h2>
        {r.medalhas.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma medalha ainda.</p>
        ) : (
          <ul className="space-y-2">
            {r.medalhas.map((m) => (
              <li key={m.chave} className="rounded-[var(--r-tile)] bg-well p-3 text-sm">
                <span className="font-semibold">{m.nome}</span>
                <span className="block text-muted">{m.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="card__title">Agradecimentos recebidos</h2>
        {r.recebidos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum agradecimento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {r.recebidos.map((a) => (
              <li key={a.id} className="rounded-[var(--r-tile)] bg-well p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{a.texto}</p>
                <p className="mt-1 text-xs text-muted">
                  {a.de} · {a.ministerio} · {formatInTimeZone(a.criadoEm, FUSO, "dd/MM/yyyy")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4 lg:col-span-2">
        <h2 className="card__title">Ranking de {r.mes.split("-").reverse().join("/")}</h2>
        {r.rankings.length === 0 && <p className="text-sm text-muted">Você não está em nenhum ministério.</p>}
        {r.rankings.map((k) => (
          <div key={k.ministerio.id} className="space-y-2">
            <h3 className="font-semibold">{k.ministerio.nome}</h3>
            <ol className="space-y-1 text-sm">
              {k.top.map((p) => (
                <li
                  key={p.usuarioId}
                  className={`flex justify-between rounded-[var(--r-tile)] p-2 ${p.usuarioId === usuario.id ? "bg-primary/10 font-semibold" : ""}`}
                >
                  <span>
                    {p.posicao}º {p.nome}
                  </span>
                  <span>{p.pontos} pts</span>
                </li>
              ))}
            </ol>
            {k.minha && !k.top.some((p) => p.usuarioId === usuario.id) && (
              <p className="rounded-[var(--r-tile)] bg-primary/10 p-2 text-sm font-semibold">
                Sua posição: {k.minha.posicao}º · {k.minha.pontos} pts
              </p>
            )}
          </div>
        ))}
      </section>

      <form action={mudarRanking} className="card space-y-3 lg:col-span-2">
        <input type="hidden" name="voltar" value="/reconhecimento" />
        <p className="text-sm">
          {r.aparecerNoRanking ? "Você aparece no ranking dos colegas." : "Você não aparece no ranking dos colegas."}
        </p>
        <button type="submit" name="aparecer" value={r.aparecerNoRanking ? "0" : "1"} className="btn btn--block">
          {r.aparecerNoRanking ? "Sair do ranking" : "Aparecer no ranking"}
        </button>
      </form>
      </div>
    </div>
  );
}
