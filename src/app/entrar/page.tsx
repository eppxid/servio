import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { igrejas } from "@/db/schema";
import { autenticar } from "@/lib/auth-core";
import { usuarioAtual } from "@/lib/auth";
import { abrirSessao, guardarAceitePendente } from "@/lib/lgpd/sessao";
import { aceiteEmDia } from "@/lib/lgpd/termos";
import { RodapeLegal } from "@/lib/lgpd/ui";
import { Publica } from "@/components/Publica";
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
  // Termos novos (ou nunca aceitos): a sessão só abre depois do aceite.
  if (!aceiteEmDia(r.usuario)) {
    await guardarAceitePendente(r.usuario);
    redirect("/entrar/termos");
  }
  await abrirSessao(r.usuario);
  redirect("/");
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; conta?: string }>;
}) {
  if (await usuarioAtual()) redirect("/");
  const [igreja] = await db().select({ id: igrejas.id }).from(igrejas).limit(1);
  if (!igreja) redirect("/primeiro-acesso");
  const { erro, conta } = await searchParams;

  return (
    <Publica>
      <h1 className="title">Entrar</h1>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro === "bloqueado"
            ? "Muitas tentativas. Aguarde 15 minutos e tente de novo."
            : "E-mail ou senha inválidos."}
        </p>
      )}
      {conta === "removida" && (
        <p role="status" className="alerta alerta--good">
          Conta excluída. Seus dados pessoais foram apagados.
        </p>
      )}
      <form action={entrar} className="space-y-4">
        <label className="rotulo">
          E-mail
          <input name="email" type="email" required autoComplete="email" className="campo" />
        </label>
        <label className="rotulo">
          Senha
          <input
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="campo"
          />
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Entrar
        </button>
      </form>
      <RodapeLegal />
    </Publica>
  );
}
