import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { usuarioAtual } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { gerarCsv } from "@/lib/indicadores/csv";
import { carregarPainel } from "@/lib/indicadores/consulta";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";
import { FUSO } from "@/lib/recorrencia";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const tipo = p.get("tipo");
  if (tipo !== "voluntarios" && tipo !== "vagas") {
    return NextResponse.json({ erro: "Tipo inválido" }, { status: 400 });
  }
  const ministerio = p.get("ministerio");

  let painel;
  try {
    painel = await carregarPainel(db() as unknown as AnyDb, usuario, {
      de: p.get("de") ?? undefined,
      ate: p.get("ate") ?? undefined,
      ministerioId: ministerio ? idSeguro(ministerio) : undefined,
    });
  } catch (e) {
    if (e instanceof ErroAcesso) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
    if (e instanceof Error && e.message === "Período inválido") {
      return NextResponse.json({ erro: e.message }, { status: 400 });
    }
    throw e;
  }

  const csv =
    tipo === "voluntarios"
      ? gerarCsv(
          ["Voluntário", "Escalas", "Confirmadas", "Presenças", "Recusas"],
          painel.porVoluntario.map((l) => [l.nome, l.total, l.confirmadas, l.presencas, l.recusas]),
        )
      : gerarCsv(
          ["Data", "Ministério", "Função"],
          painel.vagas.map((v) => [formatInTimeZone(v.quando, FUSO, "dd/MM/yyyy HH:mm"), v.ministerio, v.funcao]),
        );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
