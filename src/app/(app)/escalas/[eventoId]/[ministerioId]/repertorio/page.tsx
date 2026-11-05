import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import * as t from "@/db/schema";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, ministerioDaIgreja } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { urlBusca, urlEmbed } from "@/lib/repertorio/links";
import {
  eventosParaCopiar,
  linkWhatsAppTexto,
  listarRepertorio,
  textoRepertorio,
} from "@/lib/repertorio/nucleo";
import { copiarAcao, editarAcao, excluirAcao, incluirAcao, moverAcao } from "./acoes";
import { Player } from "./Player";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

function Campos({ v }: { v?: { titulo: string; artista: string | null; tom: string | null; linkSpotify: string | null; linkDeezer: string | null; linkCifra: string | null; observacao: string | null } }) {
  return (
    <div className="space-y-2">
      <input name="titulo" defaultValue={v?.titulo} placeholder="Título" required maxLength={200} className="campo" />
      <div className="grid grid-cols-3 gap-2">
        <input name="artista" defaultValue={v?.artista ?? ""} placeholder="Artista" maxLength={200} className="campo col-span-2" />
        <input name="tom" defaultValue={v?.tom ?? ""} placeholder="Tom" maxLength={10} className="campo" />
      </div>
      <input name="linkSpotify" defaultValue={v?.linkSpotify ?? ""} placeholder="Link do Spotify" className="campo" />
      <input name="linkDeezer" defaultValue={v?.linkDeezer ?? ""} placeholder="Link do Deezer" className="campo" />
      <input name="linkCifra" defaultValue={v?.linkCifra ?? ""} placeholder="Link do Cifra Club" className="campo" />
      <input name="observacao" defaultValue={v?.observacao ?? ""} placeholder="Observação" maxLength={500} className="campo" />
    </div>
  );
}

export default async function Repertorio({
  params,
  searchParams,
}: {
  params: Promise<{ eventoId: string; ministerioId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const p = await params;
  const eventoId = idSeguro(p.eventoId);
  const ministerioId = idSeguro(p.ministerioId);
  const banco = db() as unknown as AnyDb;
  let r;
  try {
    r = await listarRepertorio(banco, ator, eventoId, ministerioId);
  } catch (erro) {
    if (erro instanceof ErroAcesso) notFound();
    throw erro;
  }
  const [[evento], ministerio, copiaveis] = await Promise.all([
    banco.select().from(t.eventos).where(eq(t.eventos.id, eventoId)).limit(1),
    ministerioDaIgreja(banco, ator.igrejaId, ministerioId),
    r.lider ? eventosParaCopiar(banco, ator, eventoId, ministerioId) : Promise.resolve([]),
  ]);
  const { erro, ok } = await searchParams;
  const nomeMinisterio = ministerio?.nome ?? "";
  const whatsapp = r.itens.length
    ? linkWhatsAppTexto(textoRepertorio(evento.titulo, nomeMinisterio, r.itens))
    : null;
  const oculto = (id: number) => (
    <>
      <input type="hidden" name="evento" value={eventoId} />
      <input type="hidden" name="ministerio" value={ministerioId} />
      <input type="hidden" name="item" value={id} />
    </>
  );

  return (
    <div className="space-y-5">
      <Cabecalho
        eyebrow={`${evento.titulo} · ${formatInTimeZone(evento.inicio, FUSO, "dd/MM/yyyy HH:mm")}`}
        titulo={`Repertório · ${nomeMinisterio}`}
      >
        <Link href={r.lider ? `/escalas/${eventoId}/${ministerioId}` : "/agenda"} className="btn">
          ← Voltar
        </Link>
      </Cabecalho>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && <p className="alerta alerta--good">{ok}</p>}

      {r.itens.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma música no repertório.</p>
      ) : (
        <ol className="grid items-start gap-4 md:grid-cols-2">
          {r.itens.map((i, n) => {
            const spotify = urlEmbed("spotify", i.linkSpotify);
            const deezer = urlEmbed("deezer", i.linkDeezer);
            const links = [
              ["Spotify", i.linkSpotify, urlBusca("spotify", i.titulo, i.artista)],
              ["Deezer", i.linkDeezer, urlBusca("deezer", i.titulo, i.artista)],
              ["Cifra Club", i.linkCifra, urlBusca("cifra", i.titulo, i.artista)],
            ] as const;
            return (
              <li key={i.id} className="card space-y-2">
                <div>
                  <p className="font-semibold">
                    {n + 1}. {i.titulo}
                    {i.tom && <span className="chip chip--plain ml-2">Tom {i.tom}</span>}
                  </p>
                  {i.artista && <p className="text-sm text-muted">{i.artista}</p>}
                  {i.observacao && <p className="text-xs text-muted">{i.observacao}</p>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {links.map(([nome, link, busca]) => (
                    <a key={nome} href={link ?? busca} target="_blank" rel="noopener noreferrer" className="link">
                      {link ? nome : `Buscar no ${nome}`}
                    </a>
                  ))}
                </div>
                {(spotify || deezer) && <Player spotify={spotify} deezer={deezer} />}
                {r.lider && (
                  <div className="space-y-2 border-t border-line pt-2">
                    <div className="grid grid-cols-3 gap-2">
                      <form action={moverAcao}>
                        {oculto(i.id)}
                        <input type="hidden" name="direcao" value="subir" />
                        <button className="btn btn--block" disabled={n === 0} aria-label="Subir">
                          ↑
                        </button>
                      </form>
                      <form action={moverAcao}>
                        {oculto(i.id)}
                        <input type="hidden" name="direcao" value="descer" />
                        <button className="btn btn--block" disabled={n === r.itens.length - 1} aria-label="Descer">
                          ↓
                        </button>
                      </form>
                      <form action={excluirAcao}>
                        {oculto(i.id)}
                        <button className="btn btn--danger btn--block">Excluir</button>
                      </form>
                    </div>
                    <details>
                      <summary className="btn btn--sm cursor-pointer">Editar</summary>
                      <form action={editarAcao} className="mt-2 space-y-2">
                        {oculto(i.id)}
                        <Campos v={i} />
                        <button className="btn btn--primary btn--block">Salvar</button>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {r.lider && (
        <section className="card space-y-3">
          <h2 className="card__title">Incluir música</h2>
          <form action={incluirAcao} className="space-y-2">
            <input type="hidden" name="evento" value={eventoId} />
            <input type="hidden" name="ministerio" value={ministerioId} />
            <Campos />
            <button className="btn btn--primary btn--block">Incluir</button>
          </form>
          {copiaveis.length > 0 && (
            <form action={copiarAcao} className="space-y-2">
              <input type="hidden" name="evento" value={eventoId} />
              <input type="hidden" name="ministerio" value={ministerioId} />
              <label className="rotulo">
                <span className="text-ink font-semibold">Copiar repertório de outro evento</span>
                <select name="origem" className="campo">
                  {copiaveis.map((c) => (
                    <option key={c.eventoId} value={c.eventoId}>
                      {c.titulo} · {formatInTimeZone(c.inicio, FUSO, "dd/MM/yyyy")}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn--block">Copiar</button>
            </form>
          )}
        </section>
      )}

      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn--block">
          Compartilhar no WhatsApp
        </a>
      )}
    </div>
  );
}
