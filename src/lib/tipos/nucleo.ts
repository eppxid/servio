import { and, eq, gte, inArray } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { FUSO, dataLocal } from "@/lib/recorrencia";

export const NOME_TIPO_MAX = 60;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Tx = Parameters<Parameters<AnyDb["transaction"]>[0]>[0];

/** Troca o nome do tipo de culto. Só admin (mesma regra de criar culto) e só da própria igreja. */
export async function renomearTipo(db: AnyDb, ator: Ator, recorrenciaId: number, nome: string): Promise<string> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  const limpo = nome.trim();
  if (limpo.length < 1 || limpo.length > NOME_TIPO_MAX) {
    throw new RangeError(`O nome deve ter de 1 a ${NOME_TIPO_MAX} caracteres`);
  }
  const [rec] = await db
    .update(t.recorrencias)
    .set({ nome: limpo })
    .where(and(eq(t.recorrencias.id, recorrenciaId), eq(t.recorrencias.igrejaId, ator.igrejaId)))
    .returning({ id: t.recorrencias.id });
  if (!rec) throw new ErroAcesso();
  return limpo;
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dos `ids`, os que têm escala publicada. */
async function comEscalaPublicada(db: Tx | AnyDb, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const pub = await db
    .select({ eventoId: t.escalas.eventoId })
    .from(t.escalas)
    .where(and(inArray(t.escalas.eventoId, ids), eq(t.escalas.status, "publicada")));
  return new Set(pub.map((e) => e.eventoId));
}

async function eventosDoTipo(db: Tx | AnyDb, ator: Ator, recorrenciaId: number) {
  return db
    .select({ id: t.eventos.id, inicio: t.eventos.inicio })
    .from(t.eventos)
    .where(and(eq(t.eventos.igrejaId, ator.igrejaId), eq(t.eventos.recorrenciaId, recorrenciaId)));
}

/** Apaga os eventos e o que depende deles (trocas, itens, escalas, mensagens). */
async function apagarEventos(tx: Tx, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const escalas = await tx.select({ id: t.escalas.id }).from(t.escalas).where(inArray(t.escalas.eventoId, ids));
  if (escalas.length > 0) {
    const escalaIds = escalas.map((e) => e.id);
    const itens = await tx
      .select({ id: t.escalaItens.id })
      .from(t.escalaItens)
      .where(inArray(t.escalaItens.escalaId, escalaIds));
    if (itens.length > 0) {
      await tx.delete(t.trocas).where(inArray(t.trocas.escalaItemId, itens.map((i) => i.id)));
    }
    await tx.delete(t.escalaItens).where(inArray(t.escalaItens.escalaId, escalaIds));
    await tx.delete(t.escalas).where(inArray(t.escalas.eventoId, ids));
  }
  await tx.delete(t.mensagens).where(inArray(t.mensagens.eventoId, ids));
  await tx.delete(t.eventos).where(inArray(t.eventos.id, ids));
}

async function exigirTipoDaIgreja(db: Tx | AnyDb, ator: Ator, recorrenciaId: number): Promise<void> {
  const [rec] = await db
    .select({ id: t.recorrencias.id })
    .from(t.recorrencias)
    .where(and(eq(t.recorrencias.id, recorrenciaId), eq(t.recorrencias.igrejaId, ator.igrejaId)));
  if (!rec) throw new ErroAcesso();
}

/**
 * Muda dia da semana e horários do tipo. Os cultos futuros sem escala publicada acompanham
 * (mesma semana, domingo a sábado); passados e publicados não mudam.
 */
export async function editarHorarioTipo(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
  novo: { diaSemana: number; horaInicio: string; horaFim: string | null },
): Promise<void> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  const { diaSemana, horaInicio } = novo;
  const horaFim = novo.horaFim ? novo.horaFim : null;
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) throw new RangeError("Dia da semana inválido");
  if (!HORA.test(horaInicio) || (horaFim !== null && !HORA.test(horaFim))) throw new RangeError("Hora inválida");
  if (horaFim !== null && horaFim <= horaInicio) throw new RangeError("O fim deve ser depois do início");

  await db.transaction(async (tx) => {
    await exigirTipoDaIgreja(tx, ator, recorrenciaId);
    await tx.update(t.recorrencias).set({ diaSemana, horaInicio, horaFim }).where(eq(t.recorrencias.id, recorrenciaId));

    const futuros = await tx
      .select({ id: t.eventos.id, inicio: t.eventos.inicio })
      .from(t.eventos)
      .where(
        and(
          eq(t.eventos.igrejaId, ator.igrejaId),
          eq(t.eventos.recorrenciaId, recorrenciaId),
          gte(t.eventos.inicio, new Date()),
        ),
      );
    const travados = await comEscalaPublicada(tx, futuros.map((e) => e.id));
    for (const e of futuros) {
      if (travados.has(e.id)) continue;
      const dia = dataLocal(e.inicio);
      const atual = new Date(`${dia}T00:00:00Z`).getUTCDay();
      const alvo = somarDias(dia, diaSemana - atual);
      await tx
        .update(t.eventos)
        .set({
          inicio: fromZonedTime(`${alvo}T${horaInicio}:00`, FUSO),
          fim: horaFim ? fromZonedTime(`${alvo}T${horaFim}:00`, FUSO) : null,
        })
        .where(eq(t.eventos.id, e.id));
    }
  });
}

function validarDataLimite(ate: string | null): string | null {
  if (ate === null || ate === "") return null;
  if (!DATA.test(ate) || new Date(`${ate}T00:00:00Z`).toISOString().slice(0, 10) !== ate) {
    throw new RangeError("Data inválida");
  }
  if (ate < dataLocal(new Date())) throw new RangeError("A data limite não pode ser anterior a hoje");
  return ate;
}

/** Quantos cultos do tipo ficam depois de `ate` e quantos deles já têm escala publicada (para confirmar antes de salvar). */
export async function contarCultosAposLimite(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
  ate: string,
): Promise<{ removidos: number; publicados: number }> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  await exigirTipoDaIgreja(db, ator, recorrenciaId);
  const ids = (await eventosDoTipo(db, ator, recorrenciaId)).filter((e) => dataLocal(e.inicio) > ate).map((e) => e.id);
  return { removidos: ids.length, publicados: (await comEscalaPublicada(db, ids)).size };
}

/**
 * Define (ou limpa, com null) o último dia em que o tipo se repete. Remove da agenda todos os
 * cultos do tipo depois dessa data, inclusive os com escala publicada (o culto não vai acontecer).
 */
export async function definirDataLimiteTipo(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
  ate: string | null,
): Promise<{ removidos: number; publicados: number }> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  const limite = validarDataLimite(ate);
  return db.transaction(async (tx) => {
    await exigirTipoDaIgreja(tx, ator, recorrenciaId);
    await tx.update(t.recorrencias).set({ ate: limite }).where(eq(t.recorrencias.id, recorrenciaId));
    if (limite === null) return { removidos: 0, publicados: 0 };
    const ids = (await eventosDoTipo(tx, ator, recorrenciaId)).filter((e) => dataLocal(e.inicio) > limite).map((e) => e.id);
    const publicados = await comEscalaPublicada(tx, ids);
    await apagarEventos(tx, ids);
    return { removidos: ids.length, publicados: publicados.size };
  });
}

/**
 * Exclui o tipo. Apaga os cultos futuros sem escala publicada e as vagas do modelo;
 * os demais (passados ou publicados) ficam como eventos avulsos.
 */
export async function excluirTipo(db: AnyDb, ator: Ator, recorrenciaId: number): Promise<void> {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  await db.transaction(async (tx) => {
    await exigirTipoDaIgreja(tx, ator, recorrenciaId);
    const futuros = await tx
      .select({ id: t.eventos.id })
      .from(t.eventos)
      .where(
        and(
          eq(t.eventos.igrejaId, ator.igrejaId),
          eq(t.eventos.recorrenciaId, recorrenciaId),
          gte(t.eventos.inicio, new Date()),
        ),
      );
    const ids = futuros.map((e) => e.id);
    const travados = await comEscalaPublicada(tx, ids);
    await apagarEventos(tx, ids.filter((id) => !travados.has(id)));
    await tx
      .update(t.eventos)
      .set({ recorrenciaId: null })
      .where(and(eq(t.eventos.igrejaId, ator.igrejaId), eq(t.eventos.recorrenciaId, recorrenciaId)));
    await tx.delete(t.vagasModelo).where(eq(t.vagasModelo.recorrenciaId, recorrenciaId));
    await tx.delete(t.recorrencias).where(eq(t.recorrencias.id, recorrenciaId));
  });
}
