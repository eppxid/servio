import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { EditorModelo } from "../../tipos/[recorrenciaId]/EditorModelo";
import { copiarVagasAcao, definirVagasAcao, escolherPessoaAcao, publicarAcao } from "../acoes";
import { somaVagasPorTipo } from "@/lib/vagas/nucleo";
import { DIAS_SEMANA, dadosCulto, tiposDeCulto } from "../vagas-culto";
import { VagasMinisterio } from "./VagasMinisterio";

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
  const semVagas = d.ministerios.filter((m) => m.funcoes.length === 0);
  const tipos = semVagas.length > 0 ? await tiposDeCulto(banco, ator) : [];
  const soma = await somaVagasPorTipo(banco, ator, semVagas.map((m) => m.id));
  const pedidoSemVagas = idSeguro((await searchParams).tipoSemVagas);
  const tipoSemVagas = tipos.find((x) => x.id === pedidoSemVagas);
  const horaInicio = formatInTimeZone(d.evento.inicio, FUSO, "HH:mm");
  const quando = `${formatInTimeZone(d.evento.inicio, FUSO, "dd/MM")} · ${horaInicio}${
    d.evento.fim ? `–${formatInTimeZone(d.evento.fim, FUSO, "HH:mm")}` : ""
  }`;

  return (
    <div className="tela">
      <Cabecalho eyebrow={quando} titulo={d.evento.titulo}>
        <Link href={`/lider/cultos?mes=${formatInTimeZone(d.evento.inicio, FUSO, "yyyy-MM")}`} className="tbtn">
          ← Cultos
        </Link>
      </Cabecalho>

      {d.ministerios.map((m) =>
        m.funcoes.length > 0 ? (
          <div key={m.id} style={{ display: "grid", gap: 10 }}>
            <VagasMinisterio
              eventoId={d.evento.id}
              quando={quando}
              ministerio={m}
              escolher={escolherPessoaAcao}
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
