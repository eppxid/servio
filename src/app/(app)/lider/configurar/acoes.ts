"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { eventos, funcoes, ministerios, recorrencias } from "@/db/schema";
import { exigirPapel } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { criarMinisterio, gerarConvite } from "@/lib/ministerios/nucleo";
import { DIAS_A_GERAR, gerarOcorrencias } from "@/lib/recorrencia";
import { validar } from "@/lib/validar";
import { criarVagasDosEventos, salvarModeloVagas } from "@/lib/vagas/nucleo";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const vazioParaNulo = (s: unknown) => (s === "" ? null : s);

const BASE = "/lider/configurar";

export async function salvarMinisterio(formData: FormData) {
  const admin = await exigirPapel("admin");
  const v = validar(z.object({ ministerio: z.string().trim().min(2).max(120) }), formData);
  if (!v.ok) redirect(`${BASE}?passo=1&erro=1`);
  const nomes = [
    ...new Set(
      formData
        .getAll("funcoes")
        .map((f) => String(f).trim())
        .filter((f) => f.length > 0 && f.length <= 80),
    ),
  ];
  const banco = db() as unknown as AnyDb;
  const ministerio = await criarMinisterio(banco, admin, v.dados.ministerio);
  // O ator é admin (exigirPapel acima): a checagem de líder de criarFuncao não muda nada aqui.
  if (nomes.length > 0) {
    await banco
      .insert(funcoes)
      .values(nomes.map((nome) => ({ igrejaId: admin.igrejaId, ministerioId: ministerio.id, nome })));
  }
  redirect(`${BASE}?passo=2&ministerio=${ministerio.id}`);
}

const esquemaCulto = z.object({
  nome: z.string().trim().min(1).max(120),
  dia: z.coerce.number().int().min(0).max(6),
  horaInicio: hora,
  horaFim: z.preprocess(vazioParaNulo, hora.nullable()),
});

export async function salvarCulto(formData: FormData) {
  const admin = await exigirPapel("admin");
  const m = Number(formData.get("ministerio")) || 0;
  const volta = `${BASE}?passo=2${m ? `&ministerio=${m}` : ""}`;
  const v = validar(esquemaCulto, formData);
  if (!v.ok) redirect(`${volta}&erro=1`);
  const { nome, dia, horaInicio, horaFim } = v.dados;
  if (horaFim && horaFim <= horaInicio) redirect(`${volta}&erro=fim`);

  const banco = db();
  const lista = m
    ? await banco
        .select({ id: funcoes.id })
        .from(funcoes)
        .where(and(eq(funcoes.ministerioId, m), eq(funcoes.igrejaId, admin.igrejaId)))
    : [];
  const vagas = lista.map((f) => ({
    funcaoId: f.id,
    quantidade: Math.max(0, Math.min(50, Number.parseInt(String(formData.get(`qtd_${f.id}`) ?? "0"), 10) || 0)),
  }));
  // Tipo sem vagas deixaria todos os cultos da série "sem vagas": não salva.
  if (vagas.length > 0 && vagas.every((v) => v.quantidade === 0)) redirect(`${volta}&erro=vagas`);

  const [regra] = await banco
    .insert(recorrencias)
    .values({ igrejaId: admin.igrejaId, nome, diaSemana: dia, horaInicio, horaFim })
    .returning();

  if (m) {
    await salvarModeloVagas(banco as unknown as AnyDb, admin, regra.id, m, vagas);
  }

  // Gera os cultos dos próximos 90 dias; as vagas saem do modelo recém-salvo.
  const de = new Date();
  const ate = new Date(de.getTime() + DIAS_A_GERAR * 24 * 60 * 60 * 1000);
  const ocorrencias = gerarOcorrencias({ diaSemana: dia, horaInicio, horaFim }, de, ate);
  if (ocorrencias.length > 0) {
    const criados = await banco
      .insert(eventos)
      .values(
        ocorrencias.map((o) => ({
          igrejaId: admin.igrejaId,
          titulo: nome,
          inicio: o.inicio,
          fim: o.fim,
          recorrenciaId: regra.id,
        })),
      )
      .returning({ id: eventos.id });
    await criarVagasDosEventos(banco as unknown as AnyDb, admin.igrejaId, criados.map((e) => e.id));
  }
  redirect(`${BASE}?passo=3${m ? `&ministerio=${m}` : ""}`);
}

export async function gerarLinkConvite(formData: FormData) {
  const admin = await exigirPapel("admin");
  const m = Number(formData.get("ministerio")) || 0;
  const [existe] = await db()
    .select({ id: ministerios.id })
    .from(ministerios)
    .where(and(eq(ministerios.id, m), eq(ministerios.igrejaId, admin.igrejaId), isNull(ministerios.arquivadoEm)))
    .limit(1);
  if (!existe) redirect(`${BASE}?passo=3&erro=1`);
  const token = await gerarConvite(db() as unknown as AnyDb, admin, existe.id);
  redirect(`${BASE}?passo=3&ministerio=${existe.id}&convite=${token}`);
}
