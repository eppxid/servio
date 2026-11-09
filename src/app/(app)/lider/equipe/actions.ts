"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import * as t from "@/db/schema";
import { redirect } from "next/navigation";
import { decidirPedido, gerarConvitePessoal, marcarPedidoAtendido, revogarAparelho } from "@/lib/acesso/nucleo";
import { SENHA_MINIMA } from "@/lib/auth-core";
import {
  arquivarMinisterio,
  criarFuncao,
  criarMinisterio,
  decidirMembro,
  definirFuncoesDoMembro,
  definirLider,
  definirSenhaTemporaria,
  editarMinisterio,
  excluirFuncao,
  renomearFuncao,
} from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { aprovarFuncao, aprovarMembro, recusarFuncao } from "@/lib/servir/nucleo";

const nomeFuncao = z.string().trim().min(2).max(80);
const nomeMinisterio = z.string().trim().min(2).max(120);
const descricaoMinisterio = z.string().trim().max(500);

function voltar(ministerio: number, aba: string, extra = "") {
  return `/lider/equipe?ministerio=${ministerio}&aba=${aba}${extra}`;
}

function atualizar() {
  revalidatePath("/lider/equipe");
}

export async function aprovarEntrada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await aprovarMembro(db(), ator, idSeguro(formData.get("membro")));
  atualizar();
}

export async function recusarEntrada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await decidirMembro(db(), ator, idSeguro(formData.get("membro")), false);
  atualizar();
}

export async function aprovarFuncaoDesejada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await aprovarFuncao(db(), ator, idSeguro(formData.get("membro")), idSeguro(formData.get("funcao")));
  atualizar();
}

/** Um toque: aprova a entrada (se pendente) e todas as funções pedidas pelo membro. */
export async function aprovarPedidoInteiro(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const membroId = idSeguro(formData.get("membro"));
  for (const funcao of formData.getAll("funcao")) await aprovarFuncao(db(), ator, membroId, idSeguro(funcao));
  atualizar();
}

export async function recusarFuncaoDesejada(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await recusarFuncao(db(), ator, idSeguro(formData.get("membro")), idSeguro(formData.get("funcao")));
  atualizar();
}

/** Troca as funções aprovadas do membro sem perder os pedidos `desejada` que ele ainda tem. */
export async function salvarFuncoesDoMembro(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const membroId = idSeguro(formData.get("membro"));
  const ids = formData.getAll("funcoes").map(idSeguro).filter(Boolean);
  const banco = db();
  const desejadas = await banco
    .select({ funcaoId: t.membroFuncoes.funcaoId })
    .from(t.membroFuncoes)
    .where(
      and(
        eq(t.membroFuncoes.membroId, membroId),
        eq(t.membroFuncoes.igrejaId, ator.igrejaId),
        eq(t.membroFuncoes.status, "desejada"),
      ),
    );
  await definirFuncoesDoMembro(banco, ator, membroId, ids);
  const manter = desejadas.filter((d) => !ids.includes(d.funcaoId));
  if (manter.length) {
    await banco
      .insert(t.membroFuncoes)
      .values(manter.map((d) => ({ igrejaId: ator.igrejaId, membroId, funcaoId: d.funcaoId, status: "desejada" as const })))
      .onConflictDoNothing();
  }
  atualizar();
}

/** Só o admin muda o papel (líder ou voluntário) no ministério. */
export async function alterarPapel(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await definirLider(
    db(),
    ator,
    idSeguro(formData.get("ministerio")),
    idSeguro(formData.get("usuario")),
    formData.get("lider") === "1",
  );
  atualizar();
}

export async function adicionarFuncao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeFuncao.safeParse(formData.get("nome"));
  if (!nome.success) return;
  await criarFuncao(db(), ator, idSeguro(formData.get("ministerio")), nome.data);
  atualizar();
}

export async function renomearFuncaoAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeFuncao.safeParse(formData.get("nome"));
  if (!nome.success) return;
  await renomearFuncao(db(), ator, idSeguro(formData.get("funcao")), nome.data);
  atualizar();
}

export async function excluirFuncaoAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await excluirFuncao(db(), ator, idSeguro(formData.get("funcao")));
  atualizar();
}

const nomePessoa = z.string().trim().min(2).max(60);

/** Gera o convite pessoal e volta para Membros com o token na URL (a página monta o link). */
export async function gerarConvitePessoalAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const pedido = idSeguro(formData.get("pedido"));
  const nome = nomePessoa.safeParse(formData.get("nome"));
  const sobrenome = nomePessoa.safeParse(formData.get("sobrenome"));
  if (!nome.success || !sobrenome.success) {
    const dados = new URLSearchParams({ nome: String(formData.get("nome") ?? ""), sobrenome: String(formData.get("sobrenome") ?? "") });
    if (pedido) dados.set("pedido", String(pedido));
    redirect(voltar(id, "membros", `&erro=nome&${dados}`));
  }
  const { token } = await gerarConvitePessoal(db(), ator, { ministerioId: id, nome: nome.data, sobrenome: sobrenome.data });
  if (pedido) await marcarPedidoAtendido(db(), ator, pedido);
  redirect(voltar(id, "membros", `&acesso=${token}`));
}

/** Link de acesso para um membro que já existe (conta antiga ou quem perdeu os aparelhos). */
export async function gerarLinkDoMembroAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const usuarioId = idSeguro(formData.get("usuario"));
  const [u] = await db()
    .select({ nome: t.usuarios.nome })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.id, usuarioId), eq(t.usuarios.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!u) redirect(voltar(id, "membros"));
  const [primeiro, ...resto] = u.nome.trim().split(/\s+/);
  const { token } = await gerarConvitePessoal(db(), ator, {
    ministerioId: id,
    nome: primeiro,
    sobrenome: resto.join(" "),
    usuarioId,
  });
  redirect(voltar(id, "membros", `&acesso=${token}`));
}

export async function decidirPedidoAcessoAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await decidirPedido(db(), ator, idSeguro(formData.get("pedido")), formData.get("aprovar") === "1");
  atualizar();
}

export async function revogarAparelhoAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await revogarAparelho(db(), ator, idSeguro(formData.get("aparelho")));
  atualizar();
}

export async function senhaTemporariaAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const senha = z.string().min(SENHA_MINIMA).max(200).safeParse(formData.get("senha"));
  if (!senha.success) redirect(voltar(id, "membros", "&erro=senha"));
  await definirSenhaTemporaria(db(), ator, idSeguro(formData.get("membro")), senha.data);
  redirect(voltar(id, "membros", "&ok=senha"));
}

/** Tira o membro do ministério (mesma regra de recusar: apaga o vínculo e as funções). */
export async function tirarDoMinisterio(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await decidirMembro(db(), ator, idSeguro(formData.get("membro")), false);
  atualizar();
}

// ---- ministérios da igreja (só admin; a regra confere o papel em lib/ministerios) ----

export async function criarMinisterioAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeMinisterio.safeParse(formData.get("nome"));
  if (!nome.success) redirect("/lider/equipe?aba=ministerios&erro=1");
  const descricao = descricaoMinisterio.safeParse(formData.get("descricao") ?? "");
  const criado = await criarMinisterio(db(), ator, nome.data, descricao.success ? descricao.data : undefined);
  redirect(`/lider/equipe?ministerio=${criado.id}&aba=ministerios`);
}

export async function editarMinisterioAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  const nome = nomeMinisterio.safeParse(formData.get("nome"));
  if (!nome.success) redirect("/lider/equipe?aba=ministerios&erro=1");
  const descricao = descricaoMinisterio.safeParse(formData.get("descricao") ?? "");
  await editarMinisterio(db(), ator, idSeguro(formData.get("ministerio")), {
    nome: nome.data,
    descricao: descricao.success ? descricao.data : undefined,
  });
  atualizar();
}

export async function arquivarMinisterioAcao(formData: FormData) {
  const ator = await exigirUsuarioSemTroca();
  await arquivarMinisterio(db(), ator, idSeguro(formData.get("ministerio")), true);
  redirect("/lider/equipe?aba=ministerios");
}
