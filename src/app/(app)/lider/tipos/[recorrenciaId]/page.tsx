import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { DIAS_SEMANA, modeloDoTipo } from "../../cultos/vagas-culto";
import { salvarModeloAcao } from "../acoes";
import { EditorModelo } from "./EditorModelo";

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
  return (
    <div className="tela">
      <Cabecalho
        eyebrow={`${DIAS_SEMANA[d.tipo.diaSemana]}, ${d.tipo.horaInicio}${d.tipo.horaFim ? `–${d.tipo.horaFim}` : ""}`}
        titulo={d.tipo.nome}
      >
        <Link href="/lider/tipos" className="tbtn">
          ← Tipos
        </Link>
      </Cabecalho>
      <p className="eyebrow">Vagas por ministério. A mudança vale para os próximos cultos ainda em rascunho.</p>
      {d.ministerios.map((m) => (
        <EditorModelo key={m.id} recorrenciaId={d.tipo.id} ministerio={m} salvar={salvarModeloAcao} />
      ))}
    </div>
  );
}
