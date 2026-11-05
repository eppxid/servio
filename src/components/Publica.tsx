import { Marca } from "./Marca";

/** Casca das páginas fora do app: marca Servio e um cartão centrado. */
export function Publica({ larga, className = "", children }: { larga?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <main className="pub">
      <div className={`pub__col${larga ? " pub__col--larga" : ""}`}>
        <Marca />
        <div className={`card space-y-5 p-6 ${className}`} data-enter>
          {children}
        </div>
      </div>
    </main>
  );
}
