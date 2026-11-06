import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { Calendario } from "@/components/app/Calendario";
import { exigirUsuario } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cultos do líder (esqueleto: a tarefa 023 põe as vagas por ministério em cada dia). */
export default async function Cultos() {
  const usuario = await exigirUsuario();
  const admin = usuario.papelGlobal === "admin";
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Cultos" />
      <Calendario
        legenda={
          <>
            <span>
              <i style={{ ["--c" as string]: "var(--good)" }} /> Completo
            </span>
            <span>
              <i style={{ ["--c" as string]: "var(--warn)" }} /> Faltando gente
            </span>
            <span>
              <i style={{ ["--c" as string]: "var(--faint)" }} /> Sem escala
            </span>
          </>
        }
      />
      <section className="list vazio">
        <p>As vagas de cada culto aparecem no calendário em breve. Por enquanto, monte as escalas em Escalas.</p>
        <div className="vazio__acoes">
          <Link href="/escalas" className="tbtn tbtn--soft">
            Abrir Escalas
          </Link>
        </div>
      </section>
      {admin && (
        <AcaoPrincipal href="/eventos/novo" icone="adicionar">
          Novo culto
        </AcaoPrincipal>
      )}
    </div>
  );
}
