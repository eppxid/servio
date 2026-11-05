import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { dadosMontagem } from "@/lib/escala/nucleo";
import { linkWhatsApp, textoEscala } from "@/lib/escala/texto";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { gravarEscala } from "../../acoes";

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
  const { erro, ok } = await searchParams;
  const nomeDe = (f: (typeof d.funcoes)[number]) =>
    f.candidatos.find((c) => c.usuarioId === f.escolhido)?.nome ?? null;
  const whatsapp =
    d.status === "publicada"
      ? linkWhatsApp(textoEscala(d.evento, d.ministerio.nome, d.funcoes.map((f) => ({ funcao: f.nome, nome: nomeDe(f) }))))
      : null;

  return (
    <div className="space-y-6">
      <Link href="/escalas" className="text-sm">
        ← Escalas
      </Link>
      <header>
        <h1 className="text-2xl font-bold">
          {d.ministerio.nome} · {d.evento.titulo}
        </h1>
        <p className="text-sm text-slate-600">
          {formatInTimeZone(d.evento.inicio, FUSO, "dd/MM/yyyy HH:mm")}
          {d.evento.fim ? `–${formatInTimeZone(d.evento.fim, FUSO, "HH:mm")}` : ""} ·{" "}
          {d.status === "publicada" ? "Publicada" : d.status === "rascunho" ? "Rascunho" : "Sem escala"}
        </p>
      </header>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{ok}</p>}

      {d.funcoes.length === 0 ? (
        <p className="text-sm text-slate-600">
          Cadastre as funções do ministério em{" "}
          <Link href={`/ministerios/${d.ministerio.id}`} className="underline">
            Ministérios
          </Link>
          .
        </p>
      ) : (
        <form action={gravarEscala} className="space-y-4">
          <input type="hidden" name="evento" value={d.evento.id} />
          <input type="hidden" name="ministerio" value={d.ministerio.id} />
          {d.funcoes.map((f) => {
            const bloqueados = f.candidatos.filter((c) => c.bloqueio);
            return (
              <fieldset key={f.id} className="space-y-1">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">{f.nome}</span>
                  {f.statusItem && d.status === "publicada" && (
                    <span className="ml-2 text-xs text-slate-500">({f.statusItem})</span>
                  )}
                  <select name={`f_${f.id}`} defaultValue={f.escolhido ?? ""} className="campo">
                    <option value="">— vago —</option>
                    {f.candidatos.map((c) => (
                      <option
                        key={c.usuarioId}
                        value={c.usuarioId}
                        disabled={Boolean(c.bloqueio) && c.usuarioId !== f.escolhido}
                        className={c.bloqueio ? "text-red-600" : undefined}
                      >
                        {c.nome}
                        {c.bloqueio ? ` (${MOTIVO[c.bloqueio]})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {f.candidatos.length === 0 && (
                  <p className="text-xs text-slate-500">Ninguém aprovado tem esta função.</p>
                )}
                {bloqueados.length > 0 && (
                  <ul className="text-xs text-red-600">
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
          <div className="grid grid-cols-2 gap-3">
            <button type="submit" name="acao" value="rascunho" className="botao">
              Salvar rascunho
            </button>
            <button type="submit" name="acao" value="publicar" className="botao">
              {d.status === "publicada" ? "Atualizar publicada" : "Publicar"}
            </button>
          </div>
        </form>
      )}

      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="botao block text-center">
          Compartilhar no WhatsApp
        </a>
      )}
    </div>
  );
}
