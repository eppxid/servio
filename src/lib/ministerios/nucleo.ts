import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { SENHA_MINIMA, hashSenha, normalizarEmail, temPapel, type AnyDb } from "@/lib/auth-core";
import { TERMOS_VERSAO } from "@/lib/lgpd/termos";

export const VALIDADE_CONVITE_MS = 14 * 24 * 60 * 60 * 1000;

export interface Ator {
  id: number;
  igrejaId: number;
  papelGlobal: "admin" | "lider" | "voluntario";
}

export class ErroAcesso extends Error {
  constructor(msg = "Acesso negado") {
    super(msg);
  }
}

async function exigirAdmin(db: AnyDb, ator: Ator) {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
}

async function exigirLider(db: AnyDb, ator: Ator, ministerioId: number) {
  const ministerio = await ministerioDaIgreja(db, ator.igrejaId, ministerioId);
  if (!ministerio || !(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  return ministerio;
}

export async function ministerioDaIgreja(db: AnyDb, igrejaId: number, id: number) {
  const [m] = await db
    .select()
    .from(t.ministerios)
    .where(and(eq(t.ministerios.id, id), eq(t.ministerios.igrejaId, igrejaId)))
    .limit(1);
  return m ?? null;
}

// ---- ministérios (admin) ----

export async function criarMinisterio(db: AnyDb, ator: Ator, nome: string, descricao?: string) {
  await exigirAdmin(db, ator);
  const [m] = await db
    .insert(t.ministerios)
    .values({ igrejaId: ator.igrejaId, nome, descricao: descricao || null })
    .returning();
  return m;
}

export async function editarMinisterio(
  db: AnyDb,
  ator: Ator,
  id: number,
  dados: { nome: string; descricao?: string },
) {
  await exigirAdmin(db, ator);
  await db
    .update(t.ministerios)
    .set({ nome: dados.nome, descricao: dados.descricao || null })
    .where(and(eq(t.ministerios.id, id), eq(t.ministerios.igrejaId, ator.igrejaId)));
}

export async function arquivarMinisterio(db: AnyDb, ator: Ator, id: number, arquivar: boolean) {
  await exigirAdmin(db, ator);
  await db
    .update(t.ministerios)
    .set({ arquivadoEm: arquivar ? new Date() : null })
    .where(and(eq(t.ministerios.id, id), eq(t.ministerios.igrejaId, ator.igrejaId)));
}

/** Admin define (ou remove) o líder de um ministério. O usuário precisa ser da mesma igreja. */
export async function definirLider(
  db: AnyDb,
  ator: Ator,
  ministerioId: number,
  usuarioId: number,
  lider: boolean,
) {
  await exigirAdmin(db, ator);
  if (!(await ministerioDaIgreja(db, ator.igrejaId, ministerioId))) throw new ErroAcesso();
  const [u] = await db
    .select({ id: t.usuarios.id })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.id, usuarioId), eq(t.usuarios.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!u) throw new ErroAcesso();
  await db
    .insert(t.membrosMinisterio)
    .values({
      igrejaId: ator.igrejaId,
      usuarioId,
      ministerioId,
      papel: lider ? "lider" : "voluntario",
      status: "aprovado",
    })
    .onConflictDoUpdate({
      target: [t.membrosMinisterio.usuarioId, t.membrosMinisterio.ministerioId],
      set: { papel: lider ? "lider" : "voluntario", status: "aprovado" },
    });
}

// ---- funções (líder) ----

export async function criarFuncao(db: AnyDb, ator: Ator, ministerioId: number, nome: string) {
  await exigirLider(db, ator, ministerioId);
  await db.insert(t.funcoes).values({ igrejaId: ator.igrejaId, ministerioId, nome });
}

async function funcaoDoLider(db: AnyDb, ator: Ator, id: number) {
  const [f] = await db
    .select()
    .from(t.funcoes)
    .where(and(eq(t.funcoes.id, id), eq(t.funcoes.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!f) throw new ErroAcesso();
  await exigirLider(db, ator, f.ministerioId);
  return f;
}

export async function renomearFuncao(db: AnyDb, ator: Ator, id: number, nome: string) {
  await funcaoDoLider(db, ator, id);
  await db.update(t.funcoes).set({ nome }).where(eq(t.funcoes.id, id));
}

export async function excluirFuncao(db: AnyDb, ator: Ator, id: number) {
  await funcaoDoLider(db, ator, id);
  await db.delete(t.membroFuncoes).where(eq(t.membroFuncoes.funcaoId, id));
  await db.delete(t.funcoes).where(eq(t.funcoes.id, id));
}

// ---- convite ----

export function novoToken(): string {
  return randomBytes(32).toString("hex");
}

export async function gerarConvite(
  db: AnyDb,
  ator: Ator,
  ministerioId: number,
  agora: Date = new Date(),
) {
  await exigirLider(db, ator, ministerioId);
  const token = novoToken();
  await db.insert(t.convites).values({
    igrejaId: ator.igrejaId,
    ministerioId,
    token,
    expiraEm: new Date(agora.getTime() + VALIDADE_CONVITE_MS),
  });
  return token;
}

/** Convite válido (existe e não expirou) com o nome do ministério; senão null. */
export async function conviteValido(db: AnyDb, token: string, agora: Date = new Date()) {
  const [c] = await db
    .select({
      igrejaId: t.convites.igrejaId,
      ministerioId: t.convites.ministerioId,
      ministerio: t.ministerios.nome,
    })
    .from(t.convites)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.convites.ministerioId))
    .where(
      and(
        eq(t.convites.token, token),
        gt(t.convites.expiraEm, agora),
        isNull(t.ministerios.arquivadoEm),
      ),
    )
    .limit(1);
  return c ?? null;
}

export type ResultadoConvite = { ok: true } | { ok: false; motivo: "invalido" | "email_em_uso" | "sem_consentimento" };

async function entrarNoMinisterio(db: AnyDb, igrejaId: number, ministerioId: number, usuarioId: number) {
  await db
    .insert(t.membrosMinisterio)
    .values({ igrejaId, usuarioId, ministerioId, papel: "voluntario", status: "pendente" })
    .onConflictDoNothing();
}

/** Usuário já logado aceita o convite: vira membro pendente (sem rebaixar quem já é membro). */
export async function aceitarConvite(
  db: AnyDb,
  usuario: Ator,
  token: string,
  agora: Date = new Date(),
): Promise<ResultadoConvite> {
  const c = await conviteValido(db, token, agora);
  if (!c || c.igrejaId !== usuario.igrejaId) return { ok: false, motivo: "invalido" };
  await entrarNoMinisterio(db, c.igrejaId, c.ministerioId, usuario.id);
  return { ok: true };
}

/**
 * Quem não tem conta cria uma e já entra como pendente. Devolve o usuário criado.
 * Sem o consentimento destacado (LGPD art. 11 I) o cadastro é recusado.
 */
export async function cadastrarPorConvite(
  db: AnyDb,
  token: string,
  dados: { nome: string; email: string; telefone?: string; senha: string; consentimento: boolean },
  agora: Date = new Date(),
) {
  if (dados.senha.length < SENHA_MINIMA) throw new Error("Senha curta demais");
  if (!dados.consentimento) return { ok: false as const, motivo: "sem_consentimento" as const };
  const c = await conviteValido(db, token, agora);
  if (!c) return { ok: false as const, motivo: "invalido" as const };
  const email = normalizarEmail(dados.email);
  const [existe] = await db
    .select({ id: t.usuarios.id })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.igrejaId, c.igrejaId), eq(t.usuarios.email, email)))
    .limit(1);
  if (existe) return { ok: false as const, motivo: "email_em_uso" as const };
  const senhaHash = await hashSenha(dados.senha);
  const usuario = await db.transaction(async (tx) => {
    const [novo] = await tx
      .insert(t.usuarios)
      .values({
        igrejaId: c.igrejaId,
        nome: dados.nome,
        email,
        telefone: dados.telefone || null,
        senhaHash,
        consentimentoEm: agora,
        termosVersao: TERMOS_VERSAO,
      })
      .returning();
    await entrarNoMinisterio(tx as unknown as AnyDb, c.igrejaId, c.ministerioId, novo.id);
    return novo;
  });
  return { ok: true as const, usuario };
}

// ---- membros (líder) ----

async function membroDoLider(db: AnyDb, ator: Ator, membroId: number) {
  const [m] = await db
    .select()
    .from(t.membrosMinisterio)
    .where(and(eq(t.membrosMinisterio.id, membroId), eq(t.membrosMinisterio.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!m) throw new ErroAcesso();
  await exigirLider(db, ator, m.ministerioId);
  return m;
}

/** Aprova (com as funções marcadas) ou recusa (remove o pedido). */
export async function decidirMembro(
  db: AnyDb,
  ator: Ator,
  membroId: number,
  aprovar: boolean,
  funcaoIds: number[] = [],
) {
  const m = await membroDoLider(db, ator, membroId);
  if (!aprovar) {
    await db.delete(t.membroFuncoes).where(eq(t.membroFuncoes.membroId, m.id));
    await db.delete(t.membrosMinisterio).where(eq(t.membrosMinisterio.id, m.id));
    return;
  }
  await definirFuncoesDoMembro(db, ator, m.id, funcaoIds);
  await db
    .update(t.membrosMinisterio)
    .set({ status: "aprovado" })
    .where(eq(t.membrosMinisterio.id, m.id));
}

/** Só aceita funções do mesmo ministério do membro (valida o perfil). */
export async function definirFuncoesDoMembro(
  db: AnyDb,
  ator: Ator,
  membroId: number,
  funcaoIds: number[],
) {
  const m = await membroDoLider(db, ator, membroId);
  const ids = [...new Set(funcaoIds)];
  if (ids.length) {
    const validas = await db
      .select({ id: t.funcoes.id })
      .from(t.funcoes)
      .where(and(inArray(t.funcoes.id, ids), eq(t.funcoes.ministerioId, m.ministerioId)));
    if (validas.length !== ids.length) throw new ErroAcesso("Função de outro ministério");
  }
  await db.delete(t.membroFuncoes).where(eq(t.membroFuncoes.membroId, m.id));
  if (ids.length) {
    await db
      .insert(t.membroFuncoes)
      .values(ids.map((funcaoId) => ({ igrejaId: ator.igrejaId, membroId: m.id, funcaoId })));
  }
}

/** Líder define senha temporária; o membro troca no próximo acesso e as sessões abertas caem. */
export async function definirSenhaTemporaria(
  db: AnyDb,
  ator: Ator,
  membroId: number,
  senha: string,
) {
  if (senha.length < SENHA_MINIMA) throw new Error("Senha curta demais");
  const m = await membroDoLider(db, ator, membroId);
  await db
    .update(t.usuarios)
    .set({
      senhaHash: await hashSenha(senha),
      trocarSenha: true,
      sessaoVersao: sql`${t.usuarios.sessaoVersao} + 1`,
    })
    .where(and(eq(t.usuarios.id, m.usuarioId), eq(t.usuarios.igrejaId, ator.igrejaId)));
}

/** Troca feita pelo próprio usuário: grava a senha nova, limpa a flag e devolve a nova versão da sessão. */
export async function trocarSenhaObrigatoria(db: AnyDb, usuarioId: number, senha: string) {
  if (senha.length < SENHA_MINIMA) throw new Error("Senha curta demais");
  const [u] = await db
    .update(t.usuarios)
    .set({
      senhaHash: await hashSenha(senha),
      trocarSenha: false,
      sessaoVersao: sql`${t.usuarios.sessaoVersao} + 1`,
    })
    .where(eq(t.usuarios.id, usuarioId))
    .returning({ sessaoVersao: t.usuarios.sessaoVersao });
  return u.sessaoVersao;
}

// ---- leitura ----

export async function listarMinisterios(db: AnyDb, ator: Ator) {
  return db
    .select()
    .from(t.ministerios)
    .where(eq(t.ministerios.igrejaId, ator.igrejaId))
    .orderBy(asc(t.ministerios.nome));
}

export async function detalheMinisterio(db: AnyDb, ator: Ator, ministerioId: number) {
  const ministerio = await ministerioDaIgreja(db, ator.igrejaId, ministerioId);
  if (!ministerio) return null;
  const lider = await temPapel(db, ator, "lider", ministerioId);
  const funcoes = await db
    .select()
    .from(t.funcoes)
    .where(eq(t.funcoes.ministerioId, ministerioId))
    .orderBy(asc(t.funcoes.nome));
  if (!lider) return { ministerio, lider, funcoes, membros: [] };

  const linhas = await db
    .select({
      id: t.membrosMinisterio.id,
      status: t.membrosMinisterio.status,
      papel: t.membrosMinisterio.papel,
      nome: t.usuarios.nome,
      email: t.usuarios.email,
      telefone: t.usuarios.telefone,
    })
    .from(t.membrosMinisterio)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(eq(t.membrosMinisterio.ministerioId, ministerioId))
    .orderBy(asc(t.usuarios.nome));
  const marcadas = await db
    .select({ membroId: t.membroFuncoes.membroId, funcaoId: t.membroFuncoes.funcaoId })
    .from(t.membroFuncoes)
    // Só as aprovadas: as `desejada` aparecem na aba Pedidos.
    .where(
      and(
        inArray(t.membroFuncoes.membroId, linhas.length ? linhas.map((l) => l.id) : [0]),
        eq(t.membroFuncoes.status, "aprovada"),
      ),
    );
  const membros = linhas.map((l) => ({
    ...l,
    funcaoIds: marcadas.filter((x) => x.membroId === l.id).map((x) => x.funcaoId),
  }));
  return { ministerio, lider, funcoes, membros };
}
