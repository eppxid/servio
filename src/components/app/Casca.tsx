"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar } from "../Avatar";
import { Abas } from "../abas";
import { Marca } from "../Marca";
import { ajusteDoFundo } from "./fundo-visual";
import { definirModo } from "./modo";
import { INICIO_DO_MODO, modoDoCaminho, type Modo } from "./modo-comum";

/** Topo (marca, chave "Modo líder", avatar) e abas do modo atual. */
export function Casca({
  ehLider,
  modoSalvo,
  nome,
  usuarioId,
  fotoVersao,
}: {
  ehLider: boolean;
  modoSalvo: Modo;
  nome: string;
  usuarioId: number;
  fotoVersao?: number;
}) {
  const caminho = usePathname();
  const modo = modoDoCaminho(caminho, modoSalvo, ehLider);
  const lider = modo === "lider";
  useFundoVisual();

  return (
    <>
      <Abas modo={modo} />
      <header className="top">
        <Marca href={INICIO_DO_MODO[modo]} />
        <div className="top__end">
          {ehLider && (
            <form action={definirModo}>
              <input type="hidden" name="modo" value={lider ? "voluntario" : "lider"} />
              <button type="submit" role="switch" aria-checked={lider} aria-label="Modo líder" className={`modo${lider ? " is-on" : ""}`}>
                Líder
                <i aria-hidden="true" />
              </button>
            </form>
          )}
          <Link href="/perfil" className="top__link" aria-label="Perfil">
            <Avatar nome={nome} usuarioId={usuarioId} fotoVersao={fotoVersao} className="top__avatar" />
          </Link>
        </div>
      </header>
    </>
  );
}

/**
 * Mantém abas e ação principal coladas no fundo visível no celular (ver `ajusteDoFundo`).
 * Grava `--fundo-ajuste` no <html>; o app.css desce as barras fixas com `translate`.
 */
function useFundoVisual() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    const celular = window.matchMedia("(max-width: 899.98px)");
    let atual = 0;
    let quadro = 0;
    const aplicar = (px: number) => {
      if (px === atual) return;
      atual = px;
      if (px) raiz.style.setProperty("--fundo-ajuste", `${px}px`);
      else raiz.style.removeProperty("--fundo-ajuste");
    };
    const medir = () => {
      quadro = 0;
      const barra = document.querySelector(".tabbar");
      if (!barra || !celular.matches) return aplicar(0);
      aplicar(
        ajusteDoFundo({
          topoVisual: vv.offsetTop,
          alturaVisual: vv.height,
          escala: vv.scale,
          fundoBarra: barra.getBoundingClientRect().bottom,
          ajusteAtual: atual,
          campoEmFoco: !!document.activeElement?.matches("input, textarea, select, [contenteditable]"),
        }),
      );
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    vv.addEventListener("resize", agendar);
    vv.addEventListener("scroll", agendar);
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("pageshow", agendar);
    document.addEventListener("focusin", agendar);
    document.addEventListener("focusout", agendar);
    celular.addEventListener("change", agendar);
    return () => {
      cancelAnimationFrame(quadro);
      vv.removeEventListener("resize", agendar);
      vv.removeEventListener("scroll", agendar);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("pageshow", agendar);
      document.removeEventListener("focusin", agendar);
      document.removeEventListener("focusout", agendar);
      celular.removeEventListener("change", agendar);
      raiz.style.removeProperty("--fundo-ajuste");
    };
  }, []);
}
