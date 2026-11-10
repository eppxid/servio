/** Sinais do navegador que decidem se o vidro líquido (refração em backdrop-filter) liga. */
export type AmbienteVidro = {
  userAgent: string;
  /** Marcas de `navigator.userAgentData.brands` (só Chromium preenche). */
  marcas: string[];
  hardwareConcurrency: number;
  reducaoTransparencia: boolean;
  reducaoMovimento: boolean;
  contrasteAlto: boolean;
};

/**
 * Só Chromium aplica `url()` em `backdrop-filter`; todo navegador no iOS é WebKit, então fica de fora.
 * Celular fraco (<= 4 núcleos) e preferências de acessibilidade mantêm o blur simples.
 */
export function podeUsarVidro(env: AmbienteVidro): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return false;
  if (!env.marcas.some((m) => /chromium/i.test(m))) return false;
  if (env.reducaoTransparencia || env.reducaoMovimento || env.contrasteAlto) return false;
  return env.hardwareConcurrency > 4;
}
