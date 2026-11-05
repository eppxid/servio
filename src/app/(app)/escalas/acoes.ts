"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala, salvarEscala, sugerirMes } from "@/lib/escala/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { validar } from "@/lib/validar";

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

const esquemaSugestao = z.object({
  ministerio: z.coerce.number().int().positive(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido"),
});

export async function sugerirMesAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const v = validar(esquemaSugestao, formData);
  if (!v.ok) voltar("/escalas", "erro", Object.values(v.erros)[0]);
  let n = 0;
  try {
    n = await sugerirMes(banco(), ator, v.dados.ministerio, v.dados.mes);
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/escalas");
    throw erro;
  }
  revalidatePath("/escalas");
  voltar(
    "/escalas",
    "ok",
    n ? `${n} vaga(s) sugerida(s) como rascunho. Revise e publique.` : "Nenhuma vaga para sugerir.",
  );
}
