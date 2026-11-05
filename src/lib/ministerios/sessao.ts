import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";

/** Como exigirUsuario, mas manda quem tem senha temporária para a troca obrigatória. */
export async function exigirUsuarioSemTroca() {
  const usuario = await exigirUsuario();
  if (usuario.trocarSenha) redirect("/convite/trocar-senha");
  return usuario;
}

/** Id vindo da URL/formulário: inteiro positivo ou 0 (nunca casa com registro). */
export function idSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
