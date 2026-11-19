import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import { recorrencias } from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { DIAS_SEMANA, modeloDoTipo } from "../../cultos/vagas-culto";
import {
  contarCultosAposLimiteAcao,
  definirDataLimiteTipoAcao,
  editarHorarioTipoAcao,
  excluirTipoAcao,
  renomearTipoAcao,
  salvarModeloAcao,
} from "../acoes";
import { DiaHorarioTipo } from "./DiaHorarioTipo";
import { EditorModelo } from "./EditorModelo";
import { ExcluirTipo } from "./ExcluirTipo";
import { RenomearTipo } from "./RenomearTipo";

export const dynamic = "force-dynamic";

export default async function ModeloDoTipo({ params }: { params: Promise<{ recorrenciaId: string }> }) {
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro((await params).recorrenciaId);
  let d;
  try {
    d = await modeloDoTipo(db() as unknown as AnyDb, ator, id);
  } catch (erro) {
    if (erro instanceof ErroAcesso) notFound();
    throw erro;
  }
  const [{ ate }] = await db()
    .select({ ate: recorrencias.ate })
    .from(recorrencias)
    .where(and(eq(recorrencias.id, d.tipo.id), eq(recorrencias.igrejaId, ator.igrejaId)));
  const admin = ator.papelGlobal === "admin";
  return (
    <div className="tela">
      <Cabecalho
        eyebrow={`${DIAS_SEMANA[d.tipo.diaSemana]}, ${d.tipo.horaInicio}${d.tipo.horaFim ? `–${d.tipo.horaFim}` : ""}${ate ? `, até ${ate.split("-").reverse().join("/")}` : ""}`}
        titulo={d.tipo.nome}
      >
        <Link href="/lider/tipos" className="tbtn">
          ← Tipos
        </Link>
      </Cabecalho>
      {admin && (
        <>
          <RenomearTipo recorrenciaId={d.tipo.id} nome={d.tipo.nome} renomear={renomearTipoAcao} />
          <DiaHorarioTipo
            recorrenciaId={d.tipo.id}
            diaSemana={d.tipo.diaSemana}
            horaInicio={d.tipo.horaInicio}
            horaFim={d.tipo.horaFim}
            ate={ate}
            salvarHorario={editarHorarioTipoAcao}
            contarRemocao={contarCultosAposLimiteAcao}
            salvarLimite={definirDataLimiteTipoAcao}
          />
        </>
      )}
      <p className="eyebrow">Vagas por ministério. A mudança vale para os próximos cultos ainda em rascunho.</p>
      {d.ministerios.map((m) => (
        <EditorModelo key={m.id} recorrenciaId={d.tipo.id} ministerio={m} salvar={salvarModeloAcao} />
      ))}
      {admin && <ExcluirTipo recorrenciaId={d.tipo.id} excluir={excluirTipoAcao} />}
    </div>
  );
}
