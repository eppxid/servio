import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { tokenAgendaAtual } from "@/lib/trocas/ics";
import { linksDeRepertorio } from "@/lib/repertorio/nucleo";
import { agendaDoUsuario, listarSubstitutos, trocasParaMim } from "@/lib/trocas/nucleo";
import {
  checkinAcao,
  confirmarEscala,
  gerarLinkCalendario,
  pedirTrocaAcao,
  recusarEscala,
  responderTrocaAcao,
  revogarLinkCalendario,
} from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;
const STATUS_CHIP = { pendente: "chip--warn", confirmado: "chip--good", recusado: "chip--bad" } as const;

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const banco = db() as unknown as AnyDb;
  const [itens, paraMim, token] = await Promise.all([
    agendaDoUsuario(banco, ator),
    trocasParaMim(banco, ator),
    tokenAgendaAtual(banco, ator),
  ]);
  const repertorios = await linksDeRepertorio(banco, ator, itens.map((i) => i.escalaId));
  const substitutos = new Map(
    await Promise.all(
      itens.filter((i) => !i.troca && i.status !== "recusado").map(async (i) => [i.itemId, await listarSubstitutos(banco, ator, i.itemId)] as const),
    ),
  );
  const { erro, ok } = await searchParams;
  const quando = (d: Date) => formatInTimeZone(d, FUSO, "dd/MM HH:mm");

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Suas escalas" titulo="Agenda" />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && <p className="alerta alerta--good">{ok}</p>}

      {paraMim.length > 0 && (
        <section className="space-y-3">
          <h2 className="card__title">Pedidos de troca para você</h2>
          {paraMim.map((p) => (
            <form key={p.id} action={responderTrocaAcao} className="alerta alerta--warn space-y-2">
              <input type="hidden" name="troca" value={p.id} />
              <p>
                {p.solicitante} pede para você assumir <strong>{p.funcao}</strong> ({p.ministerio}) em {p.titulo},{" "}
                {quando(p.inicio)}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button name="acao" value="aceitar" className="btn btn--primary btn--block">
                  Aceitar
                </button>
                <button name="acao" value="recusar" className="btn btn--block">
                  Recusar
                </button>
              </div>
            </form>
          ))}
        </section>
      )}

      {itens.length === 0 ? (
        <p className="card text-sm text-muted">Você não tem escalas publicadas à frente.</p>
      ) : (
        <ul className="grid items-start gap-4 md:grid-cols-2" data-enter>
          {itens.map((i) => (
            <li key={i.itemId} className="card space-y-3">
              <div>
                <p className="card__title">{i.evento.titulo}</p>
                <p className="text-sm text-muted">
                  {quando(i.evento.inicio)}
                  {i.evento.fim ? `–${formatInTimeZone(i.evento.fim, FUSO, "HH:mm")}` : ""} · {i.ministerio} · {i.funcao}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`chip ${STATUS_CHIP[i.status]}`}>{STATUS[i.status]}</span>
                  {i.checkinEm && (
                    <span className="text-xs text-muted">check-in às {formatInTimeZone(i.checkinEm, FUSO, "HH:mm")}</span>
                  )}
                </p>
              </div>
              {repertorios.has(i.escalaId) && (
                <Link
                  href={`/escalas/${repertorios.get(i.escalaId)!.eventoId}/${repertorios.get(i.escalaId)!.ministerioId}/repertorio`}
                  className="link block text-sm"
                >
                  Repertório
                </Link>
              )}
              {i.colegas.length > 0 && (
                <p className="text-xs text-muted">
                  Com: {i.colegas.map((c) => `${c.nome} (${c.funcao})`).join(", ")}
                </p>
              )}
              {i.troca ? (
                <p className="alerta alerta--warn text-xs">
                  Troca {i.troca.status === "aberta" ? "aguardando o substituto" : "aguardando o líder"}.
                </p>
              ) : null}
              {i.status !== "recusado" && (
                <div className="grid grid-cols-2 gap-3">
                  {i.status === "pendente" && (
                    <form action={confirmarEscala}>
                      <input type="hidden" name="item" value={i.itemId} />
                      <button className="btn btn--primary btn--block">Confirmar</button>
                    </form>
                  )}
                  <form action={recusarEscala}>
                    <input type="hidden" name="item" value={i.itemId} />
                    <button className="btn btn--block">Não posso</button>
                  </form>
                </div>
              )}
              {i.checkinAberto && i.status !== "recusado" && !i.checkinEm && (
                <form action={checkinAcao}>
                  <input type="hidden" name="item" value={i.itemId} />
                  <button className="btn btn--primary btn--block">Fazer check-in</button>
                </form>
              )}
              {!i.troca && i.status !== "recusado" && (
                <details>
                  <summary className="btn btn--sm cursor-pointer">Pedir troca</summary>
                  {(substitutos.get(i.itemId) ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-muted">Ninguém disponível com esta função.</p>
                  ) : (
                    <form action={pedirTrocaAcao} className="mt-3 space-y-2">
                      <input type="hidden" name="item" value={i.itemId} />
                      <select name="substituto" className="campo" required>
                        {(substitutos.get(i.itemId) ?? []).map((s) => (
                          <option key={s.usuarioId} value={s.usuarioId}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn--primary btn--block">Enviar pedido</button>
                    </form>
                  )}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="card space-y-3 text-sm">
        <h2 className="card__title">Calendário do celular</h2>
        {token ? (
          <>
            <p className="campo break-all text-xs">/agenda/ics/{token}</p>
            <p className="text-xs text-muted">
              Assine este endereço (com o domínio do portal) no app de calendário. Quem tiver o link vê sua agenda.
            </p>
            <form action={revogarLinkCalendario}>
              <button className="btn btn--danger btn--block">Revogar link</button>
            </form>
          </>
        ) : (
          <form action={gerarLinkCalendario}>
            <button className="btn btn--primary btn--block">Gerar link do calendário</button>
          </form>
        )}
        <Link href="/agenda/trocas" className="btn btn--block">
          Aprovar trocas (líderes)
        </Link>
      </section>
    </div>
  );
}
