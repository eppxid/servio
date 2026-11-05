"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { gerarTokenAgenda, revogarTokenAgenda } from "@/lib/trocas/ics";
import {
  ErroTroca,
  decidirTroca,
  definirTrocaAutomatica,
  fazerCheckin,
  pedirTroca,
  responderEscala,
  responderTroca,
} from "@/lib/trocas/nucleo";

const banco = () => db() as unknown as AnyDb;

function voltar(caminho: string, chave: "erro" | "ok", msg: string): never {
  redirect(`${caminho}?${chave}=${encodeURIComponent(msg)}`);
}

/** Roda a ação; erro de regra volta para a tela com a mensagem, acesso negado volta para a agenda. */
async function executar(caminho: string, ok: string, fn: () => Promise<void>): Promise<never> {
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/agenda");
    if (erro instanceof ErroTroca) voltar(caminho, "erro", erro.message);
    throw erro;
  }
  revalidatePath("/agenda");
  revalidatePath("/agenda/trocas");
  return voltar(caminho, "ok", ok);
}

export async function confirmarEscala(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("/agenda", "Presença confirmada", () => responderEscala(banco(), ator, item, true));
}

export async function recusarEscala(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("/agenda", "Escala recusada", () => responderEscala(banco(), ator, item, false));
}

export async function checkinAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  await executar("/agenda", "Check-in feito", () => fazerCheckin(banco(), ator, item));
}

export async function pedirTrocaAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const item = idSeguro(formData.get("item"));
  const substituto = idSeguro(formData.get("substituto"));
  await executar("/agenda", "Pedido de troca enviado", () => pedirTroca(banco(), ator, item, substituto));
}

export async function responderTrocaAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const troca = idSeguro(formData.get("troca"));
  const aceitar = formData.get("acao") === "aceitar";
  await executar("/agenda", aceitar ? "Troca aceita" : "Troca recusada", () =>
    responderTroca(banco(), ator, troca, aceitar),
  );
}

export async function decidirTrocaAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const troca = idSeguro(formData.get("troca"));
  const aprovar = formData.get("acao") === "aprovar";
  await executar("/agenda/trocas", aprovar ? "Troca aprovada" : "Troca recusada", () =>
    decidirTroca(banco(), ator, troca, aprovar),
  );
}

export async function trocaAutomaticaAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const ministerio = idSeguro(formData.get("ministerio"));
  const ligada = formData.get("ligada") === "1";
  await executar("/agenda/trocas", "Opção salva", () => definirTrocaAutomatica(banco(), ator, ministerio, ligada));
}

export async function gerarLinkCalendario() {
  const ator = await exigirUsuarioSemTroca();
  await gerarTokenAgenda(banco(), ator);
  revalidatePath("/agenda");
  redirect("/agenda?ok=" + encodeURIComponent("Link do calendário gerado"));
}

export async function revogarLinkCalendario() {
  const ator = await exigirUsuarioSemTroca();
  await revogarTokenAgenda(banco(), ator);
  revalidatePath("/agenda");
  redirect("/agenda?ok=" + encodeURIComponent("Link do calendário revogado"));
}
