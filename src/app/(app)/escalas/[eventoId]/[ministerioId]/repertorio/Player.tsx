"use client";

import { useState } from "react";

/** Player embutido: o iframe só entra na página depois do toque em "Ouvir". */
export function Player({ spotify, deezer }: { spotify: string | null; deezer: string | null }) {
  const [aberto, setAberto] = useState<"spotify" | "deezer" | null>(null);
  const url = aberto === "spotify" ? spotify : aberto === "deezer" ? deezer : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {spotify && (
          <button type="button" className="btn btn--sm" onClick={() => setAberto(aberto === "spotify" ? null : "spotify")}>
            Ouvir no Spotify
          </button>
        )}
        {deezer && (
          <button type="button" className="btn btn--sm" onClick={() => setAberto(aberto === "deezer" ? null : "deezer")}>
            Ouvir no Deezer
          </button>
        )}
      </div>
      {url && (
        <iframe
          src={url}
          title="Player"
          width="100%"
          height={aberto === "spotify" ? 152 : 150}
          allow="encrypted-media"
          loading="lazy"
          className="rounded-[var(--r-tile)] border-0"
        />
      )}
    </div>
  );
}
