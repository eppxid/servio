import { and, asc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { estaIndisponivel, indisponiveisNoPeriodo } from "@/lib/disponibilidade";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";
import { sugerirEscala, type Atribuicao } from "@/lib/sugestao";
import { DURACAO_PADRAO_MS, temConflito, type Ocupacao } from "./regras";

export class ErroEscala extends Error {}

export type StatusEscala = "sem_escala" | "rascunho" | "publicada";
export type Bloqueio = "indisponivel" | "conflito" | null;

type Evento = typeof t.eventos.$inferSelect;

/** Ministérios (não arquivados) que o ator lidera; admin vê todos da igreja. */
export async function ministeriosDoLider(db: AnyDb, ator: Ator) {
  if (ator.papelGlobal === "admin") {
    return db
      .select({ id: t.ministerios.id, nome: t.ministerios.nome })
      .from(t.ministerios)
      .where(and(eq(t.ministerios.igrejaId, ator.igrejaId), isNull(t.ministerios.arquivadoEm)))
      .orderBy(asc(t.ministerios.nome));
  }
  return db
    .select({ id: t.ministerios.id, nome: t.ministerios.nome })
    .from(t.membrosMinisterio)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.membrosMinisterio.ministerioId))
    .where(
      and(
        eq(t.membrosMinisterio.usuarioId, ator.id),
        eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
        eq(t.membrosMinisterio.papel, "lider"),
        eq(t.membrosMinisterio.status, "aprovado"),
        isNull(t.ministerios.arquivadoEm),
      ),
    )
    .orderBy(asc(t.ministerios.nome));
}

async function exigirLider(db: AnyDb, ator: Ator, ministerioId: number) {
  const [m] = await db
    .select()
    .from(t.ministerios)
    .where(and(eq(t.ministerios.id, ministerioId), eq(t.ministerios.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!m || !(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  return m;
}

async function eventoDaIgreja(db: AnyDb, igrejaId: number, eventoId: number) {
  const [e] = await db
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.igrejaId, igrejaId)))
    .limit(1);
  if (!e) throw new ErroAcesso();
  return e;
}

/** Eventos futuros (até `dias`) × ministérios do líder, com o status da escala. */
export async function listarEscalasFuturas(db: AnyDb, ator: Ator, agora = new Date(), dias = 60) {
  const ministerios = await ministeriosDoLider(db, ator);
  if (ministerios.length === 0) return [];
  const ate = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
  const evs = await db
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.igrejaId, ator.igrejaId), gte(t.eventos.inicio, agora), lt(t.eventos.inicio, ate)))
    .orderBy(asc(t.eventos.inicio));
  const escs = evs.length
    ? await db
        .select({ eventoId: t.escalas.eventoId, ministerioId: t.escalas.ministerioId, status: t.escalas.status })
        .from(t.escalas)
        .where(
          and(
            eq(t.escalas.igrejaId, ator.igrejaId),
            inArray(t.escalas.eventoId, evs.map((e) => e.id)),
            inArray(t.escalas.ministerioId, ministerios.map((m) => m.id)),
          ),
        )
    : [];
  const status = new Map(escs.map((e) => [`${e.eventoId}:${e.ministerioId}`, e.status]));
  return evs.map((evento) => ({
    evento,
    ministerios: ministerios.map((m) => ({
      ...m,
      status: (status.get(`${evento.id}:${m.id}`) ?? "sem_escala") as StatusEscala,
    })),
  }));
}

/** Membros aprovados do ministério com as funções de cada um. */
async function elegiveisPorFuncao(db: AnyDb, ministerioId: number) {
  const linhas = await db
    .select({ funcaoId: t.membroFuncoes.funcaoId, usuarioId: t.membrosMinisterio.usuarioId, nome: t.usuarios.nome })
    .from(t.membroFuncoes)
    .innerJoin(t.membrosMinisterio, eq(t.membrosMinisterio.id, t.membroFuncoes.membroId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(
      and(
        eq(t.membrosMinisterio.ministerioId, ministerioId),
        eq(t.membrosMinisterio.status, "aprovado"),
        isNull(t.usuarios.anonimizadoEm),
      ),
    )
    .orderBy(asc(t.usuarios.nome));
  const mapa = new Map<number, { usuarioId: number; nome: string }[]>();
  for (const l of linhas) mapa.set(l.funcaoId, [...(mapa.get(l.funcaoId) ?? []), l]);
  return mapa;
}

/**
 * Itens escalados (não recusados) em eventos entre [de, ate), fora da escala `exceto`.
 * Vale para qualquer ministério da igreja: é o que gera conflito de horário.
 */
async function ocupacoesNoPeriodo(
  db: AnyDb,
  igrejaId: number,
  de: Date,
  ate: Date,
  exceto?: { eventoId: number; ministerioId: number },
): Promise<(Ocupacao & { ministerioId: number; status: string })[]> {
  const linhas = await db
    .select({
      usuarioId: t.escalaItens.usuarioId,
      eventoId: t.eventos.id,
      inicio: t.eventos.inicio,
      fim: t.eventos.fim,
      ministerioId: t.escalas.ministerioId,
      status: t.escalas.status,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, igrejaId),
        ne(t.escalaItens.status, "recusado"),
        gte(t.eventos.inicio, new Date(de.getTime() - DURACAO_PADRAO_MS * 12)),
        lt(t.eventos.inicio, ate),
      ),
    );
  return linhas
    .filter((l): l is typeof l & { usuarioId: number } => l.usuarioId !== null)
    .filter((l) => !exceto || l.eventoId !== exceto.eventoId || l.ministerioId !== exceto.ministerioId);
}

function fimDoEvento(e: Evento) {
  return e.fim ?? new Date(e.inicio.getTime() + DURACAO_PADRAO_MS);
}

async function escalaDe(db: AnyDb, eventoId: number, ministerioId: number) {
  const [e] = await db
    .select()
    .from(t.escalas)
    .where(and(eq(t.escalas.eventoId, eventoId), eq(t.escalas.ministerioId, ministerioId)))
    .limit(1);
  return e ?? null;
}

/** Tudo que a tela de montagem precisa: funções, candidatos (com bloqueio) e escolhas atuais. */
export async function dadosMontagem(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  const ministerio = await exigirLider(db, ator, ministerioId);
  const evento = await eventoDaIgreja(db, ator.igrejaId, eventoId);
  const funcoes = await db
    .select({ id: t.funcoes.id, nome: t.funcoes.nome })
    .from(t.funcoes)
    .where(eq(t.funcoes.ministerioId, ministerioId))
    .orderBy(asc(t.funcoes.nome));
  const elegiveis = await elegiveisPorFuncao(db, ministerioId);
  const indisp = await indisponiveisNoPeriodo(ministerioId, evento.inicio, evento.fim, db);
  const ocupacoes = await ocupacoesNoPeriodo(db, ator.igrejaId, evento.inicio, fimDoEvento(evento), {
    eventoId,
    ministerioId,
  });
  const escala = await escalaDe(db, eventoId, ministerioId);
  const itens = escala
    ? await db.select().from(t.escalaItens).where(eq(t.escalaItens.escalaId, escala.id))
    : [];

  const bloqueio = (usuarioId: number): Bloqueio =>
    estaIndisponivel(usuarioId, evento.inicio, evento.fim, indisp)
      ? "indisponivel"
      : temConflito(usuarioId, evento, ocupacoes)
        ? "conflito"
        : null;

  return {
    evento,
    ministerio: { id: ministerio.id, nome: ministerio.nome },
    status: (escala?.status ?? "sem_escala") as StatusEscala,
    funcoes: funcoes.map((f) => {
      const item = itens.find((i) => i.funcaoId === f.id);
      return {
        ...f,
        escolhido: item?.usuarioId ?? null,
        statusItem: item?.status ?? null,
        candidatos: (elegiveis.get(f.id) ?? []).map((c) => ({ ...c, bloqueio: bloqueio(c.usuarioId) })),
      };
    }),
  };
}

/**
 * Grava a escala (uma vaga por função). Recusa quem não tem a função, está indisponível,
 * está em conflito de horário ou aparece em duas funções. `publicar` muda o status
 * para publicada e avisa os escalados; item com pessoa nova volta para pendente.
 */
export async function salvarEscala(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  ministerioId: number,
  escolhas: ReadonlyMap<number, number | null>,
  publicar: boolean,
) {
  const dados = await dadosMontagem(db, ator, eventoId, ministerioId);
  const usados = new Set<number>();
  for (const f of dados.funcoes) {
    const u = escolhas.get(f.id) ?? null;
    if (u === null) continue;
    const c = f.candidatos.find((x) => x.usuarioId === u);
    if (!c) throw new ErroEscala(`Voluntário sem a função ${f.nome}`);
    if (c.bloqueio === "indisponivel") throw new ErroEscala(`${c.nome} está indisponível`);
    if (c.bloqueio === "conflito") throw new ErroEscala(`${c.nome} já está escalado em outro evento nesse horário`);
    if (usados.has(u)) throw new ErroEscala(`${c.nome} está em duas funções`);
    usados.add(u);
  }

  const escalados = await db.transaction(async (txBruto) => {
    const tx = txBruto as unknown as AnyDb;
    let escala = await escalaDe(tx, eventoId, ministerioId);
    const novoStatus = publicar ? "publicada" : (escala?.status ?? "rascunho");
    if (!escala) {
      [escala] = await tx
        .insert(t.escalas)
        .values({ igrejaId: ator.igrejaId, eventoId, ministerioId, status: novoStatus })
        .returning();
    } else if (escala.status !== novoStatus) {
      await tx.update(t.escalas).set({ status: novoStatus }).where(eq(t.escalas.id, escala.id));
    }
    const itens = await tx.select().from(t.escalaItens).where(eq(t.escalaItens.escalaId, escala.id));
    for (const f of dados.funcoes) {
      const usuarioId = escolhas.get(f.id) ?? null;
      const item = itens.find((i) => i.funcaoId === f.id);
      if (!item) {
        if (usuarioId !== null) {
          await tx
            .insert(t.escalaItens)
            .values({ igrejaId: ator.igrejaId, escalaId: escala.id, funcaoId: f.id, usuarioId });
        }
      } else if (item.usuarioId !== usuarioId) {
        await tx
          .update(t.escalaItens)
          .set({ usuarioId, status: "pendente", checkinEm: null })
          .where(eq(t.escalaItens.id, item.id));
      }
    }
    return [...usados];
  });

  if (publicar && escalados.length) {
    await notificar({ tipo: "escala_publicada", eventoId, usuarioIds: escalados });
  }
}

/** Limites [início, fim) do mês "YYYY-MM" no fuso de São Paulo (−03:00, sem horário de verão). */
export function limitesDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { de: new Date(`${mes}-01T00:00:00-03:00`), ate: new Date(`${prox}-01T00:00:00-03:00`) };
}

/**
 * "Sugerir mês": preenche as vagas vazias das escalas não publicadas do ministério
 * nos eventos futuros do mês. Escolhas já feitas pelo líder ficam. Tudo vira rascunho.
 * Devolve quantas vagas foram preenchidas.
 */
export async function sugerirMes(db: AnyDb, ator: Ator, ministerioId: number, mes: string, agora = new Date()) {
  await exigirLider(db, ator, ministerioId);
  const lim = limitesDoMes(mes);
  const de = lim.de > agora ? lim.de : agora;
  const evs = await db
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.igrejaId, ator.igrejaId), gte(t.eventos.inicio, de), lt(t.eventos.inicio, lim.ate)))
    .orderBy(asc(t.eventos.inicio));
  if (evs.length === 0) return 0;

  const funcoes = await db
    .select({ id: t.funcoes.id })
    .from(t.funcoes)
    .where(eq(t.funcoes.ministerioId, ministerioId));
  const elegiveis = await elegiveisPorFuncao(db, ministerioId);
  const indisp = await indisponiveisNoPeriodo(ministerioId, lim.de, new Date(lim.ate.getTime() - 1), db);
  const todas = await ocupacoesNoPeriodo(db, ator.igrejaId, lim.de, lim.ate);

  const publicadas = new Set(
    (
      await db
        .select({ eventoId: t.escalas.eventoId })
        .from(t.escalas)
        .where(
          and(
            eq(t.escalas.ministerioId, ministerioId),
            eq(t.escalas.status, "publicada"),
            inArray(t.escalas.eventoId, evs.map((e) => e.id)),
          ),
        )
    ).map((e) => e.eventoId),
  );
  const alvo = evs.filter((e) => !publicadas.has(e.id));
  const alvoIds = new Set(alvo.map((e) => e.id));
  const doMinisterio = todas.filter((o) => o.ministerioId === ministerioId);

  const contagemInicial = new Map<number, number>();
  for (const o of doMinisterio) {
    if (!alvoIds.has(o.eventoId)) contagemInicial.set(o.usuarioId, (contagemInicial.get(o.usuarioId) ?? 0) + 1);
  }
  // Rascunhos do líder neste ministério viram escolhas fixas; o resto é compromisso externo.
  const rascunhos = alvo.length
    ? await db
        .select({ eventoId: t.escalas.eventoId, funcaoId: t.escalaItens.funcaoId, usuarioId: t.escalaItens.usuarioId })
        .from(t.escalaItens)
        .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
        .where(and(eq(t.escalas.ministerioId, ministerioId), inArray(t.escalas.eventoId, [...alvoIds])))
    : [];
  const fixas: Atribuicao[] = rascunhos.filter((r) => r.usuarioId !== null);
  const ocupacoes = todas.filter((o) => !(o.ministerioId === ministerioId && alvoIds.has(o.eventoId)));

  const sugestao = sugerirEscala({
    eventos: alvo,
    funcoes: funcoes.map((f) => f.id),
    elegiveis: new Map([...elegiveis].map(([f, us]) => [f, us.map((u) => u.usuarioId)])),
    indisponibilidades: indisp,
    ocupacoes,
    fixas,
    contagemInicial,
  });

  let preenchidas = 0;
  for (const e of alvo) {
    const escolhas = new Map<number, number | null>();
    for (const a of sugestao.filter((s) => s.eventoId === e.id)) escolhas.set(a.funcaoId, a.usuarioId);
    const novas = sugestao.filter(
      (s) => s.eventoId === e.id && s.usuarioId !== null && !fixas.some((f) => f.eventoId === e.id && f.funcaoId === s.funcaoId),
    ).length;
    if (novas === 0) continue;
    try {
      await salvarEscala(db, ator, e.id, ministerioId, escolhas, false);
      preenchidas += novas;
    } catch (erro) {
      // Escolha antiga do líder que ficou inválida (ex.: pessoa ficou indisponível): pula o evento.
      if (!(erro instanceof ErroEscala)) throw erro;
    }
  }
  return preenchidas;
}

/** Escalas publicadas do evento (só nome dos escalados), para o detalhe do evento. */
export async function escalasPublicadasDoEvento(db: AnyDb, igrejaId: number, eventoId: number) {
  const linhas = await db
    .select({
      ministerioId: t.ministerios.id,
      ministerio: t.ministerios.nome,
      funcao: t.funcoes.nome,
      nome: t.usuarios.nome,
      status: t.escalaItens.status,
    })
    .from(t.escalas)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.escalaItens, eq(t.escalaItens.escalaId, t.escalas.id))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.escalaItens.usuarioId))
    .where(
      and(eq(t.escalas.igrejaId, igrejaId), eq(t.escalas.eventoId, eventoId), eq(t.escalas.status, "publicada")),
    )
    .orderBy(asc(t.ministerios.nome), asc(t.funcoes.nome));
  const grupos = new Map<number, { ministerio: string; itens: { funcao: string; nome: string; status: string }[] }>();
  for (const l of linhas) {
    const g = grupos.get(l.ministerioId) ?? { ministerio: l.ministerio, itens: [] };
    g.itens.push({ funcao: l.funcao, nome: l.nome, status: l.status });
    grupos.set(l.ministerioId, g);
  }
  return [...grupos.values()];
}
