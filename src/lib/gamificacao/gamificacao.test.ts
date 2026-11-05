import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { reconhecimentos } from "@/db/schema-gamificacao";
import { hashSenha, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, criarFuncao, criarMinisterio, definirLider, type Ator } from "@/lib/ministerios/nucleo";
import type { EnviadorPush } from "@/lib/push/enviar";
import { carregarReconhecimento, enviarReconhecimento, ErroReconhecimento, rankingDoMinisterio } from "./consulta";
import { calcularMedalhas, dataSequenciaSemanas } from "./medalhas";
import { calcularPontos, lancamentosDe, recusaTardia, REGRAS_PONTOS } from "./pontos";
import { montarRanking } from "./ranking";

const dia = (iso: string) => new Date(`${iso}T13:00:00Z`);

describe("pontos", () => {
  it("soma o histórico conhecido", () => {
    const l = lancamentosDe(
      [
        { eventoInicio: dia("2026-10-04"), status: "confirmado", checkinEm: dia("2026-10-04") },
        { eventoInicio: dia("2026-10-11"), status: "confirmado", checkinEm: null },
        { eventoInicio: dia("2026-10-18"), status: "pendente", checkinEm: null },
        {
          eventoInicio: dia("2026-10-25"),
          status: "recusado",
          checkinEm: null,
          recusadoEm: new Date("2026-10-24T13:00:00Z"),
        },
        {
          eventoInicio: dia("2026-11-01"),
          status: "recusado",
          checkinEm: null,
          recusadoEm: new Date("2026-10-20T13:00:00Z"),
        },
      ],
      [dia("2026-10-12")],
    );
    // 10+5 (1º) + 10 (2º) + 0 (pendente) − 5 (recusa tardia) + 0 (recusa cedo) + 15 (troca)
    expect(calcularPontos(l)).toBe(35);
    expect(calcularPontos(l, dia("2026-10-10"), dia("2026-11-01"))).toBe(20);
  });

  it("recusa com menos de 48 h perde pontos; com 48 h ou mais não", () => {
    const ev = dia("2026-10-10");
    expect(recusaTardia(ev, new Date(ev.getTime() - REGRAS_PONTOS.antecedenciaRecusaMs + 1))).toBe(true);
    expect(recusaTardia(ev, new Date(ev.getTime() - REGRAS_PONTOS.antecedenciaRecusaMs))).toBe(false);
  });
});

describe("medalhas", () => {
  const semanais = (n: number, pulo?: number) =>
    Array.from({ length: n }, (_, i) => dia("2026-09-06")).map((d, i) => new Date(d.getTime() + (i + (pulo !== undefined && i >= pulo ? 1 : 0)) * 7 * 86_400_000));

  it("4 semanas seguidas", () => {
    expect(dataSequenciaSemanas(semanais(4), 4)).not.toBeNull();
    expect(calcularMedalhas({ confirmadas: [], presencas: semanais(4), trocasSubstituto: [] }).map((m) => m.chave)).toContain("semanas_4");
  });

  it("semana sem presença quebra a sequência", () => {
    expect(dataSequenciaSemanas(semanais(4, 2), 4)).toBeNull();
    expect(calcularMedalhas({ confirmadas: [], presencas: semanais(4, 2), trocasSubstituto: [] }).map((m) => m.chave)).not.toContain("semanas_4");
  });

  it("duas presenças na mesma semana contam uma semana", () => {
    const p = [dia("2026-10-04"), dia("2026-10-05"), dia("2026-10-11"), dia("2026-10-18")];
    expect(dataSequenciaSemanas(p, 4)).toBeNull();
  });

  it("marcos de presença, primeira escala e trocas", () => {
    const presencas = Array.from({ length: 25 }, (_, i) => new Date(dia("2026-01-01").getTime() + i * 86_400_000 * 3));
    const chaves = calcularMedalhas({
      confirmadas: [dia("2026-01-01")],
      presencas,
      trocasSubstituto: Array.from({ length: 5 }, () => dia("2026-02-01")),
    }).map((m) => m.chave);
    expect(chaves).toEqual(expect.arrayContaining(["primeira_escala", "presencas_10", "presencas_25", "trocas_5"]));
    expect(chaves).not.toContain("presencas_50");
    expect(calcularMedalhas({ confirmadas: [], presencas: [], trocasSubstituto: [] })).toEqual([]);
  });
});

describe("ranking (puro)", () => {
  const linhas = [
    { usuarioId: 1, nome: "Ana", pontos: 30, aparecerNoRanking: true },
    { usuarioId: 2, nome: "Bia", pontos: 50, aparecerNoRanking: false },
    { usuarioId: 3, nome: "Caio", pontos: 30, aparecerNoRanking: true },
  ];

  it("quem desligou some para os outros, mas se vê", () => {
    expect(montarRanking(linhas, 1).top.map((p) => p.usuarioId)).toEqual([1, 3]);
    const dela = montarRanking(linhas, 2);
    expect(dela.top[0]).toMatchObject({ usuarioId: 2, posicao: 1 });
    expect(dela.minha?.posicao).toBe(1);
  });

  it("empate divide a posição e a posição própria aparece fora do top", () => {
    const r = montarRanking(linhas, 3, 1);
    expect(r.top).toHaveLength(1);
    expect(montarRanking(linhas, 1).top.map((p) => p.posicao)).toEqual([1, 1]);
    expect(r.minha?.usuarioId).toBe(3);
  });
});

describe("banco", () => {
  let db: AnyDb;
  let admin: Ator;
  let lider: Ator;
  let ana: Ator;
  let bia: Ator;
  let de: Ator;
  let louvor: number;
  let midia: number;
  let membroAna: number;
  let membroLider: number;
  const AGORA = new Date("2026-11-04T15:00:00Z");

  async function usuario(igrejaId: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
    const [u] = await db
      .insert(schema.usuarios)
      .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: await hashSenha("senha-12345"), papelGlobal })
      .returning();
    return { id: u.id, igrejaId, papelGlobal } as Ator;
  }
  async function membro(a: Ator, ministerioId: number, papel: "lider" | "voluntario" = "voluntario") {
    const [m] = await db
      .insert(schema.membrosMinisterio)
      .values({ igrejaId: a.igrejaId, usuarioId: a.id, ministerioId, papel, status: "aprovado" })
      .returning();
    return m.id;
  }

  beforeAll(async () => {
    const pg = drizzle(new PGlite(), { schema });
    await migrate(pg, { migrationsFolder: "./drizzle" });
    db = pg as unknown as AnyDb;
    const [igreja] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
    admin = await usuario(igreja.id, "admin@x.com", "admin");
    lider = await usuario(igreja.id, "lider@x.com");
    ana = await usuario(igreja.id, "ana@x.com");
    bia = await usuario(igreja.id, "bia@x.com");
    de = await usuario(igreja.id, "de@x.com");
    louvor = (await criarMinisterio(db, admin, "Louvor")).id;
    midia = (await criarMinisterio(db, admin, "Mídia")).id;
    await definirLider(db, admin, louvor, lider.id, true);
    membroLider = (
      await db.select().from(schema.membrosMinisterio).where(
        (await import("drizzle-orm")).eq(schema.membrosMinisterio.usuarioId, lider.id),
      )
    )[0].id;
    membroAna = await membro(ana, louvor);
    await membro(bia, louvor);
    await membro(de, midia);
    await criarFuncao(db, lider, louvor, "Vocal");
    const funcao = (await db.select().from(schema.funcoes))[0];

    const [ev] = await db
      .insert(schema.eventos)
      .values({ igrejaId: igreja.id, titulo: "Culto", inicio: new Date("2026-11-01T13:00:00Z") })
      .returning();
    const [esc] = await db
      .insert(schema.escalas)
      .values({ igrejaId: igreja.id, eventoId: ev.id, ministerioId: louvor, status: "publicada" })
      .returning();
    for (const [u, checkin] of [[ana, new Date("2026-11-01T12:50:00Z")], [bia, null]] as const) {
      await db.insert(schema.escalaItens).values({
        igrejaId: igreja.id,
        escalaId: esc.id,
        funcaoId: funcao.id,
        usuarioId: u.id,
        status: "confirmado",
        checkinEm: checkin,
      });
    }
    await db.update(schema.usuarios).set({ aparecerNoRanking: false }).where(
      (await import("drizzle-orm")).eq(schema.usuarios.id, bia.id),
    );
  });

  it("ranking do mês: ana vê a si mesma e não vê quem desligou", async () => {
    const r = await rankingDoMinisterio(db, ana, louvor, "2026-11");
    expect(r.top.map((p) => p.usuarioId)).not.toContain(bia.id);
    expect(r.minha).toMatchObject({ usuarioId: ana.id, pontos: 15 });
  });

  it("quem desligou vê a própria posição, e Ana não aparece como Bia", async () => {
    const r = await rankingDoMinisterio(db, bia, louvor, "2026-11");
    expect(r.minha).toMatchObject({ usuarioId: bia.id, pontos: 10 });
  });

  it("ranking de ministério alheio é negado", async () => {
    await expect(rankingDoMinisterio(db, ana, midia, "2026-11")).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("líder agradece, o voluntário recebe e o aviso sai", async () => {
    const enviados: string[] = [];
    const enviar: EnviadorPush = async (_i, p) => {
      enviados.push(p.url);
    };
    await db.insert(schema.pushInscricoes).values({
      igrejaId: ana.igrejaId,
      usuarioId: ana.id,
      endpoint: "https://push.example/ana",
      chaveP256dh: "k",
      chaveAuth: "a",
    });
    await enviarReconhecimento(db, lider, louvor, membroAna, "  Obrigado!  ", enviar);
    const r = await carregarReconhecimento(db, ana, AGORA);
    expect(r.recebidos).toHaveLength(1);
    expect(r.recebidos[0]).toMatchObject({ texto: "Obrigado!", de: "lider", ministerio: "Louvor" });
    expect(enviados).toEqual(["/reconhecimento"]);
  });

  it("voluntário não agradece; líder de outro ministério também não", async () => {
    await expect(enviarReconhecimento(db, ana, louvor, membroAna, "oi", null)).rejects.toBeInstanceOf(ErroAcesso);
    const outroLider = await usuario(ana.igrejaId, "lider2@x.com");
    await definirLider(db, admin, midia, outroLider.id, true);
    await expect(enviarReconhecimento(db, outroLider, midia, membroAna, "oi", null)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(enviarReconhecimento(db, outroLider, louvor, membroAna, "oi", null)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("texto vazio, longo demais ou para si mesmo é recusado", async () => {
    await expect(enviarReconhecimento(db, lider, louvor, membroAna, "   ", null)).rejects.toBeInstanceOf(ErroReconhecimento);
    await expect(enviarReconhecimento(db, lider, louvor, membroAna, "x".repeat(281), null)).rejects.toBeInstanceOf(ErroReconhecimento);
    await expect(enviarReconhecimento(db, lider, louvor, membroLider, "oi", null)).rejects.toBeInstanceOf(ErroReconhecimento);
    expect(await db.select().from(reconhecimentos)).toHaveLength(1);
  });
});
