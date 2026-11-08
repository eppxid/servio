import { redirect } from "next/navigation";

/** A lista antiga foi substituída por Cultos (modo líder); `?mes=` é mantido. */
export default async function Eventos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  redirect(mes ? `/lider/cultos?mes=${encodeURIComponent(mes)}` : "/lider/cultos");
}
