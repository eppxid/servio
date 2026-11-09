import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { precisaDefinirAcesso } from "@/lib/ministerios/nucleo";

/** Como exigirUsuario, mas manda para a tela de acesso quem tem senha temporária ou é admin sem e-mail/senha. */
export async function exigirUsuarioSemTroca() {
  const usuario = await exigirUsuario();
  if (precisaDefinirAcesso(usuario)) redirect("/convite/trocar-senha");
  return usuario;
}

/** Id vindo da URL/formulário: inteiro positivo ou 0 (nunca casa com registro). */
export function idSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
