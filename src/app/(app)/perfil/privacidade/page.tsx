import Link from "next/link";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuario } from "@/lib/auth";
import { dadosIgreja } from "@/lib/lgpd/termos";
import { membrosParaAnonimizar } from "@/lib/lgpd/titular";
import { anonimizarAPedido, excluirConta } from "./acoes";

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
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/perfil" className="text-sm text-blue-700 underline">
          Voltar ao perfil
        </Link>
        <h1 className="text-2xl font-bold">Privacidade e meus dados</h1>
        <p className="text-sm text-slate-600">
          Autorização dada em {formatar(usuario.consentimentoEm)} (versão {usuario.termosVersao ?? "—"}).{" "}
          <Link href="/privacidade" className="underline">
            Política de privacidade
          </Link>
        </p>
      </div>

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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Baixar meus dados</h2>
        <p className="text-sm text-slate-600">
          Arquivo JSON com perfil, ministérios, escalas, indisponibilidades, trocas, mensagens e reconhecimentos.
        </p>
        <a href="/perfil/privacidade/exportar" className="botao block text-center" download>
          Baixar meus dados
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Excluir minha conta ou revogar a autorização</h2>
        <p className="text-sm text-slate-600">
          As duas opções têm o mesmo efeito: sem a autorização não há base para tratar os seus dados. Apagamos nome,
          e-mail, telefone, foto, datas de indisponibilidade, avisos, mensagens e agradecimentos que você escreveu. As
          escalas passadas ficam sem o seu nome, só para os números do ministério. Não dá para desfazer.
        </p>
        <form action={excluirConta} className="space-y-3 rounded-lg border-2 border-red-300 p-4">
          <label className="block space-y-1 text-sm">
            Confirme com a sua senha
            <input name="senha" type="password" required autoComplete="current-password" className="campo" />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="submit" name="acao" value="exclusao" className="botao" style={{ background: "#b91c1c" }}>
              Excluir minha conta
            </button>
            <button type="submit" name="acao" value="revogacao" className="botao" style={{ background: "#b91c1c" }}>
              Revogar consentimento
            </button>
          </div>
        </form>
        <p className="text-xs text-slate-500">Outros pedidos (correção, informação): {contato}.</p>
      </section>

      {admin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Anonimizar membro a pedido</h2>
          <p className="text-sm text-slate-600">
            Use só quando o titular pedir pelo contato da igreja. Fica registrado quem fez e quando.
          </p>
          {membros.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum membro.</p>
          ) : (
            <form action={anonimizarAPedido} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <label className="block space-y-1 text-sm">
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
              <label className="block space-y-1 text-sm">
                A sua senha
                <input name="senha" type="password" required autoComplete="current-password" className="campo" />
              </label>
              <button type="submit" className="botao" style={{ background: "#b91c1c" }}>
                Anonimizar
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
