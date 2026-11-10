"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { IconeApp, type NomeIcone } from "./app/icones";
import type { Modo } from "./app/modo-comum";

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
const FRENTE_MS = 280;
const TRAS_MS = 440;
/** Mola: passa um pouco do ponto e volta. */
const MOLA = "linear(0, 0.2 6%, 0.52 13%, 0.8 21%, 0.97 29%, 1.06 40%, 1.07 48%, 1.03 60%, 0.995 76%, 1)";

type Caixa = { l: number; r: number; t: number; b: number };

/** Posição do ícone-pílula da aba dentro do padding box da barra (offsets de cada borda). */
function medir(nav: HTMLElement, link: HTMLElement): Caixa | null {
  const pill = link.querySelector<HTMLElement>(".pill");
  if (!pill) return null;
  const n = nav.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  const l = p.left - n.left - nav.clientLeft;
  const t = p.top - n.top - nav.clientTop;
  return { l, t, r: nav.clientWidth - (l + p.width), b: nav.clientHeight - (t + p.height) };
}

const igual = (a: Caixa, b: Caixa) =>
  Math.abs(a.l - b.l) < 0.5 && Math.abs(a.r - b.r) < 0.5 && Math.abs(a.t - b.t) < 0.5 && Math.abs(a.b - b.b) < 0.5;

/** Borda da frente anda rápido e a de trás segue com atraso: a pílula estica no caminho e volta ao tamanho com a mola. */
function transicao(de: Caixa, para: Caixa) {
  const aoLado = Math.abs(para.l - de.l) >= Math.abs(para.t - de.t);
  const f = `${FRENTE_MS}ms ${MOLA}`;
  const t = `${TRAS_MS}ms ${MOLA}`;
  const crescendo = aoLado ? para.l > de.l : para.t > de.t;
  const eixo = aoLado ? ["left", "right"] : ["top", "bottom"];
  const [frente, tras] = crescendo ? [eixo[1], eixo[0]] : [eixo[0], eixo[1]];
  const parado = aoLado ? ["top", "bottom"] : ["left", "right"];
  return [`${frente} ${f}`, `${tras} ${t}`, ...parado.map((p) => `${p} ${t}`)].join(", ");
}

/** Abas do modo: rodapé com ícone e rótulo no celular, barra de ícones à esquerda no desktop. */
export function Abas({ modo }: { modo: Modo }) {
  const caminho = usePathname();
  // Toque otimista: o destaque vai para a aba tocada sem esperar a tela nova.
  const [alvo, setAlvo] = useState<{ href: string; caminho: string } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const limite = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anterior = useRef<Caixa | null>(null);

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
      el.style.opacity = "0";
      anterior.current = null;
      return;
    }
    const antes = anterior.current;
    if (antes && animar && !igual(antes, caixa)) el.style.transition = transicao(antes, caixa);
    else el.style.transition = "none";
    el.style.opacity = "1";
    el.style.left = `${caixa.l}px`;
    el.style.right = `${caixa.r}px`;
    el.style.top = `${caixa.t}px`;
    el.style.bottom = `${caixa.b}px`;
    anterior.current = caixa;
  }, []);

  useLayoutEffect(() => posicionar(true), [ativo, modo, posicionar]);

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
