import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { exigirAcessoChat } from "@/lib/chat/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import { Chat } from "./Chat";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function PaginaChat({ params }: { params: Promise<{ eventoId: string }> }) {
  const usuario = await exigirUsuario();
  const eventoId = idSeguro((await params).eventoId);
  if (!eventoId) notFound();
  let lider: boolean;
  try {
    lider = (await exigirAcessoChat(db() as unknown as AnyDb, usuario, eventoId)).lider;
  } catch (e) {
    if (e instanceof ErroAcesso) redirect("/agenda");
    throw e;
  }
  return (
    <div className="tela">
      <Cabecalho eyebrow="Escala" titulo="Chat da escala" />
      <Chat eventoId={eventoId} usuarioId={usuario.id} lider={lider} />
    </div>
  );
}
