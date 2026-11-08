import { formatInTimeZone } from "date-fns-tz";
import { FUSO } from "@/lib/recorrencia";
import { decidirTrocaAcao } from "../../agenda/acoes";
import estilo from "./escalar.module.css";

export interface TrocaPendente {
  id: number;
  ministerio: string;
  funcao: string;
  titulo: string;
  inicio: Date;
  solicitante: string;
  substituto: string;
}

/** Trocas aceitas pelo substituto que esperam a decisão do líder. Não mostra nada sem pedidos. */
export function TrocasParaAprovar({ trocas }: { trocas: TrocaPendente[] }) {
  if (trocas.length === 0) return null;
  return (
    <section aria-labelledby="trocas-titulo" className={estilo.trocas}>
      <div className={estilo.titulo}>
        <h2 id="trocas-titulo">Trocas para aprovar</h2>
        <span className={estilo.contador} aria-label={`${trocas.length} ${trocas.length === 1 ? "troca" : "trocas"}`}>
          {trocas.length}
        </span>
      </div>
      <div className="list">
        {trocas.map((p) => (
          <form key={p.id} action={decidirTrocaAcao} className={estilo.troca}>
            <input type="hidden" name="troca" value={p.id} />
            <p>
              <b>
                {p.solicitante} → {p.substituto} ({p.funcao})
              </b>
              <span>
                {p.ministerio} · {p.titulo}, {formatInTimeZone(p.inicio, FUSO, "dd/MM HH:mm")}
              </span>
            </p>
            <div className={estilo.botoes}>
              <button name="acao" value="recusar" className="tbtn tbtn--soft">
                Recusar
              </button>
              <button name="acao" value="aprovar" className="tbtn tbtn--p">
                Aprovar
              </button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}
