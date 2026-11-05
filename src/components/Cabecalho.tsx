/** Cabeçalho de tela do app: contexto curto, título e ações à direita. */
export function Cabecalho({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="head" data-enter>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="title">{titulo}</h1>
      </div>
      {children && <div className="head__acoes">{children}</div>}
    </div>
  );
}
