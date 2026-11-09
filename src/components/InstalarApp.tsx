"use client";

import { useEffect, useState } from "react";

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

// O navegador dispara `beforeinstallprompt` uma vez só, antes de a tela montar: guardo no módulo.
let evento: EventoInstalar | null = null;
let instalado = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instalado = true;
    evento = null;
    avisar();
  });
}

type Modo = "oculto" | "botao" | "instalado" | "android" | "iphone";

function modoAtual(): Modo {
  if (typeof window === "undefined") return "oculto";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "oculto";
  if (instalado) return "instalado";
  if (evento) return "botao";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "oculto";
}

/** Convida a instalar o app. Some quando o app já está instalado. */
export function InstalarApp() {
  const [modo, setModo] = useState<Modo>("oculto");

  useEffect(() => {
    // O navegador só oferece instalar com o service worker registrado.
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const atualizar = () => setModo(modoAtual());
    atualizar();
    ouvintes.add(atualizar);
    return () => {
      ouvintes.delete(atualizar);
    };
  }, []);

  if (modo === "oculto") return null;

  return (
    <section className="alerta space-y-2 text-sm" aria-label="Instalar o app">
      {modo === "botao" && (
        <>
          <p className="font-medium">Instale o app no seu aparelho.</p>
          <button
            type="button"
            className="btn btn--block min-h-11"
            onClick={async () => {
              await evento?.prompt();
            }}
          >
            Instalar o app
          </button>
        </>
      )}
      {modo === "instalado" && <p className="font-medium">App instalado. Abra pelo ícone Servio.</p>}
      {modo === "android" && (
        <>
          <p className="font-medium">Instale o app no seu aparelho.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra no Chrome.</li>
            <li>Toque em ⋮ (canto de cima).</li>
            <li>Toque em Instalar app (ou Adicionar à tela inicial).</li>
          </ol>
        </>
      )}
      {modo === "iphone" && (
        <>
          <p className="font-medium">Instale o app no seu aparelho.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra no Safari.</li>
            <li>Toque em Compartilhar.</li>
            <li>Toque em Adicionar à Tela de Início.</li>
          </ol>
          <p className="text-muted">Instale antes de tocar em Entrar.</p>
        </>
      )}
    </section>
  );
}
