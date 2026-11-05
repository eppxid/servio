import { and, asc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { estaIndisponivel, indisponiveisNoPeriodo } from "@/lib/disponibilidade";
import { DURACAO_PADRAO_MS, temConflito, type Ocupacao } from "@/lib/escala/regras";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";

export class ErroTroca extends Error {}

/** Check-in abre 2 h antes do início e fecha no fim do evento. */
export const ANTECEDENCIA_CHECKIN_MS = 2 * 60 * 60 * 1000;

interface Janela {
  inicio: Date;
  fim: Date | null;
}

export function fimDoEvento(e: Janela): Date {
  return e.fim ?? new Date(e.inicio.getTime() + DURACAO_PADRAO_MS);
}

/** Diz se `agora` está dentro da janela de check-in do evento. */
export function checkinAberto(e: Janela, agora: Date): boolean {
  return (
    agora.getTime() >= e.inicio.getTime() - ANTECEDENCIA_CHECKIN_MS &&
    agora.getTime() <= fimDoEvento(e).getTime()
  );
}

/** Item escalado do próprio ator, em escala publicada. Qualquer outro caso é acesso negado. */
async function itemDoAtor(db: AnyDb, ator: Ator, itemId: number) {
  const [linha] = await db
    .select({ item: t.escalaItens, escala: t.escalas, evento: t.eventos })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalaItens.id, itemId),
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        eq(t.escalaItens.usuarioId, ator.id),
        eq(t.escalas.status, "publicada"),
      ),
    )
    .limit(1);
  if (!linha) throw new ErroAcesso();
  return linha;
}

// ---- agenda ----

/** Próximas escalas publicadas do ator, com os colegas (só nome) e a troca em aberto. */
export async function agendaDoUsuario(db: AnyDb, ator: Ator, agora = new Date()) {
  const minhas = await db
    .select({
      itemId: t.escalaItens.id,
      status: t.escalaItens.status,
      checkinEm: t.escalaItens.checkinEm,
      escalaId: t.escalas.id,
      ministerio: t.ministerios.nome,
      funcao: t.funcoes.nome,
      evento: t.eventos,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        eq(t.escalaItens.usuarioId, ator.id),
        eq(t.escalas.status, "publicada"),
        gte(t.eventos.inicio, new Date(agora.getTime() - DURACAO_PADRAO_MS * 12)),
      ),
    )
    .orderBy(asc(t.eventos.inicio));
  // Mantém o evento em curso: só some depois do fim.
  const vivas = minhas.filter((m) => fimDoEvento(m.evento).getTime() >= agora.getTime());
  if (vivas.length === 0) return [];

  const colegas = await db
    .select({ escalaId: t.escalaItens.escalaId, nome: t.usuarios.nome, funcao: t.funcoes.nome })
    .from(t.escalaItens)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.escalaItens.usuarioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        inArray(t.escalaItens.escalaId, [...new Set(vivas.map((v) => v.escalaId))]),
        ne(t.escalaItens.usuarioId, ator.id),
        ne(t.escalaItens.status, "recusado"),
        isNull(t.usuarios.anonimizadoEm),
      ),
    )
    .orderBy(asc(t.funcoes.nome), asc(t.usuarios.nome));
  const trocas = await db
    .select()
    .from(t.trocas)
    .where(
      and(
        eq(t.trocas.igrejaId, ator.igrejaId),
        inArray(t.trocas.escalaItemId, vivas.map((v) => v.itemId)),
        inArray(t.trocas.status, ["aberta", "aceita"]),
      ),
    );
  return vivas.map((v) => ({
    ...v,
    colegas: colegas.filter((c) => c.escalaId === v.escalaId),
    troca: trocas.find((x) => x.escalaItemId === v.itemId) ?? null,
    checkinAberto: checkinAberto(v.evento, agora),
  }));
}

/** Confirma ou recusa a própria escala. */
export async function responderEscala(db: AnyDb, ator: Ator, itemId: number, aceitar: boolean) {
  const { item, evento } = await itemDoAtor(db, ator, itemId);
  if (fimDoEvento(evento).getTime() < Date.now()) throw new ErroTroca("O evento já terminou");
  await db
    .update(t.escalaItens)
    .set({ status: aceitar ? "confirmado" : "recusado", checkinEm: aceitar ? item.checkinEm : null })
    .where(eq(t.escalaItens.id, item.id));
}

/** Registra a presença. Só dentro da janela de check-in e em item não recusado. */
export async function fazerCheckin(db: AnyDb, ator: Ator, itemId: number, agora = new Date()) {
  const { item, evento } = await itemDoAtor(db, ator, itemId);
  if (item.status === "recusado") throw new ErroTroca("Você recusou esta escala");
  if (!checkinAberto(evento, agora)) {
    throw new ErroTroca("O check-in abre 2 horas antes do evento e fecha no fim dele");
  }
  if (item.checkinEm) return;
  await db
    .update(t.escalaItens)
    .set({ checkinEm: agora, status: "confirmado" })
    .where(eq(t.escalaItens.id, item.id));
}

// ---- troca ----

export interface Substituto {
  usuarioId: number;
  nome: string;
}

/**
 * Colegas que podem assumir o item: mesma função no mesmo ministério, aprovados,
 * disponíveis e sem outro compromisso sobreposto (inclui o mesmo evento em outra função).
 */
async function substitutosElegiveis(
  db: AnyDb,
  item: typeof t.escalaItens.$inferSelect,
  escala: typeof t.escalas.$inferSelect,
  evento: typeof t.eventos.$inferSelect,
): Promise<Substituto[]> {
  const candidatos = await db
    .select({ usuarioId: t.membrosMinisterio.usuarioId, nome: t.usuarios.nome })
    .from(t.membroFuncoes)
    .innerJoin(t.membrosMinisterio, eq(t.membrosMinisterio.id, t.membroFuncoes.membroId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(
      and(
        eq(t.membroFuncoes.funcaoId, item.funcaoId),
        eq(t.membrosMinisterio.igrejaId, item.igrejaId),
        eq(t.membrosMinisterio.ministerioId, escala.ministerioId),
        eq(t.membrosMinisterio.status, "aprovado"),
        isNull(t.usuarios.anonimizadoEm),
      ),
    )
    .orderBy(asc(t.usuarios.nome));
  if (candidatos.length === 0) return [];

  const indisp = await indisponiveisNoPeriodo(escala.ministerioId, evento.inicio, evento.fim, db);
  const linhas = await db
    .select({
      usuarioId: t.escalaItens.usuarioId,
      eventoId: t.eventos.id,
      inicio: t.eventos.inicio,
      fim: t.eventos.fim,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, item.igrejaId),
        ne(t.escalaItens.status, "recusado"),
        gte(t.eventos.inicio, new Date(evento.inicio.getTime() - DURACAO_PADRAO_MS * 12)),
        lt(t.eventos.inicio, fimDoEvento(evento)),
      ),
    );
  const ocupacoes = linhas.filter((l): l is Ocupacao => l.usuarioId !== null);
  return candidatos
    .filter((c) => c.usuarioId !== item.usuarioId)
    .filter((c) => !estaIndisponivel(c.usuarioId, evento.inicio, evento.fim, indisp))
    .filter((c) => !temConflito(c.usuarioId, evento, ocupacoes));
}

/** Lista quem pode substituir o ator naquele item (só nome). */
export async function listarSubstitutos(db: AnyDb, ator: Ator, itemId: number): Promise<Substituto[]> {
  const { item, escala, evento } = await itemDoAtor(db, ator, itemId);
  return substitutosElegiveis(db, item, escala, evento);
}

async function trocaAtiva(db: AnyDb, itemId: number) {
  const [x] = await db
    .select()
    .from(t.trocas)
    .where(and(eq(t.trocas.escalaItemId, itemId), inArray(t.trocas.status, ["aberta", "aceita"])))
    .limit(1);
  return x ?? null;
}

/** O titular pede troca indicando um substituto elegível; o substituto é avisado. */
export async function pedirTroca(db: AnyDb, ator: Ator, itemId: number, substitutoId: number, agora = new Date()) {
  const { item, escala, evento } = await itemDoAtor(db, ator, itemId);
  if (fimDoEvento(evento).getTime() < agora.getTime()) throw new ErroTroca("O evento já terminou");
  if (await trocaAtiva(db, item.id)) throw new ErroTroca("Já existe um pedido de troca para esta escala");
  const elegiveis = await substitutosElegiveis(db, item, escala, evento);
  if (!elegiveis.some((e) => e.usuarioId === substitutoId)) {
    throw new ErroTroca("Esse voluntário não pode assumir a vaga");
  }
  await db.insert(t.trocas).values({
    igrejaId: ator.igrejaId,
    escalaItemId: item.id,
    solicitanteId: ator.id,
    substitutoId,
    status: "aberta",
  });
  await notificar({ tipo: "troca_pedida", eventoId: evento.id, usuarioIds: [substitutoId] });
}

async function trocaCompleta(db: AnyDb, igrejaId: number, trocaId: number) {
  const [linha] = await db
    .select({
      troca: t.trocas,
      item: t.escalaItens,
      escala: t.escalas,
      evento: t.eventos,
      auto: t.ministerios.trocaAutomatica,
    })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .where(and(eq(t.trocas.id, trocaId), eq(t.trocas.igrejaId, igrejaId)))
    .limit(1);
  if (!linha) throw new ErroAcesso();
  return linha;
}

/** Passa o item para o substituto, depois de conferir de novo se ele ainda pode assumir. */
async function efetivar(db: AnyDb, c: Awaited<ReturnType<typeof trocaCompleta>>) {
  const { troca, item, escala, evento } = c;
  const substitutoId = troca.substitutoId;
  if (!substitutoId || item.usuarioId !== troca.solicitanteId) {
    throw new ErroTroca("A escala mudou; peça a troca de novo");
  }
  const elegiveis = await substitutosElegiveis(db, item, escala, evento);
  if (!elegiveis.some((e) => e.usuarioId === substitutoId)) {
    throw new ErroTroca("O substituto não pode mais assumir a vaga");
  }
  await db.transaction(async (txBruto) => {
    const tx = txBruto as unknown as AnyDb;
    await tx
      .update(t.escalaItens)
      .set({ usuarioId: substitutoId, status: "pendente", checkinEm: null })
      .where(eq(t.escalaItens.id, item.id));
    await tx.update(t.trocas).set({ status: "aprovada" }).where(eq(t.trocas.id, troca.id));
  });
  await notificar({
    tipo: "troca_aprovada",
    eventoId: evento.id,
    usuarioIds: [troca.solicitanteId, substitutoId],
  });
}

/** O substituto aceita ou recusa. Aceitar aprova na hora se o ministério usa aprovação automática. */
export async function responderTroca(db: AnyDb, ator: Ator, trocaId: number, aceitar: boolean) {
  const c = await trocaCompleta(db, ator.igrejaId, trocaId);
  if (c.troca.substitutoId !== ator.id) throw new ErroAcesso();
  if (c.troca.status !== "aberta") throw new ErroTroca("Este pedido não está mais aberto");
  if (!aceitar) {
    await db.update(t.trocas).set({ status: "recusada" }).where(eq(t.trocas.id, c.troca.id));
    await notificar({ tipo: "troca_recusada", eventoId: c.evento.id, usuarioIds: [c.troca.solicitanteId] });
    return;
  }
  await db.update(t.trocas).set({ status: "aceita" }).where(eq(t.trocas.id, c.troca.id));
  await notificar({ tipo: "troca_aceita", eventoId: c.evento.id, usuarioIds: [c.troca.solicitanteId] });
  if (c.auto) await efetivar(db, { ...c, troca: { ...c.troca, status: "aceita" } });
}

/** Líder do ministério aprova ou recusa uma troca já aceita pelo substituto. */
export async function decidirTroca(db: AnyDb, ator: Ator, trocaId: number, aprovar: boolean) {
  const c = await trocaCompleta(db, ator.igrejaId, trocaId);
  if (!(await temPapel(db, ator, "lider", c.escala.ministerioId))) throw new ErroAcesso();
  if (c.troca.status !== "aceita") throw new ErroTroca("O substituto ainda não aceitou");
  if (!aprovar) {
    await db.update(t.trocas).set({ status: "recusada" }).where(eq(t.trocas.id, c.troca.id));
    await notificar({
      tipo: "troca_recusada",
      eventoId: c.evento.id,
      usuarioIds: [c.troca.solicitanteId, ...(c.troca.substitutoId ? [c.troca.substitutoId] : [])],
    });
    return;
  }
  await efetivar(db, c);
}

/** Trocas aceitas pelo substituto que esperam o líder (só dos ministérios que ele lidera). */
export async function trocasParaAprovar(db: AnyDb, ator: Ator) {
  const linhas = await db
    .select({
      id: t.trocas.id,
      ministerioId: t.escalas.ministerioId,
      ministerio: t.ministerios.nome,
      funcao: t.funcoes.nome,
      titulo: t.eventos.titulo,
      inicio: t.eventos.inicio,
      solicitanteId: t.trocas.solicitanteId,
      substitutoId: t.trocas.substitutoId,
    })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(and(eq(t.trocas.igrejaId, ator.igrejaId), eq(t.trocas.status, "aceita")))
    .orderBy(asc(t.eventos.inicio));
  const permitidas: typeof linhas = [];
  for (const l of linhas) {
    if (await temPapel(db, ator, "lider", l.ministerioId)) permitidas.push(l);
  }
  if (permitidas.length === 0) return [];
  const ids = [...new Set(permitidas.flatMap((l) => [l.solicitanteId, l.substitutoId ?? 0]))];
  const nomes = new Map(
    (await db.select({ id: t.usuarios.id, nome: t.usuarios.nome }).from(t.usuarios).where(inArray(t.usuarios.id, ids))).map(
      (u) => [u.id, u.nome],
    ),
  );
  return permitidas.map((l) => ({
    ...l,
    solicitante: nomes.get(l.solicitanteId) ?? "",
    substituto: nomes.get(l.substitutoId ?? 0) ?? "",
  }));
}

/** Trocas abertas em que o ator é o substituto indicado e ainda não respondeu. */
export async function trocasParaMim(db: AnyDb, ator: Ator) {
  return db
    .select({
      id: t.trocas.id,
      funcao: t.funcoes.nome,
      ministerio: t.ministerios.nome,
      titulo: t.eventos.titulo,
      inicio: t.eventos.inicio,
      solicitante: t.usuarios.nome,
    })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.trocas.solicitanteId))
    .where(
      and(
        eq(t.trocas.igrejaId, ator.igrejaId),
        eq(t.trocas.substitutoId, ator.id),
        eq(t.trocas.status, "aberta"),
        gte(t.eventos.inicio, new Date(Date.now() - DURACAO_PADRAO_MS)),
      ),
    )
    .orderBy(asc(t.eventos.inicio));
}

// ---- presença (visão do líder) ----

/** Presença dos escalados de uma escala; só líder do ministério (ou admin). */
export async function presencaDaEscala(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  return db
    .select({
      nome: t.usuarios.nome,
      funcao: t.funcoes.nome,
      status: t.escalaItens.status,
      checkinEm: t.escalaItens.checkinEm,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.escalaItens.usuarioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.eventoId, eventoId),
        eq(t.escalas.ministerioId, ministerioId),
      ),
    )
    .orderBy(asc(t.funcoes.nome));
}

/** O líder liga ou desliga a aprovação automática de trocas do ministério. */
export async function definirTrocaAutomatica(db: AnyDb, ator: Ator, ministerioId: number, ligada: boolean) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  const r = await db
    .update(t.ministerios)
    .set({ trocaAutomatica: ligada })
    .where(and(eq(t.ministerios.id, ministerioId), eq(t.ministerios.igrejaId, ator.igrejaId)))
    .returning({ id: t.ministerios.id });
  if (r.length === 0) throw new ErroAcesso();
}
