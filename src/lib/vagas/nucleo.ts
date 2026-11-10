import { and, asc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroEscala } from "@/lib/escala/nucleo";
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

  // A última quantidade de cada função vale, como no laço de antes; o insert em lote não aceita chave repetida.
  const ultima = new Map(vagas.map((v) => [v.funcaoId, v.quantidade]));
  const remover = [...ultima].filter(([, q]) => q === 0).map(([f]) => f);
  const gravar = [...ultima].filter(([, q]) => q > 0);
  if (remover.length > 0) {
    await db
      .delete(t.vagasModelo)
      .where(
        and(
          eq(t.vagasModelo.recorrenciaId, recorrenciaId),
          eq(t.vagasModelo.ministerioId, ministerioId),
          inArray(t.vagasModelo.funcaoId, remover),
        ),
      );
  }
  if (gravar.length > 0) {
    await db
      .insert(t.vagasModelo)
      .values(
        gravar.map(([funcaoId, quantidade]) => ({
          igrejaId: ator.igrejaId,
          recorrenciaId,
          ministerioId,
          funcaoId,
          quantidade,
        })),
      )
      .onConflictDoUpdate({
        target: [t.vagasModelo.recorrenciaId, t.vagasModelo.ministerioId, t.vagasModelo.funcaoId],
        set: { quantidade: sql`excluded.quantidade` },
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
    .select({
      recorrenciaId: t.vagasModelo.recorrenciaId,
      ministerioId: t.vagasModelo.ministerioId,
      funcaoId: t.vagasModelo.funcaoId,
      quantidade: t.vagasModelo.quantidade,
    })
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

  const pares = eventos.flatMap((ev) =>
    [...(porRec.get(ev.recorrenciaId) ?? [])].map(([ministerioId, vagas]) => ({ eventoId: ev.id, ministerioId, vagas })),
  );
  if (pares.length === 0) return;
  await db
    .insert(t.escalas)
    .values(pares.map((p) => ({ igrejaId, eventoId: p.eventoId, ministerioId: p.ministerioId })))
    .onConflictDoNothing();
  // Só escala em rascunho recebe vaga: a publicada fica como está.
  const rascunhos = await db
    .select({ id: t.escalas.id, eventoId: t.escalas.eventoId, ministerioId: t.escalas.ministerioId })
    .from(t.escalas)
    .where(
      and(
        inArray(t.escalas.eventoId, [...new Set(pares.map((p) => p.eventoId))]),
        inArray(t.escalas.ministerioId, [...new Set(pares.map((p) => p.ministerioId))]),
        eq(t.escalas.status, "rascunho"),
      ),
    );
  if (rascunhos.length === 0) return;
  const escalaDe = new Map(rascunhos.map((e) => [`${e.eventoId}:${e.ministerioId}`, e.id]));

  const itens = await db
    .select({ escalaId: t.escalaItens.escalaId, funcaoId: t.escalaItens.funcaoId })
    .from(t.escalaItens)
    .where(inArray(t.escalaItens.escalaId, rascunhos.map((e) => e.id)));
  const existentes = new Map<string, number>();
  for (const i of itens) {
    const k = `${i.escalaId}:${i.funcaoId}`;
    existentes.set(k, (existentes.get(k) ?? 0) + 1);
  }

  const novos: (typeof t.escalaItens.$inferInsert)[] = [];
  for (const p of pares) {
    const escalaId = escalaDe.get(`${p.eventoId}:${p.ministerioId}`);
    if (escalaId === undefined) continue;
    for (const v of p.vagas) {
      const falta = v.quantidade - (existentes.get(`${escalaId}:${v.funcaoId}`) ?? 0);
      for (let n = 0; n < falta; n++) novos.push({ igrejaId, escalaId, funcaoId: v.funcaoId });
    }
  }
  if (novos.length > 0) await db.insert(t.escalaItens).values(novos);
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

  const permitidos = await ministeriosPermitidos(db, ator);
  const comModelo = new Set(
    (
      await db
        .select({ ministerioId: t.vagasModelo.ministerioId })
        .from(t.vagasModelo)
        .where(
          and(
            eq(t.vagasModelo.recorrenciaId, recorrenciaId),
            eq(t.vagasModelo.igrejaId, ator.igrejaId),
            gt(t.vagasModelo.quantidade, 0),
          ),
        )
    ).map((m) => m.ministerioId),
  );
  const alvos = await ministeriosDaIgreja(db, ator.igrejaId, permitidos);
  const sem = alvos.filter((m) => !comModelo.has(m.id));
  if (alvos.length > 0 && sem.length === alvos.length) {
    const [r] = await db.select({ nome: t.recorrencias.nome }).from(t.recorrencias).where(eq(t.recorrencias.id, recorrenciaId));
    throw new ErroEscala(`O tipo ${r.nome} não tem vagas para ${sem.map((m) => m.nome).join(", ")}.`);
  }
  await aplicarModelo(db, ator.igrejaId, [{ id: eventoId, recorrenciaId }], permitidos);
}

/** Ids dos ministérios que o ator pode alterar: `undefined` para o admin (todos), senão os que lidera. */
async function ministeriosPermitidos(db: AnyDb, ator: Ator): Promise<Set<number> | undefined> {
  if (ator.papelGlobal === "admin") return undefined;
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
  return new Set(meus.map((m) => m.id));
}

async function ministeriosDaIgreja(db: AnyDb, igrejaId: number, ids?: Set<number>) {
  const todos = await db
    .select({ id: t.ministerios.id, nome: t.ministerios.nome })
    .from(t.ministerios)
    .where(and(eq(t.ministerios.igrejaId, igrejaId), isNull(t.ministerios.arquivadoEm)))
    .orderBy(asc(t.ministerios.nome));
  return ids ? todos.filter((m) => ids.has(m.id)) : todos;
}

/** Soma de vagas do modelo de cada tipo de culto, nos ministérios indicados. */
export async function somaVagasPorTipo(db: AnyDb, ator: Ator, ministerioIds: number[]) {
  const soma = new Map<number, number>();
  if (ministerioIds.length === 0) return soma;
  const linhas = await db
    .select({ recorrenciaId: t.vagasModelo.recorrenciaId, quantidade: t.vagasModelo.quantidade })
    .from(t.vagasModelo)
    .where(and(eq(t.vagasModelo.igrejaId, ator.igrejaId), inArray(t.vagasModelo.ministerioId, ministerioIds)));
  for (const l of linhas) soma.set(l.recorrenciaId, (soma.get(l.recorrenciaId) ?? 0) + l.quantidade);
  return soma;
}

/**
 * Define as vagas só deste culto para um ministério (quantidade por função). Cria a escala em rascunho
 * se não existir; acrescenta vagas; tira vagas vazias. Nunca tira vaga com pessoa nem mexe em escala publicada.
 */
export async function definirVagasDoCulto(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  ministerioId: number,
  vagas: Vaga[],
) {
  await exigirLiderDoMinisterio(db, ator, ministerioId);
  const [ev] = await db
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!ev) throw new ErroAcesso();
  for (const v of vagas) {
    if (!Number.isInteger(v.quantidade) || v.quantidade < 0 || v.quantidade > 50) {
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

  const [existente] = await db
    .select({ id: t.escalas.id, status: t.escalas.status })
    .from(t.escalas)
    .where(and(eq(t.escalas.eventoId, eventoId), eq(t.escalas.ministerioId, ministerioId)))
    .limit(1);
  if (existente?.status === "publicada") throw new ErroEscala("A escala já foi publicada: as vagas não mudam.");
  if (!existente && vagas.every((v) => v.quantidade === 0)) throw new ErroEscala("Defina pelo menos 1 vaga.");

  const itens = existente
    ? await db
        .select({ id: t.escalaItens.id, funcaoId: t.escalaItens.funcaoId, usuarioId: t.escalaItens.usuarioId })
        .from(t.escalaItens)
        .where(eq(t.escalaItens.escalaId, existente.id))
        .orderBy(asc(t.escalaItens.id))
    : [];

  const apagar: number[] = [];
  const faltam: number[] = [];
  for (const v of vagas) {
    const atuais = itens.filter((i) => i.funcaoId === v.funcaoId);
    const diff = v.quantidade - atuais.length;
    if (diff > 0) {
      for (let n = 0; n < diff; n++) faltam.push(v.funcaoId);
      continue;
    }
    const vazias = atuais.filter((i) => i.usuarioId === null);
    if (-diff > vazias.length) throw new ErroEscala("Não dá para tirar uma vaga que já tem pessoa.");
    apagar.push(...vazias.slice(vazias.length + diff).map((i) => i.id));
  }

  let escalaId = existente?.id;
  if (escalaId === undefined) {
    const [nova] = await db
      .insert(t.escalas)
      .values({ igrejaId: ator.igrejaId, eventoId, ministerioId })
      .onConflictDoNothing()
      .returning({ id: t.escalas.id });
    if (!nova) throw new ErroEscala("Tente de novo.");
    escalaId = nova.id;
  }
  if (apagar.length > 0) await db.delete(t.escalaItens).where(inArray(t.escalaItens.id, apagar));
  if (faltam.length > 0) {
    await db
      .insert(t.escalaItens)
      .values(faltam.map((funcaoId) => ({ igrejaId: ator.igrejaId, escalaId: escalaId!, funcaoId })));
  }
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
    .select({ id: t.eventos.id, titulo: t.eventos.titulo, inicio: t.eventos.inicio })
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
