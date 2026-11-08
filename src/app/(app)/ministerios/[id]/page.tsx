import { redirect } from "next/navigation";
import { idSeguro } from "@/lib/ministerios/sessao";

/** O detalhe antigo virou a aba Membros de Equipe. */
export default async function Ministerio({ params }: { params: Promise<{ id: string }> }) {
  const id = idSeguro((await params).id);
  redirect(id ? `/lider/equipe?ministerio=${id}&aba=membros` : "/lider/equipe");
}
