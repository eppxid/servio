import { redirect } from "next/navigation";

/** As trocas agora ficam dentro de Escalar (modo líder). */
export default function Trocas() {
  redirect("/lider/escalar");
}
