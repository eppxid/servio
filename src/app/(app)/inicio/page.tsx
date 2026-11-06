import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Cabecalho } from "@/components/Cabecalho";
import { IconeApp } from "@/components/app/icones";
import { exigirUsuario } from "@/lib/auth";
import { FUSO } from "@/lib/recorrencia";

export const dynamic = "force-dynamic";

/** Início do voluntário (esqueleto: a tarefa 020 traz a próxima escala e as pendências). */
export default async function Inicio() {
  const usuario = await exigirUsuario();
  const hoje = formatInTimeZone(new Date(), FUSO, "EEEE, d 'de' MMMM", { locale: ptBR });
  return (
    <div className="tela">
      <Cabecalho eyebrow={hoje.charAt(0).toUpperCase() + hoje.slice(1)} titulo={`Olá, ${usuario.nome.split(" ")[0]}`} />
      <section className="list vazio" data-enter>
        <span className="row__ic">
          <IconeApp nome="agenda" />
        </span>
        <h2>Sua próxima escala aparece aqui</h2>
        <p>Por enquanto, veja suas escalas e responda os convites na Agenda.</p>
        <div className="vazio__acoes">
          <Link href="/agenda" className="tbtn tbtn--p">
            Ver minha agenda
          </Link>
          <Link href="/ministerios" className="tbtn tbtn--soft">
            Quero servir
          </Link>
        </div>
      </section>
    </div>
  );
}
