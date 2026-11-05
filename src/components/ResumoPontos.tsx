import Link from "next/link";
import { db } from "@/db";
import { mudarRanking } from "@/app/(app)/reconhecimento/acoes";
import { lerAparecerNoRanking, resumoDoUsuario } from "@/lib/gamificacao/consulta";
import type { Ator } from "@/lib/ministerios/nucleo";

/** Pontos, as 3 medalhas mais recentes e a opção "Aparecer no ranking". */
export default async function ResumoPontos({ usuario }: { usuario: Ator }) {
  const { pontos, medalhas } = await resumoDoUsuario(db(), usuario);
  const aparecer = await lerAparecerNoRanking(db(), usuario);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Meus pontos</h2>
      <p className="text-2xl font-bold text-blue-700">{pontos}</p>
      {medalhas.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {medalhas.slice(0, 3).map((m) => (
            <li key={m.chave} className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
              {m.nome}
            </li>
          ))}
        </ul>
      )}
      <Link href="/reconhecimento" className="inline-block text-sm text-blue-700 underline">
        Ver reconhecimento e ranking
      </Link>
      <form action={mudarRanking} className="space-y-1">
        <input type="hidden" name="voltar" value="/perfil" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="hidden" name="aparecer" value="0" />
          <input type="checkbox" name="aparecer" value="1" defaultChecked={aparecer} className="size-5" />
          Aparecer no ranking
        </label>
        <button type="submit" className="min-h-11 px-3 text-blue-700">
          Salvar
        </button>
      </form>
    </section>
  );
}
