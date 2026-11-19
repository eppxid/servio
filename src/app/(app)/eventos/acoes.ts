"use server";

import { and, desc, eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type Db } from "@/db";
import { eventos, recorrencias } from "@/db/schema";
import { exigirPapel } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import {
  DIAS_A_GERAR,
  FUSO,
  dataLocal,
  gerarOcorrencias,
  type RegraRecorrencia,
} from "@/lib/recorrencia";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { excluirTipo } from "@/lib/tipos/nucleo";
import { validar } from "@/lib/validar";
import { criarVagasDosEventos } from "@/lib/vagas/nucleo";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida");
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const vazioParaNulo = (s: unknown) => (s === "" ? null : s);

const esquemaNovo = z.object({
  titulo: z.string().trim().min(1, "Informe o título").max(120),
  data: dataIso,
  horaInicio: hora,
  horaFim: z.preprocess(vazioParaNulo, hora.nullable()),
  repetir: z.preprocess((v) => v === "on", z.boolean()),
  ate: z.preprocess(vazioParaNulo, dataIso.nullable()),
});

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Insere as ocorrências da regra que ainda não existem (mesmo dia local). */
async function inserirOcorrencias(
  tx: Tx,
  igrejaId: number,
  recorrenciaId: number,
  titulo: string,
  regra: RegraRecorrencia,
  de: Date,
) {
  const ate = new Date(de.getTime() + DIAS_A_GERAR * 24 * 60 * 60 * 1000);
  const existentes = await tx
    .select({ inicio: eventos.inicio })
    .from(eventos)
    .where(and(eq(eventos.igrejaId, igrejaId), eq(eventos.recorrenciaId, recorrenciaId)));
  const dias = new Set(existentes.map((e) => dataLocal(e.inicio)));
  const novas = gerarOcorrencias(regra, de, ate).filter((o) => !dias.has(dataLocal(o.inicio)));
  if (novas.length === 0) return;
  const criados = await tx
    .insert(eventos)
    .values(novas.map((o) => ({ igrejaId, titulo, inicio: o.inicio, fim: o.fim, recorrenciaId })))
    .returning({ id: eventos.id });
  await criarVagasDosEventos(tx as unknown as AnyDb, igrejaId, criados.map((e) => e.id));
}

function erroNovo(msg: string): never {
  redirect("/eventos/novo?erro=" + encodeURIComponent(msg));
}

export async function criarEvento(formData: FormData) {
  const admin = await exigirPapel("admin");
  const v = validar(esquemaNovo, formData);
  if (!v.ok) erroNovo(Object.values(v.erros)[0]);
  const { titulo, data, horaInicio, horaFim, repetir, ate } = v.dados;

  const inicio = fromZonedTime(`${data}T${horaInicio}:00`, FUSO);
  const fim = horaFim ? fromZonedTime(`${data}T${horaFim}:00`, FUSO) : null;
  if (fim && fim <= inicio) erroNovo("O fim deve ser depois do início");

  if (!repetir) {
    const [novo] = await db().insert(eventos).values({ igrejaId: admin.igrejaId, titulo, inicio, fim }).returning({ id: eventos.id });
    revalidatePath("/lider/cultos");
    // Culto avulso abre direto na tela dele, onde o líder define as vagas.
    redirect(`/lider/cultos/${novo.id}`);
  } else {
    const diaSemana = new Date(`${data}T00:00:00Z`).getUTCDay();
    await db().transaction(async (tx) => {
      const [regra] = await tx
        .insert(recorrencias)
        .values({ igrejaId: admin.igrejaId, nome: titulo, diaSemana, horaInicio, horaFim, ate })
        .returning();
      await inserirOcorrencias(
        tx,
        admin.igrejaId,
        regra.id,
        titulo,
        { diaSemana, horaInicio, horaFim, ate },
        inicio,
      );
    });
  }
  revalidatePath("/eventos");
  redirect("/lider/cultos?mes=" + data.slice(0, 7));
}

const esquemaEdicao = z.object({
  id: z.coerce.number().int().positive(),
  titulo: z.string().trim().min(1, "Informe o título").max(120),
  data: dataIso,
  horaInicio: hora,
  horaFim: z.preprocess(vazioParaNulo, hora.nullable()),
});

/** Edita só esta ocorrência; a regra de recorrência não muda. */
export async function editarEvento(formData: FormData) {
  const admin = await exigirPapel("admin");
  const v = validar(esquemaEdicao, formData);
  if (!v.ok) redirect("/eventos");
  const { id, titulo, data, horaInicio, horaFim } = v.dados;
  const inicio = fromZonedTime(`${data}T${horaInicio}:00`, FUSO);
  const fim = horaFim ? fromZonedTime(`${data}T${horaFim}:00`, FUSO) : null;
  if (fim && fim <= inicio) {
    redirect(`/eventos/${id}?erro=` + encodeURIComponent("O fim deve ser depois do início"));
  }
  await db()
    .update(eventos)
    .set({ titulo, inicio, fim })
    .where(and(eq(eventos.id, id), eq(eventos.igrejaId, admin.igrejaId)));
  revalidatePath("/eventos");
  redirect(`/eventos/${id}`);
}

const esquemaRegra = z.object({ recorrenciaId: z.coerce.number().int().positive() });

/** Ação "Gerar próximos": completa os próximos 90 dias da regra. */
export async function gerarProximos(formData: FormData) {
  const admin = await exigirPapel("admin");
  const v = validar(esquemaRegra, formData);
  if (!v.ok) redirect("/eventos");
  const [regra] = await db()
    .select()
    .from(recorrencias)
    .where(
      and(eq(recorrencias.id, v.dados.recorrenciaId), eq(recorrencias.igrejaId, admin.igrejaId)),
    );
  if (!regra) redirect("/eventos");
  const [modelo] = await db()
    .select({ titulo: eventos.titulo })
    .from(eventos)
    .where(and(eq(eventos.recorrenciaId, regra.id), eq(eventos.igrejaId, admin.igrejaId)))
    .orderBy(desc(eventos.inicio))
    .limit(1);
  await db().transaction((tx) =>
    inserirOcorrencias(tx, admin.igrejaId, regra.id, modelo?.titulo ?? "Culto", regra, new Date()),
  );
  revalidatePath("/eventos");
  redirect("/eventos");
}

/**
 * Exclui a regra. Apaga só as ocorrências futuras sem escala publicada;
 * as demais (passadas ou com escala publicada) ficam como eventos avulsos.
 */
export async function excluirRegra(formData: FormData) {
  const admin = await exigirPapel("admin");
  const v = validar(esquemaRegra, formData);
  if (!v.ok) redirect("/eventos");
  try {
    await excluirTipo(db() as unknown as AnyDb, admin, v.dados.recorrenciaId);
  } catch (erro) {
    if (!(erro instanceof ErroAcesso)) throw erro;
  }
  revalidatePath("/eventos");
  redirect("/eventos");
}
