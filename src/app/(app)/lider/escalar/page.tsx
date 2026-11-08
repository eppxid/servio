import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Cabecalho } from "@/components/Cabecalho";
import { hojeIso, nomeDoMes, somarMes } from "@/components/app/calendario-grade";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";
import { trocasParaAprovar } from "@/lib/trocas/nucleo";
import { desfazerAcao, publicarMesAcao, sugerirAcao } from "./acoes";
import { dadosEscalar } from "./dados";
import { EscalarCliente } from "./EscalarCliente";
import { TrocasParaAprovar } from "./TrocasParaAprovar";

export const dynamic = "force-dynamic";

export default async function Escalar({ searchParams }: { searchParams: Promise<{ mes?: string; ministerio?: string }> }) {
  const ator = await exigirUsuarioSemTroca();
  const { mes: pedido, ministerio: m } = await searchParams;
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hojeIso().slice(0, 7);
  const banco = db() as unknown as AnyDb;
  const [d, trocas] = await Promise.all([dadosEscalar(banco, ator, mes, idSeguro(m) || undefined), trocasParaAprovar(banco, ator)]);
  const nome = d.ministerios.find((x) => x.id === d.ministerioId)?.nome ?? "";
  const link = (mesAlvo: string, ministerioId: number | null) =>
    `/lider/escalar?mes=${mesAlvo}${ministerioId ? `&ministerio=${ministerioId}` : ""}`;

  if (d.ministerioId === null) {
    return (
      <div className="tela">
        <Cabecalho eyebrow="Modo líder" titulo="Escalar" />
        <section className="list vazio">
          <p>Você não lidera nenhum ministério.</p>
        </section>
      </div>
    );
  }
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Escalar" />
      <TrocasParaAprovar trocas={trocas} />
      {d.ministerios.length > 1 && (
        <nav aria-label="Ministério" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {d.ministerios.map((x) => (
            <Link
              key={x.id}
              href={link(mes, x.id)}
              className={x.id === d.ministerioId ? "tbtn tbtn--p" : "tbtn tbtn--soft"}
              aria-current={x.id === d.ministerioId ? "page" : undefined}
            >
              {x.nome}
            </Link>
          ))}
        </nav>
      )}
      <nav aria-label="Mês" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Link href={link(somarMes(mes, -1), d.ministerioId)} className="tbtn" aria-label="Mês anterior">
          ←
        </Link>
        <b aria-live="polite">{nomeDoMes(mes)}</b>
        <Link href={link(somarMes(mes, 1), d.ministerioId)} className="tbtn" aria-label="Próximo mês">
          →
        </Link>
      </nav>
      <EscalarCliente
        key={`${d.ministerioId}-${mes}`}
        ministerioId={d.ministerioId}
        ministerio={nome}
        mes={mes}
        cultos={d.cultos.map((c) => ({
          eventoId: c.eventoId,
          titulo: c.titulo,
          quando: `${formatInTimeZone(c.inicio, FUSO, "dd/MM")} · ${formatInTimeZone(c.inicio, FUSO, "HH:mm")}`,
          preenchidas: c.preenchidas,
          total: c.total,
          status: c.status,
        }))}
        rascunhos={d.rascunhos}
        sugerir={sugerirAcao}
        desfazer={desfazerAcao}
        publicarMes={publicarMesAcao}
      />
    </div>
  );
}
