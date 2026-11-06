import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Cabecalho } from "@/components/Cabecalho";
import { IconeApp } from "@/components/app/icones";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { contagemPorEscala, linksDeRepertorio } from "@/lib/repertorio/nucleo";
import { agendaDoUsuario, trocasParaMim } from "@/lib/trocas/nucleo";
import { responderTrocaNoInicio } from "./acoes";
import { RespostaEscala } from "./RespostaEscala";

export const dynamic = "force-dynamic";

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;
const STATUS_CHIP = { pendente: "chip--warn", confirmado: "chip--good", recusado: "chip--bad" } as const;
const MS_48H = 48 * 60 * 60 * 1000;

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Inicio({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const usuario = await exigirUsuarioSemTroca();
  const banco = db() as unknown as AnyDb;
  const [todas, paraMim] = await Promise.all([agendaDoUsuario(banco, usuario), trocasParaMim(banco, usuario)]);
  const itens = todas.filter((i) => i.status !== "recusado");
  const proxima = itens[0];
  const pendentes = itens.filter((i) => i.status === "pendente" && i !== proxima);
  const seguintes = itens.filter((i) => i !== proxima && i.status !== "pendente").slice(0, 3);
  const [links, contagens] = proxima
    ? await Promise.all([
        linksDeRepertorio(banco, usuario, [proxima.escalaId]),
        contagemPorEscala(banco, usuario.igrejaId, [proxima.escalaId]),
      ])
    : [new Map(), new Map()];
  const { erro, ok } = await searchParams;
  const hoje = maiuscula(formatInTimeZone(new Date(), FUSO, "EEEE, d 'de' MMMM", { locale: ptBR }));
  const quando = (d: Date) => maiuscula(formatInTimeZone(d, FUSO, "EEE, d 'de' MMM 'às' HH:mm", { locale: ptBR }));
  const hora = (d: Date) => formatInTimeZone(d, FUSO, "HH:mm");

  const link = proxima ? links.get(proxima.escalaId) : undefined;
  const musicas = proxima ? (contagens.get(proxima.escalaId) ?? 0) : 0;

  return (
    <div className="tela">
      <Cabecalho eyebrow={hoje} titulo={`Olá, ${usuario.nome.split(" ")[0]}`} />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="alerta alerta--good">
          {ok}
        </p>
      )}

      {paraMim.map((p) => (
        <form key={p.id} action={responderTrocaNoInicio} className="alerta alerta--warn space-y-2" data-enter>
          <input type="hidden" name="troca" value={p.id} />
          <p>
            {p.solicitante} pede para você assumir <strong>{p.funcao}</strong> ({p.ministerio}) em {p.titulo},{" "}
            {quando(p.inicio)}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button name="acao" value="aceitar" className="tbtn tbtn--p">
              Aceitar
            </button>
            <button name="acao" value="recusar" className="tbtn">
              Recusar
            </button>
          </div>
        </form>
      ))}

      {proxima ? (
        <section className="card space-y-3" data-enter aria-label="Próxima escala">
          <p className="eyebrow">Sua próxima escala</p>
          <div>
            <h2 className="card__title" style={{ fontSize: "var(--fs-xl)" }}>
              {proxima.evento.titulo}
            </h2>
            <p className="text-muted">
              {quando(proxima.evento.inicio)}
              {proxima.evento.fim ? `–${hora(proxima.evento.fim)}` : ""}
            </p>
          </div>
          <p>
            <strong>{proxima.funcao}</strong> · {proxima.ministerio}
          </p>
          <p>
            <span className={`chip ${STATUS_CHIP[proxima.status]}`}>{STATUS[proxima.status]}</span>
            {proxima.checkinEm && (
              <span className="text-xs text-muted"> check-in às {hora(proxima.checkinEm)}</span>
            )}
          </p>
          {proxima.colegas.length > 0 && (
            <p className="text-sm text-muted">
              Com: {proxima.colegas.map((c) => `${c.nome} (${c.funcao})`).join(", ")}
            </p>
          )}
          {link && (
            <Link href={`/escalas/${link.eventoId}/${link.ministerioId}/repertorio`} className="link block text-sm">
              Repertório{musicas ? ` (${musicas} ${musicas === 1 ? "música" : "músicas"})` : ""}
            </Link>
          )}
          {proxima.troca && (
            <p className="alerta alerta--warn text-xs">
              Troca {proxima.troca.status === "aberta" ? "aguardando o substituto" : "aguardando o líder"}.
            </p>
          )}
          <RespostaEscala
            itemId={proxima.itemId}
            status={proxima.status}
            dentroDe48h={proxima.evento.inicio.getTime() - Date.now() < MS_48H}
            podeCheckin={proxima.checkinAberto}
            jaFezCheckin={!!proxima.checkinEm}
          />
        </section>
      ) : (
        <section className="list vazio" data-enter>
          <span className="row__ic">
            <IconeApp nome="agenda" />
          </span>
          <h2>Nenhuma escala à frente</h2>
          <p>Quando o líder publicar uma escala com você, ela aparece aqui.</p>
          <div className="vazio__acoes">
            <Link href="/perfil/servir" className="tbtn tbtn--p">
              Quero servir
            </Link>
            <Link href="/agenda" className="tbtn tbtn--soft">
              Ver agenda
            </Link>
          </div>
        </section>
      )}

      {pendentes.length > 0 && (
        <section data-enter>
          <h2 className="card__title" style={{ margin: "4px 4px 8px" }}>
            Aguardando sua resposta
          </h2>
          <div className="list">
            {pendentes.map((i) => (
              <Link key={i.itemId} href="/agenda" className="row">
                <span className="row__tx">
                  <b>{i.evento.titulo}</b>
                  <span>
                    {quando(i.evento.inicio)} · {i.funcao}
                  </span>
                </span>
                <span className="row__end">
                  <span className="chip chip--warn">Responder</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seguintes.length > 0 && (
        <section data-enter>
          <h2 className="card__title" style={{ margin: "4px 4px 8px" }}>
            Depois
          </h2>
          <div className="list">
            {seguintes.map((i) => (
              <Link key={i.itemId} href="/agenda" className="row">
                <span className="row__tx">
                  <b>{i.evento.titulo}</b>
                  <span>
                    {quando(i.evento.inicio)} · {i.funcao}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
