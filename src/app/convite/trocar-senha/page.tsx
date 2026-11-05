import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { SENHA_MINIMA } from "@/lib/auth-core";
import { exigirUsuario, sessao } from "@/lib/auth";
import { trocarSenhaObrigatoria } from "@/lib/ministerios/nucleo";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const esquema = z.object({ senha: z.string().min(SENHA_MINIMA).max(200) });

async function trocar(formData: FormData) {
  "use server";
  const usuario = await exigirUsuario();
  const v = validar(esquema, formData);
  if (!v.ok) redirect("/convite/trocar-senha?erro=1");
  const versao = await trocarSenhaObrigatoria(db(), usuario.id, v.dados.senha);
  const s = await sessao();
  s.sessaoVersao = versao;
  await s.save();
  redirect("/agenda");
}

export default async function TrocarSenha({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  if (!usuario.trocarSenha) redirect("/agenda");
  const { erro } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Defina uma nova senha</h1>
      <p className="text-sm text-slate-600">Sua senha era temporária. Escolha uma só sua.</p>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          A senha precisa de {SENHA_MINIMA} caracteres ou mais.
        </p>
      )}
      <form action={trocar} className="space-y-4">
        <label className="block space-y-1 text-sm">
          Nova senha
          <input name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="campo" />
        </label>
        <button type="submit" className="botao">Salvar</button>
      </form>
    </main>
  );
}
