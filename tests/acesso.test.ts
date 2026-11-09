import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { autenticar, hashSenha, type AnyDb } from "@/lib/auth-core";
import {
  MAX_PEDIDOS_PENDENTES_POR_CONVITE,
  aparelhoEhDoDono,
  aparelhoValido,
  decidirPedido,
  gerarConvitePessoal,
  hashToken,
  lerConvitePessoal,
  listarAparelhos,
  listarPedidosPendentes,
  marcarPedidoAtendido,
  pedirAcessoMesmaPessoa,
  pedirConviteOutraPessoa,
  revogarAparelho,
  rotuloDoAparelho,
  situacaoDoPedido,
  usarConvitePrimeiraVez,
} from "@/lib/acesso/nucleo";
import { TERMOS_VERSAO } from "@/lib/lgpd/termos";
import { ErroAcesso, criarMinisterio, definirLider, VALIDADE_CONVITE_MS, type Ator } from "@/lib/ministerios/nucleo";

const avisos = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/notificar", () => ({ notificarUsuarios: avisos }));

let db: AnyDb;
let admin: Ator;
let lider: Ator;
let outroLider: Ator;
let minId: number;
let outroMinId: number;

async function usuario(igrejaId: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email, email, senhaHash: await hashSenha("senha-12345"), papelGlobal })
    .returning();
  return { id: u.id, igrejaId, papelGlobal } as Ator;
}

/** Gera e usa um link: devolve o token do link e do 1º aparelho. */
async function pessoa(nome = "Maria", sobrenome = "Silva") {
  const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome, sobrenome });
  const r = await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "iPhone · Safari" });
  if (!r.ok) throw new Error("1º uso falhou");
  return { token, ...r };
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  const [igreja] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  admin = await usuario(igreja.id, "admin@x.com", "admin");
  lider = await usuario(igreja.id, "lider@x.com");
  outroLider = await usuario(igreja.id, "lider2@x.com");
  minId = (await criarMinisterio(db, admin, "Louvor")).id;
  outroMinId = (await criarMinisterio(db, admin, "Mídia")).id;
  await definirLider(db, admin, minId, lider.id, true);
  await definirLider(db, admin, outroMinId, outroLider.id, true);
});

describe("hashToken e rotuloDoAparelho", () => {
  it("hash é sha256 hex estável", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("monta o rótulo pelo user agent", () => {
    expect(
      rotuloDoAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile Safari/604"),
    ).toBe("iPhone · Safari");
    expect(
      rotuloDoAparelho("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Chrome/120 Mobile Safari/537"),
    ).toBe("Android · Chrome");
    expect(
      rotuloDoAparelho("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537 Edg/120"),
    ).toBe("Windows · Edge");
    expect(rotuloDoAparelho(undefined)).toBe("Aparelho · Navegador");
  });
});

describe("convite pessoal e 1º uso", () => {
  it("só líder do ministério (ou admin) gera; líder de outro ministério recebe ErroAcesso", async () => {
    await expect(
      gerarConvitePessoal(db, outroLider, { ministerioId: minId, nome: "A", sobrenome: "B" }),
    ).rejects.toBeInstanceOf(ErroAcesso);
    await expect(
      gerarConvitePessoal(db, admin, { ministerioId: minId, nome: "A", sobrenome: "B" }),
    ).resolves.toHaveProperty("token");
  });

  it("o banco guarda só o hash do token", async () => {
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "Ana", sobrenome: "Lima" });
    const linhas = await db.select().from(schema.convitesPessoais);
    expect(JSON.stringify(linhas)).not.toContain(token);
    expect(linhas.some((l) => l.tokenHash === hashToken(token))).toBe(true);
    const r = await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "x" });
    if (!r.ok) throw new Error();
    const aparelhos = await db.select().from(schema.aparelhos);
    expect(JSON.stringify(aparelhos)).not.toContain(r.aparelhoToken);
  });

  it("sem consentimento não cria conta nem consome o link; com consentimento cria", async () => {
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "João", sobrenome: "Souza" });
    const antes = (await db.select().from(schema.usuarios)).length;
    expect(await usarConvitePrimeiraVez(db, token, { consentimento: false, rotulo: "x" })).toEqual({
      ok: false,
      motivo: "sem_consentimento",
    });
    expect((await db.select().from(schema.usuarios)).length).toBe(antes);
    expect((await lerConvitePessoal(db, token))?.usado).toBe(false);

    const r = await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "iPhone · Safari" });
    if (!r.ok) throw new Error();
    expect(r.usuario).toMatchObject({ nome: "João Souza", email: null, senhaHash: null, termosVersao: TERMOS_VERSAO });
    expect(r.usuario.consentimentoEm).toBeInstanceOf(Date);
    const [membro] = await db
      .select()
      .from(schema.membrosMinisterio)
      .where(eq(schema.membrosMinisterio.usuarioId, r.usuario.id));
    expect(membro).toMatchObject({ ministerioId: minId, status: "aprovado", papel: "voluntario" });
    const lido = await lerConvitePessoal(db, token);
    expect(lido).toMatchObject({ usado: true, usuarioId: r.usuario.id, ministerio: "Louvor" });
  });

  it("segundo uso do mesmo link devolve ja_usado", async () => {
    const { token } = await pessoa("Paulo", "Reis");
    expect(await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "x" })).toEqual({
      ok: false,
      motivo: "ja_usado",
    });
  });

  it("link expirado (não usado), revogado ou inexistente não abre", async () => {
    const velho = new Date(Date.now() - VALIDADE_CONVITE_MS - 1000);
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "V", sobrenome: "V" }, velho);
    expect(await lerConvitePessoal(db, token)).toBeNull();
    expect(await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "x" })).toEqual({
      ok: false,
      motivo: "invalido",
    });
    const { token: t2 } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "R", sobrenome: "R" });
    await db.update(schema.convitesPessoais).set({ revogadoEm: new Date() }).where(eq(schema.convitesPessoais.tokenHash, hashToken(t2)));
    expect(await lerConvitePessoal(db, t2)).toBeNull();
    expect(await lerConvitePessoal(db, "nao-existe")).toBeNull();
  });

  it("depois do 1º uso o link não expira", async () => {
    const velho = new Date(Date.now() - 2 * VALIDADE_CONVITE_MS);
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "L", sobrenome: "L" }, velho);
    const r = await usarConvitePrimeiraVez(db, token, { consentimento: true, rotulo: "x" }, velho);
    expect(r.ok).toBe(true);
    expect(await lerConvitePessoal(db, token)).not.toBeNull();
  });

  it("link para membro existente só registra o aparelho", async () => {
    const existente = await usuario(admin.igrejaId, "antigo@x.com");
    const antes = (await db.select().from(schema.usuarios)).length;
    const { token } = await gerarConvitePessoal(db, lider, {
      ministerioId: minId,
      nome: "Antigo",
      sobrenome: "Membro",
      usuarioId: existente.id,
    });
    const r = await usarConvitePrimeiraVez(db, token, { consentimento: false, rotulo: "Windows · Edge" });
    if (!r.ok) throw new Error();
    expect(r.usuario.id).toBe(existente.id);
    expect((await db.select().from(schema.usuarios)).length).toBe(antes);
    expect(await aparelhoValido(db, r.aparelhoToken)).toEqual({ aparelhoId: r.aparelhoId, usuarioId: existente.id });
  });

  it("conta sem senha nunca autentica por senha", async () => {
    const { usuario: u } = await pessoa("Sem", "Senha");
    expect(u.senhaHash).toBeNull();
    // Mesmo com e-mail (link de acesso para conta antiga sem senha), a senha nunca confere.
    await db.update(schema.usuarios).set({ email: "sem-senha@x.com" }).where(eq(schema.usuarios.id, u.id));
    expect(await autenticar(db, "sem-senha@x.com", "")).toEqual({ ok: false, motivo: "invalido" });
    expect(await autenticar(db, "sem-senha@x.com", "qualquer-coisa")).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("aparelho", () => {
  it("aparelho do 1º uso vale e atualiza ultimo_uso_em; desconhecido não vale", async () => {
    const p = await pessoa();
    const depois = new Date(Date.now() + 60_000);
    expect(await aparelhoValido(db, p.aparelhoToken, depois)).toEqual({
      aparelhoId: p.aparelhoId,
      usuarioId: p.usuario.id,
    });
    const [a] = await db.select().from(schema.aparelhos).where(eq(schema.aparelhos.id, p.aparelhoId));
    expect(a.ultimoUsoEm?.getTime()).toBe(depois.getTime());
    expect(await aparelhoValido(db, "inventado")).toBeNull();
    expect(await aparelhoEhDoDono(db, p.token, p.aparelhoToken)).toBe(true);
    expect(await aparelhoEhDoDono(db, p.token, "inventado")).toBe(false);
  });

  it("aparelho novo pede, líder aprova e o aparelho passa a valer", async () => {
    const p = await pessoa();
    avisos.mockClear();
    const pedido = await pedirAcessoMesmaPessoa(db, p.token, "Android · Chrome");
    if (!pedido.ok) throw new Error();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect((avisos.mock.calls[0] as unknown[])[1]).toContain(lider.id);
    // Pendente: ainda não está em `aparelhos`.
    expect(await aparelhoValido(db, pedido.aparelhoToken)).toBeNull();
    expect(await aparelhoEhDoDono(db, p.token, pedido.aparelhoToken)).toBe(false);
    expect(await situacaoDoPedido(db, pedido.pedidoId, pedido.aparelhoToken)).toEqual({ status: "pendente" });
    expect(await situacaoDoPedido(db, pedido.pedidoId, p.aparelhoToken)).toBeNull();

    const pendentes = await listarPedidosPendentes(db, lider, minId);
    expect(pendentes.find((x) => x.id === pedido.pedidoId)).toMatchObject({
      tipo: "mesma_pessoa",
      rotulo: "Android · Chrome",
      conviteNome: "Maria",
    });

    await decidirPedido(db, lider, pedido.pedidoId, true);
    const sit = await situacaoDoPedido(db, pedido.pedidoId, pedido.aparelhoToken);
    expect(sit).toMatchObject({ status: "aprovado", usuarioId: p.usuario.id });
    expect(await aparelhoValido(db, pedido.aparelhoToken)).toMatchObject({ usuarioId: p.usuario.id });
    expect(await aparelhoEhDoDono(db, p.token, pedido.aparelhoToken)).toBe(true);
    expect((await listarAparelhos(db, p.usuario.id)).map((a) => a.rotulo).sort()).toEqual([
      "Android · Chrome",
      "iPhone · Safari",
    ]);
    await expect(decidirPedido(db, lider, pedido.pedidoId, true)).rejects.toThrow("já decidido");
  });

  it("recusa não cria aparelho", async () => {
    const p = await pessoa();
    const pedido = await pedirAcessoMesmaPessoa(db, p.token, "Mac · Safari");
    if (!pedido.ok) throw new Error();
    await decidirPedido(db, lider, pedido.pedidoId, false);
    expect(await situacaoDoPedido(db, pedido.pedidoId, pedido.aparelhoToken)).toEqual({ status: "recusado" });
    expect(await aparelhoValido(db, pedido.aparelhoToken)).toBeNull();
  });

  it("outra pessoa: não ganha acesso, não se aprova; líder atende com convite novo", async () => {
    const p = await pessoa();
    const pedido = await pedirConviteOutraPessoa(db, p.token, { nome: "  Carlos ", sobrenome: "Dias", rotulo: "Linux · Firefox" });
    if (!pedido.ok) throw new Error();
    await expect(decidirPedido(db, lider, pedido.pedidoId, true)).rejects.toThrow();
    const [pendente] = (await listarPedidosPendentes(db, lider, minId)).filter((x) => x.id === pedido.pedidoId);
    expect(pendente).toMatchObject({ tipo: "outra_pessoa", nome: "Carlos", sobrenome: "Dias" });
    await marcarPedidoAtendido(db, lider, pedido.pedidoId);
    const [linha] = await db.select().from(schema.pedidosAcesso).where(eq(schema.pedidosAcesso.id, pedido.pedidoId));
    expect(linha.status).toBe("atendido");
    expect((await listarPedidosPendentes(db, lider, minId)).some((x) => x.id === pedido.pedidoId)).toBe(false);
  });

  it("pedido em link ainda não usado é inválido", async () => {
    const { token } = await gerarConvitePessoal(db, lider, { ministerioId: minId, nome: "N", sobrenome: "N" });
    expect(await pedirAcessoMesmaPessoa(db, token, "x")).toEqual({ ok: false, motivo: "invalido" });
  });

  it("limita a 5 pedidos pendentes por convite", async () => {
    const p = await pessoa();
    for (let i = 0; i < MAX_PEDIDOS_PENDENTES_POR_CONVITE; i++) {
      expect((await pedirAcessoMesmaPessoa(db, p.token, `a${i}`)).ok).toBe(true);
    }
    expect(await pedirAcessoMesmaPessoa(db, p.token, "a6")).toEqual({ ok: false, motivo: "limite" });
    expect(await pedirConviteOutraPessoa(db, p.token, { nome: "x", sobrenome: "y", rotulo: "z" })).toEqual({
      ok: false,
      motivo: "limite",
    });
  });

  it("limita a 20 pedidos por hora na igreja", async () => {
    const agora = new Date();
    await db.delete(schema.pedidosAcesso);
    const pessoas = [await pessoa(), await pessoa(), await pessoa(), await pessoa(), await pessoa()];
    for (let i = 0; i < 20; i++) {
      const r = await pedirAcessoMesmaPessoa(db, pessoas[i % 5].token, "x", agora);
      expect(r.ok).toBe(true);
    }
    const extra = await pessoa();
    expect(await pedirAcessoMesmaPessoa(db, extra.token, "x", agora)).toEqual({ ok: false, motivo: "limite" });
    const daqui1h = new Date(agora.getTime() + 61 * 60 * 1000);
    expect((await pedirAcessoMesmaPessoa(db, extra.token, "x", daqui1h)).ok).toBe(true);
    // Limpa para não pesar no limite dos testes seguintes.
    await db.delete(schema.pedidosAcesso);
  });

  it("falha de aviso não derruba o pedido", async () => {
    const p = await pessoa();
    avisos.mockRejectedValueOnce(new Error("push fora do ar"));
    expect((await pedirAcessoMesmaPessoa(db, p.token, "x")).ok).toBe(true);
  });

  it("líder de outro ministério recebe ErroAcesso em decidir, listar, atender e revogar", async () => {
    const p = await pessoa();
    const pedido = await pedirAcessoMesmaPessoa(db, p.token, "x");
    if (!pedido.ok) throw new Error();
    await expect(decidirPedido(db, outroLider, pedido.pedidoId, true)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(marcarPedidoAtendido(db, outroLider, pedido.pedidoId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(listarPedidosPendentes(db, outroLider, minId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(revogarAparelho(db, outroLider, p.aparelhoId)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("revogar: dono, líder do ministério e admin podem; revogado deixa de valer", async () => {
    const dono = await pessoa();
    const donoAtor: Ator = { id: dono.usuario.id, igrejaId: admin.igrejaId, papelGlobal: "voluntario" };
    const outroDono = await pessoa();
    const terceiro = await pessoa();

    await revogarAparelho(db, donoAtor, dono.aparelhoId);
    expect(await aparelhoValido(db, dono.aparelhoToken)).toBeNull();
    expect(await listarAparelhos(db, dono.usuario.id)).toEqual([]);

    // Voluntário comum não revoga o aparelho de outro.
    await expect(revogarAparelho(db, donoAtor, outroDono.aparelhoId)).rejects.toBeInstanceOf(ErroAcesso);
    await revogarAparelho(db, lider, outroDono.aparelhoId);
    expect(await aparelhoValido(db, outroDono.aparelhoToken)).toBeNull();
    await revogarAparelho(db, admin, terceiro.aparelhoId);
    expect(await aparelhoValido(db, terceiro.aparelhoToken)).toBeNull();
  });

  it("aparelho revogado depois de aprovado não conta como aprovado", async () => {
    const p = await pessoa();
    const pedido = await pedirAcessoMesmaPessoa(db, p.token, "x");
    if (!pedido.ok) throw new Error();
    await decidirPedido(db, lider, pedido.pedidoId, true);
    const sit = await situacaoDoPedido(db, pedido.pedidoId, pedido.aparelhoToken);
    if (sit?.status !== "aprovado") throw new Error();
    await revogarAparelho(db, lider, sit.aparelhoId);
    expect(await situacaoDoPedido(db, pedido.pedidoId, pedido.aparelhoToken)).toEqual({ status: "recusado" });
  });
});
