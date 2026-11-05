import { and, eq, gte, inArray, lt, max, sql } from "drizzle-orm";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { subMonths } from "date-fns";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { FUSO } from "@/lib/recorrencia";
import {
  calcularIndicadores,
  escalasPorVoluntario,
  presencaPorMes,
  vagasAbertas,
  type ItemLinha,
  type VoluntarioLinha,
} from "./calculo";

export interface FiltroPainel {
  /** yyyy-MM-dd (fuso de São Paulo); padrão: 3 meses atrás. */
  de?: string;
  /** yyyy-MM-dd inclusive; padrão: hoje. */
  ate?: string;
  ministerioId?: number;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

export function periodo(filtro: FiltroPainel, agora: Date) {
  const deTxt =
    filtro.de && DATA.test(filtro.de) ? filtro.de : formatInTimeZone(subMonths(agora, 3), FUSO, "yyyy-MM-dd");
  const ateTxt = filtro.ate && DATA.test(filtro.ate) ? filtro.ate : formatInTimeZone(agora, FUSO, "yyyy-MM-dd");
  const de = fromZonedTime(`${deTxt}T00:00:00`, FUSO);
  const ate = fromZonedTime(`${ateTxt}T00:00:00`, FUSO);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) {
    throw new Error("Período inválido");
  }
  // Fim exclusivo: o dia seguinte à data final.
  return { deTxt, ateTxt, de, ateExclusivo: new Date(ate.getTime() + DIA_MS) };
}

/** Ministérios que o ator pode ver; filtro fora desse conjunto = acesso negado. */
export async function ministeriosPermitidos(db: AnyDb, ator: Ator, ministerioId?: number) {
  const todos = await ministeriosDoLider(db, ator);
  if (todos.length === 0) throw new ErroAcesso();
  if (ministerioId === undefined) return { todos, ids: todos.map((m) => m.id) };
  if (!todos.some((m) => m.id === ministerioId)) throw new ErroAcesso();
  return { todos, ids: [ministerioId] };
}

export async function carregarPainel(db: AnyDb, ator: Ator, filtro: FiltroPainel, agora = new Date()) {
  const { todos, ids } = await ministeriosPermitidos(db, ator, filtro.ministerioId);
  const { deTxt, ateTxt, de, ateExclusivo } = periodo(filtro, agora);
  const igrejaId = ator.igrejaId;

  const colunasItem = {
    escalaStatus: t.escalas.status,
    eventoInicio: t.eventos.inicio,
    funcaoNome: t.funcoes.nome,
    ministerioNome: t.ministerios.nome,
    usuarioId: t.escalaItens.usuarioId,
    usuarioNome: t.usuarios.nome,
    status: t.escalaItens.status,
    checkinEm: t.escalaItens.checkinEm,
  };
  const itensDe = () =>
    db
      .select(colunasItem)
      .from(t.escalaItens)
      .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
      .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
      .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
      .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
      .leftJoin(t.usuarios, eq(t.usuarios.id, t.escalaItens.usuarioId));

  const itens: ItemLinha[] = await itensDe().where(
    and(
      eq(t.escalaItens.igrejaId, igrejaId),
      inArray(t.escalas.ministerioId, ids),
      gte(t.eventos.inicio, de),
      lt(t.eventos.inicio, ateExclusivo),
    ),
  );

  const escalas = await db
    .select({ status: t.escalas.status })
    .from(t.escalas)
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalas.igrejaId, igrejaId),
        inArray(t.escalas.ministerioId, ids),
        gte(t.eventos.inicio, de),
        lt(t.eventos.inicio, ateExclusivo),
      ),
    );

  const trocas = await db
    .select({ status: t.trocas.status })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .where(
      and(
        eq(t.trocas.igrejaId, igrejaId),
        inArray(t.escalas.ministerioId, ids),
        gte(t.trocas.criadoEm, de),
        lt(t.trocas.criadoEm, ateExclusivo),
      ),
    );

  // Aprovados distintos nos ministérios do filtro + última escala (qualquer data).
  const aprovados = await db
    .selectDistinct({ usuarioId: t.membrosMinisterio.usuarioId, nome: t.usuarios.nome })
    .from(t.membrosMinisterio)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.membrosMinisterio.usuarioId))
    .where(
      and(
        eq(t.membrosMinisterio.igrejaId, igrejaId),
        inArray(t.membrosMinisterio.ministerioId, ids),
        eq(t.membrosMinisterio.status, "aprovado"),
        sql`${t.usuarios.anonimizadoEm} is null`,
      ),
    );
  const ultimas = await db
    .select({ usuarioId: t.escalaItens.usuarioId, ultima: max(t.eventos.inicio) })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalaItens.igrejaId, igrejaId),
        inArray(t.escalas.ministerioId, ids),
        eq(t.escalas.status, "publicada"),
        lt(t.eventos.inicio, agora),
      ),
    )
    .groupBy(t.escalaItens.usuarioId);
  const porUsuario = new Map(ultimas.map((u) => [u.usuarioId, u.ultima]));
  const voluntarios: VoluntarioLinha[] = aprovados.map((a) => ({
    usuarioId: a.usuarioId,
    nome: a.nome,
    ultimaEscala: porUsuario.get(a.usuarioId) ?? null,
  }));

  // Vagas: próximos 30 dias, independente do período escolhido.
  const proximos: ItemLinha[] = await itensDe().where(
    and(
      eq(t.escalaItens.igrejaId, igrejaId),
      inArray(t.escalas.ministerioId, ids),
      gte(t.eventos.inicio, agora),
      lt(t.eventos.inicio, new Date(agora.getTime() + 31 * DIA_MS)),
    ),
  );

  return {
    ministerios: todos,
    filtro: { de: deTxt, ate: ateTxt, ministerioId: filtro.ministerioId },
    indicadores: calcularIndicadores({ itens, escalas, trocas, voluntarios }, agora),
    porVoluntario: escalasPorVoluntario(itens, agora),
    vagas: vagasAbertas(proximos, agora),
    presencaMensal: presencaPorMes(itens, agora),
  };
}

export type Painel = Awaited<ReturnType<typeof carregarPainel>>;
