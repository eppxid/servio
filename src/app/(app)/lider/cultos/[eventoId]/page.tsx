import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { IconeApp, type NomeIcone } from "@/components/app/icones";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { versoesDeFoto } from "@/lib/foto/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { EditorModelo } from "../../tipos/[recorrenciaId]/EditorModelo";
import {
  aprovarEEscalarAcao,
  copiarVagasAcao,
  definirVagasAcao,
  desfazerRemocaoAcao,
  escolherPessoaAcao,
  publicarAcao,
} from "../acoes";
import { somaVagasPorTipo } from "@/lib/vagas/nucleo";
import { DIAS_SEMANA, dadosCulto, tiposDeCulto } from "../vagas-culto";
import s from "./culto.module.css";
import { VagasMinisterio } from "./VagasMinisterio";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Atalho({ href, icone, texto }: { href: string; icone: NomeIcone; texto: string }) {
  return (
    <Link href={href} className="row">
      <span className="row__ic">
        <IconeApp nome={icone} />
      </span>
      <span className="row__tx">
        <b>{texto}</b>
      </span>
      <span className="row__end">
        <IconeApp nome="dir" />
      </span>
    </Link>
  );
}

export const dynamic = "force-dynamic";

export default async function Culto({
  params,
  searchParams,
}: {
  params: Promise<{ eventoId: string }>;
  searchParams: Promise<{ tipoSemVagas?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const eventoId = idSeguro((await params).eventoId);
  const banco = db() as unknown as AnyDb;
  let d;
  try {
    d = await dadosCulto(banco, ator, eventoId);
  } catch (erro) {
    if (erro instanceof ErroAcesso) notFound();
    throw erro;
  }
  const idsDePessoas = d.ministerios.flatMap((m) =>
    m.funcoes.flatMap((f) => [...f.vagas.flatMap((v) => (v.usuarioId === null ? [] : [v.usuarioId])), ...f.candidatos.map((c) => c.usuarioId)]),
  );
  const fotos = Object.fromEntries(await versoesDeFoto(banco, [...new Set(idsDePessoas)]));
  const semVagas = d.ministerios.filter((m) => m.funcoes.length === 0);
  const tipos = semVagas.length > 0 ? await tiposDeCulto(banco, ator) : [];
  const soma = await somaVagasPorTipo(banco, ator, semVagas.map((m) => m.id));
  const pedidoSemVagas = idSeguro((await searchParams).tipoSemVagas);
  const tipoSemVagas = tipos.find((x) => x.id === pedidoSemVagas);
  const horaInicio = formatInTimeZone(d.evento.inicio, FUSO, "HH:mm");
  const quando = `${formatInTimeZone(d.evento.inicio, FUSO, "dd/MM")} · ${horaInicio}${
    d.evento.fim ? `–${formatInTimeZone(d.evento.fim, FUSO, "HH:mm")}` : ""
  }`;
  const dia = `${DIAS[Number(formatInTimeZone(d.evento.inicio, FUSO, "i")) - 1]}, ${formatInTimeZone(d.evento.inicio, FUSO, "d")} ${
    MESES[Number(formatInTimeZone(d.evento.inicio, FUSO, "M")) - 1]
  }`;
  const comVagas = d.ministerios.filter((m) => m.funcoes.length > 0);
  const vagas = comVagas.flatMap((m) => m.funcoes.flatMap((f) => f.vagas));
  const preenchidas = vagas.filter((v) => v.usuarioId !== null && v.status !== "recusado").length;
  const fixo = comVagas.length === 1;
  const reservaCta = fixo && comVagas[0].status !== "publicada";

  return (
    <div className={`tela ${reservaCta ? s.reserva : ""}`}>
      <header className={s.topo}>
        <Link
          href={`/lider/cultos?mes=${formatInTimeZone(d.evento.inicio, FUSO, "yyyy-MM")}`}
          className={s.voltar}
          aria-label="Voltar para os cultos"
        >
          <IconeApp nome="esq" />
        </Link>
        <div className={s.titulo}>
          <small>
            {d.evento.titulo} · {comVagas.length === 1 ? comVagas[0].nome : quando}
          </small>
          <h1>{dia}</h1>
        </div>
        {vagas.length > 0 && (
          <span
            className={`vg ${s.selo} ${preenchidas === vagas.length ? "vg--ok" : "vg--falta"}`}
            aria-label={`${preenchidas} de ${vagas.length} vagas preenchidas`}
          >
            {preenchidas}/{vagas.length}
          </span>
        )}
      </header>

      {d.ministerios.map((m) =>
        m.funcoes.length > 0 ? (
          <div key={m.id} style={{ display: "grid", gap: 10 }}>
            <VagasMinisterio
              eventoId={d.evento.id}
              quando={quando}
              ministerio={m}
              fotos={fotos}
              fixo={fixo}
              escolher={escolherPessoaAcao}
              desfazer={desfazerRemocaoAcao}
              aprovar={aprovarEEscalarAcao}
              publicarCulto={publicarAcao}
            />
            {m.status !== "publicada" && (
              <details>
                <summary className="tbtn tbtn--soft">Ajustar as vagas deste culto</summary>
                <EditorModelo
                  alvoId={d.evento.id}
                  legenda="neste culto"
                  ministerio={{ id: m.id, nome: m.nome, funcoes: m.todasFuncoes }}
                  salvar={definirVagasAcao}
                />
              </details>
            )}
          </div>
        ) : (
          <section key={m.id} className="list vazio">
            <h2>{m.nome}</h2>
            <p>Este culto não tem vagas para {m.nome}.</p>
            <EditorModelo
              alvoId={d.evento.id}
              legenda="neste culto"
              ministerio={{ id: m.id, nome: m.nome, funcoes: m.todasFuncoes }}
              salvar={definirVagasAcao}
            />
          </section>
        ),
      )}

      <nav aria-label="Atalhos do culto" className={s.atalhos}>
        <Atalho href={`/chat/${d.evento.id}`} icone="escalas" texto="Chat do culto" />
        {comVagas.map((m) => (
          <Atalho
            key={m.id}
            href={`/escalas/${d.evento.id}/${m.id}/repertorio`}
            icone="agenda"
            texto={comVagas.length > 1 ? `Repertório · ${m.nome}` : "Repertório"}
          />
        ))}
        {ator.papelGlobal === "admin" && <Atalho href={`/eventos/${d.evento.id}`} icone="escalar" texto="Editar culto" />}
      </nav>

      {semVagas.length > 0 && (
        <section className="list vazio">
          <h2>Definir as vagas</h2>
          {tipoSemVagas && (
            <p role="alert" className="alerta alerta--bad">
              O tipo {tipoSemVagas.nome} não tem vagas para {semVagas.map((m) => m.nome).join(", ")}.{" "}
              <Link href={`/lider/tipos/${tipoSemVagas.id}`} className="link">
                Definir vagas do tipo
              </Link>
            </p>
          )}
          {tipos.length > 0 ? (
            <form action={copiarVagasAcao} className="vazio__acoes" style={{ flexWrap: "wrap" }}>
              <input type="hidden" name="evento" value={d.evento.id} />
              <label>
                <span className="sr-only">Copiar vagas de</span>
                <select name="tipo" defaultValue={d.evento.recorrenciaId ?? tipos[0].id} className="campo">
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} · {DIAS_SEMANA[t.diaSemana]} {t.horaInicio} · {soma.get(t.id) ?? 0}{" "}
                      {(soma.get(t.id) ?? 0) === 1 ? "vaga" : "vagas"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="tbtn tbtn--p">
                Copiar vagas deste tipo
              </button>
            </form>
          ) : (
            <p>Nenhum tipo de culto com vagas ainda.</p>
          )}
          <div className="vazio__acoes">
            <Link href="/lider/tipos" className="tbtn tbtn--soft">
              Configurar tipos de culto
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
