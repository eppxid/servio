"use client";

import { useEffect, useState } from "react";
import { CopiarLink } from "./CopiarLink";

/** Compartilha o link pessoal: folha nativa do celular quando existe, senão WhatsApp e cópia. */
export function CompartilharConvite({ link, nome }: { link: string; nome: string }) {
  const [nativo, setNativo] = useState<boolean | null>(null);
  useEffect(() => setNativo(typeof navigator.share === "function"), []);
  // Regra LGPD 7: a mensagem passa por terceiro e não cita igreja nem ministério.
  const texto = `Olá, ${nome}! Seu link de acesso ao Servio:`;

  async function compartilhar() {
    try {
      await navigator.share({ title: "Servio", text: texto, url: link });
    } catch {
      // O líder fechou a folha de compartilhar: não é erro.
    }
  }

  return (
    <>
      {nativo && (
        <button type="button" className="tbtn tbtn--p" onClick={compartilhar}>
          Compartilhar
        </button>
      )}
      {nativo === false && (
        <a
          className="tbtn tbtn--p"
          href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${link}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Enviar por WhatsApp
        </a>
      )}
      <CopiarLink link={link} />
    </>
  );
}
