import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { PresencaEscala } from "@/components/PresencaEscala";
import { dadosMontagem } from "@/lib/escala/nucleo";
import { linkWhatsApp, textoEscala } from "@/lib/escala/texto";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { presencaDaEscala } from "@/lib/trocas/nucleo";
import { gravarEscala } from "../../acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const MOTIVO = { indisponivel: "indisponível", conflito: "em outro evento no horário" } as const;

export default async function MontarEscala({
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
  let d;
  try {
    d = await dadosMontagem(db() as unknown as AnyDb, ator, eventoId, ministerioId);
  } catch (erro) {
    if (erro instanceof ErroAcesso) notFound();
    throw erro;
  }
  const presenca = d.status === "publicada" ? await presencaDaEscala(db() as unknown as AnyDb, ator, eventoId, ministerioId) : [];
  const { erro, ok } = await searchParams;
  const nomeDe = (f: (typeof d.funcoes)[number]) =>
    f.candidatos.find((c) => c.usuarioId === f.escolhido)?.nome ?? null;
  const whatsapp =
    d.status === "publicada"
      ? linkWhatsApp(textoEscala(d.evento, d.ministerio.nome, d.funcoes.map((f) => ({ funcao: f.nome, nome: nomeDe(f) }))))
      : null;

  return (
    <div className="space-y-5">
      <Cabecalho
        eyebrow={`${formatInTimeZone(d.evento.inicio, FUSO, "dd/MM/yyyy HH:mm")}${
          d.evento.fim ? `–${formatInTimeZone(d.evento.fim, FUSO, "HH:mm")}` : ""
        } · ${d.status === "publicada" ? "Publicada" : d.status === "rascunho" ? "Rascunho" : "Sem escala"}`}
        titulo={`${d.ministerio.nome} · ${d.evento.titulo}`}
      >
        <Link href="/escalas" className="btn">
          ← Escalas
        </Link>
      </Cabecalho>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && <p className="alerta alerta--good">{ok}</p>}

      {d.funcoes.length === 0 ? (
        <p className="text-sm text-muted">
          Cadastre as funções do ministério em{" "}
          <Link href={`/ministerios/${d.ministerio.id}`} className="link">
            Ministérios
          </Link>
          .
        </p>
      ) : (
        <form action={gravarEscala} className="card space-y-4">
          <input type="hidden" name="evento" value={d.evento.id} />
          <input type="hidden" name="ministerio" value={d.ministerio.id} />
          {d.funcoes.map((f) => {
            const bloqueados = f.candidatos.filter((c) => c.bloqueio);
            return (
              <fieldset key={f.id} className="space-y-1">
                <label className="rotulo">
                  <span className="text-ink font-semibold">{f.nome}</span>
                  {f.statusItem && d.status === "publicada" && (
                    <span className="ml-2 text-xs font-normal">({f.statusItem})</span>
                  )}
                  <select name={`f_${f.id}`} defaultValue={f.escolhido ?? ""} className="campo">
                    <option value="">— vago —</option>
                    {f.candidatos.map((c) => (
                      <option
                        key={c.usuarioId}
                        value={c.usuarioId}
                        disabled={Boolean(c.bloqueio) && c.usuarioId !== f.escolhido}
                        className={c.bloqueio ? "text-bad" : undefined}
                      >
                        {c.nome}
                        {c.bloqueio ? ` (${MOTIVO[c.bloqueio]})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {f.candidatos.length === 0 && (
                  <p className="text-xs text-muted">Ninguém aprovado tem esta função.</p>
                )}
                {bloqueados.length > 0 && (
                  <ul className="text-xs text-bad">
                    {bloqueados.map((c) => (
                      <li key={c.usuarioId}>
                        {c.nome}: {MOTIVO[c.bloqueio!]}
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="submit" name="acao" value="rascunho" className="btn btn--block">
              Salvar rascunho
            </button>
            <button type="submit" name="acao" value="publicar" className="btn btn--primary btn--block">
              {d.status === "publicada" ? "Atualizar publicada" : "Publicar"}
            </button>
          </div>
        </form>
      )}

      <PresencaEscala linhas={presenca} />

      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn--block">
          Compartilhar no WhatsApp
        </a>
      )}
    </div>
  );
}
