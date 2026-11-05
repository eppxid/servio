import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { usuarioDaSessao, type AnyDb } from "@/lib/auth-core";
import { abrirSessao, sessaoLgpd } from "@/lib/lgpd/sessao";
import { consentiu } from "@/lib/lgpd/termos";
import { registrarAceite } from "@/lib/lgpd/titular";
import { CampoConsentimento } from "@/lib/lgpd/ui";

export const dynamic = "force-dynamic";

/** Usuário do login à espera do aceite (versão da sessão ainda válida); senão null. */
async function pendente() {
  const s = await sessaoLgpd();
  const p = s.aceitePendente;
  if (!p) return null;
  return usuarioDaSessao(db() as unknown as AnyDb, p.usuarioId, p.sessaoVersao);
}

async function aceitar(formData: FormData) {
  "use server";
  const usuario = await pendente();
  if (!usuario) redirect("/entrar");
  if (!consentiu(formData.get("consentimento"))) redirect("/entrar/termos?erro=1");
  await registrarAceite(db() as unknown as AnyDb, usuario.id);
  await abrirSessao(usuario);
  redirect("/agenda");
}

async function recusar() {
  "use server";
  const s = await sessaoLgpd();
  s.destroy();
  redirect("/entrar");
}

export default async function AceiteTermos({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await pendente();
  if (!usuario) redirect("/entrar");
  const { erro } = await searchParams;

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Termos atualizados</h1>
      <p className="text-sm text-slate-600">
        Para continuar, leia a{" "}
        <Link href="/privacidade" className="underline">
          política de privacidade
        </Link>{" "}
        e os{" "}
        <Link href="/termos" className="underline">
          termos de uso
        </Link>{" "}
        e marque a autorização.
      </p>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Marque a autorização para continuar.
        </p>
      )}
      <form action={aceitar} className="space-y-4">
        <CampoConsentimento />
        <button type="submit" className="botao">
          Aceitar e continuar
        </button>
      </form>
      <form action={recusar}>
        <button type="submit" className="text-sm text-slate-600 underline">
          Não aceito (sair)
        </button>
      </form>
      <p className="text-xs text-slate-500">
        Sem o aceite você não usa o portal. Para excluir os seus dados, escreva para o contato da política.
      </p>
    </main>
  );
}
