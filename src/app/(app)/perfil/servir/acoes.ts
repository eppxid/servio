"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import * as t from "@/db/schema";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { pedirParaServir } from "@/lib/servir/nucleo";

function volta(chave: "ok" | "erro", valor: string): never {
  redirect(`/perfil/servir?${chave}=${encodeURIComponent(valor)}`);
}

/**
 * Salva "onde quero servir". Campos: `f` = ids das funções marcadas (`<ministerio>:<funcao>`).
 * Ministério com função marcada vira pedido; função `desejada` desmarcada é retirada.
 * Função `aprovada` nunca é tocada aqui (só o líder muda).
 */
export async function salvarOndeServir(formData: FormData) {
  const usuario = await exigirUsuario();
  const banco = db() as unknown as AnyDb;
  const porMinisterio = new Map<number, number[]>();
  for (const v of formData.getAll("f")) {
    const [m, f] = String(v).split(":").map(Number);
    if (!Number.isInteger(m) || !Number.isInteger(f)) continue;
    porMinisterio.set(m, [...(porMinisterio.get(m) ?? []), f]);
  }

  try {
    for (const [ministerioId, funcaoIds] of porMinisterio) await pedirParaServir(banco, usuario, ministerioId, funcaoIds);

    // Retira as `desejada` que o voluntário desmarcou.
    const membros = await banco
      .select({ id: t.membrosMinisterio.id, ministerioId: t.membrosMinisterio.ministerioId })
      .from(t.membrosMinisterio)
      .where(and(eq(t.membrosMinisterio.usuarioId, usuario.id), eq(t.membrosMinisterio.igrejaId, usuario.igrejaId)));
    for (const m of membros) {
      const mantidas = porMinisterio.get(m.ministerioId) ?? [];
      await banco
        .delete(t.membroFuncoes)
        .where(
          and(
            eq(t.membroFuncoes.membroId, m.id),
            eq(t.membroFuncoes.igrejaId, usuario.igrejaId),
            eq(t.membroFuncoes.status, "desejada"),
            mantidas.length ? notInArray(t.membroFuncoes.funcaoId, mantidas) : inArray(t.membroFuncoes.membroId, [m.id]),
          ),
        );
    }
  } catch (erro) {
    if (erro instanceof ErroAcesso) volta("erro", "Ministério ou função indisponível");
    throw erro;
  }
  revalidatePath("/perfil/servir");
  volta("ok", "Pedido salvo. O líder vai avaliar.");
}
