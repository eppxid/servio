"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala, salvarEscala } from "@/lib/escala/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";

const banco = () => db() as unknown as AnyDb;

function voltar(caminho: string, chave: "erro" | "ok", msg: string): never {
  redirect(`${caminho}?${chave}=${encodeURIComponent(msg)}`);
}

/** Salvar rascunho ou publicar. Campos `f_<funcaoId>` = usuário escolhido (vazio = vago). */
export async function gravarEscala(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const eventoId = idSeguro(formData.get("evento"));
  const ministerioId = idSeguro(formData.get("ministerio"));
  const caminho = `/escalas/${eventoId}/${ministerioId}`;
  const escolhas = new Map<number, number | null>();
  for (const [campo, valor] of formData.entries()) {
    if (!campo.startsWith("f_")) continue;
    const funcaoId = idSeguro(campo.slice(2));
    if (funcaoId) escolhas.set(funcaoId, idSeguro(valor) || null);
  }
  const publicar = formData.get("acao") === "publicar";
  try {
    await salvarEscala(banco(), ator, eventoId, ministerioId, escolhas, publicar);
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/escalas");
    if (erro instanceof ErroEscala) voltar(caminho, "erro", erro.message);
    throw erro;
  }
  revalidatePath("/escalas");
  voltar(caminho, "ok", publicar ? "Escala publicada" : "Rascunho salvo");
}
