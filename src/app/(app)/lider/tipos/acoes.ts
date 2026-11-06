"use server";

import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
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
