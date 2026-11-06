"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { ErroTroca, fazerCheckin, responderEscala, responderTroca } from "@/lib/trocas/nucleo";

const banco = () => db() as unknown as AnyDb;

/** Roda a ação e volta ao Início com o aviso; erro de regra vira aviso de erro. */
async function executar(ok: string, fn: () => Promise<void>): Promise<never> {
  let destino = `/inicio?ok=${encodeURIComponent(ok)}`;
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof ErroAcesso) destino = "/inicio";
    else if (erro instanceof ErroTroca) destino = `/inicio?erro=${encodeURIComponent(erro.message)}`;
    else throw erro;
  }
  revalidatePath("/inicio");
  revalidatePath("/agenda");
  redirect(destino);
}

export async function confirmarNoInicio(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("Presença confirmada", () => responderEscala(banco(), ator, item, true));
}

export async function recusarNoInicio(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("Escala recusada", () => responderEscala(banco(), ator, item, false));
}

export async function checkinNoInicio(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("Check-in feito", () => fazerCheckin(banco(), ator, item));
}

export async function responderTrocaNoInicio(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const troca = idSeguro(formData.get("troca"));
  const aceitar = formData.get("acao") === "aceitar";
  await executar(aceitar ? "Troca aceita" : "Troca recusada", () => responderTroca(banco(), ator, troca, aceitar));
}
