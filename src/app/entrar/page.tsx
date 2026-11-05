import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { igrejas } from "@/db/schema";
import { autenticar } from "@/lib/auth-core";
import { sessao, usuarioAtual } from "@/lib/auth";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const esquema = z.object({
  email: z.string().trim().min(1).max(254),
  senha: z.string().min(1).max(200),
});

async function entrar(formData: FormData) {
  "use server";
  const v = validar(esquema, formData);
  if (!v.ok) redirect("/entrar?erro=1");
  const r = await autenticar(db(), v.dados.email, v.dados.senha);
  if (!r.ok) redirect(r.motivo === "bloqueado" ? "/entrar?erro=bloqueado" : "/entrar?erro=1");
  const s = await sessao();
  s.usuarioId = r.usuario.id;
  s.sessaoVersao = r.usuario.sessaoVersao;
  await s.save();
  redirect("/agenda");
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await usuarioAtual()) redirect("/agenda");
  const [igreja] = await db().select({ id: igrejas.id }).from(igrejas).limit(1);
  if (!igreja) redirect("/primeiro-acesso");
  const { erro } = await searchParams;

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Entrar</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro === "bloqueado"
            ? "Muitas tentativas. Aguarde 15 minutos e tente de novo."
            : "E-mail ou senha inválidos."}
        </p>
      )}
      <form action={entrar} className="space-y-4">
        <label className="block space-y-1 text-sm">
          E-mail
          <input name="email" type="email" required autoComplete="email" className="campo" />
        </label>
        <label className="block space-y-1 text-sm">
          Senha
          <input
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="campo"
          />
        </label>
        <button type="submit" className="botao">
          Entrar
        </button>
      </form>
    </main>
  );
}
