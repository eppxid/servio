import { and, asc, count, eq, gte, inArray, lt, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { dadosMontagem, ErroEscala, ministeriosDoLider, limitesDoMes } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { notificar } from "@/lib/notificar";
import { dataLocal } from "@/lib/recorrencia";
import { criarVagasDosEventos } from "@/lib/vagas/nucleo";

export type StatusItem = "pendente" | "confirmado" | "recusado";

export interface VagaCulto {
  itemId: number;
  usuarioId: number | null;
  nome: string | null;
  status: StatusItem;
}

export interface CandidatoCulto {
  usuarioId: number;
  nome: string;
  /** Escalas (não recusadas) da pessoa no mês do culto. */
  noMes: number;
  bloqueio: "indisponivel" | "conflito" | null;
}

export interface FuncaoCulto {
  id: number;
  nome: string;
  vagas: VagaCulto[];
  candidatos: CandidatoCulto[];
}

export interface MinisterioCulto {
  id: number;
  nome: string;
  status: "sem_escala" | "rascunho" | "publicada";
  funcoes: FuncaoCulto[];
  /** Todas as funções do ministério, com as vagas atuais deste culto (0 se não há). */
  todasFuncoes: { id: number; nome: string; quantidade: number }[];
}

export interface DadosCulto {
  evento: { id: number; titulo: string; inicio: Date; fim: Date | null; recorrenciaId: number | null };
  ministerios: MinisterioCulto[];
}

/** Tudo que a tela do culto precisa: por ministério que o ator lidera, as vagas e quem pode ocupá-las. */
export async function dadosCulto(db: AnyDb, ator: Ator, eventoId: number): Promise<DadosCulto> {
  const [evento] = await db
    .select()
    .from(t.eventos)
    .where(and(eq(t.eventos.id, eventoId), eq(t.eventos.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!evento) throw new ErroAcesso();
  const meus = await ministeriosDoLider(db, ator);
  if (meus.length === 0) throw new ErroAcesso();

  // Escalas do mês por pessoa (contagem exibida ao escolher).
  const lim = limitesDoMes(dataLocal(evento.inicio).slice(0, 7));
  const doMes = await db
    .select({ usuarioId: t.escalaItens.usuarioId, n: count() })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        ne(t.escalaItens.status, "recusado"),
        gte(t.eventos.inicio, lim.de),
        lt(t.eventos.inicio, lim.ate),
      ),
    )
    .groupBy(t.escalaItens.usuarioId);
  const noMes = new Map(doMes.flatMap((l) => (l.usuarioId === null ? [] : [[l.usuarioId, Number(l.n)] as const])));

  const ministerios: MinisterioCulto[] = [];
  for (const m of meus) {
    const d = await dadosMontagem(db, ator, eventoId, m.id);
    const [escala] = await db
      .select()
      .from(t.escalas)
      .where(and(eq(t.escalas.eventoId, eventoId), eq(t.escalas.ministerioId, m.id)))
      .limit(1);
    const itens = escala
      ? await db
          .select({
            id: t.escalaItens.id,
            funcaoId: t.escalaItens.funcaoId,
            usuarioId: t.escalaItens.usuarioId,
            status: t.escalaItens.status,
            nome: t.usuarios.nome,
          })
          .from(t.escalaItens)
          .leftJoin(t.usuarios, eq(t.usuarios.id, t.escalaItens.usuarioId))
          .where(eq(t.escalaItens.escalaId, escala.id))
          .orderBy(asc(t.escalaItens.id))
      : [];
    ministerios.push({
      id: m.id,
      nome: m.nome,
      status: d.status,
      todasFuncoes: d.funcoes.map((f) => ({
        id: f.id,
        nome: f.nome,
        quantidade: itens.filter((i) => i.funcaoId === f.id).length,
      })),
      funcoes: d.funcoes
        .map((f) => ({
          id: f.id,
          nome: f.nome,
          vagas: itens
            .filter((i) => i.funcaoId === f.id)
            .map((i) => ({ itemId: i.id, usuarioId: i.usuarioId, nome: i.nome, status: i.status })),
          candidatos: f.candidatos.map((c) => ({ ...c, noMes: noMes.get(c.usuarioId) ?? 0 })),
        }))
        .filter((f) => f.vagas.length > 0),
    });
  }
  return {
    evento: {
      id: evento.id,
      titulo: evento.titulo,
      inicio: evento.inicio,
      fim: evento.fim,
      recorrenciaId: evento.recorrenciaId,
    },
    ministerios,
  };
}

/**
 * Põe (ou tira, com `null`) uma pessoa numa vaga. Recusa quem não tem a função aprovada, está de folga,
 * está em outro culto no mesmo horário ou já ocupa outra vaga deste culto. Em escala já publicada,
 * avisa a pessoa nova.
 */
export async function preencherVaga(db: AnyDb, ator: Ator, itemId: number, usuarioId: number | null) {
  const [item] = await db
    .select({
      id: t.escalaItens.id,
      escalaId: t.escalaItens.escalaId,
      funcaoId: t.escalaItens.funcaoId,
      usuarioId: t.escalaItens.usuarioId,
      eventoId: t.escalas.eventoId,
      ministerioId: t.escalas.ministerioId,
      status: t.escalas.status,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .where(and(eq(t.escalaItens.id, itemId), eq(t.escalaItens.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!item || !(await temPapel(db, ator, "lider", item.ministerioId))) throw new ErroAcesso();
  if (item.usuarioId === usuarioId) return;

  if (usuarioId !== null) {
    const d = await dadosMontagem(db, ator, item.eventoId, item.ministerioId);
    const c = d.funcoes.find((f) => f.id === item.funcaoId)?.candidatos.find((x) => x.usuarioId === usuarioId);
    if (!c) throw new ErroEscala("Essa pessoa não tem a função aprovada");
    if (c.bloqueio === "indisponivel") throw new ErroEscala(`${c.nome} está de folga`);
    if (c.bloqueio === "conflito") throw new ErroEscala(`${c.nome} já está em outro culto nesse horário`);
    const [outra] = await db
      .select({ id: t.escalaItens.id })
      .from(t.escalaItens)
      .where(
        and(
          eq(t.escalaItens.escalaId, item.escalaId),
          eq(t.escalaItens.usuarioId, usuarioId),
          ne(t.escalaItens.id, itemId),
        ),
      )
      .limit(1);
    if (outra) throw new ErroEscala(`${c.nome} já ocupa outra vaga neste culto`);
  }

  await db
    .update(t.escalaItens)
    .set({ usuarioId, status: "pendente", checkinEm: null, recusadoEm: null })
    .where(eq(t.escalaItens.id, itemId));
  if (usuarioId !== null && item.status === "publicada") {
    await notificar({ tipo: "escala_publicada", eventoId: item.eventoId, usuarioIds: [usuarioId] });
  }
}

/** Publica a escala do ministério (precisa de ao menos uma vaga preenchida) e avisa os escalados. */
export async function publicarCulto(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  const [escala] = await db
    .select()
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.eventoId, eventoId),
        eq(t.escalas.ministerioId, ministerioId),
        eq(t.escalas.igrejaId, ator.igrejaId),
      ),
    )
    .limit(1);
  if (!escala) throw new ErroAcesso();
  const itens = await db
    .select({ usuarioId: t.escalaItens.usuarioId })
    .from(t.escalaItens)
    .where(and(eq(t.escalaItens.escalaId, escala.id), ne(t.escalaItens.status, "recusado")));
  const escalados = [...new Set(itens.flatMap((i) => (i.usuarioId === null ? [] : [i.usuarioId])))];
  if (escalados.length === 0) throw new ErroEscala("Preencha ao menos uma vaga antes de publicar");
  if (escala.status === "publicada") return;
  await db.update(t.escalas).set({ status: "publicada" }).where(eq(t.escalas.id, escala.id));
  await notificar({ tipo: "escala_publicada", eventoId, usuarioIds: escalados });
}

export interface TipoDeCulto {
  id: number;
  nome: string;
  diaSemana: number;
  horaInicio: string;
  horaFim: string | null;
}

/** Tipos de culto (séries recorrentes) da igreja. */
export async function tiposDeCulto(db: AnyDb, ator: Ator): Promise<TipoDeCulto[]> {
  if (!(await temPapel(db, ator, "lider"))) throw new ErroAcesso();
  return db
    .select({
      id: t.recorrencias.id,
      nome: t.recorrencias.nome,
      diaSemana: t.recorrencias.diaSemana,
      horaInicio: t.recorrencias.horaInicio,
      horaFim: t.recorrencias.horaFim,
    })
    .from(t.recorrencias)
    .where(eq(t.recorrencias.igrejaId, ator.igrejaId))
    .orderBy(asc(t.recorrencias.diaSemana), asc(t.recorrencias.horaInicio), asc(t.recorrencias.id));
}

export interface ModeloMinisterio {
  id: number;
  nome: string;
  funcoes: { id: number; nome: string; quantidade: number }[];
}

/** Modelo de vagas do tipo, por ministério que o ator lidera (todas as funções, com quantidade 0 se não há vaga). */
export async function modeloDoTipo(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
): Promise<{ tipo: TipoDeCulto; ministerios: ModeloMinisterio[] }> {
  const tipo = (await tiposDeCulto(db, ator)).find((x) => x.id === recorrenciaId);
  if (!tipo) throw new ErroAcesso();
  const meus = await ministeriosDoLider(db, ator);
  if (meus.length === 0) throw new ErroAcesso();
  const funcoes = await db
    .select({ id: t.funcoes.id, nome: t.funcoes.nome, ministerioId: t.funcoes.ministerioId })
    .from(t.funcoes)
    .where(inArray(t.funcoes.ministerioId, meus.map((m) => m.id)))
    .orderBy(asc(t.funcoes.nome));
  const modelo = await db
    .select({ funcaoId: t.vagasModelo.funcaoId, quantidade: t.vagasModelo.quantidade })
    .from(t.vagasModelo)
    .where(and(eq(t.vagasModelo.recorrenciaId, recorrenciaId), eq(t.vagasModelo.igrejaId, ator.igrejaId)));
  const qtd = new Map(modelo.map((m) => [m.funcaoId, m.quantidade]));
  return {
    tipo,
    ministerios: meus.map((m) => ({
      id: m.id,
      nome: m.nome,
      funcoes: funcoes
        .filter((f) => f.ministerioId === m.id)
        .map((f) => ({ id: f.id, nome: f.nome, quantidade: qtd.get(f.id) ?? 0 })),
    })),
  };
}

/**
 * Aplica o modelo do tipo aos cultos futuros do ministério que ainda estão em rascunho: tira as vagas
 * vazias que sobram e cria as que faltam. Vaga com pessoa e escala publicada não mudam.
 */
export async function ajustarCultosAoModelo(
  db: AnyDb,
  ator: Ator,
  recorrenciaId: number,
  ministerioId: number,
  agora = new Date(),
) {
  if (!(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  const futuros = await db
    .select({ id: t.eventos.id })
    .from(t.eventos)
    .where(
      and(
        eq(t.eventos.igrejaId, ator.igrejaId),
        eq(t.eventos.recorrenciaId, recorrenciaId),
        gte(t.eventos.inicio, agora),
      ),
    );
  if (futuros.length === 0) return;
  const modelo = await db
    .select({ funcaoId: t.vagasModelo.funcaoId, quantidade: t.vagasModelo.quantidade })
    .from(t.vagasModelo)
    .where(
      and(
        eq(t.vagasModelo.recorrenciaId, recorrenciaId),
        eq(t.vagasModelo.ministerioId, ministerioId),
        eq(t.vagasModelo.igrejaId, ator.igrejaId),
      ),
    );
  const quantidade = new Map(modelo.map((m) => [m.funcaoId, m.quantidade]));

  const rascunhos = await db
    .select({ id: t.escalas.id })
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.ministerioId, ministerioId),
        eq(t.escalas.status, "rascunho"),
        inArray(t.escalas.eventoId, futuros.map((e) => e.id)),
      ),
    );
  for (const esc of rascunhos) {
    const itens = await db
      .select({ id: t.escalaItens.id, funcaoId: t.escalaItens.funcaoId, usuarioId: t.escalaItens.usuarioId })
      .from(t.escalaItens)
      .where(eq(t.escalaItens.escalaId, esc.id))
      .orderBy(asc(t.escalaItens.id));
    const porFuncao = new Map<number, typeof itens>();
    for (const i of itens) porFuncao.set(i.funcaoId, [...(porFuncao.get(i.funcaoId) ?? []), i]);
    const apagar: number[] = [];
    for (const [funcaoId, lista] of porFuncao) {
      let sobra = lista.length - (quantidade.get(funcaoId) ?? 0);
      for (const i of [...lista].reverse()) {
        if (sobra <= 0) break;
        if (i.usuarioId === null) {
          apagar.push(i.id);
          sobra--;
        }
      }
    }
    if (apagar.length > 0) await db.delete(t.escalaItens).where(inArray(t.escalaItens.id, apagar));
  }
  await criarVagasDosEventos(db, ator.igrejaId, futuros.map((e) => e.id));
}

/** Nomes dos dias da semana (0 = domingo), como no cadastro da recorrência. */
export const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
