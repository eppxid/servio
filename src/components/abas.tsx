"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { IconeApp, type NomeIcone } from "./app/icones";
import type { Modo } from "./app/modo-comum";
import { podeUsarVidro } from "./app/vidro";

export const ABAS: Record<Modo, { href: string; rotulo: string; icone: NomeIcone }[]> = {
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

/** Se a tela nova não chega nesse tempo, o destaque volta para a aba do pathname (mesmo limite da barra de carregamento). */
const LIMITE_OTIMISTA_MS = 8000;
const DURACAO_MS = 420;
/** Mola: passa um pouco do ponto e volta. */
const MOLA = "linear(0, 0.2 6%, 0.52 13%, 0.8 21%, 0.97 29%, 1.06 40%, 1.07 48%, 1.03 60%, 0.995 76%, 1)";
/** Trecho em que a pílula estica: a frente sai rápida, sem passar do alvo. */
const ESTICA = "cubic-bezier(0.2, 0.7, 0.3, 1)";

type Caixa = { x: number; y: number; w: number; h: number };

/** Posição e tamanho do ícone-pílula da aba dentro do padding box da barra. */
function medir(nav: HTMLElement, link: HTMLElement): Caixa | null {
  const pill = link.querySelector<HTMLElement>(".pill");
  if (!pill) return null;
  const n = nav.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  return { x: p.left - n.left - nav.clientLeft, y: p.top - n.top - nav.clientTop, w: p.width, h: p.height };
}

/** Caixa que o indicador mostra agora (meio da animação inclusive), lida do transform calculado. */
function atual(el: HTMLElement): Caixa {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: m.e, y: m.f, w: el.offsetWidth * m.a, h: el.offsetHeight * m.d };
}

const igual = (a: Caixa, b: Caixa) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

const quadro = (c: Caixa, d: Caixa, extra = "") =>
  `translate(${c.x}px, ${c.y}px) scale(${c.w / d.w}, ${c.h / d.h})${extra}`;

/** Quadros da esticada: no meio a pílula cobre da origem até a borda da frente; no fim volta ao tamanho do destino. */
function quadros(de: Caixa, para: Caixa): Keyframe[] {
  const aoLado = Math.abs(para.x - de.x) >= Math.abs(para.y - de.y);
  const meio = { ...para };
  if (aoLado) {
    meio.x = Math.min(de.x, para.x);
    meio.w = Math.max(de.x + de.w, para.x + para.w) - meio.x;
  } else {
    meio.y = Math.min(de.y, para.y);
    meio.h = Math.max(de.y + de.h, para.y + para.h) - meio.y;
  }
  return [
    { transform: quadro(de, para), easing: ESTICA },
    { transform: quadro(meio, para), offset: 0.4, easing: MOLA },
    { transform: quadro(para, para) },
  ];
}

const movimentoReduzido = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";

/** Abas do modo: rodapé com ícone e rótulo no celular, barra de ícones à esquerda no desktop. */
export function Abas({ modo }: { modo: Modo }) {
  const caminho = usePathname();
  // Toque otimista: o destaque vai para a aba tocada sem esperar a tela nova.
  const [alvo, setAlvo] = useState<{ href: string; caminho: string } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const limite = useRef<ReturnType<typeof setTimeout>>(undefined);
  const visivel = useRef(false);

  const doCaminho = ABAS[modo].find((a) => caminho === a.href || caminho.startsWith(a.href + "/"))?.href;
  // Um alvo guardado de outro pathname já foi confirmado (ou falhou): vale o pathname.
  const ativo = alvo && alvo.caminho === caminho ? alvo.href : doCaminho;

  // Tela nova chegou: o pathname confirma a posição e o toque otimista sai de cena.
  useEffect(() => {
    clearTimeout(limite.current);
    setAlvo(null);
  }, [caminho]);
  useEffect(() => () => clearTimeout(limite.current), []);

  const posicionar = useCallback((animar: boolean) => {
    const barra = nav.current;
    const el = ind.current;
    if (!barra || !el) return;
    const link = barra.querySelector<HTMLElement>("a.is-active");
    const caixa = link ? medir(barra, link) : null;
    if (!caixa) {
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = "0";
      visivel.current = false;
      return;
    }
    // A origem é onde a pílula está agora: um toque no meio do deslize parte dali, sem salto.
    const de = visivel.current ? atual(el) : null;
    el.getAnimations().forEach((a) => a.cancel());
    el.style.width = `${caixa.w}px`;
    el.style.height = `${caixa.h}px`;
    el.style.transform = `translate(${caixa.x}px, ${caixa.y}px)`;
    el.style.opacity = "1";
    visivel.current = true;
    if (de && animar && !movimentoReduzido() && !igual(de, caixa)) {
      el.style.willChange = "transform";
      el.animate(quadros(de, caixa), { duration: DURACAO_MS }).finished.then(
        () => (el.style.willChange = ""),
        () => {},
      );
    }
  }, []);

  useLayoutEffect(() => posicionar(true), [ativo, modo, posicionar]);

  // Vidro líquido é opt-in: sem a marca, a barra fica com o blur de sempre.
  useEffect(() => {
    const barra = nav.current;
    if (!barra) return;
    const q = (c: string) => window.matchMedia(c).matches;
    const marcas = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
    const liga = podeUsarVidro({
      userAgent: navigator.userAgent,
      marcas: marcas.map((m) => m.brand),
      hardwareConcurrency: navigator.hardwareConcurrency,
      reducaoTransparencia: q("(prefers-reduced-transparency: reduce)"),
      reducaoMovimento: q("(prefers-reduced-motion: reduce)"),
      contrasteAlto: q("(prefers-contrast: more)"),
    });
    if (liga) barra.dataset.vidro = "on";
    return () => barra.removeAttribute("data-vidro");
  }, []);

  // Mudança de tamanho (girar o celular, passar do rodapé para a barra lateral) reposiciona sem deslizar.
  useEffect(() => {
    const barra = nav.current;
    if (!barra) return;
    const ro = new ResizeObserver(() => posicionar(false));
    ro.observe(barra);
    return () => ro.disconnect();
  }, [posicionar]);

  const aoClicar = (href: string) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || href === caminho) return;
    setAlvo({ href, caminho });
    clearTimeout(limite.current);
    limite.current = setTimeout(() => setAlvo(null), LIMITE_OTIMISTA_MS);
  };

  return (
    <nav aria-label="Principal" className="tabbar" ref={nav}>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }} focusable="false">
        <filter id="vidro-liquido" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" seed="7" result="ruido" />
          <feDisplacementMap in="SourceGraphic" in2="ruido" scale="28" xChannelSelector="R" yChannelSelector="G" result="refrato" />
          <feGaussianBlur in="refrato" stdDeviation="0.6" />
        </filter>
      </svg>
      <span className="tabbar__ind" aria-hidden="true" ref={ind} />
      {ABAS[modo].map((aba) => {
        const atual = caminho === aba.href || caminho.startsWith(aba.href + "/");
        return (
          <Link
            key={aba.href}
            href={aba.href}
            // Página dinâmica: o prefetch automático só baixa o layout. O completo deixa a 1ª visita sair do cache.
            // Só no voluntário: as telas do líder mostram pedidos de outras pessoas e não podem abrir velhas.
            prefetch={modo === "voluntario" ? true : null}
            aria-current={atual ? "page" : undefined}
            className={ativo === aba.href ? "is-active" : undefined}
            onClick={aoClicar(aba.href)}
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
