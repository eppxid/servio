import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { copiarVagasAcao, escolherPessoaAcao, publicarAcao } from "../acoes";
import { DIAS_SEMANA, dadosCulto, tiposDeCulto } from "../vagas-culto";
import { VagasMinisterio } from "./VagasMinisterio";

export const dynamic = "force-dynamic";

export default async function Culto({ params }: { params: Promise<{ eventoId: string }> }) {
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
          <VagasMinisterio
            key={m.id}
            eventoId={d.evento.id}
            quando={quando}
            ministerio={m}
            escolher={escolherPessoaAcao}
            publicarCulto={publicarAcao}
          />
        ) : (
          <section key={m.id} className="list vazio">
            <h2>{m.nome}</h2>
            <p>Este culto não tem vagas para {m.nome}.</p>
          </section>
        ),
      )}

      {semVagas.length > 0 && (
        <section className="list vazio">
          <h2>Definir as vagas</h2>
          {tipos.length > 0 ? (
            <form action={copiarVagasAcao} className="vazio__acoes" style={{ flexWrap: "wrap" }}>
              <input type="hidden" name="evento" value={d.evento.id} />
              <label>
                <span className="sr-only">Copiar vagas de</span>
                <select name="tipo" defaultValue={d.evento.recorrenciaId ?? tipos[0].id} className="campo">
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} · {DIAS_SEMANA[t.diaSemana]} {t.horaInicio}
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
