import type { IronSession } from "iron-session";
import { sessao, type DadosSessao } from "@/lib/auth";

/** Login feito, mas falta aceitar a versão nova dos termos: a sessão ainda não vale. */
export interface SessaoComAceite extends DadosSessao {
  aceitePendente?: { usuarioId: number; sessaoVersao: number; aparelhoId?: number };
}

export async function sessaoLgpd() {
  return (await sessao()) as unknown as IronSession<SessaoComAceite>;
}

/**
 * Abre a sessão do usuário (e limpa qualquer aceite pendente).
 * Sem `aparelhoId`, herda o do aceite pendente: a tela de termos não sabe de aparelho.
 */
export async function abrirSessao(usuario: { id: number; sessaoVersao: number }, aparelhoId?: number) {
  const s = await sessaoLgpd();
  const aparelho = aparelhoId ?? s.aceitePendente?.aparelhoId;
  s.usuarioId = usuario.id;
  s.sessaoVersao = usuario.sessaoVersao;
  if (aparelho === undefined) delete s.aparelhoId;
  else s.aparelhoId = aparelho;
  delete s.aceitePendente;
  await s.save();
}

/** Guarda o login à espera do aceite, sem abrir a sessão. */
export async function guardarAceitePendente(usuario: { id: number; sessaoVersao: number }, aparelhoId?: number) {
  const s = await sessaoLgpd();
  delete s.usuarioId;
  delete s.sessaoVersao;
  delete s.aparelhoId;
  s.aceitePendente = { usuarioId: usuario.id, sessaoVersao: usuario.sessaoVersao, aparelhoId };
  await s.save();
}
