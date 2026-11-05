import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { igrejas, usuarios } from "@/db/schema";
import { SENHA_MINIMA, hashSenha, normalizarEmail } from "@/lib/auth-core";
import { sessao } from "@/lib/auth";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const esquema = z.object({
  igreja: z.string().trim().min(2).max(120),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  senha: z.string().min(SENHA_MINIMA).max(200),
});

async function criar(formData: FormData) {
  "use server";
  const v = validar(esquema, formData);
  if (!v.ok) redirect("/primeiro-acesso?erro=1");
  const banco = db();
  const senhaHash = await hashSenha(v.dados.senha);

  // Só cria quando ainda não existe igreja; a transação evita duas criações concorrentes.
  const usuario = await banco.transaction(async (tx) => {
    const [existe] = await tx.select({ id: igrejas.id }).from(igrejas).limit(1);
    if (existe) return null;
    const [igreja] = await tx.insert(igrejas).values({ nome: v.dados.igreja }).returning();
    const [novo] = await tx
      .insert(usuarios)
      .values({
        igrejaId: igreja.id,
        nome: v.dados.nome,
        email: normalizarEmail(v.dados.email),
        senhaHash,
        papelGlobal: "admin",
      })
      .returning();
    return novo;
  });
  if (!usuario) redirect("/entrar");

  const s = await sessao();
  s.usuarioId = usuario.id;
  s.sessaoVersao = usuario.sessaoVersao;
  await s.save();
  redirect("/agenda");
}

export default async function PrimeiroAcesso({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const [existe] = await db().select({ id: igrejas.id }).from(igrejas).limit(1);
  if (existe) redirect("/entrar");
  const { erro } = await searchParams;

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Primeiro acesso</h1>
      <p className="text-sm text-slate-600">Cria a igreja e o administrador.</p>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Confira os campos. A senha precisa de {SENHA_MINIMA} caracteres ou mais.
        </p>
      )}
      <form action={criar} className="space-y-4">
        <label className="block space-y-1 text-sm">
          Nome da igreja
          <input name="igreja" required minLength={2} maxLength={120} className="campo" />
        </label>
        <label className="block space-y-1 text-sm">
          Seu nome
          <input name="nome" required minLength={2} maxLength={120} autoComplete="name" className="campo" />
        </label>
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
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            className="campo"
          />
        </label>
        <button type="submit" className="botao">
          Criar
        </button>
      </form>
    </main>
  );
}
