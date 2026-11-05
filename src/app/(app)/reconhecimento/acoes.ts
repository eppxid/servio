"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import {
  definirAparecerNoRanking,
  enviarReconhecimento,
  ErroReconhecimento,
  MAX_TEXTO_RECONHECIMENTO,
} from "@/lib/gamificacao/consulta";
import { validar } from "@/lib/validar";

const esquemaTexto = z.object({
  texto: z.string().trim().min(1, "Escreva o agradecimento").max(MAX_TEXTO_RECONHECIMENTO, "Texto longo demais"),
});

/** Só volta para páginas conhecidas (nunca para URL vinda do formulário). */
const DESTINOS = new Set(["/perfil", "/reconhecimento"]);

export async function mudarRanking(formData: FormData) {
  const usuario = await exigirUsuarioSemTroca();
  await definirAparecerNoRanking(db(), usuario, formData.getAll("aparecer").includes("1"));
  const destino = String(formData.get("voltar") ?? "");
  revalidatePath("/reconhecimento");
  redirect(DESTINOS.has(destino) ? destino : "/reconhecimento");
}

export async function agradecer(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const ministerioId = idSeguro(formData.get("ministerio"));
  const volta = `/ministerios/${ministerioId}`;
  const v = validar(esquemaTexto, formData);
  if (!v.ok) redirect(`${volta}?erro=agradecimento`);
  try {
    await enviarReconhecimento(db(), ator, ministerioId, idSeguro(formData.get("membro")), v.dados.texto);
  } catch (e) {
    if (e instanceof ErroAcesso || e instanceof ErroReconhecimento) redirect(`${volta}?erro=agradecimento`);
    throw e;
  }
  redirect(`${volta}?ok=agradecimento`);
}
