"use client";

import { useRef, useState, useTransition } from "react";
import { removerFotoAcao, salvarFotoAcao } from "./acoes";

const LADO = 512;
const MAX_BYTES = 150 * 1024;
const MSG_NAVEGADOR = "Atualize o navegador para enviar foto";

function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("Não foi possível abrir essa imagem"));
    };
    img.src = url;
  });
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob(ok, tipo, qualidade));
}

/** Recorte quadrado central, 512×512, WebP (JPEG no Safari, que não codifica WebP): regravar no canvas apaga o EXIF (inclusive GPS). */
async function prepararFoto(arquivo: File): Promise<Blob> {
  const img = await carregar(arquivo);
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(MSG_NAVEGADOR);
  ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  let tipo = "image/webp";
  for (let q = 0.82; q >= 0.3; q -= 0.1) {
    let blob = await paraBlob(canvas, tipo, q);
    // Safari (iOS e macOS) devolve PNG quando não sabe WebP: cai para JPEG.
    if (blob && blob.type !== tipo && tipo === "image/webp") {
      tipo = "image/jpeg";
      blob = await paraBlob(canvas, tipo, q);
    }
    if (!blob || blob.type !== tipo) throw new Error(MSG_NAVEGADOR);
    if (blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("A foto ficou grande demais. Escolha outra.");
}

export function FotoPerfil({ usuarioId, nome, versao }: { usuarioId: number; nome: string; versao: number | null }) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const atual = versao !== null ? `/api/foto/${usuarioId}?v=${versao}` : null;
  const mostrada = previa ?? atual;

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    try {
      const pronto = await prepararFoto(arquivo);
      if (previa) URL.revokeObjectURL(previa);
      setBlob(pronto);
      setPrevia(URL.createObjectURL(pronto));
    } catch (err) {
      setBlob(null);
      setPrevia(null);
      setErro(err instanceof Error ? err.message : "Não foi possível usar essa foto");
    }
    if (entrada.current) entrada.current.value = "";
  }

  function salvar() {
    if (!blob) return;
    const dados = new FormData();
    dados.set("foto", blob, blob.type === "image/jpeg" ? "foto.jpg" : "foto.webp");
    iniciar(() => salvarFotoAcao(dados));
  }

  return (
    <section id="foto" className="card space-y-3" aria-labelledby="titulo-foto">
      <h2 id="titulo-foto" className="card__title">Minha foto</h2>
      <div className="flex items-center gap-4">
        {mostrada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mostrada}
            alt={previa ? "Prévia da nova foto" : `Foto de ${nome}`}
            width={96}
            height={96}
            data-testid="foto-previa"
            style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: 32,
              background: "var(--surface-2, #e5e7eb)",
            }}
          >
            {nome.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="space-y-2">
          <label className="btn" style={{ minHeight: 44, position: "relative" }}>
            Escolher foto
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              onChange={escolher}
              data-testid="foto-arquivo"
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
          </label>
          {previa && (
            <button type="button" className="btn btn--primary" onClick={salvar} disabled={pendente} style={{ minHeight: 44 }}>
              {pendente ? "Salvando…" : "Salvar foto"}
            </button>
          )}
        </div>
      </div>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {atual && !previa && (
        <button
          type="button"
          className="btn btn--danger"
          disabled={pendente}
          style={{ minHeight: 44 }}
          onClick={() => iniciar(() => removerFotoAcao())}
        >
          Remover foto
        </button>
      )}
      <p className="text-xs text-muted">Só você pode trocar a sua foto. Membros da sua igreja veem a foto na escala.</p>
    </section>
  );
}
