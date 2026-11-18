/**
 * Quanto descer as barras fixas no fundo (abas e ação principal) para encostarem no fundo da área visível.
 *
 * No iPhone, o WebKit às vezes deixa a viewport visual deslocada da viewport de layout (depois de rolar com a
 * barra do navegador recolhendo, ou de fechar o teclado). O `position: fixed; bottom: 0` segue a de layout,
 * então a barra fica no meio da tela e o conteúdo aparece embaixo dela. Coordenadas na viewport de layout.
 */
export function ajusteDoFundo(m: {
  /** `visualViewport.offsetTop` */
  topoVisual: number;
  /** `visualViewport.height` */
  alturaVisual: number;
  /** `visualViewport.scale` */
  escala: number;
  /** `getBoundingClientRect().bottom` da barra, já com o ajuste atual aplicado */
  fundoBarra: number;
  /** ajuste aplicado hoje (px) */
  ajusteAtual: number;
  /** campo editável em foco (teclado aberto ou abrindo) */
  campoEmFoco?: boolean;
}): number {
  // Pinça de zoom: a barra fica onde o navegador põe; seguir o zoom faria a barra tremer.
  // Teclado: a barra fica atrás dele; descer até o fundo visível a poria por cima do campo em foco.
  if (m.escala > 1.01 || m.campoEmFoco) return 0;
  const semAjuste = m.fundoBarra - m.ajusteAtual;
  const falta = m.topoVisual + m.alturaVisual - semAjuste;
  // Negativo = teclado aberto (fundo visível acima do fundo de layout): a barra fica atrás do teclado, como sempre.
  return falta >= 1 ? Math.round(falta) : 0;
}
