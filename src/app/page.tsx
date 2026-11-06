import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_MODO, INICIO_DO_MODO, lerModo } from "@/components/app/modo-comum";

export const dynamic = "force-dynamic";

/** `/` abre o Início do último modo escolhido (quem não lidera volta do modo líder para /inicio). */
export default async function Raiz() {
  redirect(INICIO_DO_MODO[lerModo((await cookies()).get(COOKIE_MODO)?.value)]);
}
