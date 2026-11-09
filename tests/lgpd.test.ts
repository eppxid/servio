import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { reconhecimentos } from "@/db/schema-gamificacao";
import { lgpdRegistros } from "@/db/schema-lgpd";
import { autenticar, hashSenha, usuarioDaSessao, type AnyDb } from "@/lib/auth-core";
import { listarMensagens } from "@/lib/chat/nucleo";
import { rankingDoMinisterio } from "@/lib/gamificacao/consulta";
import { carregarPainel } from "@/lib/indicadores/consulta";
import { limparDadosAntigos } from "@/lib/lgpd/limpeza";
import { TERMOS_VERSAO, aceiteEmDia } from "@/lib/lgpd/termos";
import {
  ErroLgpd,
  NOME_REMOVIDO,
  anonimizarMembro,
  excluirPropriaConta,
  exportarDados,
} from "@/lib/lgpd/titular";
import { ErroAcesso, cadastrarPorConvite, gerarConvite, type Ator } from "@/lib/ministerios/nucleo";
import { agendaDoUsuario } from "@/lib/trocas/nucleo";
import {
  decidirPedido,
  gerarConvitePessoal,
  hashToken,
  pedirAcessoMesmaPessoa,
  usarConvitePrimeiraVez,
} from "@/lib/acesso/nucleo";
import { PALAVRA_EXCLUIR } from "@/lib/lgpd/termos";

vi.mock("@/lib/notificar", () => ({
  notificar: vi.fn(async () => undefined),
  notificarUsuarios: vi.fn(async () => undefined),
}));

const AGORA = new Date("2026-11-05T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const SENHA = "senha-certa-123";
const TEL_B = "11988887777";

type U = Ator & { senhaHash: string; email: string };

let db: AnyDb;
let igrejaId: number;
let ministerioId: number;
let funcaoId: number;
let admin: U;
let lider: U;
let ana: U;
let bia: U;
let eventoFuturo: number;
let escalaFutura: number;

async function usuario(nome: string, papelGlobal: Ator["papelGlobal"] = "voluntario", telefone?: string): Promise<U> {
  const email = `${nome.toLowerCase()}@exemplo.com`;
  const senhaHash = await hashSenha(SENHA);
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome, email, telefone, senhaHash, papelGlobal, consentimentoEm: AGORA, termosVersao: TERMOS_VERSAO })
    .returning();
  return { id: u.id, igrejaId, papelGlobal, senhaHash, email };
}

async function membro(u: Ator, papel: "lider" | "voluntario" = "voluntario") {
  const [m] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: u.id, ministerioId, papel, status: "aprovado" })
    .returning();
  await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m.id, funcaoId });
}

async function evento(inicio: Date, titulo = "Culto") {
  const [ev] = await db.insert(schema.eventos).values({ igrejaId, titulo, inicio }).returning();
  const [esc] = await db
    .insert(schema.escalas)
    .values({ igrejaId, eventoId: ev.id, ministerioId, status: "publicada" })
    .returning();
  return { eventoId: ev.id, escalaId: esc.id };
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Igreja" }).returning();
  [{ id: ministerioId }] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  [{ id: funcaoId }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId, nome: "Vocal" }).returning();

  admin = await usuario("Admin", "admin");
  lider = await usuario("Lider");
  ana = await usuario("Ana", "voluntario", "11911112222");
  bia = await usuario("Bia", "voluntario", TEL_B);
  await membro(lider, "lider");
  await membro(ana);
  await membro(bia);

  const passado = await evento(new Date(AGORA.getTime() - 10 * DIA));
  const futuro = await evento(new Date(AGORA.getTime() + 2 * 60 * 60 * 1000));
  eventoFuturo = futuro.eventoId;
  escalaFutura = futuro.escalaId;
  for (const e of [passado, futuro]) {
    const checkinEm = e === passado ? new Date(AGORA.getTime() - 10 * DIA) : null;
    await db.insert(schema.escalaItens).values([
      { igrejaId, escalaId: e.escalaId, funcaoId, usuarioId: ana.id, status: "confirmado", checkinEm },
      { igrejaId, escalaId: e.escalaId, funcaoId, usuarioId: bia.id, status: "confirmado", checkinEm },
    ]);
  }
  await db.insert(schema.mensagens).values([
    { igrejaId, eventoId: eventoFuturo, usuarioId: ana.id, texto: "texto-da-ana" },
    { igrejaId, eventoId: eventoFuturo, usuarioId: bia.id, texto: "texto-da-bia" },
  ]);
  await db.insert(schema.indisponibilidades).values([
    { igrejaId, usuarioId: ana.id, dataInicio: "2026-12-01", dataFim: "2026-12-01", motivo: "viagem-da-ana" },
    { igrejaId, usuarioId: bia.id, dataInicio: "2026-12-02", dataFim: "2026-12-02", motivo: "motivo-da-bia" },
  ]);
  await db.insert(reconhecimentos).values([
    { igrejaId, ministerioId, deUsuario: bia.id, paraUsuario: ana.id, texto: "obrigado-ana" },
    { igrejaId, ministerioId, deUsuario: ana.id, paraUsuario: bia.id, texto: "valeu-bia" },
  ]);
});

describe("consentimento", () => {
  it("cadastro por convite sem consentimento é recusado e não cria usuário", async () => {
    const token = await gerarConvite(db, lider, ministerioId);
    const r = await cadastrarPorConvite(db, token, {
      nome: "Caio",
      email: "caio@exemplo.com",
      senha: "senha-12345",
      consentimento: false,
    });
    expect(r).toEqual({ ok: false, motivo: "sem_consentimento" });
    const achou = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, "caio@exemplo.com"));
    expect(achou).toHaveLength(0);
  });

  it("com consentimento grava a data e a versão dos termos", async () => {
    const token = await gerarConvite(db, lider, ministerioId);
    const r = await cadastrarPorConvite(db, token, {
      nome: "Duda",
      email: "duda@exemplo.com",
      senha: "senha-12345",
      consentimento: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.usuario.termosVersao).toBe(TERMOS_VERSAO);
    expect(aceiteEmDia(r.usuario)).toBe(true);
  });

  it("versão antiga dos termos pede novo aceite", () => {
    expect(aceiteEmDia({ consentimentoEm: AGORA, termosVersao: "2000-01-01" })).toBe(false);
    expect(aceiteEmDia({ consentimentoEm: null, termosVersao: null })).toBe(false);
  });
});

describe("exportação", () => {
  it("dados de Ana não contêm nada de Bia", async () => {
    const json = JSON.stringify(await exportarDados(db, ana, AGORA));
    expect(json).toContain("texto-da-ana");
    expect(json).toContain("viagem-da-ana");
    expect(json).toContain("obrigado-ana");
    expect(json).toContain("ana@exemplo.com");
    for (const deBia of ["Bia", "bia@exemplo.com", TEL_B, "texto-da-bia", "motivo-da-bia", bia.senhaHash]) {
      expect(json).not.toContain(deBia);
    }
    expect(json).not.toContain(ana.senhaHash);
  });
});

describe("contato de colega não vaza para voluntário", () => {
  it("agenda, chat e ranking de Ana não trazem telefone nem e-mail de Bia", async () => {
    const respostas = [
      await agendaDoUsuario(db, ana, AGORA),
      await listarMensagens(db, ana, eventoFuturo),
      await rankingDoMinisterio(db, ana, ministerioId, "2026-10"),
    ];
    const json = JSON.stringify(respostas);
    expect(json).toContain("Bia");
    expect(json).not.toContain(TEL_B);
    expect(json).not.toContain("bia@exemplo.com");
  });
});

describe("exclusão da conta", () => {
  it("senha errada não exclui", async () => {
    await expect(excluirPropriaConta(db, bia, "errada", "exclusao", AGORA)).rejects.toBeInstanceOf(ErroLgpd);
  });

  it("único admin não pode se excluir", async () => {
    await expect(excluirPropriaConta(db, admin, SENHA, "exclusao", AGORA)).rejects.toBeInstanceOf(ErroLgpd);
  });

  it("voluntário não anonimiza outro membro (acesso negado)", async () => {
    await expect(anonimizarMembro(db, ana, bia.id, SENHA, AGORA)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("anonimiza, apaga o que é dele e mantém a contagem de escalas no painel", async () => {
    const filtro = { de: "2026-10-01", ate: "2026-11-04" }; // só o passado
    const antes = await carregarPainel(db, admin, filtro, AGORA);
    const [{ sessaoVersao }] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, bia.id));

    await excluirPropriaConta(db, bia, SENHA, "revogacao", AGORA);

    const [b] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, bia.id));
    expect(b.nome).toBe(NOME_REMOVIDO);
    expect(b.email).toBeNull();
    expect(b.telefone).toBeNull();
    expect(b.fotoUrl).toBeNull();
    expect(b.anonimizadoEm).toEqual(AGORA);
    expect(await usuarioDaSessao(db, bia.id, sessaoVersao)).toBeNull();
    expect((await autenticar(db, "bia@exemplo.com", SENHA, AGORA)).ok).toBe(false);

    const doUsuario = async (tabela: typeof schema.mensagens | typeof schema.indisponibilidades | typeof schema.pushInscricoes) =>
      db.select().from(tabela).where(eq(tabela.usuarioId, bia.id));
    expect(await doUsuario(schema.mensagens)).toHaveLength(0);
    expect(await doUsuario(schema.indisponibilidades)).toHaveLength(0);
    expect(await db.select().from(reconhecimentos).where(eq(reconhecimentos.deUsuario, bia.id))).toHaveLength(0);

    const depois = await carregarPainel(db, admin, filtro, AGORA);
    expect(depois.indicadores.escalasPublicadas).toBe(antes.indicadores.escalasPublicadas);
    const total = (p: typeof antes) => p.porVoluntario.reduce((s, l) => s + l.total, 0);
    expect(total(depois)).toBe(total(antes));
    expect(depois.porVoluntario.find((l) => l.usuarioId === bia.id)?.nome).toBe(NOME_REMOVIDO);

    // A vaga futura de Bia volta a ficar aberta.
    const itensFuturos = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, escalaFutura));
    expect(itensFuturos.map((i) => i.usuarioId)).not.toContain(bia.id);
    expect(itensFuturos.filter((i) => i.usuarioId === null)).toHaveLength(1);

    const [registro] = await db.select().from(lgpdRegistros).where(eq(lgpdRegistros.usuarioId, bia.id));
    expect(registro).toMatchObject({ feitoPor: bia.id, acao: "revogacao" });
  });

  it("admin anonimiza a pedido e fica registrado quem fez", async () => {
    await anonimizarMembro(db, admin, ana.id, SENHA, AGORA);
    const [registro] = await db.select().from(lgpdRegistros).where(eq(lgpdRegistros.usuarioId, ana.id));
    expect(registro).toMatchObject({ feitoPor: admin.id, acao: "anonimizacao_admin", criadoEm: AGORA });
  });
});

describe("retenção", () => {
  it("apaga mensagem de evento de 181 dias e mantém a de 179", async () => {
    const velho = await evento(new Date(AGORA.getTime() - 181 * DIA), "Velho");
    const recente = await evento(new Date(AGORA.getTime() - 179 * DIA), "Recente");
    await db.insert(schema.mensagens).values([
      { igrejaId, eventoId: velho.eventoId, usuarioId: lider.id, texto: "m181" },
      { igrejaId, eventoId: recente.eventoId, usuarioId: lider.id, texto: "m179" },
    ]);
    await db.insert(schema.indisponibilidades).values([
      { igrejaId, usuarioId: lider.id, dataInicio: "2026-08-01", dataFim: "2026-08-01" },
      { igrejaId, usuarioId: lider.id, dataInicio: "2026-08-20", dataFim: "2026-08-20" },
    ]);
    await db.insert(schema.tentativasLogin).values([
      { emailHash: "velha", criadoEm: new Date(AGORA.getTime() - 2 * DIA) },
      { emailHash: "nova", criadoEm: AGORA },
    ]);

    const r = await limparDadosAntigos(db, AGORA);

    const textos = (await db.select().from(schema.mensagens)).map((m) => m.texto);
    expect(textos).not.toContain("m181");
    expect(textos).toContain("m179");
    const datas = (await db.select().from(schema.indisponibilidades)).map((i) => i.dataFim);
    expect(datas).not.toContain("2026-08-01");
    expect(datas).toContain("2026-08-20");
    const hashes = (await db.select().from(schema.tentativasLogin)).map((x) => x.emailHash);
    expect(hashes).not.toContain("velha");
    expect(hashes).toContain("nova");
    expect(r.mensagens).toBe(1);
  });

  it("apaga convite expirado e mantém o válido", async () => {
    await db.insert(schema.convites).values([
      { igrejaId, ministerioId, token: "a".repeat(64), expiraEm: new Date(AGORA.getTime() - DIA) },
      { igrejaId, ministerioId, token: "b".repeat(64), expiraEm: new Date(AGORA.getTime() + DIA) },
    ]);
    await limparDadosAntigos(db, AGORA);
    const tokens = (await db.select().from(schema.convites)).map((c) => c.token);
    expect(tokens).not.toContain("a".repeat(64));
    expect(tokens).toContain("b".repeat(64));
  });
});

describe("acesso por link (LGPD)", () => {
  async function convite(nome: string, criadoEm: Date, usado: boolean, usuarioId?: number) {
    const [c] = await db
      .insert(schema.convitesPessoais)
      .values({
        igrejaId,
        ministerioId,
        nome,
        sobrenome: "Teste",
        tokenHash: hashToken(`tk-${nome}`),
        criadoPor: lider.id,
        usuarioId: usuarioId ?? null,
        expiraEm: new Date(criadoEm.getTime() + 14 * DIA),
        usadoEm: usado ? criadoEm : null,
        criadoEm,
      })
      .returning();
    return c;
  }

  it("limpeza apaga pré-cadastro vencido, pedido velho e aparelho revogado há 30+ dias", async () => {
    const vencido = await convite("Vencido", new Date(AGORA.getTime() - 20 * DIA), false);
    const valido = await convite("Valido", new Date(AGORA.getTime() - 2 * DIA), false);
    const usado = await convite("Usado", new Date(AGORA.getTime() - 60 * DIA), true, ana.id);
    await db.insert(schema.pedidosAcesso).values([
      { igrejaId, conviteId: vencido.id, tipo: "outra_pessoa", nome: "Pedido-do-vencido", rotulo: "x", criadoEm: new Date(AGORA.getTime() - DIA) },
      { igrejaId, conviteId: usado.id, tipo: "outra_pessoa", nome: "Pedido-velho", rotulo: "x", status: "recusado",
        criadoEm: new Date(AGORA.getTime() - 40 * DIA), decididoEm: new Date(AGORA.getTime() - 31 * DIA) },
      { igrejaId, conviteId: usado.id, tipo: "outra_pessoa", nome: "Pedido-parado", rotulo: "x", criadoEm: new Date(AGORA.getTime() - 31 * DIA) },
      { igrejaId, conviteId: usado.id, tipo: "outra_pessoa", nome: "Pedido-novo", rotulo: "x", criadoEm: new Date(AGORA.getTime() - DIA) },
    ]);
    await db.insert(schema.aparelhos).values([
      { igrejaId, usuarioId: ana.id, tokenHash: hashToken("ap-velho"), rotulo: "velho", revogadoEm: new Date(AGORA.getTime() - 31 * DIA) },
      { igrejaId, usuarioId: ana.id, tokenHash: hashToken("ap-recente"), rotulo: "recente", revogadoEm: new Date(AGORA.getTime() - DIA) },
      { igrejaId, usuarioId: ana.id, tokenHash: hashToken("ap-ativo"), rotulo: "ativo" },
    ]);

    const r = await limparDadosAntigos(db, AGORA);

    const convites = (await db.select().from(schema.convitesPessoais)).map((c) => c.id);
    expect(convites).not.toContain(vencido.id);
    expect(convites).toEqual(expect.arrayContaining([valido.id, usado.id]));
    const pedidos = (await db.select().from(schema.pedidosAcesso)).map((p) => p.nome);
    expect(pedidos).toEqual(["Pedido-novo"]);
    const aparelhos = (await db.select().from(schema.aparelhos)).map((a) => a.rotulo).sort();
    expect(aparelhos).toEqual(["ativo", "recente"]);
    expect(r.convitesPessoais).toBe(1);
    expect(r.aparelhos).toBe(1);
  });

  it("conta criada por link exclui a si mesma com EXCLUIR e leva aparelhos, link e pedidos", async () => {
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId, nome: "Caio", sobrenome: "Link" }, AGORA);
    const r = await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "Android · Chrome" }, AGORA);
    if (!r.ok) throw new Error(r.motivo);
    const pedido = await pedirAcessoMesmaPessoa(db, token, "Windows · Edge", AGORA);
    if (!pedido.ok) throw new Error(pedido.motivo);
    await decidirPedido(db, lider, pedido.pedidoId, true, AGORA);
    const caio = { id: r.usuario.id, igrejaId, papelGlobal: "voluntario" as const, senhaHash: null };

    const exportado = await exportarDados(db, caio, AGORA);
    expect(exportado.aparelhos.map((a) => a.rotulo).sort()).toEqual(["Android · Chrome", "Windows · Edge"]);

    await expect(excluirPropriaConta(db, caio, "qualquer", "exclusao", AGORA)).rejects.toBeInstanceOf(ErroLgpd);
    await excluirPropriaConta(db, caio, PALAVRA_EXCLUIR.toLowerCase(), "exclusao", AGORA);

    const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, caio.id));
    expect(u.nome).toBe(NOME_REMOVIDO);
    expect(u.email).toBeNull();
    expect(u.senhaHash).toBeNull();
    expect(await db.select().from(schema.aparelhos).where(eq(schema.aparelhos.usuarioId, caio.id))).toHaveLength(0);
    const links = await db.select().from(schema.convitesPessoais).where(eq(schema.convitesPessoais.usuarioId, caio.id));
    expect(links).toHaveLength(0);
    const nomes = (await db.select().from(schema.convitesPessoais)).map((c) => c.nome);
    expect(nomes).not.toContain("Caio");
  });
});
