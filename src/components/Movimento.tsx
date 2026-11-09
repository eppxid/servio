"use client";

import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { chegou, navegar, podeAnimar, tipoDaNavegacao, transicao } from "./app/navegar";

declare global {
  interface Window {
    motion?: {
      enter(root?: ParentNode): void;
      countAll(root?: ParentNode): void;
      stuck(top: Element): void;
      theme(tema: string, origem?: Element | null): void;
      menu(ancora: Element, itens: ({ label: string; checked?: boolean; run?: () => void } | "-")[]): void;
    };
  }
}

/** Depois de uma View Transition o deslize já é a entrada: sem cascata, e os números contam ao fim dela. */
function animar(fimDaTransicao: Promise<void> | null = null) {
  const m = window.motion;
  const main = document.querySelector("main");
  if (!m || !main) return;
  if (fimDaTransicao) {
    void fimDaTransicao.then(() => m.countAll(main));
    return;
  }
  m.enter(main);
  m.countAll(main);
}

/** Carrega o motion.js, anima a entrada de cada tela e dá direção às trocas de tela (View Transitions). */
export function Movimento() {
  const caminho = usePathname();
  const router = useRouter();
  const atual = useRef(caminho);

  useEffect(() => {
    atual.current = caminho;
    animar(chegou());
  }, [caminho]);

  useEffect(() => {
    // Links internos (abas, detalhes, voltar) entram na transição com a direção calculada.
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || !podeAnimar()) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === atual.current || url.pathname.startsWith("/api/")) return;
      e.preventDefault();
      navegar(router, url.pathname + url.search + url.hash, tipoDaNavegacao(atual.current, url.pathname));
    };
    // Botão voltar do navegador: o Next troca a tela sozinho, a transição só espera o pathname mudar.
    const aoVoltar = () => {
      if (location.pathname !== atual.current) transicao("tras", () => {});
    };
    document.addEventListener("click", aoClicar, true);
    addEventListener("popstate", aoVoltar);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      removeEventListener("popstate", aoVoltar);
    };
  }, [router]);

  return (
    <Script
      src="/ui/motion.js"
      strategy="afterInteractive"
      onReady={() => {
        const top = document.querySelector(".top");
        if (top && !top.hasAttribute("data-stuck")) {
          top.setAttribute("data-stuck", "");
          window.motion?.stuck(top);
        }
        animar();
      }}
    />
  );
}
