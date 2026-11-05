import type { IronSession } from "iron-session";
import { sessao, type DadosSessao } from "@/lib/auth";

/** Login feito, mas falta aceitar a versão nova dos termos: a sessão ainda não vale. */
export interface SessaoComAceite extends DadosSessao {
  aceitePendente?: { usuarioId: number; sessaoVersao: number };
}

export async function sessaoLgpd() {
  return (await sessao()) as unknown as IronSession<SessaoComAceite>;
}

/** Abre a sessão do usuário (e limpa qualquer aceite pendente). */
export async function abrirSessao(usuario: { id: number; sessaoVersao: number }) {
  const s = await sessaoLgpd();
  s.usuarioId = usuario.id;
  s.sessaoVersao = usuario.sessaoVersao;
  delete s.aceitePendente;
  await s.save();
}

/** Guarda o login à espera do aceite, sem abrir a sessão. */
export async function guardarAceitePendente(usuario: { id: number; sessaoVersao: number }) {
  const s = await sessaoLgpd();
  delete s.usuarioId;
  delete s.sessaoVersao;
  s.aceitePendente = { usuarioId: usuario.id, sessaoVersao: usuario.sessaoVersao };
  await s.save();
}
