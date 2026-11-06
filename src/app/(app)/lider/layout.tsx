import { redirect } from "next/navigation";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";

export const dynamic = "force-dynamic";

/** Modo líder: só quem lidera algum ministério (ou é admin); os demais voltam ao Início. */
export default async function LayoutLider({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  if (usuario.papelGlobal !== "admin" && (await ministeriosDoLider(db() as unknown as AnyDb, usuario)).length === 0) {
    redirect("/inicio");
  }
  return children;
}
