import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { indisponibilidades } from "@/db/schema";
import { exigirUsuario } from "@/lib/auth";
import {
  excluirIndisponibilidade,
  incluirDiasDaSemana,
  incluirIndisponibilidade,
  mudarSenha,
  salvarPerfil,
} from "./acoes";

export const dynamic = "force-dynamic";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function formatar(d: string) {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

export default async function Perfil({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { ok, erro } = await searchParams;
  const periodos = await db()
    .select()
    .from(indisponibilidades)
    .where(
      and(
        eq(indisponibilidades.usuarioId, usuario.id),
        eq(indisponibilidades.igrejaId, usuario.igrejaId),
      ),
    )
    .orderBy(asc(indisponibilidades.dataInicio));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Perfil</h1>

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {ok}
        </p>
      )}

      <form action={salvarPerfil} className="space-y-4">
        <h2 className="text-lg font-semibold">Meus dados</h2>
        <label className="block space-y-1 text-sm">
          Nome
          <input name="nome" required maxLength={120} defaultValue={usuario.nome} className="campo" />
        </label>
        <label className="block space-y-1 text-sm">
          Telefone (opcional)
          <input
            name="telefone"
            type="tel"
            maxLength={30}
            defaultValue={usuario.telefone ?? ""}
            autoComplete="tel"
            className="campo"
          />
        </label>
        <label className="block space-y-1 text-sm">
          Link da foto (opcional, https)
          <input
            name="fotoUrl"
            type="url"
            maxLength={500}
            defaultValue={usuario.fotoUrl ?? ""}
            className="campo"
          />
        </label>
        <button type="submit" className="botao">
          Salvar
        </button>
      </form>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Quando não posso servir</h2>
        {periodos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum período marcado.</p>
        ) : (
          <ul className="space-y-2">
            {periodos.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <span>
                  {p.dataInicio === p.dataFim
                    ? formatar(p.dataInicio)
                    : `${formatar(p.dataInicio)} a ${formatar(p.dataFim)}`}
                  {p.motivo && <span className="block text-slate-500">{p.motivo}</span>}
                </span>
                <form action={excluirIndisponibilidade}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-red-700 underline">
                    Excluir
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={incluirIndisponibilidade} className="space-y-3">
          <h3 className="font-medium">Incluir período</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              De
              <input name="dataInicio" type="date" required className="campo" />
            </label>
            <label className="block space-y-1 text-sm">
              Até
              <input name="dataFim" type="date" required className="campo" />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            Motivo (opcional; só você vê)
            <input name="motivo" maxLength={200} className="campo" />
          </label>
          <button type="submit" className="botao">
            Incluir
          </button>
        </form>

        <form action={incluirDiasDaSemana} className="space-y-3">
          <h3 className="font-medium">Todo dia da semana num mês</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              Dia da semana
              <select name="diaSemana" className="campo" defaultValue="0">
                {DIAS.map((nome, i) => (
                  <option key={nome} value={i}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              Mês
              <input name="mes" type="month" required className="campo" />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            Motivo (opcional; só você vê)
            <input name="motivo" maxLength={200} className="campo" />
          </label>
          <button type="submit" className="botao">
            Incluir dias
          </button>
        </form>
      </section>

      <form action={mudarSenha} className="space-y-4">
        <h2 className="text-lg font-semibold">Trocar senha</h2>
        <label className="block space-y-1 text-sm">
          Senha atual
          <input
            name="atual"
            type="password"
            required
            autoComplete="current-password"
            className="campo"
          />
        </label>
        <label className="block space-y-1 text-sm">
          Nova senha (mínimo 8 caracteres)
          <input
            name="nova"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="campo"
          />
        </label>
        <button type="submit" className="botao">
          Trocar senha
        </button>
        <p className="text-xs text-slate-500">
          Trocar a senha encerra o login nos outros aparelhos.
        </p>
      </form>

      <form action="/sair" method="post">
        <button type="submit" className="botao">
          Sair
        </button>
      </form>
    </div>
  );
}
