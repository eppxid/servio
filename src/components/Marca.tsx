import Link from "next/link";

export function Marca({ href }: { href?: string }) {
  const conteudo = (
    <>
      <span className="logo" aria-hidden="true">
        S
      </span>
      Servio
    </>
  );
  return href ? (
    <Link href={href} className="brand">
      {conteudo}
    </Link>
  ) : (
    <div className="brand">{conteudo}</div>
  );
}
