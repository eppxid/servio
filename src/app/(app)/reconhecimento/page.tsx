import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { carregarReconhecimento } from "@/lib/gamificacao/consulta";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { mudarRanking } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Reconhecimento() {
  const usuario = await exigirUsuarioSemTroca();
  const r = await carregarReconhecimento(db(), usuario);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Reconhecimento</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Meus pontos</h2>
        <p className="text-3xl font-bold text-blue-700">{r.pontos}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Minhas medalhas</h2>
        {r.medalhas.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma medalha ainda.</p>
        ) : (
          <ul className="space-y-2">
            {r.medalhas.map((m) => (
              <li key={m.chave} className="rounded-lg border border-slate-200 p-3 text-sm">
                <span className="font-medium">{m.nome}</span>
                <span className="block text-slate-500">{m.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Agradecimentos recebidos</h2>
        {r.recebidos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agradecimento ainda.</p>
        ) : (
          <ul className="space-y-2">
            {r.recebidos.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{a.texto}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {a.de} · {a.ministerio} · {formatInTimeZone(a.criadoEm, FUSO, "dd/MM/yyyy")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Ranking de {r.mes.split("-").reverse().join("/")}</h2>
        {r.rankings.length === 0 && <p className="text-sm text-slate-500">Você não está em nenhum ministério.</p>}
        {r.rankings.map((k) => (
          <div key={k.ministerio.id} className="space-y-2">
            <h3 className="font-medium">{k.ministerio.nome}</h3>
            <ol className="space-y-1 text-sm">
              {k.top.map((p) => (
                <li
                  key={p.usuarioId}
                  className={`flex justify-between rounded-lg p-2 ${p.usuarioId === usuario.id ? "bg-blue-50 font-medium" : ""}`}
                >
                  <span>
                    {p.posicao}º {p.nome}
                  </span>
                  <span>{p.pontos} pts</span>
                </li>
              ))}
            </ol>
            {k.minha && !k.top.some((p) => p.usuarioId === usuario.id) && (
              <p className="rounded-lg bg-blue-50 p-2 text-sm font-medium">
                Sua posição: {k.minha.posicao}º · {k.minha.pontos} pts
              </p>
            )}
          </div>
        ))}
      </section>

      <form action={mudarRanking} className="space-y-2">
        <input type="hidden" name="voltar" value="/reconhecimento" />
        <p className="text-sm">
          {r.aparecerNoRanking ? "Você aparece no ranking dos colegas." : "Você não aparece no ranking dos colegas."}
        </p>
        <button type="submit" name="aparecer" value={r.aparecerNoRanking ? "0" : "1"} className="botao">
          {r.aparecerNoRanking ? "Sair do ranking" : "Aparecer no ranking"}
        </button>
      </form>
    </div>
  );
}
