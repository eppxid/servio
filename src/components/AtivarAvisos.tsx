"use client";

import { useEffect, useState } from "react";

type Estado = "carregando" | "sem-suporte" | "ios-instalar" | "bloqueado" | "inativo" | "ativo";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchida = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(preenchida);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function registro() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export default function AtivarAvisos() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (ios && !standalone) return setEstado("ios-instalar");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setEstado("sem-suporte");
    }
    if (Notification.permission === "denied") return setEstado("bloqueado");
    registro()
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setEstado(s ? "ativo" : "inativo"))
      .catch(() => setEstado("inativo"));
  }, []);

  async function ativar() {
    setErro("");
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) throw new Error("Avisos não configurados no servidor.");
      if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueado");
      const r = await registro();
      const s = await r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      });
      const resp = await fetch("/api/push/inscricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s.toJSON()),
      });
      if (!resp.ok) throw new Error("Não foi possível salvar a inscrição.");
      setEstado("ativo");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function desativar() {
    setErro("");
    try {
      const s = await (await registro()).pushManager.getSubscription();
      if (s) {
        await fetch("/api/push/inscricao", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: s.endpoint }),
        });
        await s.unsubscribe();
      }
      setEstado("inativo");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Avisos no celular</h2>
      {estado === "carregando" && <p className="text-sm text-slate-500">Verificando…</p>}
      {estado === "ios-instalar" && (
        <p className="text-sm text-slate-700">
          No iPhone, instale o app para receber avisos: toque em Compartilhar &gt; Adicionar à Tela de
          Início e abra o app pelo ícone.
        </p>
      )}
      {estado === "sem-suporte" && (
        <p className="text-sm text-slate-500">Este navegador não suporta avisos.</p>
      )}
      {estado === "bloqueado" && (
        <p className="text-sm text-slate-700">
          Os avisos estão bloqueados. Libere nas configurações do navegador para este site.
        </p>
      )}
      {estado === "inativo" && (
        <button type="button" onClick={ativar} className="botao">
          Ativar avisos
        </button>
      )}
      {estado === "ativo" && (
        <div className="space-y-2">
          <p className="text-sm text-green-800">Avisos ativos neste aparelho.</p>
          <button type="button" onClick={desativar} className="botao">
            Desativar avisos
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm text-red-800">
          {erro}
        </p>
      )}
    </section>
  );
}
