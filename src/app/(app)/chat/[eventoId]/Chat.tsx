"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Mensagem {
  id: number;
  usuarioId: number;
  autor: string;
  texto: string;
  aviso: boolean;
  criadoEm: string;
}

export function Chat({ eventoId, usuarioId, lider }: { eventoId: number; usuarioId: number; lider: boolean }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState(false);
  const [erro, setErro] = useState("");
  const ultima = useRef<string | undefined>(undefined);

  const buscar = useCallback(async () => {
    const q = ultima.current ? `?depois=${encodeURIComponent(ultima.current)}` : "";
    const r = await fetch(`/api/chat/${eventoId}${q}`, { cache: "no-store" });
    if (!r.ok) return;
    const { mensagens: novas } = (await r.json()) as { mensagens: Mensagem[] };
    if (novas.length === 0) return;
    ultima.current = novas[novas.length - 1].criadoEm;
    setMensagens((atual) => {
      const ids = new Set(atual.map((m) => m.id));
      return [...atual, ...novas.filter((m) => !ids.has(m.id))];
    });
  }, [eventoId]);

  useEffect(() => {
    void buscar();
    const timer = setInterval(() => void buscar(), 5000);
    return () => clearInterval(timer);
  }, [buscar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const r = await fetch(`/api/chat/${eventoId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto, aviso }),
    });
    if (!r.ok) {
      setErro(((await r.json().catch(() => null)) as { erro?: string } | null)?.erro ?? "Falha ao enviar");
      return;
    }
    setTexto("");
    setAviso(false);
    await buscar();
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2" aria-live="polite">
        {mensagens.length === 0 && <li className="text-sm text-muted">Nenhuma mensagem ainda.</li>}
        {mensagens.map((m) => (
          <li
            key={m.id}
            className={`rounded-[var(--r-tile)] p-3 text-sm ${
              m.aviso
                ? "alerta alerta--warn"
                : m.usuarioId === usuarioId
                  ? "bg-primary/10"
                  : "bg-well"
            }`}
          >
            <p className="text-xs font-medium text-muted">
              {m.aviso && "Aviso · "}
              {m.autor} · {new Date(m.criadoEm).toLocaleString("pt-BR")}
            </p>
            <p className="whitespace-pre-wrap break-words">{m.texto}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={enviar} className="space-y-2">
        {erro && (
          <p role="alert" className="alerta alerta--bad">
            {erro}
          </p>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={1000}
          required
          rows={3}
          aria-label="Mensagem"
          enterKeyHint="send"
          className="campo"
        />
        {lider && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="caixa size-5" checked={aviso} onChange={(e) => setAviso(e.target.checked)} />
            Marcar como aviso
          </label>
        )}
        <button type="submit" className="btn btn--primary btn--block">
          Enviar
        </button>
      </form>
    </div>
  );
}
