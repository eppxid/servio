/** Versão da política e dos termos. Mudar este valor pede novo aceite no próximo login. */
export const TERMOS_VERSAO = "2026-11-05";

export const TEXTO_CONSENTIMENTO =
  "Autorizo a igreja a tratar meus dados, inclusive o vínculo religioso, para organizar as escalas.";

export const AVISO_RASCUNHO = "RASCUNHO — revisão jurídica obrigatória antes de publicar";

/** Prazos de retenção (dias). */
export const RETENCAO = { mensagensDias: 180, indisponibilidadesDias: 90, tentativasLoginDias: 1 } as const;

/** Dados da controladora vindos do ambiente; vazio = "a informar" (nunca inventar valor). */
export function dadosIgreja() {
  const v = (nome: string) => process.env[nome]?.trim() || "a informar";
  return {
    nome: v("IGREJA_NOME"),
    cnpj: v("IGREJA_CNPJ"),
    endereco: v("IGREJA_ENDERECO"),
    contato: v("IGREJA_CONTATO"),
  };
}

/** Checkbox de consentimento marcado (valor "sim"). */
export function consentiu(valor: unknown): boolean {
  return valor === "sim";
}

/** Usuário aceitou a versão atual dos termos? */
export function aceiteEmDia(u: { consentimentoEm: Date | null; termosVersao: string | null }): boolean {
  return Boolean(u.consentimentoEm) && u.termosVersao === TERMOS_VERSAO;
}
