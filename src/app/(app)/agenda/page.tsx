import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { indisponibilidades } from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { tokenAgendaAtual } from "@/lib/trocas/ics";
import { linksDeRepertorio } from "@/lib/repertorio/nucleo";
import { agendaDoUsuario, listarSubstitutos, trocasParaMim } from "@/lib/trocas/nucleo";
import { gerarLinkCalendario, responderTrocaAcao, revogarLinkCalendario } from "./acoes";
import { Cabecalho } from "@/components/Cabecalho";
import { CalendarioAgenda, type EscalaDoDia } from "./CalendarioAgenda";

/** Dias `AAAA-MM-DD` de um período, limitado a 366 para o calendário não pesar. */
function diasDoPeriodo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  const f = new Date(`${fim}T12:00:00Z`);
  for (let n = 0; d <= f && n < 366; n++, d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
  return dias;
}

export const dynamic = "force-dynamic";

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; dia?: string }>;
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
  const { erro, ok, dia } = await searchParams;
  const diaInicial = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
  const quando = (d: Date) => formatInTimeZone(d, FUSO, "dd/MM HH:mm");
  const hoje = formatInTimeZone(new Date(), FUSO, "yyyy-MM-dd");
  const periodos = await banco
    .select({ inicio: indisponibilidades.dataInicio, fim: indisponibilidades.dataFim })
    .from(indisponibilidades)
    .where(
      and(
        eq(indisponibilidades.usuarioId, ator.id),
        eq(indisponibilidades.igrejaId, ator.igrejaId),
        gte(indisponibilidades.dataFim, hoje),
      ),
    )
    .orderBy(asc(indisponibilidades.dataInicio));
  const folgas = periodos.flatMap((p) => diasDoPeriodo(p.inicio, p.fim));
  const escalas: EscalaDoDia[] = itens.map((i) => {
    const r = repertorios.get(i.escalaId);
    return {
      itemId: i.itemId,
      dia: formatInTimeZone(i.evento.inicio, FUSO, "yyyy-MM-dd"),
      titulo: i.evento.titulo,
      horario:
        formatInTimeZone(i.evento.inicio, FUSO, "HH:mm") +
        (i.evento.fim ? `–${formatInTimeZone(i.evento.fim, FUSO, "HH:mm")}` : ""),
      ministerio: i.ministerio,
      funcao: i.funcao,
      status: i.status,
      checkinHora: i.checkinEm ? formatInTimeZone(i.checkinEm, FUSO, "HH:mm") : null,
      checkinAberto: i.checkinAberto,
      colegas: i.colegas.map((c) => `${c.nome} (${c.funcao})`),
      repertorio: r ? `/escalas/${r.eventoId}/${r.ministerioId}/repertorio` : null,
      musicas: r?.musicas ?? 0,
      chat: `/chat/${i.evento.id}`,
      troca: i.troca ? (i.troca.status as "aberta" | "aceita") : null,
      substitutos: (substitutos.get(i.itemId) ?? []).map((s) => ({ id: s.usuarioId, nome: s.nome })),
    };
  });

  return (
    <div className="tela">
      <Cabecalho eyebrow="Suas escalas" titulo="Agenda">
        <details>
          <summary className="tbtn tbtn--soft">Calendário do celular</summary>
          <div className="card space-y-3 text-sm" style={{ marginTop: 8 }}>
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
          </div>
        </details>
      </Cabecalho>
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

      <CalendarioAgenda escalas={escalas} folgas={folgas} diaInicial={diaInicial} />
    </div>
  );
}
