"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { indisponibilidades, usuarios } from "@/db/schema";
import { SENHA_MINIMA, trocarSenha, verificarSenha } from "@/lib/auth-core";
import { exigirUsuario, sessao } from "@/lib/auth";
import { diasDaSemanaNoMes } from "@/lib/disponibilidade";
import { validar } from "@/lib/validar";

const vazioNulo = (s: string) => (s.trim() === "" ? null : s.trim());
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const MAX_DIAS_PERIODO = 366;

function volta(chave: "ok" | "erro", valor: string): never {
  redirect(`/perfil?${chave}=${encodeURIComponent(valor)}`);
}

const esquemaPerfil = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(120),
  telefone: z.string().max(30).transform(vazioNulo),
  fotoUrl: z
    .string()
    .max(500)
    .transform(vazioNulo)
    .refine((v) => v === null || /^https:\/\/\S+$/.test(v), "A foto precisa ser um link https"),
});

export async function salvarPerfil(formData: FormData) {
  const usuario = await exigirUsuario();
  const v = validar(esquemaPerfil, formData);
  if (!v.ok) volta("erro", Object.values(v.erros)[0]);
  await db()
    .update(usuarios)
    .set(v.dados)
    .where(and(eq(usuarios.id, usuario.id), eq(usuarios.igrejaId, usuario.igrejaId)));
  revalidatePath("/perfil");
  volta("ok", "Perfil salvo");
}

const esquemaSenha = z.object({
  atual: z.string().min(1, "Informe a senha atual").max(200),
  nova: z
    .string()
    .min(SENHA_MINIMA, `A senha precisa ter ${SENHA_MINIMA} caracteres ou mais`)
    .max(200),
});

export async function mudarSenha(formData: FormData) {
  const usuario = await exigirUsuario();
  const v = validar(esquemaSenha, formData);
  if (!v.ok) volta("erro", Object.values(v.erros)[0]);
  if (!(await verificarSenha(v.dados.atual, usuario.senhaHash))) {
    volta("erro", "Senha atual incorreta");
  }
  await trocarSenha(db(), usuario.id, v.dados.nova);
  // A troca encerra as outras sessões; esta continua com a versão nova.
  const [novo] = await db()
    .select({ versao: usuarios.sessaoVersao })
    .from(usuarios)
    .where(eq(usuarios.id, usuario.id));
  const s = await sessao();
  s.sessaoVersao = novo.versao;
  await s.save();
  volta("ok", "Senha alterada");
}

const esquemaPeriodo = z
  .object({
    dataInicio: data,
    dataFim: data,
    motivo: z.string().max(200).transform(vazioNulo),
  })
  .refine((d) => d.dataFim >= d.dataInicio, {
    message: "A data final vem antes da inicial",
    path: ["dataFim"],
  })
  .refine(
    (d) => (Date.parse(d.dataFim) - Date.parse(d.dataInicio)) / 86_400_000 < MAX_DIAS_PERIODO,
    { message: "O período passa de um ano", path: ["dataFim"] },
  );

export async function incluirIndisponibilidade(formData: FormData) {
  const usuario = await exigirUsuario();
  const v = validar(esquemaPeriodo, formData);
  if (!v.ok) volta("erro", Object.values(v.erros)[0]);
  await db()
    .insert(indisponibilidades)
    .values({ igrejaId: usuario.igrejaId, usuarioId: usuario.id, ...v.dados });
  revalidatePath("/perfil");
  volta("ok", "Período incluído");
}

const esquemaDiasSemana = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido"),
  diaSemana: z.coerce.number().int().min(0).max(6),
  motivo: z.string().max(200).transform(vazioNulo),
});

export async function incluirDiasDaSemana(formData: FormData) {
  const usuario = await exigirUsuario();
  const v = validar(esquemaDiasSemana, formData);
  if (!v.ok) volta("erro", Object.values(v.erros)[0]);
  const [ano, mes] = v.dados.mes.split("-").map(Number);
  const dias = diasDaSemanaNoMes(ano, mes, v.dados.diaSemana);
  await db()
    .insert(indisponibilidades)
    .values(
      dias.map((d) => ({
        igrejaId: usuario.igrejaId,
        usuarioId: usuario.id,
        dataInicio: d,
        dataFim: d,
        motivo: v.dados.motivo,
      })),
    );
  revalidatePath("/perfil");
  volta("ok", `${dias.length} dias incluídos`);
}

export async function excluirIndisponibilidade(formData: FormData) {
  const usuario = await exigirUsuario();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) volta("erro", "Registro inválido");
  // Filtra pelo dono: id vindo do formulário nunca vale sozinho.
  await db()
    .delete(indisponibilidades)
    .where(
      and(
        eq(indisponibilidades.id, id),
        eq(indisponibilidades.usuarioId, usuario.id),
        eq(indisponibilidades.igrejaId, usuario.igrejaId),
      ),
    );
  revalidatePath("/perfil");
  volta("ok", "Período excluído");
}
