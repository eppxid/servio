"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { indisponibilidades } from "@/db/schema";
import { exigirUsuario } from "@/lib/auth";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;

const somarDia = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function volta(chave: "ok" | "erro", valor: string): never {
  redirect(`/folgas?${chave}=${encodeURIComponent(valor)}`);
}

/** Marca folga do dia (ou do período, com `ate`). */
export async function marcarFolga(formData: FormData) {
  const usuario = await exigirUsuario();
  const inicio = String(formData.get("dia") ?? "");
  const ate = String(formData.get("ate") ?? "") || inicio;
  if (!DATA.test(inicio) || !DATA.test(ate)) volta("erro", "Data inválida");
  if (ate < inicio) volta("erro", "A data final vem antes da inicial");
  if ((Date.parse(ate) - Date.parse(inicio)) / 86_400_000 >= MAX_DIAS) volta("erro", "O período passa de um ano");
  await db()
    .insert(indisponibilidades)
    .values({ igrejaId: usuario.igrejaId, usuarioId: usuario.id, dataInicio: inicio, dataFim: ate });
  volta("ok", "Folga marcada");
}

/** Desmarca um dia: períodos que o cobrem são divididos, sobrando só os outros dias. */
export async function desmarcarFolga(formData: FormData) {
  const usuario = await exigirUsuario();
  const dia = String(formData.get("dia") ?? "");
  if (!DATA.test(dia)) volta("erro", "Data inválida");
  const dono = and(eq(indisponibilidades.usuarioId, usuario.id), eq(indisponibilidades.igrejaId, usuario.igrejaId));
  const cobrem = await db()
    .select()
    .from(indisponibilidades)
    .where(and(dono, lte(indisponibilidades.dataInicio, dia), gte(indisponibilidades.dataFim, dia)));
  for (const p of cobrem) {
    await db().delete(indisponibilidades).where(and(dono, eq(indisponibilidades.id, p.id)));
    const base = { igrejaId: usuario.igrejaId, usuarioId: usuario.id, motivo: p.motivo };
    if (p.dataInicio < dia) {
      await db().insert(indisponibilidades).values({ ...base, dataInicio: p.dataInicio, dataFim: somarDia(dia, -1) });
    }
    if (p.dataFim > dia) {
      await db().insert(indisponibilidades).values({ ...base, dataInicio: somarDia(dia, 1), dataFim: p.dataFim });
    }
  }
  volta("ok", "Folga removida");
}
