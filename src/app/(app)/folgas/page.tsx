import { Cabecalho } from "@/components/Cabecalho";
import { CalendarioFolgas } from "./CalendarioFolgas";

export const dynamic = "force-dynamic";

/** Folgas do voluntário (esqueleto: a tarefa 020 grava a folga pelo toque no dia). */
export default function Folgas() {
  return (
    <div className="tela">
      <Cabecalho eyebrow="Indisponibilidade" titulo="Folgas" />
      <CalendarioFolgas />
    </div>
  );
}
