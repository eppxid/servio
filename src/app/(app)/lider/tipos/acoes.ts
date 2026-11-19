"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import {
  contarCultosAposLimite,
  definirDataLimiteTipo,
  editarHorarioTipo,
  excluirTipo,
  renomearTipo,
} from "@/lib/tipos/nucleo";
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

const SO_ADMIN = "Só o administrador altera o tipo de culto";

function revalidarTipo(rec: number) {
  revalidatePath("/lider/tipos");
  revalidatePath(`/lider/tipos/${rec}`);
  revalidatePath("/lider/cultos");
  revalidatePath("/eventos");
}

/** Muda dia da semana e horários do tipo (só admin). */
export async function editarHorarioTipoAcao(
  recorrenciaId: number,
  diaSemana: number,
  horaInicio: string,
  horaFim: string,
): Promise<{ erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const rec = idSeguro(recorrenciaId);
  try {
    await editarHorarioTipo(db() as unknown as AnyDb, ator, rec, {
      diaSemana: Number(diaSemana),
      horaInicio: String(horaInicio),
      horaFim: horaFim ? String(horaFim) : null,
    });
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: SO_ADMIN };
    if (erro instanceof RangeError) return { erro: erro.message };
    throw erro;
  }
  revalidarTipo(rec);
  return {};
}

/** Quantos cultos saem da agenda se a data limite for `ate` (para a confirmação). */
export async function contarCultosAposLimiteAcao(
  recorrenciaId: number,
  ate: string,
): Promise<{ removidos?: number; publicados?: number; erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const rec = idSeguro(recorrenciaId);
  try {
    return await contarCultosAposLimite(db() as unknown as AnyDb, ator, rec, String(ate));
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: SO_ADMIN };
    throw erro;
  }
}

/** Define ou limpa (null) a data limite do tipo e remove os cultos depois dela (só admin). */
export async function definirDataLimiteTipoAcao(
  recorrenciaId: number,
  ate: string | null,
): Promise<{ erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const rec = idSeguro(recorrenciaId);
  try {
    await definirDataLimiteTipo(db() as unknown as AnyDb, ator, rec, ate ? String(ate) : null);
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: SO_ADMIN };
    if (erro instanceof RangeError) return { erro: erro.message };
    throw erro;
  }
  revalidarTipo(rec);
  return {};
}

/** Exclui o tipo de culto (só admin) e volta para a lista. */
export async function excluirTipoAcao(recorrenciaId: number): Promise<{ erro?: string }> {
  const ator = await exigirUsuarioSemTroca();
  const rec = idSeguro(recorrenciaId);
  try {
    await excluirTipo(db() as unknown as AnyDb, ator, rec);
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: SO_ADMIN };
    throw erro;
  }
  revalidarTipo(rec);
  redirect("/lider/tipos");
}
