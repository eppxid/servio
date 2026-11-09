import type { CSSProperties } from "react";

/** Duas iniciais do nome para o avatar. */
export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

interface AvatarProps {
  nome: string;
  usuarioId?: number | null;
  /** `atualizado_em` da foto (de `versoesDeFoto`); sem ele, mostra as iniciais. */
  fotoVersao?: number;
  /** Lado em px; sem ele vale o tamanho do `.avatar` (ou da `className`). */
  tamanho?: number;
  className?: string;
  cor?: string;
  /** Texto de acessibilidade do avatar sozinho (o nome ao lado já o descreve nas listas). */
  rotulo?: string;
}

/** Círculo com a foto da pessoa (quando existe) ou as iniciais. Sem estado: serve no servidor e no cliente. */
export function Avatar({ nome, usuarioId, fotoVersao, tamanho, className, cor, rotulo }: AvatarProps) {
  const estilo: CSSProperties = {};
  if (tamanho) Object.assign(estilo, { width: tamanho, height: tamanho });
  if (cor) (estilo as Record<string, string>)["--c"] = cor;
  const comFoto = fotoVersao !== undefined && usuarioId != null;
  return (
    <span
      className={`avatar ${className ?? ""}`.trim()}
      style={estilo}
      {...(rotulo ? { role: "img", "aria-label": rotulo } : { "aria-hidden": true })}
    >
      {comFoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a rota devolve webp já reduzido, com cache longo
        <img src={`/api/foto/${usuarioId}?v=${fotoVersao}`} alt="" loading="lazy" decoding="async" />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
