"use client";

import { useEffect, useState } from "react";

const CINCO_SEGUNDOS = 5000;

/** Espera o líder decidir: consulta o pedido a cada 5 s. Aprovado → reabre a sessão neste aparelho. */
export function Aguardando({ pedidoId }: { pedidoId: number }) {
  const [estado, setEstado] = useState<"pendente" | "recusado" | "erro">("pendente");

  useEffect(() => {
    let ativo = true;
    async function consultar() {
      try {
        const r = await fetch(`/acesso/pedido/${pedidoId}`, { cache: "no-store" });
        if (!ativo) return;
        if (!r.ok) return setEstado("erro");
        const { status } = (await r.json()) as { status: "pendente" | "aprovado" | "recusado" };
        if (status === "aprovado") location.assign("/acesso/reentrar");
        else setEstado(status);
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
    }
    consultar();
    const id = setInterval(() => estado === "pendente" && consultar(), CINCO_SEGUNDOS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [pedidoId, estado]);

  if (estado === "recusado") return <p role="alert" className="alerta alerta--bad">Pedido recusado. Fale com o líder.</p>;
  if (estado === "erro") return <p role="alert" className="alerta alerta--bad">Não foi possível consultar o pedido. Abra o link de novo.</p>;
  return (
    <p role="status" className="text-sm text-muted">
      Pedido enviado. Aguarde o líder aprovar. Esta tela atualiza sozinha.
    </p>
  );
}
