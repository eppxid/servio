import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, ministerioDaIgreja, type Ator } from "@/lib/ministerios/nucleo";

/**
 * "Onde quero servir": o voluntário pede ministérios e funções; o líder aprova.
 * Funções `desejada` ainda não valem para a escala; só `aprovada`.
 */

async function exigirLider(db: AnyDb, ator: Ator, ministerioId: number) {
  const ministerio = await ministerioDaIgreja(db, ator.igrejaId, ministerioId);
  if (!ministerio || !(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  return ministerio;
}

/** Valida que todas as funções existem na igreja e pertencem ao ministério. */
async function validarFuncoes(db: AnyDb, ator: Ator, ministerioId: number, funcaoIds: number[]) {
  const ids = [...new Set(funcaoIds)];
  if (ids.length) {
    const validas = await db
      .select({ id: t.funcoes.id })
      .from(t.funcoes)
      .where(
        and(
          inArray(t.funcoes.id, ids),
          eq(t.funcoes.ministerioId, ministerioId),
          eq(t.funcoes.igrejaId, ator.igrejaId),
        ),
      );
    if (validas.length !== ids.length) throw new ErroAcesso("Função de outro ministério");
  }
  return ids;
}

/**
 * Pede para servir no ministério com as funções indicadas. Cria o membro `pendente` se não existir
 * (sem rebaixar quem já é membro) e grava as funções como `desejada` (sem rebaixar uma `aprovada`).
 */
export async function pedirParaServir(
  db: AnyDb,
  ator: Ator,
  ministerioId: number,
  funcaoIds: number[],
) {
  const ministerio = await ministerioDaIgreja(db, ator.igrejaId, ministerioId);
  if (!ministerio || ministerio.arquivadoEm) throw new ErroAcesso();
  const ids = await validarFuncoes(db, ator, ministerioId, funcaoIds);
  await db
    .insert(t.membrosMinisterio)
    .values({
      igrejaId: ator.igrejaId,
      usuarioId: ator.id,
      ministerioId,
      papel: "voluntario",
      status: "pendente",
    })
    .onConflictDoNothing();
  const [m] = await db
    .select({ id: t.membrosMinisterio.id })
    .from(t.membrosMinisterio)
    .where(
      and(
        eq(t.membrosMinisterio.usuarioId, ator.id),
        eq(t.membrosMinisterio.ministerioId, ministerioId),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
      ),
    )
    .limit(1);
  if (ids.length) {
    await db
      .insert(t.membroFuncoes)
      .values(
        ids.map((funcaoId) => ({
          igrejaId: ator.igrejaId,
          membroId: m.id,
          funcaoId,
          status: "desejada" as const,
        })),
      )
      .onConflictDoNothing();
  }
  return { membroId: m.id };
}

/** Ministérios do usuário com o status de cada um e suas funções (desejada/aprovada). */
export async function minhasPreferencias(db: AnyDb, ator: Ator) {
  const membros = await db
    .select({
      membroId: t.membrosMinisterio.id,
      ministerioId: t.membrosMinisterio.ministerioId,
      ministerio: t.ministerios.nome,
      status: t.membrosMinisterio.status,
      papel: t.membrosMinisterio.papel,
    })
    .from(t.membrosMinisterio)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.membrosMinisterio.ministerioId))
    .where(
      and(
        eq(t.membrosMinisterio.usuarioId, ator.id),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
      ),
    )
    .orderBy(asc(t.ministerios.nome));
  const funcoes = await db
    .select({
      membroId: t.membroFuncoes.membroId,
      funcaoId: t.funcoes.id,
      nome: t.funcoes.nome,
      status: t.membroFuncoes.status,
    })
    .from(t.membroFuncoes)
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.membroFuncoes.funcaoId))
    .where(inArray(t.membroFuncoes.membroId, membros.length ? membros.map((m) => m.membroId) : [0]))
    .orderBy(asc(t.funcoes.nome));
  return membros.map((m) => ({
    ...m,
    funcoes: funcoes
      .filter((f) => f.membroId === m.membroId)
      .map(({ membroId: _m, ...f }) => f),
  }));
}

/** Líder/admin: membros `pendente` e/ou com funções `desejada`, com o que cada um pediu. */
export async function pedidosPendentes(db: AnyDb, ator: Ator, ministerioId: number) {
  await exigirLider(db, ator, ministerioId);
  const linhas = await db
    .select({
      membroId: t.membrosMinisterio.id,
      status: t.membrosMinisterio.status,
      nome: t.usuarios.nome,
      email: t.usuarios.email,
      telefone: t.usuarios.telefone,
    })
    .from(t.membrosMinisterio)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(
      and(
        eq(t.membrosMinisterio.ministerioId, ministerioId),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
      ),
    )
    .orderBy(asc(t.usuarios.nome));
  const desejadas = await db
    .select({
      membroId: t.membroFuncoes.membroId,
      funcaoId: t.funcoes.id,
      nome: t.funcoes.nome,
    })
    .from(t.membroFuncoes)
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.membroFuncoes.funcaoId))
    .where(
      and(
        eq(t.membroFuncoes.status, "desejada"),
        eq(t.membroFuncoes.igrejaId, ator.igrejaId),
        inArray(t.membroFuncoes.membroId, linhas.length ? linhas.map((l) => l.membroId) : [0]),
      ),
    )
    .orderBy(asc(t.funcoes.nome));
  return linhas
    .map((l) => ({
      ...l,
      funcoesDesejadas: desejadas
        .filter((d) => d.membroId === l.membroId)
        .map(({ membroId: _m, ...d }) => d),
    }))
    .filter((l) => l.status === "pendente" || l.funcoesDesejadas.length > 0);
}

async function membroDoLider(db: AnyDb, ator: Ator, membroId: number) {
  const [m] = await db
    .select()
    .from(t.membrosMinisterio)
    .where(and(eq(t.membrosMinisterio.id, membroId), eq(t.membrosMinisterio.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!m) throw new ErroAcesso();
  await exigirLider(db, ator, m.ministerioId);
  if (m.usuarioId === ator.id) throw new ErroAcesso("Ninguém aprova a si mesmo");
  return m;
}

/** Aprova o membro pendente. As funções desejadas continuam à espera de `aprovarFuncao`. */
export async function aprovarMembro(db: AnyDb, ator: Ator, membroId: number) {
  const m = await membroDoLider(db, ator, membroId);
  await db
    .update(t.membrosMinisterio)
    .set({ status: "aprovado" })
    .where(eq(t.membrosMinisterio.id, m.id));
}

async function funcaoDoMembro(db: AnyDb, ator: Ator, membroId: number, funcaoId: number) {
  const m = await membroDoLider(db, ator, membroId);
  const [f] = await db
    .select({ id: t.funcoes.id })
    .from(t.funcoes)
    .where(
      and(
        eq(t.funcoes.id, funcaoId),
        eq(t.funcoes.ministerioId, m.ministerioId),
        eq(t.funcoes.igrejaId, ator.igrejaId),
      ),
    )
    .limit(1);
  if (!f) throw new ErroAcesso("Função de outro ministério");
  return m;
}

/** Aprova uma função desejada; o membro também passa a `aprovado`. */
export async function aprovarFuncao(db: AnyDb, ator: Ator, membroId: number, funcaoId: number) {
  const m = await funcaoDoMembro(db, ator, membroId, funcaoId);
  await db
    .update(t.membroFuncoes)
    .set({ status: "aprovada" })
    .where(and(eq(t.membroFuncoes.membroId, m.id), eq(t.membroFuncoes.funcaoId, funcaoId)));
  await db
    .update(t.membrosMinisterio)
    .set({ status: "aprovado" })
    .where(eq(t.membrosMinisterio.id, m.id));
}

/** Recusa uma função: remove apenas a `desejada` (a `aprovada` fica). */
export async function recusarFuncao(db: AnyDb, ator: Ator, membroId: number, funcaoId: number) {
  const m = await funcaoDoMembro(db, ator, membroId, funcaoId);
  await db
    .delete(t.membroFuncoes)
    .where(
      and(
        eq(t.membroFuncoes.membroId, m.id),
        eq(t.membroFuncoes.funcaoId, funcaoId),
        eq(t.membroFuncoes.status, "desejada"),
      ),
    );
}

/** Por função do ministério: quantas pessoas desejam e ainda não foram aprovadas. */
export async function recomendacoes(db: AnyDb, ator: Ator, ministerioId: number) {
  await exigirLider(db, ator, ministerioId);
  const linhas = await db
    .select({
      funcaoId: t.funcoes.id,
      funcao: t.funcoes.nome,
      desejam: sql<number>`count(${t.membroFuncoes.membroId}) filter (where ${t.membroFuncoes.status} = 'desejada')`.mapWith(
        Number,
      ),
    })
    .from(t.funcoes)
    .leftJoin(t.membroFuncoes, eq(t.membroFuncoes.funcaoId, t.funcoes.id))
    .where(and(eq(t.funcoes.ministerioId, ministerioId), eq(t.funcoes.igrejaId, ator.igrejaId)))
    .groupBy(t.funcoes.id, t.funcoes.nome)
    .orderBy(asc(t.funcoes.nome));
  return linhas;
}
