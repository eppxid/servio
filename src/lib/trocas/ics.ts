import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, gte, ne } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { DURACAO_PADRAO_MS } from "@/lib/escala/regras";
import type { Ator } from "@/lib/ministerios/nucleo";

export const VALIDADE_TOKEN_AGENDA_MS = 365 * 24 * 60 * 60 * 1000;

/** Gera (ou troca) o token do .ics do usuário. O token anterior deixa de valer. */
export async function gerarTokenAgenda(db: AnyDb, ator: Ator, agora = new Date()) {
  const token = randomBytes(32).toString("hex");
  await db
    .update(t.usuarios)
    .set({ agendaToken: token, agendaTokenExpiraEm: new Date(agora.getTime() + VALIDADE_TOKEN_AGENDA_MS) })
    .where(and(eq(t.usuarios.id, ator.id), eq(t.usuarios.igrejaId, ator.igrejaId)));
  return token;
}

/** Revoga o link atual do .ics. */
export async function revogarTokenAgenda(db: AnyDb, ator: Ator) {
  await db
    .update(t.usuarios)
    .set({ agendaToken: null, agendaTokenExpiraEm: null })
    .where(and(eq(t.usuarios.id, ator.id), eq(t.usuarios.igrejaId, ator.igrejaId)));
}

export async function tokenAgendaAtual(db: AnyDb, ator: Ator, agora = new Date()) {
  const [u] = await db
    .select({ token: t.usuarios.agendaToken, expira: t.usuarios.agendaTokenExpiraEm })
    .from(t.usuarios)
    .where(eq(t.usuarios.id, ator.id))
    .limit(1);
  return u?.token && u.expira && u.expira > agora ? u.token : null;
}

function escapar(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Dobra linhas com mais de 75 octetos, como pede a RFC 5545. */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const ch of linha) {
    if (Buffer.byteLength(atual + ch) > (partes.length === 0 ? 75 : 74)) {
      partes.push(atual);
      atual = ch;
    } else {
      atual += ch;
    }
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export interface EventoIcs {
  itemId: number;
  titulo: string;
  ministerio: string;
  funcao: string;
  inicio: Date;
  fim: Date | null;
}

export function montarIcs(eventos: readonly EventoIcs[], agora = new Date()): string {
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EscalaIgreja//Agenda//PT-BR", "CALSCALE:GREGORIAN"];
  for (const e of eventos) {
    const fim = e.fim ?? new Date(e.inicio.getTime() + DURACAO_PADRAO_MS);
    linhas.push(
      "BEGIN:VEVENT",
      `UID:escala-item-${e.itemId}@escala-igreja`,
      `DTSTAMP:${utc(agora)}`,
      `DTSTART:${utc(e.inicio)}`,
      `DTEND:${utc(fim)}`,
      `SUMMARY:${escapar(`${e.titulo} - ${e.funcao}`)}`,
      `DESCRIPTION:${escapar(`${e.ministerio} · ${e.funcao}`)}`,
      "END:VEVENT",
    );
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/** .ics do dono do token (escalas publicadas, não recusadas, dos últimos 30 dias em diante). Token inválido ou vencido = null. */
export async function icsDoToken(db: AnyDb, token: string, agora = new Date()): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [u] = await db
    .select({ id: t.usuarios.id, igrejaId: t.usuarios.igrejaId })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.agendaToken, token), gt(t.usuarios.agendaTokenExpiraEm, agora)))
    .limit(1);
  if (!u) return null;
  const itens = await db
    .select({
      itemId: t.escalaItens.id,
      titulo: t.eventos.titulo,
      ministerio: t.ministerios.nome,
      funcao: t.funcoes.nome,
      inicio: t.eventos.inicio,
      fim: t.eventos.fim,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(
      and(
        eq(t.escalaItens.usuarioId, u.id),
        eq(t.escalaItens.igrejaId, u.igrejaId),
        ne(t.escalaItens.status, "recusado"),
        eq(t.escalas.status, "publicada"),
        gte(t.eventos.inicio, new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(asc(t.eventos.inicio));
  return montarIcs(itens, agora);
}
