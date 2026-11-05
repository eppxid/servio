"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { Icone } from "./Icones";

const ABAS = [
  { href: "/agenda", rotulo: "Agenda", icone: "agenda" },
  { href: "/escalas", rotulo: "Escalas", icone: "escalas" },
  { href: "/ministerios", rotulo: "Ministérios", icone: "ministerios" },
  { href: "/painel", rotulo: "Painel", icone: "painel", soLider: true },
  { href: "/reconhecimento", rotulo: "Pontos", dica: "Reconhecimento", icone: "reconhecimento" },
  { href: "/perfil", rotulo: "Perfil", icone: "perfil" },
] as const;

/** Barra de ícones: flutuante à esquerda no desktop, pílula no rodapé no celular. */
export function Abas({ temPainel }: { temPainel: boolean }) {
  const caminho = usePathname();
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const primeira = useRef(true);

  useLayoutEffect(() => {
    const posicionar = () => {
      const alvo = nav.current?.querySelector<HTMLElement>("[aria-current]");
      const i = ind.current;
      if (!alvo || !i) {
        if (i) i.style.opacity = "0";
        return;
      }
      if (primeira.current) i.style.transition = "none";
      i.style.opacity = "1";
      i.style.width = `${alvo.offsetWidth}px`;
      i.style.height = `${alvo.offsetHeight}px`;
      i.style.transform = `translate(${alvo.offsetLeft}px, ${alvo.offsetTop}px)`;
      if (primeira.current) {
        void i.offsetWidth;
        i.style.transition = "";
        primeira.current = false;
        nav.current?.setAttribute("data-pronto", "");
      }
    };
    posicionar();
    const ro = new ResizeObserver(posicionar);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [caminho, temPainel]);

  return (
    <nav ref={nav} aria-label="Principal" className="rail">
      <span ref={ind} className="rail__ind" aria-hidden="true" />
      {ABAS.filter((a) => !("soLider" in a) || temPainel).map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(aba.href + "/");
        const dica = "dica" in aba ? aba.dica : aba.rotulo;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            aria-label={dica}
            data-tip={dica}
            className={`rail__btn${ativa ? " is-active" : ""}`}
          >
            <Icone nome={aba.icone} />
            <span className="rail__rot">{aba.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
