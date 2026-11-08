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
import css from "./inicio.module.css";
import { RespostaEscala } from "./RespostaEscala";

export const dynamic = "force-dynamic";

const STATUS = { pendente: "Aguardando confirmação", confirmado: "Confirmado", recusado: "Recusado" } as const;
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
  const diaIso = (d: Date) => formatInTimeZone(d, FUSO, "yyyy-MM-dd");
  const linkDoDia = (d: Date) => `/agenda?dia=${diaIso(d)}`;
  const diasAte = (d: Date) =>
    Math.round((Date.parse(`${diaIso(d)}T12:00:00Z`) - Date.parse(`${diaIso(new Date())}T12:00:00Z`)) / 86_400_000);
  const quandoFaltam = (n: number) => (n <= 0 ? "Hoje" : n === 1 ? "Amanhã" : `Daqui a ${n} dias`);
  const iniciais = (nome: string) =>
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  const listaDeNomes = (nomes: string[]) =>
    nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;

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
          <Link href={linkDoDia(p.inicio)} className="link text-sm">
            Ver o dia na agenda
          </Link>
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
        <section className={css.hero} data-enter aria-label="Próxima escala">
          <div className={css.quando}>
            <div className={css.data} aria-hidden="true">
              <b>{formatInTimeZone(proxima.evento.inicio, FUSO, "d")}</b>
              <span>{["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][Number(formatInTimeZone(proxima.evento.inicio, FUSO, "i")) % 7]}</span>
            </div>
            <div>
              <p className={css.rotulo}>
                {quandoFaltam(diasAte(proxima.evento.inicio))} · {quando(proxima.evento.inicio)}
                {proxima.evento.fim ? `–${hora(proxima.evento.fim)}` : ""}
              </p>
              <h2 className={css.titulo}>{proxima.evento.titulo}</h2>
            </div>
          </div>
          <div className={css.pilulas}>
            <span className={css.pilula}>
              {proxima.ministerio} · {proxima.funcao}
            </span>
            {link ? (
              <Link href={`/escalas/${link.eventoId}/${link.ministerioId}/repertorio`} className={css.pilula}>
                Repertório{musicas ? ` · ${musicas} ${musicas === 1 ? "música" : "músicas"}` : ""}
              </Link>
            ) : (
              <span className={css.pilula}>Repertório ainda vazio</span>
            )}
            <Link href={`/chat/${proxima.evento.id}`} className={css.pilula}>
              Chat da equipe
            </Link>
          </div>
          {proxima.colegas.length > 0 && (
            <div className={css.equipe}>
              <span className={css.rostos} aria-hidden="true">
                {proxima.colegas.slice(0, 3).map((c, n) => (
                  <span key={n}>{iniciais(c.nome)}</span>
                ))}
              </span>
              <span>Com {listaDeNomes(proxima.colegas.map((c) => c.nome.split(" ")[0]))}</span>
            </div>
          )}
          {(proxima.status !== "pendente" || proxima.checkinEm || proxima.troca) && (
            <p className={css.avisos}>
              {proxima.status !== "pendente" && <span className={css.pilula}>{STATUS[proxima.status]}</span>}
              {proxima.checkinEm && <span className={css.pilula}>Presente · check-in às {hora(proxima.checkinEm)}</span>}
              {proxima.troca && (
                <span className={css.pilula}>
                  Troca {proxima.troca.status === "aberta" ? "aguardando o substituto" : "aguardando o líder"}
                </span>
              )}
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
            Para você responder
          </h2>
          <div className="list">
            {pendentes.map((i) => (
              <Link key={i.itemId} href={linkDoDia(i.evento.inicio)} className="row">
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
              <Link key={i.itemId} href={linkDoDia(i.evento.inicio)} className="row">
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
