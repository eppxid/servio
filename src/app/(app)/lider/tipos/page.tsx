import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { IconeApp } from "@/components/app/icones";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca } from "@/lib/ministerios/sessao";
import { DIAS_SEMANA, tiposDeCulto } from "../cultos/vagas-culto";

export const dynamic = "force-dynamic";

/** Tipos de culto: cada um abre o modelo de vagas por ministério. */
export default async function Tipos() {
  const ator = await exigirUsuarioSemTroca();
  const tipos = await tiposDeCulto(db() as unknown as AnyDb, ator);
  const admin = ator.papelGlobal === "admin";
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Tipos de culto">
        <Link href="/lider/cultos" className="tbtn">
          ← Cultos
        </Link>
      </Cabecalho>
      {tipos.length === 0 ? (
        <section className="list vazio">
          {admin ? (
            <>
              <p>Nenhum tipo de culto ainda. Crie um culto que se repete toda semana para definir as vagas dele.</p>
              <div className="vazio__acoes">
                <Link href="/eventos/novo" className="tbtn tbtn--soft">
                  Criar culto semanal
                </Link>
              </div>
            </>
          ) : (
            <p>Só o administrador cria cultos. Peça para ele criar o culto que se repete.</p>
          )}
        </section>
      ) : (
        <section className="list">
          {tipos.map((t) => (
            <Link key={t.id} href={`/lider/tipos/${t.id}`} className="row">
              <span className="row__tx">
                <b>{t.nome}</b>
                <span>
                  {DIAS_SEMANA[t.diaSemana]}, {t.horaInicio}
                  {t.horaFim ? `–${t.horaFim}` : ""}
                </span>
              </span>
              <span className="row__end">
                Vagas
                <IconeApp nome="dir" />
              </span>
            </Link>
          ))}
        </section>
      )}
      {admin && tipos.length > 0 && (
        <AcaoPrincipal href="/eventos/novo" icone="adicionar">
          Novo culto
        </AcaoPrincipal>
      )}
    </div>
  );
}
