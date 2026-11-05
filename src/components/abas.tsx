"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/escalas", rotulo: "Escalas" },
  { href: "/ministerios", rotulo: "Ministérios" },
  { href: "/perfil", rotulo: "Perfil" },
];

export function Abas() {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-slate-200 bg-white"
    >
      {ABAS.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(aba.href + "/");
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={`flex min-h-14 items-center justify-center text-sm ${
              ativa ? "font-bold text-blue-700" : "text-slate-500"
            }`}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
