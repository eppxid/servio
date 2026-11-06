/** Ícones do app v2 (traço 1.9, 24×24), os mesmos da maquete. */
const P = {
  inicio: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />,
  agenda: <path d="M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4" />,
  folga: (
    <path d="M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 4M14.5 13.5l-5 4" />
  ),
  perfil: <path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5" />,
  escalar: <path d="M8 4h8a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9 10h6M9 14h6M9 18h3" />,
  equipe: (
    <path d="M9 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c1-3.4 3.4-5.2 6.5-5.2s5.5 1.8 6.5 5.2M17 6.2a2.8 2.8 0 1 1 0 5.6M16.5 14.6c2.4.1 4.1 1.6 5 4.4" />
  ),
  painel: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  mais: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
  esq: <path d="m14.5 6-6 6 6 6" />,
  dir: <path d="m9.5 6 6 6-6 6" />,
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
  adicionar: <path d="M12 5v14M5 12h14" />,
  magia: (
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
  ),
  escalas: <path d="M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7 5M3.5 12l1.5 1.5L7 11M3.5 18l1.5 1.5L7 17" />,
  ministerios: <path d="M12 2.5v4M10 4.5h4M5 21V11l7-4.5 7 4.5v10M10 21v-4.5a2 2 0 0 1 4 0V21M3 21h18" />,
  pontos: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  tema: <path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 3.5v17" />,
  seta: <path d="M5 12h14M13 6l6 6-6 6" />,
} as const;

export type NomeIcone = keyof typeof P;

export function IconeApp({ nome }: { nome: NomeIcone }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[nome]}
    </svg>
  );
}
