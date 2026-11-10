"use client";

import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cascata, chegou, itensDaTela, navegar, podeAnimar, telaDo, tipoDaNavegacao, transicao } from "./app/navegar";

declare global {
  interface Window {
    motion?: {
      enter(root?: ParentNode | Element[], opcoes?: { sel?: string; stagger?: number; y?: number; ms?: number; max?: number }): void;
      countAll(root?: ParentNode): void;
      stuck(top: Element): void;
      theme(tema: string, origem?: Element | null): void;
      menu(ancora: Element, itens: ({ label: string; checked?: boolean; run?: () => void } | "-")[]): void;
    };
  }
}

/**
 * Entrada da tela nova. Detalhe ↔ lista (View Transition `frente`/`tras`): o deslize já é a entrada, sem cascata,
 * e os números contam ao fim dela. Troca de aba ou de modo: a tela antiga esmaece (kit.css) e os blocos da nova
 * entram em cascata já durante a transição, que mostra a tela nova ao vivo.
 */
function animar(fimDaTransicao: Promise<void> | null = null) {
  const m = window.motion;
  const main = document.querySelector("main");
  if (!m || !main) return;
  const nav = document.documentElement.dataset.nav;
  if (fimDaTransicao && (nav === "frente" || nav === "tras")) {
    void fimDaTransicao.then(() => m.countAll(main));
    return;
  }
  cascata(itensDaTela(telaDo(main)));
  m.countAll(main);
}

const LIMITE_FILTRO_MS = 3000;

/** Filtro por link (mesmo caminho, outra query): quando a URL nova chega, os blocos abaixo do filtro entram em cascata. */
function cascataAoFiltrar(destino: string, link: Element) {
  const main = document.querySelector("main");
  const tela = main && telaDo(main);
  if (!tela) return;
  let bloco: Element | null = link;
  while (bloco && bloco.parentElement !== tela) bloco = bloco.parentElement;
  const desde = bloco ? [...tela.children].indexOf(bloco) + 1 : 0;
  const t0 = performance.now();
  const olhar = () => {
    if (location.search === destino) {
      const agora = telaDo(document.querySelector("main") ?? tela);
      cascata(itensDaTela(agora, agora === tela ? desde : 0));
    } else if (performance.now() - t0 < LIMITE_FILTRO_MS) requestAnimationFrame(olhar);
  };
  requestAnimationFrame(olhar);
}

const LIMITE_CARREGANDO_MS = 8000;

function limparCarregando() {
  document.documentElement.removeAttribute("data-carregando");
  document.querySelector("[data-indo]")?.removeAttribute("data-indo");
}

/** Carrega o motion.js, anima a entrada de cada tela e dá direção às trocas de tela (View Transitions). */
export function Movimento() {
  const caminho = usePathname();
  const router = useRouter();
  const atual = useRef(caminho);
  const aviso = useRef<HTMLDivElement>(null);
  const limite = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    atual.current = caminho;
    clearTimeout(limite.current);
    limparCarregando();
    if (aviso.current) aviso.current.textContent = "";
    animar(chegou());
  }, [caminho]);

  useEffect(() => {
    // Links internos (abas, detalhes, voltar) entram na transição com a direção calculada.
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === atual.current) {
        if (url.search !== location.search) cascataAoFiltrar(url.search, a);
        return;
      }
      // As marcas entram antes da View Transition para já estarem no quadro "antigo".
      limparCarregando();
      document.documentElement.setAttribute("data-carregando", "");
      a.setAttribute("data-indo", "");
      if (aviso.current) aviso.current.textContent = "Carregando";
      // O limite cobre a rota que não muda o pathname (redirect para o mesmo caminho, erro).
      clearTimeout(limite.current);
      limite.current = setTimeout(limparCarregando, LIMITE_CARREGANDO_MS);
      if (!podeAnimar()) return;
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
    <>
      <div ref={aviso} aria-live="polite" className="sr-only" />
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
    </>
  );
}
