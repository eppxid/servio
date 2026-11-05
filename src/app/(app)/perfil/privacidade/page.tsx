import Link from "next/link";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuario } from "@/lib/auth";
import { dadosIgreja } from "@/lib/lgpd/termos";
import { membrosParaAnonimizar } from "@/lib/lgpd/titular";
import { anonimizarAPedido, excluirConta } from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

function formatar(d: Date | null) {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "não registrado";
}

export default async function Privacidade({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const { ok, erro } = await searchParams;
  const admin = usuario.papelGlobal === "admin";
  const membros = admin ? await membrosParaAnonimizar(db() as unknown as AnyDb, usuario) : [];
  const contato = dadosIgreja().contato;

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Perfil" titulo="Privacidade e meus dados">
        <Link href="/perfil" className="btn">
          Voltar ao perfil
        </Link>
      </Cabecalho>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <p className="text-sm text-muted lg:col-span-2">
          Autorização dada em {formatar(usuario.consentimentoEm)} (versão {usuario.termosVersao ?? "—"}).{" "}
          <Link href="/privacidade" className="link">
            Política de privacidade
          </Link>
        </p>
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

      <section className="card space-y-2">
        <h2 className="card__title">Baixar meus dados</h2>
        <p className="text-sm text-muted">
          Arquivo JSON com perfil, ministérios, escalas, indisponibilidades, trocas, mensagens e reconhecimentos.
        </p>
        <a href="/perfil/privacidade/exportar" className="btn btn--primary btn--block" download>
          Baixar meus dados
        </a>
      </section>

      <section className="card space-y-3">
        <h2 className="card__title">Excluir minha conta ou revogar a autorização</h2>
        <p className="text-sm text-muted">
          As duas opções têm o mesmo efeito: sem a autorização não há base para tratar os seus dados. Apagamos nome,
          e-mail, telefone, foto, datas de indisponibilidade, avisos, mensagens e agradecimentos que você escreveu. As
          escalas passadas ficam sem o seu nome, só para os números do ministério. Não dá para desfazer.
        </p>
        <form action={excluirConta} className="alerta alerta--bad space-y-3">
          <label className="rotulo">
            Confirme com a sua senha
            <input name="senha" type="password" required autoComplete="current-password" className="campo" />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="submit" name="acao" value="exclusao" className="btn btn--danger btn--block">
              Excluir minha conta
            </button>
            <button type="submit" name="acao" value="revogacao" className="btn btn--danger btn--block">
              Revogar consentimento
            </button>
          </div>
        </form>
        <p className="text-xs text-muted">Outros pedidos (correção, informação): {contato}.</p>
      </section>

      {admin && (
        <section className="card space-y-3">
          <h2 className="card__title">Anonimizar membro a pedido</h2>
          <p className="text-sm text-muted">
            Use só quando o titular pedir pelo contato da igreja. Fica registrado quem fez e quando.
          </p>
          {membros.length === 0 ? (
            <p className="text-sm text-muted">Nenhum membro.</p>
          ) : (
            <form action={anonimizarAPedido} className="space-y-3">
              <label className="rotulo">
                Membro
                <select name="usuario" required className="campo" defaultValue="">
                  <option value="" disabled>
                    Escolha
                  </option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rotulo">
                A sua senha
                <input name="senha" type="password" required autoComplete="current-password" className="campo" />
              </label>
              <button type="submit" className="btn btn--danger btn--block">
                Anonimizar
              </button>
            </form>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
