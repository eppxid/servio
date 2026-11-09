"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuario } from "@/lib/auth";
import { sessaoLgpd } from "@/lib/lgpd/sessao";
import { ErroLgpd, anonimizarMembro, excluirPropriaConta } from "@/lib/lgpd/titular";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import { validar } from "@/lib/validar";

const banco = () => db() as unknown as AnyDb;
const CAMINHO = "/perfil/privacidade";

function voltar(chave: "ok" | "erro", msg: string): never {
  redirect(`${CAMINHO}?${chave}=${encodeURIComponent(msg)}`);
}

const esquemaExclusao = z.object({
  senha: z.string().min(1, "Preencha a confirmação").max(200),
  acao: z.enum(["exclusao", "revogacao"]),
});

/** Excluir a conta ou revogar o consentimento: mesmo efeito (anonimiza e encerra a sessão). */
export async function excluirConta(formData: FormData) {
  const usuario = await exigirUsuario();
  const v = validar(esquemaExclusao, formData);
  if (!v.ok) voltar("erro", Object.values(v.erros)[0]);
  try {
    await excluirPropriaConta(banco(), usuario, v.dados.senha, v.dados.acao);
  } catch (e) {
    if (e instanceof ErroLgpd) voltar("erro", e.message);
    throw e;
  }
  (await sessaoLgpd()).destroy();
  redirect("/entrar?conta=removida");
}

const esquemaAdmin = z.object({ senha: z.string().min(1, "Informe a sua senha").max(200) });

/** Admin anonimiza um membro a pedido do titular. */
export async function anonimizarAPedido(formData: FormData) {
  const admin = await exigirUsuario();
  const v = validar(esquemaAdmin, formData);
  if (!v.ok) voltar("erro", Object.values(v.erros)[0]);
  try {
    await anonimizarMembro(banco(), admin, idSeguro(formData.get("usuario")), v.dados.senha);
  } catch (e) {
    if (e instanceof ErroAcesso) redirect("/agenda");
    if (e instanceof ErroLgpd) voltar("erro", e.message);
    throw e;
  }
  voltar("ok", "Membro anonimizado");
}
