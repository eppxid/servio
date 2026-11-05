const SIMBOLOS: Record<string, React.ReactNode> = {
  agenda: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  escalas: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.5 1.5L7 5M3.5 12l1.5 1.5L7 11M3.5 18l1.5 1.5L7 17" />
    </>
  ),
  ministerios: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 5.2a3.3 3.3 0 0 1 0 6.6M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
    </>
  ),
  painel: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  reconhecimento: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  perfil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4.2 3.9-6.5 8-6.5s7.3 2.3 8 6.5" />
    </>
  ),
  tema: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" />
    </>
  ),
};

/** Sprite dos ícones; entra uma vez no layout raiz. */
export function Sprite() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      {Object.entries(SIMBOLOS).map(([nome, forma]) => (
        <symbol key={nome} id={`i-${nome}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {forma}
        </symbol>
      ))}
    </svg>
  );
}

export function Icone({ nome }: { nome: keyof typeof SIMBOLOS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <use href={`#i-${nome}`} />
    </svg>
  );
}
