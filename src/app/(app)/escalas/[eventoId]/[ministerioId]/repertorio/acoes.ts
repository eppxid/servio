"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import {
  copiarRepertorio,
  editarMusica,
  ErroRepertorio,
  excluirMusica,
  incluirMusica,
  moverMusica,
  type DadosMusica,
} from "@/lib/repertorio/nucleo";

const banco = () => db() as unknown as AnyDb;

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? "");

function dados(f: FormData): DadosMusica {
  return {
    titulo: texto(f, "titulo"),
    artista: texto(f, "artista"),
    tom: texto(f, "tom"),
    linkSpotify: texto(f, "linkSpotify"),
    linkDeezer: texto(f, "linkDeezer"),
    linkCifra: texto(f, "linkCifra"),
    observacao: texto(f, "observacao"),
  };
}

function voltar(caminho: string, chave: "erro" | "ok", msg: string): never {
  redirect(`${caminho}?${chave}=${encodeURIComponent(msg)}`);
}

/** Executa a ação do líder e volta para a página; erro de regra vira mensagem, acesso negado vai para /agenda. */
async function executar(
  formData: FormData,
  ok: string,
  fn: (ator: Awaited<ReturnType<typeof exigirUsuarioSemTroca>>, eventoId: number, ministerioId: number) => Promise<string | void>,
): Promise<never> {
  const ator = await exigirUsuarioSemTroca();
  const eventoId = idSeguro(formData.get("evento"));
  const ministerioId = idSeguro(formData.get("ministerio"));
  const caminho = `/escalas/${eventoId}/${ministerioId}/repertorio`;
  let mensagem = ok;
  try {
    mensagem = (await fn(ator, eventoId, ministerioId)) || ok;
  } catch (erro) {
    if (erro instanceof ErroAcesso) redirect("/agenda");
    if (erro instanceof ErroRepertorio) voltar(caminho, "erro", erro.message);
    throw erro;
  }
  revalidatePath(caminho);
  return voltar(caminho, "ok", mensagem);
}

export async function incluirAcao(f: FormData) {
  await executar(f, "Música incluída", (a, e, m) => incluirMusica(banco(), a, e, m, dados(f)));
}

export async function editarAcao(f: FormData) {
  await executar(f, "Música atualizada", (a, e, m) =>
    editarMusica(banco(), a, e, m, idSeguro(f.get("item")), dados(f)),
  );
}

export async function excluirAcao(f: FormData) {
  await executar(f, "Música removida", (a, e, m) => excluirMusica(banco(), a, e, m, idSeguro(f.get("item"))));
}

export async function moverAcao(f: FormData) {
  const direcao = f.get("direcao") === "descer" ? "descer" : "subir";
  await executar(f, "Ordem atualizada", (a, e, m) => moverMusica(banco(), a, e, m, idSeguro(f.get("item")), direcao));
}

export async function copiarAcao(f: FormData) {
  await executar(f, "Repertório copiado", async (a, e, m) => {
    const n = await copiarRepertorio(banco(), a, e, m, idSeguro(f.get("origem")));
    return `${n} música(s) copiada(s)`;
  });
}
