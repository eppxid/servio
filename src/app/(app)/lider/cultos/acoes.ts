"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroEscala } from "@/lib/escala/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { copiarVagasDeTipo, definirVagasDoCulto } from "@/lib/vagas/nucleo";
import { aprovarEEscalar, preencherVaga, publicarCulto, type StatusItem } from "./vagas-culto";

const banco = () => db() as unknown as AnyDb;

export type Resultado = { erro?: string };

async function comoResultado(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    return {};
  } catch (erro) {
    if (erro instanceof ErroEscala) return { erro: erro.message };
    if (erro instanceof ErroAcesso) return { erro: "Você não lidera este ministério" };
    throw erro;
  }
}

/** Põe uma pessoa na vaga (ou tira, com `usuarioId` nulo). */
export async function escolherPessoaAcao(eventoId: number, itemId: number, usuarioId: number | null): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() => preencherVaga(banco(), ator, idSeguro(itemId), usuarioId === null ? null : idSeguro(usuarioId) || -1));
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}

/** Desfaz uma remoção: devolve a pessoa à vaga com o status que ela tinha. */
export async function desfazerRemocaoAcao(
  eventoId: number,
  itemId: number,
  usuarioId: number,
  status: StatusItem,
): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const permitido: StatusItem[] = ["pendente", "confirmado", "recusado"];
  const r = await comoResultado(() =>
    preencherVaga(banco(), ator, idSeguro(itemId), idSeguro(usuarioId) || -1, permitido.includes(status) ? status : "pendente"),
  );
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}

/** Aprova a função que a pessoa pediu e a escala numa vaga aberta deste culto. */
export async function aprovarEEscalarAcao(
  eventoId: number,
  ministerioId: number,
  membroId: number,
  funcaoId: number,
): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() =>
    aprovarEEscalar(banco(), ator, idSeguro(eventoId), idSeguro(ministerioId), idSeguro(membroId), idSeguro(funcaoId)),
  );
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  revalidatePath("/lider/equipe");
  return r;
}

export async function publicarAcao(eventoId: number, ministerioId: number): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() => publicarCulto(banco(), ator, idSeguro(eventoId), idSeguro(ministerioId)));
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}

/** Culto avulso: copia o modelo de vagas de um tipo de culto. */
export async function copiarVagasAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const eventoId = idSeguro(formData.get("evento"));
  const tipo = idSeguro(formData.get("tipo"));
  const caminho = `/lider/cultos/${eventoId}`;
  if (!eventoId || !tipo) redirect(caminho);
  try {
    await copiarVagasDeTipo(banco(), ator, eventoId, tipo);
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/lider/cultos");
    if (erro instanceof ErroEscala) redirect(`${caminho}?tipoSemVagas=${tipo}`);
    throw erro;
  }
  revalidatePath(caminho);
  revalidatePath("/lider/cultos");
  redirect(caminho);
}

/** Define as vagas só deste culto para um ministério (cria a escala em rascunho se preciso). */
export async function definirVagasAcao(
  eventoId: number,
  ministerioId: number,
  vagas: { funcaoId: number; quantidade: number }[],
): Promise<Resultado> {
  const ator = await exigirUsuarioSemTroca();
  const r = await comoResultado(() =>
    definirVagasDoCulto(
      banco(),
      ator,
      idSeguro(eventoId),
      idSeguro(ministerioId),
      vagas.map((v) => ({ funcaoId: idSeguro(v.funcaoId), quantidade: Number(v.quantidade) })),
    ),
  );
  revalidatePath(`/lider/cultos/${idSeguro(eventoId)}`);
  revalidatePath("/lider/cultos");
  return r;
}
