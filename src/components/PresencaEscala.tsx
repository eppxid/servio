import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";

export interface LinhaPresenca {
  nome: string;
  funcao: string;
  status: "pendente" | "confirmado" | "recusado";
  checkinEm: Date | null;
}

const STATUS = { pendente: "Aguardando", confirmado: "Confirmado", recusado: "Recusou" } as const;

/** Presença da escala para o líder: confirmação e horário do check-in de cada escalado. */
export function PresencaEscala({ linhas }: { linhas: readonly LinhaPresenca[] }) {
  if (linhas.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Presença</h2>
      <ul className="divide-y divide-slate-200 text-sm">
        {linhas.map((l) => (
          <li key={`${l.funcao}-${l.nome}`} className="flex justify-between gap-3 py-1">
            <span>
              {l.funcao}: {l.nome}
            </span>
            <span className={l.checkinEm ? "text-green-700" : "text-slate-500"}>
              {l.checkinEm ? `Presente ${formatInTimeZone(l.checkinEm, FUSO, "HH:mm")}` : STATUS[l.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
