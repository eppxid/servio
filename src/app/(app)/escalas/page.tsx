import { redirect } from "next/navigation";

/** A lista antiga foi substituída por Escalar (modo líder); a montagem por culto segue em /escalas/[eventoId]/[ministerioId]. */
export default function Escalas() {
  redirect("/lider/escalar");
}
