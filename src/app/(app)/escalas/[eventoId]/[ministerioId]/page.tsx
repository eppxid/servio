import { redirect } from "next/navigation";
import { idSeguro } from "@/lib/ministerios/sessao";

/** A montagem por ministério foi substituída pela tela do culto (modo líder). */
export default async function MontarEscala({ params }: { params: Promise<{ eventoId: string }> }) {
  redirect(`/lider/cultos/${idSeguro((await params).eventoId)}`);
}
