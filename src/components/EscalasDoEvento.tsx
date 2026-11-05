import Link from "next/link";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { escalasPublicadasDoEvento } from "@/lib/escala/nucleo";

/** Escalas publicadas do evento (só nomes), para o detalhe do evento. */
export async function EscalasDoEvento({ eventoId, igrejaId }: { eventoId: number; igrejaId: number }) {
  const grupos = await escalasPublicadasDoEvento(db() as unknown as AnyDb, igrejaId, eventoId);
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <h2 className="font-semibold">Escalas</h2>
      <Link href={`/chat/${eventoId}`} className="text-sm underline">
        Chat
      </Link>
      {grupos.length === 0 && <p className="text-sm text-slate-600">Nenhuma escala publicada.</p>}
      {grupos.map((g) => (
        <div key={g.ministerio} className="space-y-1">
          <h3 className="text-sm font-medium">{g.ministerio}</h3>
          <ul className="text-sm text-slate-700">
            {g.itens.map((i, n) => (
              <li key={n}>
                {i.funcao}: {i.nome}
                {i.status !== "confirmado" && <span className="text-xs text-slate-500"> ({i.status})</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
