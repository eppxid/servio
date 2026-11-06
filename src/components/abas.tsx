"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeApp, type NomeIcone } from "./app/icones";
import type { Modo } from "./app/modo-comum";

const ABAS: Record<Modo, { href: string; rotulo: string; icone: NomeIcone }[]> = {
  voluntario: [
    { href: "/inicio", rotulo: "Início", icone: "inicio" },
    { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
    { href: "/folgas", rotulo: "Folgas", icone: "folga" },
    { href: "/perfil", rotulo: "Perfil", icone: "perfil" },
  ],
  lider: [
    { href: "/lider/cultos", rotulo: "Cultos", icone: "agenda" },
    { href: "/lider/escalar", rotulo: "Escalar", icone: "escalar" },
    { href: "/lider/equipe", rotulo: "Equipe", icone: "equipe" },
    { href: "/painel", rotulo: "Painel", icone: "painel" },
  ],
};

/** Abas do modo: rodapé com ícone e rótulo no celular, barra de ícones à esquerda no desktop. */
export function Abas({ modo }: { modo: Modo }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Principal" className="tabbar">
      {ABAS[modo].map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(aba.href + "/");
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={ativa ? "is-active" : undefined}
          >
            <span className="pill">
              <IconeApp nome={aba.icone} />
            </span>
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
