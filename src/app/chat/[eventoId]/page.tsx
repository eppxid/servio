import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { exigirAcessoChat } from "@/lib/chat/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import { Chat } from "./Chat";

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
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Chat da escala</h1>
      <Chat eventoId={eventoId} usuarioId={usuario.id} lider={lider} />
    </main>
  );
}
