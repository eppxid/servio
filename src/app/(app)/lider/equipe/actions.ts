"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import * as t from "@/db/schema";
import { decidirMembro, criarFuncao, definirFuncoesDoMembro, definirLider, renomearFuncao } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { aprovarFuncao, aprovarMembro, recusarFuncao } from "@/lib/servir/nucleo";

const nomeFuncao = z.string().trim().min(2).max(80);

function atualizar() {
  revalidatePath("/lider/equipe");
}

export async function aprovarEntrada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await aprovarMembro(db(), ator, idSeguro(formData.get("membro")));
  atualizar();
}

export async function recusarEntrada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await decidirMembro(db(), ator, idSeguro(formData.get("membro")), false);
  atualizar();
}

export async function aprovarFuncaoDesejada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await aprovarFuncao(db(), ator, idSeguro(formData.get("membro")), idSeguro(formData.get("funcao")));
  atualizar();
}

export async function recusarFuncaoDesejada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await recusarFuncao(db(), ator, idSeguro(formData.get("membro")), idSeguro(formData.get("funcao")));
  atualizar();
}

/** Troca as funções aprovadas do membro sem perder os pedidos `desejada` que ele ainda tem. */
export async function salvarFuncoesDoMembro(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const membroId = idSeguro(formData.get("membro"));
  const ids = formData.getAll("funcoes").map(idSeguro).filter(Boolean);
  const banco = db();
  const desejadas = await banco
    .select({ funcaoId: t.membroFuncoes.funcaoId })
    .from(t.membroFuncoes)
    .where(
      and(
        eq(t.membroFuncoes.membroId, membroId),
        eq(t.membroFuncoes.igrejaId, ator.igrejaId),
        eq(t.membroFuncoes.status, "desejada"),
      ),
    );
  await definirFuncoesDoMembro(banco, ator, membroId, ids);
  const manter = desejadas.filter((d) => !ids.includes(d.funcaoId));
  if (manter.length) {
    await banco
      .insert(t.membroFuncoes)
      .values(manter.map((d) => ({ igrejaId: ator.igrejaId, membroId, funcaoId: d.funcaoId, status: "desejada" as const })))
      .onConflictDoNothing();
  }
  atualizar();
}

/** Só o admin muda o papel (líder ou voluntário) no ministério. */
export async function alterarPapel(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await definirLider(
    db(),
    ator,
    idSeguro(formData.get("ministerio")),
    idSeguro(formData.get("usuario")),
    formData.get("lider") === "1",
  );
  atualizar();
}

export async function adicionarFuncao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeFuncao.safeParse(formData.get("nome"));
  if (!nome.success) return;
  await criarFuncao(db(), ator, idSeguro(formData.get("ministerio")), nome.data);
  atualizar();
}

export async function renomearFuncaoAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeFuncao.safeParse(formData.get("nome"));
  if (!nome.success) return;
  await renomearFuncao(db(), ator, idSeguro(formData.get("funcao")), nome.data);
  atualizar();
}
