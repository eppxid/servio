import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { IconeApp } from "@/components/app/icones";

/** Equipe (esqueleto: a tarefa 022 traz membros, funções aprovadas e pedidos pendentes). */
export default function Equipe() {
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Equipe" />
      <section className="list vazio">
        <span className="row__ic">
          <IconeApp nome="equipe" />
        </span>
        <h2>Pedidos e membros</h2>
        <p>Quem pediu para servir e as funções de cada pessoa aparecem aqui. Por enquanto, aprove em Ministérios.</p>
        <div className="vazio__acoes">
          <Link href="/ministerios" className="tbtn tbtn--soft">
            Abrir Ministérios
          </Link>
        </div>
      </section>
    </div>
  );
}
