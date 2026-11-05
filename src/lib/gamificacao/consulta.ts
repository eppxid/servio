import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import * as t from "@/db/schema";
import { reconhecimentos } from "@/db/schema-gamificacao";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { limitesDoMes } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { enviarParaUsuarios, type EnviadorPush } from "@/lib/push/enviar";
import { enviadorWebPush } from "@/lib/push/web";
import { FUSO } from "@/lib/recorrencia";
import { calcularMedalhas } from "./medalhas";
import { calcularPontos, lancamentosDe, type ItemHistorico, type Lancamento } from "./pontos";
import { montarRanking, type LinhaRanking } from "./ranking";

export const MAX_TEXTO_RECONHECIMENTO = 280;

export class ErroReconhecimento extends Error {}

interface LinhaItem extends ItemHistorico {
  usuarioId: number;
  ministerioId: number;
}
interface LinhaTroca {
  substitutoId: number;
  ministerioId: number;
  eventoInicio: Date;
}
interface Filtro {
  usuarioId?: number;
  ministerioIds?: number[];
  de?: Date;
  ate?: Date;
}

/** Itens de escalas publicadas, já com o início do evento. */
async function itensDe(db: AnyDb, igrejaId: number, f: Filtro) {
  const cond = [
    eq(t.escalas.igrejaId, igrejaId),
    eq(t.escalas.status, "publicada"),
    sql`${t.escalaItens.usuarioId} is not null`,
  ];
  if (f.usuarioId !== undefined) cond.push(eq(t.escalaItens.usuarioId, f.usuarioId));
  if (f.ministerioIds) cond.push(inArray(t.escalas.ministerioId, f.ministerioIds.length ? f.ministerioIds : [0]));
  if (f.de) cond.push(gte(t.eventos.inicio, f.de));
  if (f.ate) cond.push(lt(t.eventos.inicio, f.ate));
  const linhas = await db
    .select({
      usuarioId: t.escalaItens.usuarioId,
      ministerioId: t.escalas.ministerioId,
      eventoInicio: t.eventos.inicio,
      status: t.escalaItens.status,
      checkinEm: t.escalaItens.checkinEm,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(and(...cond));
  return linhas as LinhaItem[];
}

/** Trocas aceitas pelo substituto (aceita ou já aprovada). */
async function trocasDe(db: AnyDb, igrejaId: number, f: Filtro) {
  const cond = [
    eq(t.trocas.igrejaId, igrejaId),
    inArray(t.trocas.status, ["aceita", "aprovada"]),
    sql`${t.trocas.substitutoId} is not null`,
  ];
  if (f.usuarioId !== undefined) cond.push(eq(t.trocas.substitutoId, f.usuarioId));
  if (f.ministerioIds) cond.push(inArray(t.escalas.ministerioId, f.ministerioIds.length ? f.ministerioIds : [0]));
  if (f.de) cond.push(gte(t.eventos.inicio, f.de));
  if (f.ate) cond.push(lt(t.eventos.inicio, f.ate));
  const linhas = await db
    .select({
      substitutoId: t.trocas.substitutoId,
      ministerioId: t.escalas.ministerioId,
      eventoInicio: t.eventos.inicio,
    })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(and(...cond));
  return linhas as LinhaTroca[];
}

/** Pontos e medalhas de um usuário, somando todos os ministérios. */
export async function resumoDoUsuario(db: AnyDb, ator: Ator) {
  const itens = await itensDe(db, ator.igrejaId, { usuarioId: ator.id });
  const trocasEm = (await trocasDe(db, ator.igrejaId, { usuarioId: ator.id })).map((x) => x.eventoInicio);
  const pontos = calcularPontos(lancamentosDe(itens, trocasEm));
  const medalhas = calcularMedalhas({
    confirmadas: itens.filter((i) => i.status === "confirmado").map((i) => i.eventoInicio),
    presencas: itens.filter((i) => i.status !== "recusado" && i.checkinEm).map((i) => i.eventoInicio),
    trocasSubstituto: trocasEm,
  });
  return { pontos, medalhas };
}

export function mesAtual(agora: Date): string {
  return formatInTimeZone(agora, FUSO, "yyyy-MM");
}

/** Ministérios onde o usuário é membro aprovado. */
async function ministeriosDoMembro(db: AnyDb, ator: Ator) {
  return db
    .select({ id: t.ministerios.id, nome: t.ministerios.nome })
    .from(t.membrosMinisterio)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.membrosMinisterio.ministerioId))
    .where(
      and(
        eq(t.membrosMinisterio.usuarioId, ator.id),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
        eq(t.membrosMinisterio.status, "aprovado"),
        isNull(t.ministerios.arquivadoEm),
      ),
    )
    .orderBy(asc(t.ministerios.nome));
}

/** Ranking do mês de um ministério em que o ator é membro aprovado; outro ministério = acesso negado. */
export async function rankingDoMinisterio(db: AnyDb, ator: Ator, ministerioId: number, mes: string) {
  const meus = await ministeriosDoMembro(db, ator);
  if (!meus.some((m) => m.id === ministerioId)) throw new ErroAcesso();
  const { de, ate } = limitesDoMes(mes);
  const membros = await db
    .select({
      usuarioId: t.usuarios.id,
      nome: t.usuarios.nome,
      aparecerNoRanking: t.usuarios.aparecerNoRanking,
    })
    .from(t.membrosMinisterio)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(
      and(
        eq(t.membrosMinisterio.ministerioId, ministerioId),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
        eq(t.membrosMinisterio.status, "aprovado"),
        isNull(t.usuarios.anonimizadoEm),
      ),
    );
  const itens = await itensDe(db, ator.igrejaId, { ministerioIds: [ministerioId], de, ate });
  const trocas = await trocasDe(db, ator.igrejaId, { ministerioIds: [ministerioId], de, ate });
  const linhas: LinhaRanking[] = membros.map((m) => {
    const lanc: Lancamento[] = lancamentosDe(
      itens.filter((i) => i.usuarioId === m.usuarioId),
      trocas.filter((x) => x.substitutoId === m.usuarioId).map((x) => x.eventoInicio),
    );
    return { ...m, pontos: calcularPontos(lanc) };
  });
  return montarRanking(linhas, ator.id);
}

export async function carregarReconhecimento(db: AnyDb, ator: Ator, agora = new Date()) {
  const mes = mesAtual(agora);
  const resumo = await resumoDoUsuario(db, ator);
  const rankings = [];
  for (const m of await ministeriosDoMembro(db, ator)) {
    rankings.push({ ministerio: m, ...(await rankingDoMinisterio(db, ator, m.id, mes)) });
  }
  const recebidos = await db
    .select({
      id: reconhecimentos.id,
      texto: reconhecimentos.texto,
      criadoEm: reconhecimentos.criadoEm,
      de: t.usuarios.nome,
      ministerio: t.ministerios.nome,
    })
    .from(reconhecimentos)
    .innerJoin(t.usuarios, eq(t.usuarios.id, reconhecimentos.deUsuario))
    .innerJoin(t.ministerios, eq(t.ministerios.id, reconhecimentos.ministerioId))
    .where(and(eq(reconhecimentos.paraUsuario, ator.id), eq(reconhecimentos.igrejaId, ator.igrejaId)))
    .orderBy(desc(reconhecimentos.criadoEm))
    .limit(50);
  const aparecerNoRanking = await lerAparecerNoRanking(db, ator);
  return { mes, ...resumo, rankings, recebidos, aparecerNoRanking };
}

export async function lerAparecerNoRanking(db: AnyDb, ator: Ator): Promise<boolean> {
  const [eu] = await db
    .select({ aparecer: t.usuarios.aparecerNoRanking })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.id, ator.id), eq(t.usuarios.igrejaId, ator.igrejaId)));
  return eu?.aparecer ?? true;
}

export async function definirAparecerNoRanking(db: AnyDb, ator: Ator, aparecer: boolean) {
  await db
    .update(t.usuarios)
    .set({ aparecerNoRanking: aparecer })
    .where(and(eq(t.usuarios.id, ator.id), eq(t.usuarios.igrejaId, ator.igrejaId)));
}

/**
 * O líder do ministério agradece a um membro aprovado (identificado pelo id do vínculo).
 * Devolve o id do usuário agradecido. Falha no aviso por Web Push não derruba o envio.
 */
export async function enviarReconhecimento(
  db: AnyDb,
  ator: Ator,
  ministerioId: number,
  membroId: number,
  textoBruto: string,
  enviar: EnviadorPush | null = enviadorWebPush(),
) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  const [vinculo] = await db
    .select({ usuarioId: t.membrosMinisterio.usuarioId })
    .from(t.membrosMinisterio)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.membrosMinisterio.ministerioId))
    .where(
      and(
        eq(t.membrosMinisterio.id, membroId),
        eq(t.membrosMinisterio.ministerioId, ministerioId),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
        eq(t.ministerios.igrejaId, ator.igrejaId),
        eq(t.membrosMinisterio.status, "aprovado"),
      ),
    )
    .limit(1);
  if (!vinculo) throw new ErroAcesso();
  if (vinculo.usuarioId === ator.id) throw new ErroReconhecimento("Você não pode agradecer a si mesmo");
  const texto = textoBruto.trim();
  if (texto.length === 0) throw new ErroReconhecimento("Escreva o agradecimento");
  if (texto.length > MAX_TEXTO_RECONHECIMENTO) {
    throw new ErroReconhecimento(`O texto passa de ${MAX_TEXTO_RECONHECIMENTO} caracteres`);
  }
  await db.insert(reconhecimentos).values({
    igrejaId: ator.igrejaId,
    ministerioId,
    deUsuario: ator.id,
    paraUsuario: vinculo.usuarioId,
    texto,
  });
  if (enviar) {
    try {
      await enviarParaUsuarios(
        db,
        ator.igrejaId,
        [vinculo.usuarioId],
        { titulo: "Você recebeu um agradecimento", corpo: "Veja o recado do seu líder", url: "/reconhecimento" },
        enviar,
      );
    } catch (e) {
      console.error("reconhecimento: falha no aviso", (e as Error)?.message);
    }
  }
  return vinculo.usuarioId;
}
