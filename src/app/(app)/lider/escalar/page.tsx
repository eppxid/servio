import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { IconeApp } from "@/components/app/icones";

/** Escalar (esqueleto: a tarefa 024 lista as vagas abertas do mês e a sugestão automática). */
export default function Escalar() {
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Escalar" />
      <section className="list vazio">
        <span className="row__ic">
          <IconeApp nome="escalar" />
        </span>
        <h2>Vagas abertas do mês</h2>
        <p>Os cultos com vaga aberta aparecem aqui, em ordem de data. Por enquanto, sugira e publique em Escalas.</p>
        <div className="vazio__acoes">
          <Link href="/escalas" className="tbtn tbtn--soft">
            Abrir Escalas
          </Link>
        </div>
      </section>
      <AcaoPrincipal href="/escalas" icone="magia">
        Sugerir escala do mês
      </AcaoPrincipal>
    </div>
  );
}
