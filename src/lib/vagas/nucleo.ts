import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";

export type StatusPreenchimento = "completo" | "faltando" | "sem_escala";

export interface PreenchimentoMinisterio {
  ministerioId: number;
  nome: string;
  preenchidas: number;
  total: number;
  status: StatusPreenchimento;
}

export interface PreenchimentoEvento {
  eventoId: number;
  titulo: string;
  inicio: Date;
  ministerios: PreenchimentoMinisterio[];
}

type Vaga = { funcaoId: number; quantidade: number };

async function exigirLiderDoMinisterio(db: AnyDb, ator: Ator, ministerioId: number) {
  const [m] = await db
    .select({ id: t.ministerios.id })
    .from(t.ministerios)
    .where(and(eq(t.ministerios.id, ministerioId), eq(t.ministerios.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!m || !(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
}

/** Define o modelo de vagas de um tipo de culto para um ministério. Quantidade 0 remove a função. */
export async function salvarModeloVagas(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
  ministerioId: number,
  vagas: Vaga[],
) {
  await exigirLiderDoMinisterio(db, ator, ministerioId);
  const [rec] = await db
    .select({ id: t.recorrencias.id })
    .from(t.recorrencias)
    .where(and(eq(t.recorrencias.id, recorrenciaId), eq(t.recorrencias.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!rec) throw new ErroAcesso();

  for (const v of vagas) {
    if (!Number.isInteger(v.quantidade) || v.quantidade < 0) {
      throw new RangeError("Quantidade inválida");
    }
  }
  const funcaoIds = [...new Set(vagas.map((v) => v.funcaoId))];
  if (funcaoIds.length > 0) {
    const validas = await db
      .select({ id: t.funcoes.id })
      .from(t.funcoes)
      .where(and(inArray(t.funcoes.id, funcaoIds), eq(t.funcoes.ministerioId, ministerioId)));
    if (validas.length !== funcaoIds.length) throw new ErroAcesso();
  }

  for (const v of vagas) {
    if (v.quantidade === 0) {
      await db
        .delete(t.vagasModelo)
        .where(
          and(
            eq(t.vagasModelo.recorrenciaId, recorrenciaId),
            eq(t.vagasModelo.ministerioId, ministerioId),
            eq(t.vagasModelo.funcaoId, v.funcaoId),
          ),
        );
      continue;
    }
    await db
      .insert(t.vagasModelo)
      .values({
        igrejaId: ator.igrejaId,
        recorrenciaId,
        ministerioId,
        funcaoId: v.funcaoId,
        quantidade: v.quantidade,
      })
      .onConflictDoUpdate({
        target: [t.vagasModelo.recorrenciaId, t.vagasModelo.ministerioId, t.vagasModelo.funcaoId],
        set: { quantidade: v.quantidade },
      });
  }
}

/**
 * Cria, para cada evento e ministério com modelo, a escala em rascunho com as vagas vazias.
 * Idempotente: completa o que falta se o modelo cresceu e não toca escala publicada.
 */
async function aplicarModelo(
  db: AnyDb,
  igrejaId: number,
  eventos: { id: number; recorrenciaId: number }[],
  apenasMinisterios?: Set<number>,
) {
  if (eventos.length === 0) return;
  const recIds = [...new Set(eventos.map((e) => e.recorrenciaId))];
  const modelo = await db
    .select()
    .from(t.vagasModelo)
    .where(and(eq(t.vagasModelo.igrejaId, igrejaId), inArray(t.vagasModelo.recorrenciaId, recIds)));

  const porRec = new Map<number, Map<number, Vaga[]>>();
  for (const m of modelo) {
    if (apenasMinisterios && !apenasMinisterios.has(m.ministerioId)) continue;
    const mins = porRec.get(m.recorrenciaId) ?? new Map<number, Vaga[]>();
    mins.set(m.ministerioId, [
      ...(mins.get(m.ministerioId) ?? []),
      { funcaoId: m.funcaoId, quantidade: m.quantidade },
    ]);
    porRec.set(m.recorrenciaId, mins);
  }

  for (const ev of eventos) {
    for (const [ministerioId, vagas] of porRec.get(ev.recorrenciaId) ?? []) {
      await db.insert(t.escalas).values({ igrejaId, eventoId: ev.id, ministerioId }).onConflictDoNothing();
      const [escala] = await db
        .select()
        .from(t.escalas)
        .where(and(eq(t.escalas.eventoId, ev.id), eq(t.escalas.ministerioId, ministerioId)));
      if (escala.status !== "rascunho") continue;

      const itens = await db
        .select({ funcaoId: t.escalaItens.funcaoId })
        .from(t.escalaItens)
        .where(eq(t.escalaItens.escalaId, escala.id));
      const existentes = new Map<number, number>();
      for (const i of itens) existentes.set(i.funcaoId, (existentes.get(i.funcaoId) ?? 0) + 1);

      const novos: (typeof t.escalaItens.$inferInsert)[] = [];
      for (const v of vagas) {
        const falta = v.quantidade - (existentes.get(v.funcaoId) ?? 0);
        for (let n = 0; n < falta; n++) {
          novos.push({ igrejaId, escalaId: escala.id, funcaoId: v.funcaoId });
        }
      }
      if (novos.length > 0) await db.insert(t.escalaItens).values(novos);
    }
  }
}

/** Cria as escalas em rascunho e as vagas vazias dos eventos da série (pelo modelo do tipo de culto). */
export async function criarVagasDosEventos(db: AnyDb, igrejaId: number, eventoIds: number[]) {
  if (eventoIds.length === 0) return;
  const evs = await db
    .select({ id: t.eventos.id, recorrenciaId: t.eventos.recorrenciaId })
    .from(t.eventos)
    .where(and(eq(t.eventos.igrejaId, igrejaId), inArray(t.eventos.id, eventoIds)));
  await aplicarModelo(
    db,
    igrejaId,
    evs.flatMap((e) => (e.recorrenciaId === null ? [] : [{ id: e.id, recorrenciaId: e.recorrenciaId }])),
  );
}

/** Culto avulso: copia o modelo de um tipo de culto. Admin copia tudo; líder, só os ministérios que lidera. */
export async function copiarVagasDeTipo(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  recorrenciaId: number,
) {
  const [ev] = await db
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.igrejaId, ator.igrejaId)))
    .limit(1);
  const [rec] = await db
    .select({ id: t.recorrencias.id })
    .from(t.recorrencias)
    .where(and(eq(t.recorrencias.id, recorrenciaId), eq(t.recorrencias.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!ev || !rec || !(await temPapel(db, ator, "lider"))) throw new ErroAcesso();

  let permitidos: Set<number> | undefined;
  if (ator.papelGlobal !== "admin") {
    const meus = await db
      .select({ id: t.membrosMinisterio.ministerioId })
      .from(t.membrosMinisterio)
      .where(
        and(
          eq(t.membrosMinisterio.usuarioId, ator.id),
          eq(t.membrosMinisterio.igrejaId, ator.igrejaId),
          eq(t.membrosMinisterio.papel, "lider"),
          eq(t.membrosMinisterio.status, "aprovado"),
        ),
      );
    permitidos = new Set(meus.map((m) => m.id));
  }
  await aplicarModelo(db, ator.igrejaId, [{ id: eventoId, recorrenciaId }], permitidos);
}

/** Preenchimento do mês ('YYYY-MM', fuso de São Paulo) por evento e por ministério que o ator lidera. */
export async function preenchimentoDoMes(
  db: AnyDb,
  ator: Ator,
  mes: string,
): Promise<PreenchimentoEvento[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new RangeError("Mês inválido");
  if (!(await temPapel(db, ator, "lider"))) throw new ErroAcesso();

  const [ano, m] = mes.split("-").map(Number);
  // -03:00 fixo: o Brasil não tem horário de verão desde 2019.
  const de = new Date(`${mes}-01T00:00:00-03:00`);
  const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
  const ate = new Date(`${proximo}-01T00:00:00-03:00`);

  const ministerios =
    ator.papelGlobal === "admin"
      ? await db
          .select({ id: t.ministerios.id, nome: t.ministerios.nome })
          .from(t.ministerios)
          .where(and(eq(t.ministerios.igrejaId, ator.igrejaId), isNull(t.ministerios.arquivadoEm)))
          .orderBy(asc(t.ministerios.nome))
      : await db
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
  if (ministerios.length === 0) return [];

  const evs = await db
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.igrejaId, ator.igrejaId), gte(t.eventos.inicio, de), lt(t.eventos.inicio, ate)))
    .orderBy(asc(t.eventos.inicio));
  if (evs.length === 0) return [];

  const escs = await db
    .select({ id: t.escalas.id, eventoId: t.escalas.eventoId, ministerioId: t.escalas.ministerioId })
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        inArray(t.escalas.eventoId, evs.map((e) => e.id)),
        inArray(t.escalas.ministerioId, ministerios.map((x) => x.id)),
      ),
    );
  const itens = escs.length
    ? await db
        .select({
          escalaId: t.escalaItens.escalaId,
          usuarioId: t.escalaItens.usuarioId,
          status: t.escalaItens.status,
        })
        .from(t.escalaItens)
        .where(inArray(t.escalaItens.escalaId, escs.map((e) => e.id)))
    : [];

  // Vaga preenchida = tem alguém e a pessoa não recusou.
  const contagem = new Map<number, { preenchidas: number; total: number }>();
  for (const i of itens) {
    const c = contagem.get(i.escalaId) ?? { preenchidas: 0, total: 0 };
    c.total++;
    if (i.usuarioId !== null && i.status !== "recusado") c.preenchidas++;
    contagem.set(i.escalaId, c);
  }
  const escalaDe = new Map(escs.map((e) => [`${e.eventoId}:${e.ministerioId}`, e.id]));

  return evs.map((ev) => ({
    eventoId: ev.id,
    titulo: ev.titulo,
    inicio: ev.inicio,
    ministerios: ministerios.map((min) => {
      const escalaId = escalaDe.get(`${ev.id}:${min.id}`);
      const c = escalaId === undefined ? undefined : contagem.get(escalaId);
      if (!c) {
        return { ministerioId: min.id, nome: min.nome, preenchidas: 0, total: 0, status: "sem_escala" as const };
      }
      return {
        ministerioId: min.id,
        nome: min.nome,
        preenchidas: c.preenchidas,
        total: c.total,
        status: c.preenchidas >= c.total ? ("completo" as const) : ("faltando" as const),
      };
    }),
  }));
}
