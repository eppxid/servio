import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import * as aviso from "@/lib/notificar";
import {
  ErroEscala,
  dadosMontagem,
  desfazerSugestao,
  escalasPublicadasDoEvento,
  listarEscalasFuturas,
  salvarEscala,
  sugerirMes,
} from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let lider: Ator;
let outroLider: Ator;
let louvor: number;
let midia: number;
let vocal: number;
let camera: number;
const vol: Record<string, number> = {};
let culto: number;
let culto2: number;
let ensaio: number;

async function usuario(email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId, papelGlobal } as Ator;
}

async function membro(usuarioId: number, ministerioId: number, papel: "lider" | "voluntario", funcaoId?: number) {
  const [m] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId, ministerioId, papel, status: "aprovado" })
    .returning();
  if (funcaoId) await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m.id, funcaoId });
}

async function evento(titulo: string, inicio: string, fim: string) {
  const [e] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo, inicio: new Date(inicio), fim: new Date(fim) })
    .returning();
  return e.id;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  [{ id: louvor }, { id: midia }] = await db
    .insert(schema.ministerios)
    .values([
      { igrejaId, nome: "Louvor" },
      { igrejaId, nome: "Mídia" },
    ])
    .returning();
  [{ id: vocal }, { id: camera }] = await db
    .insert(schema.funcoes)
    .values([
      { igrejaId, ministerioId: louvor, nome: "Vocal" },
      { igrejaId, ministerioId: midia, nome: "Câmera" },
    ])
    .returning();
  lider = await usuario("lider@x.com");
  outroLider = await usuario("lider2@x.com");
  await membro(lider.id, louvor, "lider");
  await membro(outroLider.id, midia, "lider");
  for (const nome of ["ana", "bia", "caio"]) {
    vol[nome] = (await usuario(`${nome}@x.com`)).id;
    await membro(vol[nome], louvor, "voluntario", vocal);
  }
  await membro(vol.caio, midia, "voluntario", camera);
  vol.sem = (await usuario("sem@x.com")).id;
  await membro(vol.sem, louvor, "voluntario");
  culto = await evento("Culto", "2099-03-01T22:00:00Z", "2099-03-02T00:00:00Z");
  ensaio = await evento("Ensaio", "2099-03-01T23:00:00Z", "2099-03-02T01:00:00Z");
  culto2 = await evento("Culto", "2099-03-08T22:00:00Z", "2099-03-09T00:00:00Z");
  await db
    .insert(schema.indisponibilidades)
    .values({ igrejaId, usuarioId: vol.ana, dataInicio: "2099-03-01", dataFim: "2099-03-01", motivo: "viagem" });
});

describe("acesso", () => {
  it("líder de outro ministério não monta nem salva a escala", async () => {
    await expect(dadosMontagem(db, outroLider, culto, louvor)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(salvarEscala(db, outroLider, culto, louvor, new Map(), true)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(sugerirMes(db, outroLider, louvor, "2099-03")).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("voluntário não vê escalas para montar", async () => {
    const ator = { id: vol.bia, igrejaId, papelGlobal: "voluntario" } as Ator;
    expect(await listarEscalasFuturas(db, ator)).toEqual([]);
    await expect(dadosMontagem(db, ator, culto, louvor)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("evento de outra igreja é negado", async () => {
    const [outra] = await db.insert(schema.igrejas).values({ nome: "Outra" }).returning();
    const [e] = await db
      .insert(schema.eventos)
      .values({ igrejaId: outra.id, titulo: "X", inicio: new Date("2099-03-01T22:00:00Z") })
      .returning();
    await expect(dadosMontagem(db, lider, e.id, louvor)).rejects.toBeInstanceOf(ErroAcesso);
  });
});

describe("montagem", () => {
  it("lista só quem tem a função e marca indisponível e conflito", async () => {
    await salvarEscala(db, outroLider, ensaio, midia, new Map([[camera, vol.caio]]), false);
    const d = await dadosMontagem(db, lider, culto, louvor);
    const cand = d.funcoes[0].candidatos;
    expect(cand.map((c) => c.usuarioId).sort()).toEqual([vol.ana, vol.bia, vol.caio].sort());
    expect(cand.find((c) => c.usuarioId === vol.ana)?.bloqueio).toBe("indisponivel");
    expect(cand.find((c) => c.usuarioId === vol.caio)?.bloqueio).toBe("conflito");
    expect(cand.find((c) => c.usuarioId === vol.bia)?.bloqueio).toBeNull();
  });

  it("recusa no servidor quem está bloqueado ou não tem a função", async () => {
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.ana]]), false)).rejects.toBeInstanceOf(ErroEscala);
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.caio]]), false)).rejects.toBeInstanceOf(ErroEscala);
    await expect(salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.sem]]), false)).rejects.toBeInstanceOf(ErroEscala);
  });

  it("publica: status publicada, itens pendentes e notifica", async () => {
    const espiao = vi.spyOn(aviso, "notificar");
    await salvarEscala(db, lider, culto, louvor, new Map([[vocal, vol.bia]]), true);
    const [esc] = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, culto));
    expect(esc.status).toBe("publicada");
    const itens = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
    expect(itens.map((i) => [i.usuarioId, i.status])).toEqual([[vol.bia, "pendente"]]);
    expect(espiao).toHaveBeenCalledWith({ tipo: "escala_publicada", eventoId: culto, usuarioIds: [vol.bia] });
    const pub = await escalasPublicadasDoEvento(db, igrejaId, culto);
    expect(pub).toEqual([{ ministerio: "Louvor", itens: [{ funcao: "Vocal", nome: "bia", status: "pendente" }] }]);
  });

  it("sugerir mês preenche só escalas não publicadas, como rascunho", async () => {
    // culto2 tem escala em rascunho com 1 vaga vazia; o ensaio não tem escala no Louvor.
    const [esc2] = await db.insert(schema.escalas).values({ igrejaId, eventoId: culto2, ministerioId: louvor }).returning();
    await db.insert(schema.escalaItens).values({ igrejaId, escalaId: esc2.id, funcaoId: vocal });
    const r = await sugerirMes(db, lider, louvor, "2099-03", new Date("2099-02-01T00:00:00Z"));
    expect(r.preenchidos).toHaveLength(1);
    // Ensaio sem escala no ministério: fica fora da sugestão e volta em semVagas.
    expect(r.semCandidato).toEqual([]);
    expect(r.semVagas).toEqual([{ eventoId: ensaio, data: "2099-03-01" }]);
    const escEnsaio = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, ensaio));
    expect(escEnsaio.filter((e) => e.ministerioId === louvor)).toEqual([]);
    const [esc] = await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, culto2));
    expect(esc.status).toBe("rascunho");
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.escalaId, esc.id));
    // bia já tem 1 escala no mês: vai quem tem menos (ana, livre no dia 8).
    expect(item.usuarioId).toBe(vol.ana);
    const lista = await listarEscalasFuturas(db, lider, new Date("2099-02-28T00:00:00Z"), 30);
    const status = lista.map((l) => [l.evento.id, l.ministerios.find((m) => m.id === louvor)?.status]);
    expect(status).toEqual([
      [culto, "publicada"],
      [ensaio, "sem_escala"],
      [culto2, "rascunho"],
    ]);
  });
});

describe("sugestão sem vagas", () => {
  it("culto sem escala no ministério não ganha escala nem item e volta em semVagas", async () => {
    const [fora] = await db
      .insert(schema.eventos)
      .values({ igrejaId, titulo: "Culto avulso", inicio: new Date("2099-06-07T22:00:00Z"), fim: new Date("2099-06-07T23:59:00Z") })
      .returning();
    const r = await sugerirMes(db, lider, louvor, "2099-06", new Date("2099-05-01T00:00:00Z"));
    expect(r.preenchidos).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.semVagas).toEqual([{ eventoId: fora.id, data: "2099-06-07" }]);
    expect(await db.select().from(schema.escalas).where(eq(schema.escalas.eventoId, fora.id))).toEqual([]);
  });
});

describe("sugestão com vagas do modelo", () => {
  let som: number;
  let mesa: number;
  const x: Record<string, number> = {};
  const itens: Record<string, number[]> = {};
  const ev: Record<string, number> = {};

  async function escalaCom(eventoId: number, status: "rascunho" | "publicada", usuarios: (number | null)[]) {
    const [e] = await db.insert(schema.escalas).values({ igrejaId, eventoId, ministerioId: som, status }).returning();
    const criados = await db
      .insert(schema.escalaItens)
      .values(usuarios.map((usuarioId) => ({ igrejaId, escalaId: e.id, funcaoId: mesa, usuarioId })))
      .returning();
    return criados.map((c) => c.id);
  }

  const doItem = async (id: number) =>
    (await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, id)))[0].usuarioId;

  beforeAll(async () => {
    [{ id: som }] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Som", limiteMensal: 2 }).returning();
    [{ id: mesa }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId: som, nome: "Mesa" }).returning();
    await membro(lider.id, som, "lider");
    for (const nome of ["x1", "x2", "x3", "x4"]) {
      x[nome] = (await usuario(`${nome}@x.com`)).id;
      if (nome !== "x3") await membro(x[nome], som, "voluntario", mesa);
    }
    // x3 só deseja a função: não é elegível.
    const [m3] = await db
      .insert(schema.membrosMinisterio)
      .values({ igrejaId, usuarioId: x.x3, ministerioId: som, papel: "voluntario", status: "aprovado" })
      .returning();
    await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m3.id, funcaoId: mesa, status: "desejada" });

    for (const [k, dia] of [["a", "05"], ["b", "12"], ["c", "19"], ["d", "26"]] as const) {
      ev[k] = await evento("Culto", `2099-04-${dia}T22:00:00Z`, `2099-04-${dia}T23:59:00Z`);
    }
    itens.a = await escalaCom(ev.a, "rascunho", [null, null, x.x4]);
    itens.b = await escalaCom(ev.b, "publicada", [null]);
    itens.c = await escalaCom(ev.c, "rascunho", [null, null]);
    itens.d = await escalaCom(ev.d, "rascunho", [null, null]);
  });

  it("preenche N vagas só com função aprovada, respeita mesmo culto, limite e publicada", async () => {
    const r = await sugerirMes(db, lider, som, "2099-04", new Date("2099-03-15T00:00:00Z"));
    expect(r.total).toBe(6);
    expect(r.preenchidos).toHaveLength(5);
    expect(r.semCandidato).toEqual([{ eventoId: ev.d, funcaoId: mesa, data: "2099-04-26" }]);

    // Manual fica; x4 já está no culto A, então as 2 vagas vão para x1 e x2.
    expect(await Promise.all(itens.a.map(doItem))).toEqual([x.x1, x.x2, x.x4]);
    expect(await doItem(itens.b[0])).toBeNull();
    expect(await Promise.all(itens.c.map(doItem))).toEqual([x.x1, x.x2]);
    // x1 e x2 atingiram o limite (2): só x4 serve no dia 26; x3 (desejada) nunca entra.
    expect(await Promise.all(itens.d.map(doItem))).toEqual([x.x4, null]);
  });

  it("rodar de novo não sobrescreve nada já preenchido", async () => {
    const r = await sugerirMes(db, lider, som, "2099-04", new Date("2099-03-15T00:00:00Z"));
    expect(r.preenchidos).toEqual([]);
    expect(await doItem(itens.a[2])).toBe(x.x4);
  });

  it("desfazer limpa só o que a sugestão preencheu e ninguém mexeu depois", async () => {
    // Refaz a partir do estado limpo para ter os ids da sugestão.
    for (const id of [...itens.a.slice(0, 2), ...itens.c, itens.d[0]]) {
      await db.update(schema.escalaItens).set({ usuarioId: null }).where(eq(schema.escalaItens.id, id));
    }
    const r = await sugerirMes(db, lider, som, "2099-04", new Date("2099-03-15T00:00:00Z"));
    expect(r.preenchidos).toHaveLength(5);

    // Outro líder não desfaz.
    expect(await desfazerSugestao(db, outroLider, r.preenchidos, r.usuarios)).toBe(0);

    // O líder trocou a pessoa de uma vaga depois da sugestão: essa fica.
    await db.update(schema.escalaItens).set({ usuarioId: x.x3 }).where(eq(schema.escalaItens.id, itens.c[0]));
    expect(await desfazerSugestao(db, lider, r.preenchidos, r.usuarios)).toBe(4);
    expect(await Promise.all(itens.a.map(doItem))).toEqual([null, null, x.x4]);
    expect(await Promise.all(itens.c.map(doItem))).toEqual([x.x3, null]);
    expect(await Promise.all(itens.d.map(doItem))).toEqual([null, null]);
  });

  it("desfazer não mexe em escala publicada", async () => {
    await db.update(schema.escalaItens).set({ usuarioId: x.x1 }).where(eq(schema.escalaItens.id, itens.b[0]));
    expect(await desfazerSugestao(db, lider, [itens.b[0]])).toBe(0);
    expect(await doItem(itens.b[0])).toBe(x.x1);
  });
});
