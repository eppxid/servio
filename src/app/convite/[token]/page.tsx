import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { SENHA_MINIMA } from "@/lib/auth-core";
import { sessao, usuarioAtual } from "@/lib/auth";
import { aceitarConvite, cadastrarPorConvite, conviteValido } from "@/lib/ministerios/nucleo";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

const esquema = z.object({
  token: z.string().regex(TOKEN),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  telefone: z.string().trim().max(30).optional(),
  senha: z.string().min(SENHA_MINIMA).max(200),
});

function caminho(token: string, consulta: string) {
  return TOKEN.test(token) ? `/convite/${token}?${consulta}` : "/entrar";
}

async function cadastrar(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const v = validar(esquema, formData);
  if (!v.ok) redirect(caminho(token, "erro=1"));
  const r = await cadastrarPorConvite(db(), v.dados.token, v.dados);
  if (!r.ok) redirect(caminho(token, `erro=${r.motivo}`));
  const s = await sessao();
  s.usuarioId = r.usuario.id;
  s.sessaoVersao = r.usuario.sessaoVersao;
  await s.save();
  redirect(caminho(token, "ok=1"));
}

async function pedirEntrada(formData: FormData) {
  "use server";
  const usuario = await usuarioAtual();
  const token = String(formData.get("token") ?? "");
  if (!usuario) redirect("/entrar");
  const r = await aceitarConvite(db(), usuario, token);
  redirect(caminho(token, r.ok ? "ok=1" : "erro=invalido"));
}

export default async function Convite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { token } = await params;
  const { erro, ok } = await searchParams;
  const convite = TOKEN.test(token) ? await conviteValido(db(), token) : null;

  if (!convite) {
    return (
      <main className="mx-auto max-w-sm space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Convite inválido</h1>
        <p className="text-sm text-slate-600">O link expirou ou não existe. Peça um novo ao líder.</p>
      </main>
    );
  }

  if (ok) {
    return (
      <main className="mx-auto max-w-sm space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Pedido enviado</h1>
        <p className="text-sm text-slate-600">O líder de {convite.ministerio} vai aprovar sua entrada.</p>
        <Link href="/agenda" className="botao">
          Abrir o app
        </Link>
      </main>
    );
  }

  const usuario = await usuarioAtual();
  const msg =
    erro === "email_em_uso"
      ? "Este e-mail já tem conta. Entre com ela."
      : erro
        ? `Confira os campos. A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`
        : null;

  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">Convite: {convite.ministerio}</h1>
      {msg && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {msg}
        </p>
      )}
      {usuario && usuario.igrejaId === convite.igrejaId ? (
        <form action={pedirEntrada} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-slate-600">Entrar como {usuario.nome}.</p>
          <button type="submit" className="botao">Pedir para entrar</button>
        </form>
      ) : (
        <>
          <form action={cadastrar} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <label className="block space-y-1 text-sm">
              Nome
              <input name="nome" required minLength={2} maxLength={120} autoComplete="name" className="campo" />
            </label>
            <label className="block space-y-1 text-sm">
              E-mail
              <input name="email" type="email" required autoComplete="email" className="campo" />
            </label>
            <label className="block space-y-1 text-sm">
              Telefone (opcional)
              <input name="telefone" type="tel" maxLength={30} autoComplete="tel" className="campo" />
            </label>
            <label className="block space-y-1 text-sm">
              Senha
              <input name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="campo" />
            </label>
            <button type="submit" className="botao">Criar conta e pedir para entrar</button>
          </form>
          <p className="text-sm">
            Já tem conta?{" "}
            <Link href="/entrar" className="text-blue-700 underline">
              Entre
            </Link>{" "}
            e abra este link de novo.
          </p>
        </>
      )}
    </main>
  );
}
