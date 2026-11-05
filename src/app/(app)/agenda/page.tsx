import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { tokenAgendaAtual } from "@/lib/trocas/ics";
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

export const dynamic = "force-dynamic";

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;

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
  const substitutos = new Map(
    await Promise.all(
      itens.filter((i) => !i.troca && i.status !== "recusado").map(async (i) => [i.itemId, await listarSubstitutos(banco, ator, i.itemId)] as const),
    ),
  );
  const { erro, ok } = await searchParams;
  const quando = (d: Date) => formatInTimeZone(d, FUSO, "dd/MM HH:mm");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agenda</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{ok}</p>}

      {paraMim.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Pedidos de troca para você</h2>
          {paraMim.map((p) => (
            <form key={p.id} action={responderTrocaAcao} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <input type="hidden" name="troca" value={p.id} />
              <p>
                {p.solicitante} pede para você assumir <strong>{p.funcao}</strong> ({p.ministerio}) em {p.titulo},{" "}
                {quando(p.inicio)}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button name="acao" value="aceitar" className="botao">
                  Aceitar
                </button>
                <button name="acao" value="recusar" className="botao">
                  Recusar
                </button>
              </div>
            </form>
          ))}
        </section>
      )}

      {itens.length === 0 ? (
        <p className="text-sm text-slate-600">Você não tem escalas publicadas à frente.</p>
      ) : (
        <ul className="space-y-4">
          {itens.map((i) => (
            <li key={i.itemId} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-semibold">{i.evento.titulo}</p>
                <p className="text-sm text-slate-600">
                  {quando(i.evento.inicio)}
                  {i.evento.fim ? `–${formatInTimeZone(i.evento.fim, FUSO, "HH:mm")}` : ""} · {i.ministerio} · {i.funcao}
                </p>
                <p className="text-xs text-slate-500">
                  {STATUS[i.status]}
                  {i.checkinEm ? ` · check-in às ${formatInTimeZone(i.checkinEm, FUSO, "HH:mm")}` : ""}
                </p>
              </div>
              {i.colegas.length > 0 && (
                <p className="text-xs text-slate-600">
                  Com: {i.colegas.map((c) => `${c.nome} (${c.funcao})`).join(", ")}
                </p>
              )}
              {i.troca ? (
                <p className="text-xs text-amber-800">
                  Troca {i.troca.status === "aberta" ? "aguardando o substituto" : "aguardando o líder"}.
                </p>
              ) : null}
              {i.status !== "recusado" && (
                <div className="grid grid-cols-2 gap-3">
                  {i.status === "pendente" && (
                    <form action={confirmarEscala}>
                      <input type="hidden" name="item" value={i.itemId} />
                      <button className="botao w-full">Confirmar</button>
                    </form>
                  )}
                  <form action={recusarEscala}>
                    <input type="hidden" name="item" value={i.itemId} />
                    <button className="botao w-full">Não posso</button>
                  </form>
                </div>
              )}
              {i.checkinAberto && i.status !== "recusado" && !i.checkinEm && (
                <form action={checkinAcao}>
                  <input type="hidden" name="item" value={i.itemId} />
                  <button className="botao w-full">Fazer check-in</button>
                </form>
              )}
              {!i.troca && i.status !== "recusado" && (
                <details>
                  <summary className="cursor-pointer text-sm underline">Pedir troca</summary>
                  {(substitutos.get(i.itemId) ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Ninguém disponível com esta função.</p>
                  ) : (
                    <form action={pedirTrocaAcao} className="mt-2 space-y-2">
                      <input type="hidden" name="item" value={i.itemId} />
                      <select name="substituto" className="campo" required>
                        {(substitutos.get(i.itemId) ?? []).map((s) => (
                          <option key={s.usuarioId} value={s.usuarioId}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                      <button className="botao w-full">Enviar pedido</button>
                    </form>
                  )}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Calendário do celular</h2>
        {token ? (
          <>
            <p className="break-all rounded bg-slate-100 p-2 text-xs">/agenda/ics/{token}</p>
            <p className="text-xs text-slate-500">
              Assine este endereço (com o domínio do portal) no app de calendário. Quem tiver o link vê sua agenda.
            </p>
            <form action={revogarLinkCalendario}>
              <button className="botao w-full">Revogar link</button>
            </form>
          </>
        ) : (
          <form action={gerarLinkCalendario}>
            <button className="botao w-full">Gerar link do calendário</button>
          </form>
        )}
        <Link href="/agenda/trocas" className="block underline">
          Aprovar trocas (líderes)
        </Link>
      </section>
    </div>
  );
}
