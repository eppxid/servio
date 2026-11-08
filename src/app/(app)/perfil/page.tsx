import Link from "next/link";
import AtivarAvisos from "@/components/AtivarAvisos";
import { TemaPerfil } from "@/components/app/TemaPerfil";
import ResumoPontos from "@/components/ResumoPontos";
import { exigirUsuario } from "@/lib/auth";
import { mudarSenha, salvarPerfil } from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function Perfil({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { ok, erro } = await searchParams;

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
        <label className="rotulo">
          Link da foto (opcional, https)
          <input
            name="fotoUrl"
            type="url"
            maxLength={500}
            defaultValue={usuario.fotoUrl ?? ""}
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

      <div className="card space-y-3">
        <Link href="/perfil/privacidade" className="btn btn--block">
          Privacidade e meus dados
        </Link>
        <form action="/sair" method="post">
          <button type="submit" className="btn btn--danger btn--block">
            Sair
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
