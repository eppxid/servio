"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { renomearTipo } from "@/lib/tipos/nucleo";
import { salvarModeloVagas } from "@/lib/vagas/nucleo";
import { ajustarCultosAoModelo } from "../cultos/vagas-culto";

/** Grava o modelo de vagas do ministério neste tipo e ajusta os cultos futuros em rascunho. */
export async function salvarModeloAcao(
  recorrenciaId: number,
  ministerioId: number,
  vagas: { funcaoId: number; quantidade: number }[],
): Promise<{ erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const banco = db() as unknown as AnyDb;
  const rec = idSeguro(recorrenciaId);
  const min = idSeguro(ministerioId);
  try {
    await salvarModeloVagas(
      banco,
      ator,
      rec,
      min,
      vagas.map((v) => ({ funcaoId: idSeguro(v.funcaoId), quantidade: Math.trunc(Number(v.quantidade)) })),
    );
    await ajustarCultosAoModelo(banco, ator, rec, min);
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: "Você não lidera este ministério" };
    if (erro instanceof RangeError) return { erro: erro.message };
    throw erro;
  }
  return {};
}

/** Troca o nome do tipo de culto (só admin). */
export async function renomearTipoAcao(recorrenciaId: number, nome: string): Promise<{ erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const rec = idSeguro(recorrenciaId);
  try {
    await renomearTipo(db() as unknown as AnyDb, ator, rec, String(nome));
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: "Só o administrador renomeia o tipo de culto" };
    if (erro instanceof RangeError) return { erro: erro.message };
    throw erro;
  }
  revalidatePath("/lider/tipos");
  revalidatePath(`/lider/tipos/${rec}`);
  return {};
}
