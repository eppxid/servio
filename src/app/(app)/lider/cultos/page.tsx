import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Cabecalho } from "@/components/Cabecalho";
import { AcaoPrincipal } from "@/components/app/AcaoPrincipal";
import { hojeIso } from "@/components/app/calendario-grade";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { FUSO, dataLocal } from "@/lib/recorrencia";
import { preenchimentoDoMes } from "@/lib/vagas/nucleo";
import { CalendarioCultos, type CultoDoMes } from "./CalendarioCultos";

export const dynamic = "force-dynamic";

export default async function Cultos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const usuario = await exigirUsuario();
  const admin = usuario.papelGlobal === "admin";
  const { mes: pedido } = await searchParams;
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hojeIso().slice(0, 7);
  const eventos = await preenchimentoDoMes(db() as unknown as AnyDb, usuario, mes);
  const cultos: CultoDoMes[] = eventos.map((e) => ({
    eventoId: e.eventoId,
    titulo: e.titulo,
    data: dataLocal(e.inicio),
    hora: formatInTimeZone(e.inicio, FUSO, "HH:mm"),
    ministerios: e.ministerios.map((m) => ({
      id: m.ministerioId,
      nome: m.nome,
      preenchidas: m.preenchidas,
      total: m.total,
      status: m.status,
    })),
  }));
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Cultos">
        <Link href="/lider/tipos" className="tbtn tbtn--soft">
          Tipos de culto
        </Link>
      </Cabecalho>
      <CalendarioCultos mes={mes} cultos={cultos}>
        {admin && (
          <AcaoPrincipal href="/eventos/novo" icone="adicionar">
            Novo culto
          </AcaoPrincipal>
        )}
      </CalendarioCultos>
    </div>
  );
}
