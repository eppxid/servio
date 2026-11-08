import { and, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { FUSO } from "@/lib/recorrencia";
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
  const [evento] = await db()
    .select({ titulo: eventos.titulo, inicio: eventos.inicio })
    .from(eventos)
    .where(and(eq(eventos.id, eventoId), eq(eventos.igrejaId, usuario.igrejaId)))
    .limit(1);
  const eyebrow = evento ? `${evento.titulo} · ${formatInTimeZone(evento.inicio, FUSO, "dd/MM HH:mm")}` : "Escala";
  return (
    <div className="tela">
      <Cabecalho eyebrow={eyebrow} titulo="Chat da escala" />
      <Chat eventoId={eventoId} usuarioId={usuario.id} lider={lider} />
    </div>
  );
}
