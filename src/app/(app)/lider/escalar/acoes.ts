"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { desfazerSugestao, sugerirMes } from "@/lib/escala/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { recomendacoes } from "@/lib/servir/nucleo";
import { publicarMes } from "./dados";
import { resumoDaSugestao } from "./resumo";

const banco = () => db() as unknown as AnyDb;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RespostaSugestao {
  erro?: string;
  resumo?: string;
  /** Itens que a sugestão preencheu e a pessoa de cada um: voltam em `desfazerAcao`. */
  itens?: number[];
  usuarios?: number[];
  /** Funções com falta sem candidato em que há pessoas que desejam a função e ainda não foram aprovadas. */
  recomendacoes?: { funcaoId: number; funcao: string; desejam: number }[];
}

export async function sugerirAcao(ministerioId: number, mes: string): Promise<RespostaSugestao> {
  const ator = await exigirUsuarioSemTroca();
  if (!MES.test(mes)) return { erro: "Mês inválido" };
  const id = idSeguro(ministerioId);
  try {
    const r = await sugerirMes(banco(), ator, id, mes);
    const faltaIds = [...new Set(r.semCandidato.map((f) => f.funcaoId))];
    const nomes = new Map<number, string>();
    if (faltaIds.length > 0) {
      const fs = await banco().select({ id: t.funcoes.id, nome: t.funcoes.nome }).from(t.funcoes).where(inArray(t.funcoes.id, faltaIds));
      for (const f of fs) nomes.set(f.id, f.nome);
    }
    const sugestoes = faltaIds.length > 0 ? (await recomendacoes(banco(), ator, id)).filter((x) => faltaIds.includes(x.funcaoId) && x.desejam > 0) : [];
    revalidatePath("/lider/escalar");
    revalidatePath("/lider/cultos");
    return {
      resumo: resumoDaSugestao(
        r.total,
        r.preenchidos.length,
        r.semCandidato.map((f) => ({ funcao: nomes.get(f.funcaoId) ?? "Função", data: f.data })),
      ),
      itens: r.preenchidos,
      usuarios: r.usuarios,
      recomendacoes: sugestoes.map((s) => ({ funcaoId: s.funcaoId, funcao: s.funcao, desejam: s.desejam })),
    };
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: "Você não lidera este ministério" };
    throw erro;
  }
}

export async function desfazerAcao(itens: number[], usuarios: number[]): Promise<{ erro?: string; desfeitas?: number }> {
  const ator = await exigirUsuarioSemTroca();
  const desfeitas = await desfazerSugestao(banco(), ator, itens.map(idSeguro), usuarios.map(idSeguro));
  revalidatePath("/lider/escalar");
  revalidatePath("/lider/cultos");
  return { desfeitas };
}

export async function publicarMesAcao(ministerioId: number, mes: string): Promise<{ erro?: string; publicadas?: number }> {
  const ator = await exigirUsuarioSemTroca();
  if (!MES.test(mes)) return { erro: "Mês inválido" };
  try {
    const publicadas = await publicarMes(banco(), ator, idSeguro(ministerioId), mes);
    revalidatePath("/lider/escalar");
    revalidatePath("/lider/cultos");
    return { publicadas };
  } catch (erro) {
    if (erro instanceof ErroAcesso) return { erro: "Você não lidera este ministério" };
    throw erro;
  }
}
