import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { reconhecimentos } from "@/db/schema-gamificacao";
import { lgpdRegistros } from "@/db/schema-lgpd";
import { temPapel, verificarSenha, type AnyDb } from "@/lib/auth-core";
import { tipoDaFoto } from "@/lib/foto/nucleo";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { PALAVRA_EXCLUIR, TERMOS_VERSAO } from "./termos";

export const NOME_REMOVIDO = "Voluntário removido";

export class ErroLgpd extends Error {}

export type AcaoTitular = "exclusao" | "revogacao" | "anonimizacao_admin";

/** Grava o aceite da versão atual dos termos. */
export async function registrarAceite(db: AnyDb, usuarioId: number, agora = new Date()) {
  await db
    .update(t.usuarios)
    .set({ consentimentoEm: agora, termosVersao: TERMOS_VERSAO })
    .where(eq(t.usuarios.id, usuarioId));
}

// ---- exportação (art. 18 II e V) ----

/** Só os dados do próprio titular; nomes e contatos de colegas não entram. */
export async function exportarDados(db: AnyDb, ator: Ator, agora = new Date()) {
  const dono = (col: typeof t.usuarios.id) => and(eq(col, ator.id), eq(t.usuarios.igrejaId, ator.igrejaId));
  const [perfil] = await db
    .select({
      nome: t.usuarios.nome,
      email: t.usuarios.email,
      telefone: t.usuarios.telefone,
      fotoUrl: t.usuarios.fotoUrl,
      papelGlobal: t.usuarios.papelGlobal,
      aparecerNoRanking: t.usuarios.aparecerNoRanking,
      consentimentoEm: t.usuarios.consentimentoEm,
      termosVersao: t.usuarios.termosVersao,
      criadoEm: t.usuarios.criadoEm,
    })
    .from(t.usuarios)
    .where(dono(t.usuarios.id));
  if (!perfil) throw new ErroAcesso();

  const membros = await db
    .select({
      membroId: t.membrosMinisterio.id,
      ministerio: t.ministerios.nome,
      papel: t.membrosMinisterio.papel,
      status: t.membrosMinisterio.status,
      desde: t.membrosMinisterio.criadoEm,
    })
    .from(t.membrosMinisterio)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.membrosMinisterio.ministerioId))
    .where(and(eq(t.membrosMinisterio.usuarioId, ator.id), eq(t.membrosMinisterio.igrejaId, ator.igrejaId)));
  const funcoesMarcadas = membros.length
    ? await db
        .select({ membroId: t.membroFuncoes.membroId, funcao: t.funcoes.nome })
        .from(t.membroFuncoes)
        .innerJoin(t.funcoes, eq(t.funcoes.id, t.membroFuncoes.funcaoId))
        .where(inArray(t.membroFuncoes.membroId, membros.map((m) => m.membroId)))
    : [];
  const ministerios = membros.map(({ membroId, ...m }) => ({
    ...m,
    funcoes: funcoesMarcadas.filter((f) => f.membroId === membroId).map((f) => f.funcao),
  }));

  const escalas = await db
    .select({
      evento: t.eventos.titulo,
      inicio: t.eventos.inicio,
      ministerio: t.ministerios.nome,
      funcao: t.funcoes.nome,
      status: t.escalaItens.status,
      checkinEm: t.escalaItens.checkinEm,
    })
    .from(t.escalaItens)
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.escalas.ministerioId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(and(eq(t.escalaItens.usuarioId, ator.id), eq(t.escalaItens.igrejaId, ator.igrejaId)))
    .orderBy(asc(t.eventos.inicio));

  const indisponibilidades = await db
    .select({
      dataInicio: t.indisponibilidades.dataInicio,
      dataFim: t.indisponibilidades.dataFim,
      motivo: t.indisponibilidades.motivo,
    })
    .from(t.indisponibilidades)
    .where(and(eq(t.indisponibilidades.usuarioId, ator.id), eq(t.indisponibilidades.igrejaId, ator.igrejaId)))
    .orderBy(asc(t.indisponibilidades.dataInicio));

  const trocasBrutas = await db
    .select({
      solicitanteId: t.trocas.solicitanteId,
      status: t.trocas.status,
      criadoEm: t.trocas.criadoEm,
      evento: t.eventos.titulo,
      inicio: t.eventos.inicio,
      funcao: t.funcoes.nome,
    })
    .from(t.trocas)
    .innerJoin(t.escalaItens, eq(t.escalaItens.id, t.trocas.escalaItemId))
    .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
    .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
    .innerJoin(t.funcoes, eq(t.funcoes.id, t.escalaItens.funcaoId))
    .where(
      and(
        eq(t.trocas.igrejaId, ator.igrejaId),
        or(eq(t.trocas.solicitanteId, ator.id), eq(t.trocas.substitutoId, ator.id)),
      ),
    )
    .orderBy(asc(t.trocas.criadoEm));
  const trocas = trocasBrutas.map(({ solicitanteId, ...tr }) => ({
    ...tr,
    papel: solicitanteId === ator.id ? "solicitante" : "substituto",
  }));

  const mensagens = await db
    .select({ evento: t.eventos.titulo, texto: t.mensagens.texto, aviso: t.mensagens.aviso, criadoEm: t.mensagens.criadoEm })
    .from(t.mensagens)
    .innerJoin(t.eventos, eq(t.eventos.id, t.mensagens.eventoId))
    .where(and(eq(t.mensagens.usuarioId, ator.id), eq(t.mensagens.igrejaId, ator.igrejaId)))
    .orderBy(asc(t.mensagens.criadoEm));

  const reconhecimentosBrutos = await db
    .select({
      deUsuario: reconhecimentos.deUsuario,
      ministerio: t.ministerios.nome,
      texto: reconhecimentos.texto,
      criadoEm: reconhecimentos.criadoEm,
    })
    .from(reconhecimentos)
    .innerJoin(t.ministerios, eq(t.ministerios.id, reconhecimentos.ministerioId))
    .where(
      and(
        eq(reconhecimentos.igrejaId, ator.igrejaId),
        or(eq(reconhecimentos.deUsuario, ator.id), eq(reconhecimentos.paraUsuario, ator.id)),
      ),
    )
    .orderBy(asc(reconhecimentos.criadoEm));
  const reconhecimentosLista = reconhecimentosBrutos.map(({ deUsuario, ...r }) => ({
    ...r,
    direcao: deUsuario === ator.id ? "enviado" : "recebido",
  }));

  const [avisos] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.pushInscricoes)
    .where(and(eq(t.pushInscricoes.usuarioId, ator.id), eq(t.pushInscricoes.igrejaId, ator.igrejaId)));

  const aparelhos = await db
    .select({
      rotulo: t.aparelhos.rotulo,
      criadoEm: t.aparelhos.criadoEm,
      ultimoUsoEm: t.aparelhos.ultimoUsoEm,
      revogadoEm: t.aparelhos.revogadoEm,
    })
    .from(t.aparelhos)
    .where(and(eq(t.aparelhos.usuarioId, ator.id), eq(t.aparelhos.igrejaId, ator.igrejaId)))
    .orderBy(asc(t.aparelhos.criadoEm));

  const [fotoLinha] = await db
    .select({ conteudo: t.fotos.conteudo })
    .from(t.fotos)
    .where(and(eq(t.fotos.usuarioId, ator.id), eq(t.fotos.igrejaId, ator.igrejaId)))
    .limit(1);
  // A foto pode ser WebP ou JPEG: o tipo vem dos bytes, para o arquivo exportado abrir certo (art. 18 V).
  const fotoBytes = fotoLinha ? Buffer.from(fotoLinha.conteudo) : null;
  const foto = fotoBytes ? `data:${tipoDaFoto(fotoBytes) ?? "application/octet-stream"};base64,${fotoBytes.toString("base64")}` : null;

  return {
    geradoEm: agora.toISOString(),
    aparelhos,
    perfil,
    foto,
    ministerios,
    escalas,
    indisponibilidades,
    trocas,
    mensagens,
    reconhecimentos: reconhecimentosLista,
    aparelhosComAviso: avisos?.n ?? 0,
  };
}

// ---- exclusão / anonimização (art. 18 IV, VI e IX) ----

/** Apaga o que identifica a pessoa e mantém escala_itens passados para os indicadores. */
async function anonimizar(db: AnyDb, alvo: { id: number; igrejaId: number }, feitoPor: number, acao: AcaoTitular, agora: Date) {
  await db.transaction(async (txBruto) => {
    const tx = txBruto as unknown as AnyDb;
    const id = alvo.id;
    await tx.delete(t.indisponibilidades).where(eq(t.indisponibilidades.usuarioId, id));
    await tx.delete(t.pushInscricoes).where(eq(t.pushInscricoes.usuarioId, id));
    await tx.delete(t.fotos).where(eq(t.fotos.usuarioId, id));
    await tx.delete(t.mensagens).where(eq(t.mensagens.usuarioId, id));
    // O agradecimento recebido também sai: o texto do colega fala da pessoa e pode trazer o nome dela.
    await tx.delete(reconhecimentos).where(or(eq(reconhecimentos.deUsuario, id), eq(reconhecimentos.paraUsuario, id)));

    // Acesso por link: aparelhos, o link pessoal da pessoa e os pedidos feitos sobre ele.
    await tx.delete(t.aparelhos).where(eq(t.aparelhos.usuarioId, id));
    const convitesDele = tx
      .select({ id: t.convitesPessoais.id })
      .from(t.convitesPessoais)
      .where(eq(t.convitesPessoais.usuarioId, id));
    await tx.delete(t.pedidosAcesso).where(inArray(t.pedidosAcesso.conviteId, convitesDele));
    await tx.delete(t.convitesPessoais).where(eq(t.convitesPessoais.usuarioId, id));

    const membros = await tx
      .select({ id: t.membrosMinisterio.id })
      .from(t.membrosMinisterio)
      .where(eq(t.membrosMinisterio.usuarioId, id));
    if (membros.length) {
      await tx.delete(t.membroFuncoes).where(inArray(t.membroFuncoes.membroId, membros.map((m) => m.id)));
      await tx.delete(t.membrosMinisterio).where(eq(t.membrosMinisterio.usuarioId, id));
    }

    // Vaga futura volta a ficar aberta; o passado fica para os indicadores.
    const futuros = await tx
      .select({ id: t.escalaItens.id })
      .from(t.escalaItens)
      .innerJoin(t.escalas, eq(t.escalas.id, t.escalaItens.escalaId))
      .innerJoin(t.eventos, eq(t.eventos.id, t.escalas.eventoId))
      .where(and(eq(t.escalaItens.usuarioId, id), gt(t.eventos.inicio, agora)));
    if (futuros.length) {
      await tx
        .update(t.escalaItens)
        .set({ usuarioId: null, status: "pendente", checkinEm: null })
        .where(inArray(t.escalaItens.id, futuros.map((f) => f.id)));
    }
    await tx
      .update(t.trocas)
      .set({ status: "recusada" })
      .where(
        and(
          inArray(t.trocas.status, ["aberta", "aceita"]),
          or(eq(t.trocas.solicitanteId, id), eq(t.trocas.substitutoId, id)),
        ),
      );

    await tx
      .update(t.usuarios)
      .set({
        nome: NOME_REMOVIDO,
        // Sem e-mail e sem senha ninguém entra; desde a migração 0009 as duas colunas aceitam nulo.
        email: null,
        telefone: null,
        fotoUrl: null,
        senhaHash: null,
        papelGlobal: "voluntario",
        trocarSenha: false,
        aparecerNoRanking: false,
        agendaToken: null,
        agendaTokenExpiraEm: null,
        anonimizadoEm: agora,
        sessaoVersao: sql`${t.usuarios.sessaoVersao} + 1`,
      })
      .where(and(eq(t.usuarios.id, id), eq(t.usuarios.igrejaId, alvo.igrejaId)));

    await tx.insert(lgpdRegistros).values({ igrejaId: alvo.igrejaId, usuarioId: id, feitoPor, acao, criadoEm: agora });
  });
}

/** A igreja não pode ficar sem administrador ativo. */
async function garantirOutroAdmin(db: AnyDb, alvo: { id: number; igrejaId: number; papelGlobal: string }) {
  if (alvo.papelGlobal !== "admin") return;
  const [outro] = await db
    .select({ id: t.usuarios.id })
    .from(t.usuarios)
    .where(
      and(
        eq(t.usuarios.igrejaId, alvo.igrejaId),
        eq(t.usuarios.papelGlobal, "admin"),
        ne(t.usuarios.id, alvo.id),
        isNull(t.usuarios.anonimizadoEm),
      ),
    )
    .limit(1);
  if (!outro) throw new ErroLgpd("Você é o único administrador. Defina outro administrador antes de excluir a conta.");
}

/**
 * Exclusão ou revogação pedida pelo próprio titular (art. 18).
 * Conta com senha confirma com a senha; conta criada pelo link (sem senha) digita EXCLUIR —
 * sem isso quem entrou por link não teria como exercer o direito.
 */
export async function excluirPropriaConta(
  db: AnyDb,
  ator: Ator & { senhaHash: string | null },
  confirmacao: string,
  acao: "exclusao" | "revogacao",
  agora = new Date(),
) {
  if (ator.senhaHash) {
    if (!(await verificarSenha(confirmacao, ator.senhaHash))) throw new ErroLgpd("Senha incorreta");
  } else if (confirmacao.trim().toUpperCase() !== PALAVRA_EXCLUIR) {
    throw new ErroLgpd(`Digite ${PALAVRA_EXCLUIR} para confirmar`);
  }
  await garantirOutroAdmin(db, ator);
  await anonimizar(db, ator, ator.id, acao, agora);
}

/** Admin anonimiza um membro a pedido do titular (fica registrado quem fez e quando). */
export async function anonimizarMembro(
  db: AnyDb,
  ator: Ator & { senhaHash: string | null },
  alvoId: number,
  senha: string,
  agora = new Date(),
) {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  if (!(await verificarSenha(senha, ator.senhaHash))) throw new ErroLgpd("Senha incorreta");
  const [alvo] = await db
    .select({ id: t.usuarios.id, igrejaId: t.usuarios.igrejaId, papelGlobal: t.usuarios.papelGlobal })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.id, alvoId), eq(t.usuarios.igrejaId, ator.igrejaId), isNull(t.usuarios.anonimizadoEm)))
    .limit(1);
  if (!alvo) throw new ErroAcesso();
  await garantirOutroAdmin(db, alvo);
  await anonimizar(db, alvo, ator.id, "anonimizacao_admin", agora);
}

/** Lista para o admin escolher quem anonimizar (só nome; contato não é necessário aqui). */
export async function membrosParaAnonimizar(db: AnyDb, ator: Ator) {
  if (!(await temPapel(db, ator, "admin"))) throw new ErroAcesso();
  return db
    .select({ id: t.usuarios.id, nome: t.usuarios.nome })
    .from(t.usuarios)
    .where(and(eq(t.usuarios.igrejaId, ator.igrejaId), isNull(t.usuarios.anonimizadoEm), ne(t.usuarios.id, ator.id)))
    .orderBy(asc(t.usuarios.nome));
}
