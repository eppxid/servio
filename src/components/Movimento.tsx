"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

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

function animar() {
  const m = window.motion;
  const main = document.querySelector("main");
  if (!m || !main) return;
  m.enter(main);
  m.countAll(main);
}

/** Carrega o motion.js e anima a entrada de cada tela. */
export function Movimento() {
  const caminho = usePathname();
  useEffect(animar, [caminho]);
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
