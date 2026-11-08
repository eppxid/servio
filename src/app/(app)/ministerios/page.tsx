import { redirect } from "next/navigation";

/** A lista antiga foi substituída por Equipe (modo líder). */
export default function Ministerios() {
  redirect("/lider/equipe");
}
