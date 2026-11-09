import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { temPapel, type AnyDb } from "@/lib/auth-core";
import { TERMOS_VERSAO } from "@/lib/lgpd/termos";
import {
  credenciaisDeAdmin,
  ErroAcesso,
  ministerioDaIgreja,
  novoToken,
  VALIDADE_CONVITE_MS,
  type Ator,
  type FalhaCredenciais,
} from "@/lib/ministerios/nucleo";
import { notificarUsuarios } from "@/lib/notificar";

export const MAX_PEDIDOS_PENDENTES_POR_CONVITE = 5;
export const MAX_PEDIDOS_POR_HORA_NA_IGREJA = 20;
const UMA_HORA_MS = 60 * 60 * 1000;

export type PapelConvite = (typeof t.papelConvite.enumValues)[number];

/** O banco guarda só o hash dos tokens (LGPD art. 46): vazamento do banco não entrega links nem cookies válidos. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Rótulo para a pessoa reconhecer o aparelho na lista. Vem do user agent; nada além disso é guardado. */
export function rotuloDoAparelho(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const sistema = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/i.test(ua)
            ? "Mac"
            : /Linux|X11/i.test(ua)
              ? "Linux"
              : "Aparelho";
  const navegador = /Edg(e|A|iOS)?\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /SamsungBrowser/i.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/i.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/i.test(ua)
            ? "Chrome"
            : /Safari\//i.test(ua)
              ? "Safari"
              : "Navegador";
  return `${sistema} · ${navegador}`;
}

async function exigirLider(db: AnyDb, ator: Ator, ministerioId: number) {
  const ministerio = await ministerioDaIgreja(db, ator.igrejaId, ministerioId);
  if (!ministerio || !(await temPapel(db, ator, "lider", ministerioId))) throw new ErroAcesso();
  return ministerio;
}

// ---- convite pessoal ----

/**
 * Líder do ministério (ou admin) gera o link; `papel` diferente de voluntário só o admin escolhe.
 * Com `usuarioId` é o link de acesso de um membro existente: não muda o papel de ninguém.
 */
export async function gerarConvitePessoal(
  db: AnyDb,
  ator: Ator,
  dados: { ministerioId: number; nome: string; sobrenome: string; usuarioId?: number; papel?: PapelConvite },
  agora: Date = new Date(),
): Promise<{ token: string }> {
  await exigirLider(db, ator, dados.ministerioId);
  const papel = dados.papel ?? "voluntario";
  if (papel !== "voluntario" && ator.papelGlobal !== "admin") throw new ErroAcesso();
  if (dados.usuarioId !== undefined) {
    const [u] = await db
      .select({ id: t.usuarios.id, papelGlobal: t.usuarios.papelGlobal })
      .from(t.usuarios)
      .where(and(eq(t.usuarios.id, dados.usuarioId), eq(t.usuarios.igrejaId, ator.igrejaId)))
      .limit(1);
    if (!u) throw new ErroAcesso();
    // Este link registra o aparelho sem aprovação: em conta de admin, seria entrar no lugar dele.
    if (u.papelGlobal === "admin" && ator.papelGlobal !== "admin") throw new ErroAcesso();
  }
  const token = novoToken();
  await db.insert(t.convitesPessoais).values({
    igrejaId: ator.igrejaId,
    ministerioId: dados.ministerioId,
    nome: dados.nome.trim(),
    sobrenome: dados.sobrenome.trim(),
    tokenHash: hashToken(token),
    criadoPor: ator.id,
    usuarioId: dados.usuarioId ?? null,
    papel: dados.usuarioId === undefined ? papel : "voluntario",
    expiraEm: new Date(agora.getTime() + VALIDADE_CONVITE_MS),
  });
  return { token };
}

export interface ConvitePessoal {
  id: number;
  igrejaId: number;
  ministerioId: number;
  ministerio: string;
  nome: string;
  sobrenome: string;
  papel: PapelConvite;
  /** O dono do link é admin: aparelho novo dele só outro admin aprova. */
  donoAdmin: boolean;
  usado: boolean;
  /** Dono do link: preenchido depois do 1º uso (ou desde a criação, em link para membro existente). */
  usuarioId: number | null;
}

/** Convite não revogado e, se ainda não usado, não expirado; senão null. */
export async function lerConvitePessoal(
  db: AnyDb,
  token: string,
  agora: Date = new Date(),
): Promise<ConvitePessoal | null> {
  const [c] = await db
    .select({
      id: t.convitesPessoais.id,
      igrejaId: t.convitesPessoais.igrejaId,
      ministerioId: t.convitesPessoais.ministerioId,
      ministerio: t.ministerios.nome,
      nome: t.convitesPessoais.nome,
      sobrenome: t.convitesPessoais.sobrenome,
      papel: t.convitesPessoais.papel,
      usadoEm: t.convitesPessoais.usadoEm,
      usuarioId: t.convitesPessoais.usuarioId,
      donoPapelGlobal: t.usuarios.papelGlobal,
    })
    .from(t.convitesPessoais)
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.convitesPessoais.ministerioId))
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.convitesPessoais.usuarioId))
    .where(
      and(
        eq(t.convitesPessoais.tokenHash, hashToken(token)),
        isNull(t.convitesPessoais.revogadoEm),
        or(sql`${t.convitesPessoais.usadoEm} is not null`, gt(t.convitesPessoais.expiraEm, agora)),
      ),
    )
    .limit(1);
  if (!c) return null;
  const { usadoEm, donoPapelGlobal, ...resto } = c;
  return { ...resto, donoAdmin: donoPapelGlobal === "admin", usado: usadoEm !== null };
}

export type ResultadoPrimeiroUso =
  | { ok: true; usuario: typeof t.usuarios.$inferSelect; aparelhoId: number; aparelhoToken: string }
  | { ok: false; motivo: "invalido" | "ja_usado" | "sem_consentimento" }
  | FalhaCredenciais;

/**
 * 1º uso do link: cria a conta, o membro aprovado e o aparelho. Só o convite de admin leva e-mail e senha:
 * é a porta de recuperação se ele perder o aparelho e não houver outro admin para aprovar o novo.
 * Link de membro existente (`usuarioId`): não cria conta nem pede consentimento, só registra o aparelho.
 */
export async function usarConvitePrimeiraVez(
  db: AnyDb,
  token: string,
  dados: { consentimento: boolean; rotulo: string; email?: string; senha?: string },
  agora: Date = new Date(),
): Promise<ResultadoPrimeiroUso> {
  const c = await lerConvitePessoal(db, token, agora);
  if (!c) return { ok: false, motivo: "invalido" };
  if (c.usado) return { ok: false, motivo: "ja_usado" };
  if (c.usuarioId === null && !dados.consentimento) return { ok: false, motivo: "sem_consentimento" };
  const novoAdmin = c.usuarioId === null && c.papel === "admin";
  const credenciais = novoAdmin ? await credenciaisDeAdmin(db, c.igrejaId, dados) : null;
  if (credenciais && !credenciais.ok) return credenciais;

  return db.transaction(async (tx): Promise<ResultadoPrimeiroUso> => {
    const banco = tx as unknown as AnyDb;
    // O UPDATE condicional impede dois primeiros usos simultâneos do mesmo link.
    const [marcado] = await banco
      .update(t.convitesPessoais)
      .set({ usadoEm: agora })
      .where(and(eq(t.convitesPessoais.id, c.id), isNull(t.convitesPessoais.usadoEm)))
      .returning({ id: t.convitesPessoais.id });
    if (!marcado) return { ok: false, motivo: "ja_usado" };

    let usuario: typeof t.usuarios.$inferSelect;
    if (c.usuarioId === null) {
      [usuario] = await banco
        .insert(t.usuarios)
        .values({
          igrejaId: c.igrejaId,
          nome: `${c.nome} ${c.sobrenome}`.trim(),
          papelGlobal: novoAdmin ? "admin" : "voluntario",
          email: credenciais?.email,
          senhaHash: credenciais?.senhaHash,
          consentimentoEm: agora,
          termosVersao: TERMOS_VERSAO,
        })
        .returning();
      await banco
        .insert(t.membrosMinisterio)
        .values({
          igrejaId: c.igrejaId,
          usuarioId: usuario.id,
          ministerioId: c.ministerioId,
          papel: c.papel === "voluntario" ? "voluntario" : "lider",
          status: "aprovado",
        })
        .onConflictDoNothing();
      await banco
        .update(t.convitesPessoais)
        .set({ usuarioId: usuario.id })
        .where(eq(t.convitesPessoais.id, c.id));
    } else {
      [usuario] = await banco.select().from(t.usuarios).where(eq(t.usuarios.id, c.usuarioId)).limit(1);
    }
    const aparelhoToken = novoToken();
    const [aparelho] = await banco
      .insert(t.aparelhos)
      .values({
        igrejaId: c.igrejaId,
        usuarioId: usuario.id,
        tokenHash: hashToken(aparelhoToken),
        rotulo: dados.rotulo,
        ultimoUsoEm: agora,
      })
      .returning({ id: t.aparelhos.id });
    return { ok: true, usuario, aparelhoId: aparelho.id, aparelhoToken };
  });
}

// ---- aparelho ----

/** Aparelho do cookie, se não foi revogado nem a conta anonimizada. Atualiza `ultimo_uso_em`. */
export async function aparelhoValido(
  db: AnyDb,
  aparelhoToken: string,
  agora: Date = new Date(),
): Promise<{ aparelhoId: number; usuarioId: number } | null> {
  const [a] = await db
    .select({ id: t.aparelhos.id, usuarioId: t.aparelhos.usuarioId })
    .from(t.aparelhos)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.aparelhos.usuarioId))
    .where(
      and(
        eq(t.aparelhos.tokenHash, hashToken(aparelhoToken)),
        isNull(t.aparelhos.revogadoEm),
        isNull(t.usuarios.anonimizadoEm),
      ),
    )
    .limit(1);
  if (!a) return null;
  await db.update(t.aparelhos).set({ ultimoUsoEm: agora }).where(eq(t.aparelhos.id, a.id));
  return { aparelhoId: a.id, usuarioId: a.usuarioId };
}

/** O aparelho do cookie pertence ao dono do convite? Não atualiza `ultimo_uso_em`. */
export async function aparelhoEhDoDono(db: AnyDb, token: string, aparelhoToken: string): Promise<boolean> {
  const [linha] = await db
    .select({ id: t.aparelhos.id })
    .from(t.convitesPessoais)
    .innerJoin(t.aparelhos, eq(t.aparelhos.usuarioId, t.convitesPessoais.usuarioId))
    .where(
      and(
        eq(t.convitesPessoais.tokenHash, hashToken(token)),
        isNull(t.convitesPessoais.revogadoEm),
        eq(t.aparelhos.tokenHash, hashToken(aparelhoToken)),
        isNull(t.aparelhos.revogadoEm),
      ),
    )
    .limit(1);
  return Boolean(linha);
}

// ---- pedidos ----

export type ResultadoPedido<T> = ({ ok: true } & T) | { ok: false; motivo: "invalido" | "limite" };

async function dentroDoLimite(db: AnyDb, c: ConvitePessoal, agora: Date): Promise<boolean> {
  const [pendentes] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.pedidosAcesso)
    .where(and(eq(t.pedidosAcesso.conviteId, c.id), eq(t.pedidosAcesso.status, "pendente")));
  if (pendentes.n >= MAX_PEDIDOS_PENDENTES_POR_CONVITE) return false;
  const [naHora] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.pedidosAcesso)
    .where(
      and(
        eq(t.pedidosAcesso.igrejaId, c.igrejaId),
        gt(t.pedidosAcesso.criadoEm, new Date(agora.getTime() - UMA_HORA_MS)),
      ),
    );
  return naHora.n < MAX_PEDIDOS_POR_HORA_NA_IGREJA;
}

/** Avisa quem decide o pedido: líderes do ministério e todos os admins ativos da igreja. */
async function avisarQuemDecide(db: AnyDb, c: ConvitePessoal, corpo: string) {
  try {
    const lideres = await db
      .select({ usuarioId: t.membrosMinisterio.usuarioId })
      .from(t.membrosMinisterio)
      .where(
        and(
          eq(t.membrosMinisterio.ministerioId, c.ministerioId),
          eq(t.membrosMinisterio.papel, "lider"),
          eq(t.membrosMinisterio.status, "aprovado"),
        ),
      );
    const admins = await db
      .select({ usuarioId: t.usuarios.id })
      .from(t.usuarios)
      .where(
        and(
          eq(t.usuarios.igrejaId, c.igrejaId),
          eq(t.usuarios.papelGlobal, "admin"),
          isNull(t.usuarios.anonimizadoEm),
        ),
      );
    await notificarUsuarios(
      c.igrejaId,
      [...new Set([...lideres, ...admins].map((l) => l.usuarioId))],
      { titulo: "Pedido de acesso", corpo, url: `/lider/equipe?ministerio=${c.ministerioId}&aba=membros` },
    );
  } catch (e) {
    console.error("pedido de acesso: falha ao avisar", (e as Error)?.message);
  }
}

/** Aparelho novo diz "sou o dono do link". O aparelho espera no pedido; só entra em `aparelhos` se o líder aprovar. */
export async function pedirAcessoMesmaPessoa(
  db: AnyDb,
  token: string,
  rotulo: string,
  agora: Date = new Date(),
): Promise<ResultadoPedido<{ pedidoId: number; aparelhoToken: string }>> {
  const c = await lerConvitePessoal(db, token, agora);
  if (!c || !c.usado || c.usuarioId === null) return { ok: false, motivo: "invalido" };
  if (!(await dentroDoLimite(db, c, agora))) return { ok: false, motivo: "limite" };
  const aparelhoToken = novoToken();
  const [pedido] = await db
    .insert(t.pedidosAcesso)
    .values({
      igrejaId: c.igrejaId,
      conviteId: c.id,
      tipo: "mesma_pessoa",
      aparelhoTokenHash: hashToken(aparelhoToken),
      rotulo,
      criadoEm: agora,
    })
    .returning({ id: t.pedidosAcesso.id });
  await avisarQuemDecide(db, c, `Aparelho novo de ${c.nome} ${c.sobrenome} pede acesso.`);
  return { ok: true, pedidoId: pedido.id, aparelhoToken };
}

/** "Não sou essa pessoa": o aparelho não ganha acesso; o líder gera um convite novo e marca o pedido como atendido. */
export async function pedirConviteOutraPessoa(
  db: AnyDb,
  token: string,
  dados: { nome: string; sobrenome: string; rotulo: string },
  agora: Date = new Date(),
): Promise<ResultadoPedido<{ pedidoId: number }>> {
  const c = await lerConvitePessoal(db, token, agora);
  if (!c) return { ok: false, motivo: "invalido" };
  if (!(await dentroDoLimite(db, c, agora))) return { ok: false, motivo: "limite" };
  const nome = dados.nome.trim();
  const sobrenome = dados.sobrenome.trim();
  const [pedido] = await db
    .insert(t.pedidosAcesso)
    .values({
      igrejaId: c.igrejaId,
      conviteId: c.id,
      tipo: "outra_pessoa",
      nome,
      sobrenome,
      rotulo: dados.rotulo,
      criadoEm: agora,
    })
    .returning({ id: t.pedidosAcesso.id });
  await avisarQuemDecide(db, c, `${nome} ${sobrenome} pede um convite.`);
  return { ok: true, pedidoId: pedido.id };
}

export type SituacaoPedido =
  | { status: "pendente" | "recusado" }
  | { status: "aprovado"; usuarioId: number; aparelhoId: number };

/** Só responde a quem tem o token do aparelho que fez o pedido (`mesma_pessoa`); senão null. */
export async function situacaoDoPedido(
  db: AnyDb,
  pedidoId: number,
  aparelhoToken: string,
): Promise<SituacaoPedido | null> {
  const hash = hashToken(aparelhoToken);
  const [p] = await db
    .select({ status: t.pedidosAcesso.status, usuarioId: t.convitesPessoais.usuarioId })
    .from(t.pedidosAcesso)
    .innerJoin(t.convitesPessoais, eq(t.convitesPessoais.id, t.pedidosAcesso.conviteId))
    .where(and(eq(t.pedidosAcesso.id, pedidoId), eq(t.pedidosAcesso.aparelhoTokenHash, hash)))
    .limit(1);
  if (!p) return null;
  if (p.status === "pendente") return { status: "pendente" };
  if (p.status !== "aprovado" || p.usuarioId === null) return { status: "recusado" };
  const [a] = await db
    .select({ id: t.aparelhos.id })
    .from(t.aparelhos)
    .where(and(eq(t.aparelhos.tokenHash, hash), isNull(t.aparelhos.revogadoEm)))
    .limit(1);
  if (!a) return { status: "recusado" };
  return { status: "aprovado", usuarioId: p.usuarioId, aparelhoId: a.id };
}

async function pedidoDoLider(db: AnyDb, ator: Ator, pedidoId: number) {
  const [p] = await db
    .select({
      pedido: t.pedidosAcesso,
      ministerioId: t.convitesPessoais.ministerioId,
      usuarioId: t.convitesPessoais.usuarioId,
      donoPapelGlobal: t.usuarios.papelGlobal,
    })
    .from(t.pedidosAcesso)
    .innerJoin(t.convitesPessoais, eq(t.convitesPessoais.id, t.pedidosAcesso.conviteId))
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.convitesPessoais.usuarioId))
    .where(and(eq(t.pedidosAcesso.id, pedidoId), eq(t.pedidosAcesso.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!p) throw new ErroAcesso();
  await exigirLider(db, ator, p.ministerioId);
  if (p.pedido.status !== "pendente") throw new Error("Pedido já decidido");
  return p;
}

/**
 * Aprovar só existe para `mesma_pessoa` (registra o aparelho). `outra_pessoa`: recusar, ou `marcarPedidoAtendido`.
 * Aparelho de admin: só admin decide, e o dono do pedido não aprova o próprio aparelho.
 */
export async function decidirPedido(
  db: AnyDb,
  ator: Ator,
  pedidoId: number,
  aprovar: boolean,
  agora: Date = new Date(),
): Promise<void> {
  const { pedido, usuarioId, donoPapelGlobal } = await pedidoDoLider(db, ator, pedidoId);
  if (pedido.tipo === "mesma_pessoa" && donoPapelGlobal === "admin") {
    if (ator.papelGlobal !== "admin" || (aprovar && ator.id === usuarioId)) throw new ErroAcesso();
  }
  const hash = pedido.aparelhoTokenHash;
  if (aprovar && (pedido.tipo !== "mesma_pessoa" || !hash || usuarioId === null)) {
    throw new Error("Este pedido não se aprova: gere o convite novo");
  }
  await db.transaction(async (tx) => {
    const banco = tx as unknown as AnyDb;
    if (aprovar && hash && usuarioId !== null) {
      await banco.insert(t.aparelhos).values({
        igrejaId: pedido.igrejaId,
        usuarioId,
        tokenHash: hash,
        rotulo: pedido.rotulo,
        criadoEm: agora,
      });
    }
    await banco
      .update(t.pedidosAcesso)
      .set({ status: aprovar ? "aprovado" : "recusado", decididoPor: ator.id, decididoEm: agora })
      .where(eq(t.pedidosAcesso.id, pedido.id));
  });
}

/** O líder gerou o convite novo para o pedido `outra_pessoa`. */
export async function marcarPedidoAtendido(
  db: AnyDb,
  ator: Ator,
  pedidoId: number,
  agora: Date = new Date(),
): Promise<void> {
  const { pedido } = await pedidoDoLider(db, ator, pedidoId);
  if (pedido.tipo !== "outra_pessoa") throw new Error("Só pedido de outra pessoa é atendido");
  await db
    .update(t.pedidosAcesso)
    .set({ status: "atendido", decididoPor: ator.id, decididoEm: agora })
    .where(eq(t.pedidosAcesso.id, pedido.id));
}

/** Sem `ministerioId`: pedidos de todos os ministérios (só admin). */
export async function listarPedidosPendentes(db: AnyDb, ator: Ator, ministerioId?: number) {
  if (ministerioId !== undefined) await exigirLider(db, ator, ministerioId);
  else if (ator.papelGlobal !== "admin") throw new ErroAcesso();
  return db
    .select({
      id: t.pedidosAcesso.id,
      tipo: t.pedidosAcesso.tipo,
      nome: t.pedidosAcesso.nome,
      sobrenome: t.pedidosAcesso.sobrenome,
      rotulo: t.pedidosAcesso.rotulo,
      criadoEm: t.pedidosAcesso.criadoEm,
      conviteNome: t.convitesPessoais.nome,
      conviteSobrenome: t.convitesPessoais.sobrenome,
      ministerioId: t.convitesPessoais.ministerioId,
      ministerio: t.ministerios.nome,
      donoId: t.convitesPessoais.usuarioId,
      donoPapelGlobal: t.usuarios.papelGlobal,
      donoPapelMembro: t.membrosMinisterio.papel,
    })
    .from(t.pedidosAcesso)
    .innerJoin(t.convitesPessoais, eq(t.convitesPessoais.id, t.pedidosAcesso.conviteId))
    .innerJoin(t.ministerios, eq(t.ministerios.id, t.convitesPessoais.ministerioId))
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.convitesPessoais.usuarioId))
    .leftJoin(
      t.membrosMinisterio,
      and(
        eq(t.membrosMinisterio.usuarioId, t.convitesPessoais.usuarioId),
        eq(t.membrosMinisterio.ministerioId, t.convitesPessoais.ministerioId),
      ),
    )
    .where(
      and(
        ministerioId !== undefined ? eq(t.convitesPessoais.ministerioId, ministerioId) : undefined,
        eq(t.pedidosAcesso.igrejaId, ator.igrejaId),
        eq(t.pedidosAcesso.status, "pendente"),
      ),
    )
    .orderBy(asc(t.pedidosAcesso.criadoEm));
}

// ---- gestão de aparelhos ----

/** Aparelhos ativos do usuário. Quem chama já checou que pode ver (o próprio usuário ou um líder dele). */
export async function listarAparelhos(db: AnyDb, usuarioId: number) {
  return db
    .select({
      id: t.aparelhos.id,
      rotulo: t.aparelhos.rotulo,
      criadoEm: t.aparelhos.criadoEm,
      ultimoUsoEm: t.aparelhos.ultimoUsoEm,
    })
    .from(t.aparelhos)
    .where(and(eq(t.aparelhos.usuarioId, usuarioId), isNull(t.aparelhos.revogadoEm)))
    .orderBy(desc(t.aparelhos.criadoEm));
}

/** Próprio dono, admin ou líder de um ministério do dono. */
export async function revogarAparelho(
  db: AnyDb,
  ator: Ator,
  aparelhoId: number,
  agora: Date = new Date(),
): Promise<void> {
  const [a] = await db
    .select()
    .from(t.aparelhos)
    .where(and(eq(t.aparelhos.id, aparelhoId), eq(t.aparelhos.igrejaId, ator.igrejaId)))
    .limit(1);
  if (!a) throw new ErroAcesso();
  if (a.usuarioId !== ator.id && ator.papelGlobal !== "admin") {
    const ministerios = await db
      .select({ id: t.membrosMinisterio.ministerioId })
      .from(t.membrosMinisterio)
      .where(eq(t.membrosMinisterio.usuarioId, a.usuarioId));
    const permitidos = await Promise.all(ministerios.map((m) => temPapel(db, ator, "lider", m.id)));
    if (!permitidos.some(Boolean)) throw new ErroAcesso();
  }
  await db
    .update(t.aparelhos)
    .set({ revogadoEm: agora })
    .where(and(eq(t.aparelhos.id, a.id), isNull(t.aparelhos.revogadoEm)));
}
