import Link from "next/link";
import { IconeApp, type NomeIcone } from "./icones";

/**
 * Ação principal da tela: botão grande fixo acima das abas no celular (alcance do polegar),
 * no fluxo normal no desktop. Com `href` vira link; sem ele, botão (`type="submit"` dentro de form).
 */
export function AcaoPrincipal({
  href,
  icone,
  children,
  ...botao
}: { href?: string; icone?: NomeIcone; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const conteudo = (
    <>
      {icone && <IconeApp nome={icone} />}
      {children}
    </>
  );
  return (
    <>
      <div className="cta-espaco" aria-hidden="true" />
      {href ? (
        <Link href={href} className="cta">
          {conteudo}
        </Link>
      ) : (
        <button type="button" {...botao} className="cta">
          {conteudo}
        </button>
      )}
    </>
  );
}
