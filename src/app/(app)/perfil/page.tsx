import Link from "next/link";
import AtivarAvisos from "@/components/AtivarAvisos";
import { TemaPerfil } from "@/components/app/TemaPerfil";
import ResumoPontos from "@/components/ResumoPontos";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuario, sessao } from "@/lib/auth";
import { listarAparelhos } from "@/lib/acesso/nucleo";
import { mudarSenha, removerAparelho, salvarPerfil } from "./acoes";

const quando = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function Perfil({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { ok, erro } = await searchParams;
  const s = await sessao();
  const meusAparelhos = await listarAparelhos(db() as unknown as AnyDb, usuario.id);

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Conta" titulo="Perfil" />

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

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <form action={salvarPerfil} className="card space-y-4">
        <h2 className="card__title">Meus dados</h2>
        <label className="rotulo">
          Nome
          <input name="nome" required maxLength={120} defaultValue={usuario.nome} className="campo" />
        </label>
        <label className="rotulo">
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
        <button type="submit" className="btn btn--primary btn--block">
          Salvar
        </button>
      </form>

      <Link href="/perfil/servir" className="card row" style={{ minHeight: 0 }}>
        <span className="row__tx">
          <b>Onde quero servir</b>
          <span>Escolha ministérios e funções</span>
        </span>
      </Link>

      <Link href="/reconhecimento" className="card row" style={{ minHeight: 0 }}>
        <span className="row__tx">
          <b>Meus pontos e medalhas</b>
          <span>Reconhecimento e conquistas</span>
        </span>
      </Link>

      <TemaPerfil />

      <ResumoPontos usuario={usuario} />

      <AtivarAvisos />


      <section className="card space-y-3" aria-labelledby="meus-aparelhos">
        <h2 id="meus-aparelhos" className="card__title">Meus aparelhos</h2>
        {meusAparelhos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum aparelho guardado. Você entrou com e-mail e senha.</p>
        ) : (
          <ul className="space-y-2">
            {meusAparelhos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <b>{a.rotulo}</b>
                  {a.id === s.aparelhoId && <span className="text-muted"> · este aparelho</span>}
                  <br />
                  <span className="text-xs text-muted">Último uso: {quando(a.ultimoUsoEm ?? a.criadoEm)}</span>
                </span>
                <form action={removerAparelho}>
                  <input type="hidden" name="aparelho" value={a.id} />
                  <button type="submit" className="btn btn--danger" style={{ minHeight: 44 }}>
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Removeu um aparelho por engano? Abra seu link de acesso nele de novo; o líder aprova.
        </p>
      </section>

      {usuario.senhaHash && (
      <form action={mudarSenha} className="card space-y-4">
        <h2 className="card__title">Trocar senha</h2>
        <label className="rotulo">
          Senha atual
          <input
            name="atual"
            type="password"
            required
            autoComplete="current-password"
            className="campo"
          />
        </label>
        <label className="rotulo">
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
        <button type="submit" className="btn btn--primary btn--block">
          Trocar senha
        </button>
        <p className="text-xs text-muted">
          Trocar a senha encerra o login nos outros aparelhos.
        </p>
      </form>
      )}

      <div className="card space-y-3">
        <Link href="/perfil/privacidade" className="btn btn--block">
          Privacidade e meus dados
        </Link>
        <form action="/sair" method="post">
          <button type="submit" className="btn btn--danger btn--block">
            Sair
          </button>
        </form>
        {!usuario.senhaHash && (
          <p className="text-xs text-muted">
            Sair remove este aparelho. Para entrar de novo, abra seu link; o líder aprova.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
