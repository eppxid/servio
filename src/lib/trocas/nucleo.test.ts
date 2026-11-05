import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { gerarTokenAgenda, icsDoToken, revogarTokenAgenda } from "./ics";
import {
  ErroTroca,
  agendaDoUsuario,
  decidirTroca,
  definirTrocaAutomatica,
  fazerCheckin,
  listarSubstitutos,
  pedirTroca,
  presencaDaEscala,
  responderEscala,
  responderTroca,
} from "./nucleo";

let db: AnyDb;
let igrejaId: number;
let ministerioId: number;
let vocal: number;
let lider: Ator;
let ana: Ator;
let bia: Ator;
let caio: Ator;
let dani: Ator;
let eva: Ator;
let estranho: Ator;

const HORA = 60 * 60 * 1000;
const base = new Date("2030-05-05T13:00:00Z");

async function usuario(nome: string, papelGlobal: Ator["papelGlobal"] = "voluntario", igreja = igrejaId) {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId: igreja, nome, email: `${nome}@x.com`, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId: igreja, papelGlobal } as Ator;
}

async function membro(u: Ator, papel: "lider" | "voluntario", comFuncao: boolean) {
  const [m] = await db
    .insert(schema.membrosMinisterio)
    .values({ igrejaId, usuarioId: u.id, ministerioId, papel, status: "aprovado" })
    .returning();
  if (comFuncao) await db.insert(schema.membroFuncoes).values({ igrejaId, membroId: m.id, funcaoId: vocal });
}

/** Evento + escala publicada com `titular` no Vocal; devolve o id do item. */
async function escalar(titular: Ator, inicio: Date, fim: Date | null = new Date(inicio.getTime() + 2 * HORA)) {
  const [e] = await db.insert(schema.eventos).values({ igrejaId, titulo: "Culto", inicio, fim }).returning();
  const [esc] = await db
    .insert(schema.escalas)
    .values({ igrejaId, eventoId: e.id, ministerioId, status: "publicada" })
    .returning();
  const [item] = await db
    .insert(schema.escalaItens)
    .values({ igrejaId, escalaId: esc.id, funcaoId: vocal, usuarioId: titular.id })
    .returning();
  return { itemId: item.id, eventoId: e.id };
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
  const [{ id: outraIgreja }] = await db.insert(schema.igrejas).values({ nome: "Outra" }).returning();
  [{ id: ministerioId }] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  [{ id: vocal }] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId, nome: "Vocal" }).returning();
  lider = await usuario("lider");
  ana = await usuario("ana");
  bia = await usuario("bia");
  caio = await usuario("caio");
  dani = await usuario("dani");
  eva = await usuario("eva");
  estranho = await usuario("estranho", "voluntario", outraIgreja);
  await membro(lider, "lider", false);
  for (const v of [ana, bia, caio, dani]) await membro(v, "voluntario", true);
  await membro(eva, "voluntario", false); // sem a função Vocal
});

describe("check-in", () => {
  it("recusa fora da janela e aceita dentro dela", async () => {
    const { itemId } = await escalar(ana, new Date("2030-06-01T13:00:00Z"));
    const inicio = new Date("2030-06-01T13:00:00Z");
    await expect(fazerCheckin(db, ana, itemId, new Date(inicio.getTime() - 3 * HORA))).rejects.toThrow(ErroTroca);
    await expect(fazerCheckin(db, ana, itemId, new Date(inicio.getTime() + 3 * HORA))).rejects.toThrow(ErroTroca);
    const cedo = new Date(inicio.getTime() - 2 * HORA + 1000);
    await fazerCheckin(db, ana, itemId, cedo);
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, itemId));
    expect(item.checkinEm?.getTime()).toBe(cedo.getTime());
    expect(item.status).toBe("confirmado");
  });

  it("não deixa outro usuário nem outra igreja fazer check-in", async () => {
    const { itemId } = await escalar(ana, new Date("2030-06-08T13:00:00Z"));
    const durante = new Date("2030-06-08T14:00:00Z");
    await expect(fazerCheckin(db, bia, itemId, durante)).rejects.toThrow(ErroAcesso);
    await expect(fazerCheckin(db, estranho, itemId, durante)).rejects.toThrow(ErroAcesso);
  });

  it("recusado não faz check-in", async () => {
    const { itemId } = await escalar(ana, new Date("2030-06-15T13:00:00Z"));
    await responderEscala(db, ana, itemId, false);
    await expect(fazerCheckin(db, ana, itemId, new Date("2030-06-15T13:30:00Z"))).rejects.toThrow(ErroTroca);
  });

  it("guarda quando recusou (mantém a primeira data) e limpa ao aceitar", async () => {
    const { itemId } = await escalar(ana, new Date("2030-06-22T13:00:00Z"));
    const ler = async () =>
      (await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, itemId)))[0].recusadoEm;
    await responderEscala(db, ana, itemId, false);
    const primeira = await ler();
    expect(primeira).toBeInstanceOf(Date);
    await responderEscala(db, ana, itemId, false);
    expect((await ler())?.getTime()).toBe(primeira?.getTime());
    await responderEscala(db, ana, itemId, true);
    expect(await ler()).toBeNull();
  });
});

describe("agenda", () => {
  it("lista as escalas do usuário com colegas só pelo nome", async () => {
    const { itemId } = await escalar(dani, new Date("2030-07-01T13:00:00Z"));
    const agenda = await agendaDoUsuario(db, dani, new Date("2030-06-30T00:00:00Z"));
    expect(agenda.map((a) => a.itemId)).toContain(itemId);
    expect(await agendaDoUsuario(db, estranho, new Date("2030-06-30T00:00:00Z"))).toEqual([]);
  });
});

describe("troca", () => {
  it("só lista substitutos elegíveis (mesma função, disponível, sem conflito)", async () => {
    const { itemId, eventoId } = await escalar(ana, base);
    // bia indisponível no dia
    await db.insert(schema.indisponibilidades).values({
      igrejaId,
      usuarioId: bia.id,
      dataInicio: "2030-05-05",
      dataFim: "2030-05-05",
    });
    // caio já escalado em outro evento no mesmo horário
    await escalar(caio, new Date(base.getTime() + HORA));
    const nomes = (await listarSubstitutos(db, ana, itemId)).map((s) => s.usuarioId);
    expect(nomes).toContain(dani.id);
    expect(nomes).not.toContain(bia.id);
    expect(nomes).not.toContain(caio.id);
    expect(nomes).not.toContain(eva.id); // sem a função
    expect(nomes).not.toContain(ana.id);
    expect(nomes).not.toContain(estranho.id);
    await expect(pedirTroca(db, ana, itemId, bia.id)).rejects.toThrow(ErroTroca);
    await expect(pedirTroca(db, bia, itemId, dani.id)).rejects.toThrow(ErroAcesso);
    expect(eventoId).toBeGreaterThan(0);
  });

  it("troca aprovada pelo líder muda o usuário do item", async () => {
    const { itemId } = await escalar(ana, new Date("2030-08-03T13:00:00Z"));
    await pedirTroca(db, ana, itemId, dani.id);
    await expect(pedirTroca(db, ana, itemId, dani.id)).rejects.toThrow(ErroTroca);
    const [troca] = await db.select().from(schema.trocas).where(eq(schema.trocas.escalaItemId, itemId));
    await expect(responderTroca(db, bia, troca.id, true)).rejects.toThrow(ErroAcesso);
    await expect(decidirTroca(db, lider, troca.id, true)).rejects.toThrow(ErroTroca); // substituto ainda não aceitou
    await responderTroca(db, dani, troca.id, true);
    await expect(decidirTroca(db, ana, troca.id, true)).rejects.toThrow(ErroAcesso); // voluntário não aprova
    await expect(decidirTroca(db, estranho, troca.id, true)).rejects.toThrow(ErroAcesso);
    await decidirTroca(db, lider, troca.id, true);
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, itemId));
    expect(item.usuarioId).toBe(dani.id);
    expect(item.status).toBe("pendente");
    const [final] = await db.select().from(schema.trocas).where(eq(schema.trocas.id, troca.id));
    expect(final.status).toBe("aprovada");
  });

  it("aprovação automática do ministério efetiva ao aceitar", async () => {
    await expect(definirTrocaAutomatica(db, ana, ministerioId, true)).rejects.toThrow(ErroAcesso);
    await definirTrocaAutomatica(db, lider, ministerioId, true);
    const { itemId } = await escalar(ana, new Date("2030-09-07T13:00:00Z"));
    await pedirTroca(db, ana, itemId, bia.id);
    const [troca] = await db.select().from(schema.trocas).where(eq(schema.trocas.escalaItemId, itemId));
    await responderTroca(db, bia, troca.id, true);
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, itemId));
    expect(item.usuarioId).toBe(bia.id);
    await definirTrocaAutomatica(db, lider, ministerioId, false);
  });

  it("substituto recusa e o item fica com o titular", async () => {
    const { itemId } = await escalar(ana, new Date("2030-10-05T13:00:00Z"));
    await pedirTroca(db, ana, itemId, caio.id);
    const [troca] = await db.select().from(schema.trocas).where(eq(schema.trocas.escalaItemId, itemId));
    await responderTroca(db, caio, troca.id, false);
    const [item] = await db.select().from(schema.escalaItens).where(eq(schema.escalaItens.id, itemId));
    expect(item.usuarioId).toBe(ana.id);
  });
});

describe("presença e calendário", () => {
  it("só o líder vê a presença", async () => {
    const { eventoId } = await escalar(ana, new Date("2030-11-02T13:00:00Z"));
    const linhas = await presencaDaEscala(db, lider, eventoId, ministerioId);
    expect(linhas[0].nome).toBe("ana");
    await expect(presencaDaEscala(db, ana, eventoId, ministerioId)).rejects.toThrow(ErroAcesso);
    await expect(presencaDaEscala(db, estranho, eventoId, ministerioId)).rejects.toThrow(ErroAcesso);
  });

  it("gera .ics pelo token e invalida ao revogar", async () => {
    const token = await gerarTokenAgenda(db, ana, new Date("2030-11-01T00:00:00Z"));
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const ics = await icsDoToken(db, token, new Date("2030-11-01T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Culto - Vocal");
    expect(await icsDoToken(db, token, new Date("2032-01-01T00:00:00Z"))).toBeNull();
    expect(await icsDoToken(db, "zz")).toBeNull();
    await revogarTokenAgenda(db, ana);
    expect(await icsDoToken(db, token, new Date("2030-11-01T00:00:00Z"))).toBeNull();
  });
});
