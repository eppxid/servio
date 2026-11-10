import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { SENHA_MINIMA } from "@/lib/auth-core";
import { exigirUsuario, sessao } from "@/lib/auth";
import {
  definirAcessoAdmin,
  faltaAcessoDeAdmin,
  precisaDefinirAcesso,
  trocarSenhaObrigatoria,
} from "@/lib/ministerios/nucleo";
import { Publica } from "@/components/Publica";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const esquema = z.object({ senha: z.string().min(SENHA_MINIMA).max(200) });

async function trocar(formData: FormData) {
  "use server";
  const usuario = await exigirUsuario();
  let versao: number;
  if (faltaAcessoDeAdmin(usuario)) {
    const r = await definirAcessoAdmin(db(), usuario.id, {
      email: String(formData.get("email") ?? ""),
      senha: String(formData.get("senha") ?? ""),
    });
    if (!r.ok) redirect(`/convite/trocar-senha?erro=${r.motivo}`);
    versao = r.sessaoVersao;
  } else {
    const v = validar(esquema, formData);
    if (!v.ok) redirect("/convite/trocar-senha?erro=1");
    versao = await trocarSenhaObrigatoria(db(), usuario.id, v.dados.senha);
  }
  const s = await sessao();
  s.sessaoVersao = versao;
  await s.save();
  redirect("/");
}

export default async function TrocarSenha({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  if (!precisaDefinirAcesso(usuario)) redirect("/");
  const { erro } = await searchParams;
  const mensagem =
    erro === "email_em_uso"
      ? "Este e-mail já está em uso."
      : erro === "email_invalido"
        ? "Digite um e-mail válido."
        : `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`;
  const alerta = erro && (
    <p role="alert" className="alerta alerta--bad">
      {mensagem}
    </p>
  );
  if (faltaAcessoDeAdmin(usuario)) {
    return (
      <Publica>
        <h1 className="title">Defina e-mail e senha de administrador</h1>
        <p className="text-sm text-muted">Com eles você recupera o acesso se perder o aparelho.</p>
        {alerta}
        <form action={trocar} className="space-y-4">
          <label className="rotulo">
            E-mail
            <input name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" defaultValue={usuario.email ?? ""} className="campo" />
          </label>
          <label className="rotulo">
            Senha
            <input name="senha" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" className="campo" />
          </label>
          <button type="submit" className="btn btn--primary btn--block">Salvar</button>
        </form>
      </Publica>
    );
  }
  return (
    <Publica>
      <h1 className="title">Defina uma nova senha</h1>
      <p className="text-sm text-muted">Sua senha era temporária. Escolha uma só sua.</p>
      {alerta}
      <form action={trocar} className="space-y-4">
        <label className="rotulo">
          Nova senha
          <input name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="campo" />
        </label>
        <button type="submit" className="btn btn--primary btn--block">Salvar</button>
      </form>
    </Publica>
  );
}
