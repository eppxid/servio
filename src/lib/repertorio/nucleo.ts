import { and, asc, desc, eq, inArray, lt, max, ne, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { repertorioItens } from "@/db/schema-repertorio";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { validarLink } from "./links";

export class ErroRepertorio extends Error {}

export interface DadosMusica {
  titulo: string;
  artista?: string;
  tom?: string;
  linkSpotify?: string;
  linkDeezer?: string;
  linkCifra?: string;
  observacao?: string;
}

export interface Acesso {
  escalaId: number;
  lider: boolean;
}

/** Líder do ministério/admin edita; escalado no evento só lê; qualquer outro = ErroAcesso (403). */
export async function exigirAcessoRepertorio(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number): Promise<Acesso> {
  const [escala] = await db
    .select({ id: t.escalas.id })
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.eventoId, eventoId),
        eq(t.escalas.ministerioId, ministerioId),
      ),
    )
    .limit(1);
  if (!escala) throw new ErroAcesso();
  if (await temPapel(db, ator, "lider", ministerioId)) return { escalaId: escala.id, lider: true };

  const publicadas = await db
    .select({ id: t.escalas.id })
    .from(t.escalas)
    .where(
      and(eq(t.escalas.igrejaId, ator.igrejaId), eq(t.escalas.eventoId, eventoId), eq(t.escalas.status, "publicada")),
    );
  if (publicadas.length === 0) throw new ErroAcesso();
  const [escalado] = await db
    .select({ id: t.escalaItens.id })
    .from(t.escalaItens)
    .where(
      and(
        eq(t.escalaItens.igrejaId, ator.igrejaId),
        eq(t.escalaItens.usuarioId, ator.id),
        inArray(
          t.escalaItens.escalaId,
          publicadas.map((e) => e.id),
        ),
      ),
    )
    .limit(1);
  if (!escalado) throw new ErroAcesso();
  return { escalaId: escala.id, lider: false };
}

export async function listarRepertorio(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  const acesso = await exigirAcessoRepertorio(db, ator, eventoId, ministerioId);
  const itens = await db
    .select()
    .from(repertorioItens)
    .where(and(eq(repertorioItens.escalaId, acesso.escalaId), eq(repertorioItens.igrejaId, ator.igrejaId)))
    .orderBy(asc(repertorioItens.ordem), asc(repertorioItens.id));
  return { ...acesso, itens };
}

function limpar(d: DadosMusica) {
  const titulo = d.titulo.trim();
  if (!titulo) throw new ErroRepertorio("Informe o título da música");
  const corte = (v: string | undefined, limite: number) => v?.trim().slice(0, limite) || null;
  const link = (s: "spotify" | "deezer" | "cifra", v: string | undefined) => {
    const r = validarLink(s, v ?? "");
    if (!r.ok) throw new ErroRepertorio(r.erro);
    return r.url;
  };
  return {
    titulo: titulo.slice(0, 200),
    artista: corte(d.artista, 200),
    tom: corte(d.tom, 10),
    linkSpotify: link("spotify", d.linkSpotify),
    linkDeezer: link("deezer", d.linkDeezer),
    linkCifra: link("cifra", d.linkCifra),
    observacao: corte(d.observacao, 500),
  };
}

async function exigirEdicao(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  const acesso = await exigirAcessoRepertorio(db, ator, eventoId, ministerioId);
  if (!acesso.lider) throw new ErroAcesso();
  return acesso;
}

export async function incluirMusica(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number, dados: DadosMusica) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  const valores = limpar(dados);
  const [{ m }] = await db
    .select({ m: max(repertorioItens.ordem) })
    .from(repertorioItens)
    .where(eq(repertorioItens.escalaId, escalaId));
  await db
    .insert(repertorioItens)
    .values({ igrejaId: ator.igrejaId, escalaId, ordem: (m ?? 0) + 1, criadoPor: ator.id, ...valores });
}

async function itemDaEscala(db: AnyDb, escalaId: number, itemId: number) {
  const [i] = await db
    .select()
    .from(repertorioItens)
    .where(and(eq(repertorioItens.id, itemId), eq(repertorioItens.escalaId, escalaId)))
    .limit(1);
  if (!i) throw new ErroRepertorio("Música não encontrada");
  return i;
}

export async function editarMusica(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  ministerioId: number,
  itemId: number,
  dados: DadosMusica,
) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  await itemDaEscala(db, escalaId, itemId);
  await db.update(repertorioItens).set(limpar(dados)).where(eq(repertorioItens.id, itemId));
}

export async function excluirMusica(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number, itemId: number) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  await itemDaEscala(db, escalaId, itemId);
  await db.delete(repertorioItens).where(eq(repertorioItens.id, itemId));
  await renumerar(db, escalaId);
}

/** Troca a posição com a vizinha. Já na ponta = nada. */
export async function moverMusica(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  ministerioId: number,
  itemId: number,
  direcao: "subir" | "descer",
) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  await itemDaEscala(db, escalaId, itemId);
  await renumerar(db, escalaId);
  const lista = await db
    .select({ id: repertorioItens.id, ordem: repertorioItens.ordem })
    .from(repertorioItens)
    .where(eq(repertorioItens.escalaId, escalaId))
    .orderBy(asc(repertorioItens.ordem));
  const i = lista.findIndex((x) => x.id === itemId);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return;
  await db.update(repertorioItens).set({ ordem: lista[j].ordem }).where(eq(repertorioItens.id, lista[i].id));
  await db.update(repertorioItens).set({ ordem: lista[i].ordem }).where(eq(repertorioItens.id, lista[j].id));
}

/** Deixa a ordem em 1..n sem buracos. */
async function renumerar(db: AnyDb, escalaId: number) {
  const lista = await db
    .select({ id: repertorioItens.id })
    .from(repertorioItens)
    .where(eq(repertorioItens.escalaId, escalaId))
    .orderBy(asc(repertorioItens.ordem), asc(repertorioItens.id));
  for (const [n, x] of lista.entries()) {
    await db.update(repertorioItens).set({ ordem: n + 1 }).where(eq(repertorioItens.id, x.id));
  }
}

/** Últimos 10 eventos anteriores do mesmo ministério que têm repertório. */
export async function eventosParaCopiar(db: AnyDb, ator: Ator, eventoId: number, ministerioId: number) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  const [atual] = await db.select({ inicio: t.eventos.inicio }).from(t.eventos).where(eq(t.eventos.id, eventoId)).limit(1);
  return db
    .select({ eventoId: t.eventos.id, titulo: t.eventos.titulo, inicio: t.eventos.inicio })
    .from(t.escalas)
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.ministerioId, ministerioId),
        ne(t.escalas.id, escalaId),
        lt(t.eventos.inicio, atual?.inicio ?? new Date()),
        sql`exists (select 1 from ${repertorioItens} where ${repertorioItens.escalaId} = ${t.escalas.id})`,
      ),
    )
    .orderBy(desc(t.eventos.inicio))
    .limit(10);
}

/** Acrescenta ao fim as músicas do outro evento (mesmo ministério e igreja). */
export async function copiarRepertorio(
  db: AnyDb,
  ator: Ator,
  eventoId: number,
  ministerioId: number,
  origemEventoId: number,
) {
  const { escalaId } = await exigirEdicao(db, ator, eventoId, ministerioId);
  const [origem] = await db
    .select({ id: t.escalas.id })
    .from(t.escalas)
    .where(
      and(
        eq(t.escalas.igrejaId, ator.igrejaId),
        eq(t.escalas.eventoId, origemEventoId),
        eq(t.escalas.ministerioId, ministerioId),
      ),
    )
    .limit(1);
  if (!origem || origem.id === escalaId) throw new ErroRepertorio("Evento de origem inválido");
  const itens = await db
    .select()
    .from(repertorioItens)
    .where(eq(repertorioItens.escalaId, origem.id))
    .orderBy(asc(repertorioItens.ordem), asc(repertorioItens.id));
  if (itens.length === 0) throw new ErroRepertorio("O evento escolhido não tem repertório");
  const [{ m }] = await db
    .select({ m: max(repertorioItens.ordem) })
    .from(repertorioItens)
    .where(eq(repertorioItens.escalaId, escalaId));
  let ordem = m ?? 0;
  for (const i of itens) {
    await db.insert(repertorioItens).values({
      igrejaId: ator.igrejaId,
      escalaId,
      ordem: ++ordem,
      titulo: i.titulo,
      artista: i.artista,
      tom: i.tom,
      linkSpotify: i.linkSpotify,
      linkDeezer: i.linkDeezer,
      linkCifra: i.linkCifra,
      observacao: i.observacao,
      criadoPor: ator.id,
    });
  }
  return itens.length;
}

/** Quantidade de músicas por escala. */
export async function contagemPorEscala(db: AnyDb, igrejaId: number, escalaIds: number[]) {
  if (escalaIds.length === 0) return new Map<number, number>();
  const linhas = await db
    .select({ escalaId: repertorioItens.escalaId, n: sql<number>`count(*)::int` })
    .from(repertorioItens)
    .where(and(eq(repertorioItens.igrejaId, igrejaId), inArray(repertorioItens.escalaId, escalaIds)))
    .groupBy(repertorioItens.escalaId);
  return new Map(linhas.map((l) => [l.escalaId, l.n]));
}

/**
 * Links de repertório por escala: só entram escalas com música ou em que o ator é líder.
 * Alimenta o card da agenda e o detalhe do evento.
 */
export async function linksDeRepertorio(db: AnyDb, ator: Ator, escalaIds: number[]) {
  const mapa = new Map<number, { eventoId: number; ministerioId: number; musicas: number; lider: boolean }>();
  if (escalaIds.length === 0) return mapa;
  const escalas = await db
    .select({ id: t.escalas.id, eventoId: t.escalas.eventoId, ministerioId: t.escalas.ministerioId })
    .from(t.escalas)
    .where(and(eq(t.escalas.igrejaId, ator.igrejaId), inArray(t.escalas.id, escalaIds)));
  const contagem = await contagemPorEscala(db, ator.igrejaId, escalaIds);
  const lideres = new Map<number, boolean>();
  for (const e of escalas) {
    if (!lideres.has(e.ministerioId)) lideres.set(e.ministerioId, await temPapel(db, ator, "lider", e.ministerioId));
    const lider = lideres.get(e.ministerioId)!;
    const musicas = contagem.get(e.id) ?? 0;
    if (lider || musicas > 0) mapa.set(e.id, { eventoId: e.eventoId, ministerioId: e.ministerioId, musicas, lider });
  }
  return mapa;
}

/** Texto do repertório para o WhatsApp. */
export function textoRepertorio(
  evento: string,
  ministerio: string,
  itens: { titulo: string; artista: string | null; tom: string | null }[],
) {
  const linhas = itens.map(
    (i, n) => `${n + 1}. ${i.titulo}${i.artista ? ` - ${i.artista}` : ""}${i.tom ? ` (tom ${i.tom})` : ""}`,
  );
  return `Repertório - ${ministerio} - ${evento}\n${linhas.join("\n")}`;
}

export const linkWhatsAppTexto = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/** Links de repertório do evento (um por ministério, com o nome dele). */
export async function linksDoEvento(db: AnyDb, ator: Ator, eventoId: number) {
  const escalas = await db
    .select({ id: t.escalas.id, ministerioId: t.escalas.ministerioId, ministerio: t.ministerios.nome })
    .from(t.escalas)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .where(and(eq(t.escalas.igrejaId, ator.igrejaId), eq(t.escalas.eventoId, eventoId)))
    .orderBy(asc(t.ministerios.nome));
  const links = await linksDeRepertorio(db, ator, escalas.map((e) => e.id));
  const visiveis = [];
  for (const e of escalas.filter((x) => links.has(x.id))) {
    try {
      await exigirAcessoRepertorio(db, ator, eventoId, e.ministerioId);
      visiveis.push({ ministerioId: e.ministerioId, ministerio: e.ministerio });
    } catch (erro) {
      if (!(erro instanceof ErroAcesso)) throw erro;
    }
  }
  return visiveis;
}
