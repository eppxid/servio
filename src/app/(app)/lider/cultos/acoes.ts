"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala } from "@/lib/escala/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { copiarVagasDeTipo } from "@/lib/vagas/nucleo";
import { preencherVaga, publicarCulto } from "./vagas-culto";

const banco = () => db() as unknown as AnyDb;

export type Resultado = { erro?: string };

async function comoResultado(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    return {};
  } catch (erro) {
    if (erro instanceof ErroEscala) return { erro: erro.message };
    if (erro instanceof ErroAcesso) return { erro: "Você não lidera este ministério" };
    throw erro;
  }
}

/** Põe uma pessoa na vaga (ou tira, com `usuarioId` nulo). */
export async function escolherPessoaAcao(eventoId: number, itemId: number, usuarioId: number | null): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() => preencherVaga(banco(), ator, idSeguro(itemId), usuarioId === null ? null : idSeguro(usuarioId) || -1));
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}

export async function publicarAcao(eventoId: number, ministerioId: number): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() => publicarCulto(banco(), ator, idSeguro(eventoId), idSeguro(ministerioId)));
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}

/** Culto avulso: copia o modelo de vagas de um tipo de culto. */
export async function copiarVagasAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const eventoId = idSeguro(formData.get("evento"));
  const tipo = idSeguro(formData.get("tipo"));
  const caminho = `/lider/cultos/${eventoId}`;
  if (!eventoId || !tipo) redirect(caminho);
  try {
    await copiarVagasDeTipo(banco(), ator, eventoId, tipo);
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/lider/cultos");
    throw erro;
  }
  revalidatePath(caminho);
  revalidatePath("/lider/cultos");
  redirect(caminho);
}
