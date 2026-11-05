import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { hashSenha, type AnyDb } from "@/lib/auth-core";
import { ErroAcesso, criarFuncao, criarMinisterio, definirLider, type Ator } from "@/lib/ministerios/nucleo";
import {
  calcularIndicadores,
  escalasPorVoluntario,
  presencaPorMes,
  taxaPresenca,
  vagasAbertas,
  type ItemLinha,
} from "./calculo";
import { carregarPainel } from "./consulta";
import { gerarCsv } from "./csv";

const AGORA = new Date("2026-11-04T15:00:00Z");

function item(p: Partial<ItemLinha>): ItemLinha {
  return {
    escalaStatus: "publicada",
    eventoInicio: new Date("2026-10-04T13:00:00Z"),
    funcaoNome: "Vocal",
    ministerioNome: "Louvor",
    usuarioId: 1,
    usuarioNome: "Ana",
    status: "confirmado",
    checkinEm: null,
    ...p,
  };
}

describe("cálculo", () => {
  it("taxa de presença ignora evento futuro", () => {
    const itens = [
      item({ checkinEm: new Date("2026-10-04T12:50:00Z") }),
      item({ usuarioId: 2 }),
      item({ eventoInicio: new Date("2026-11-10T13:00:00Z") }),
    ];
    expect(taxaPresenca(itens, AGORA)).toBe(0.5);
    expect(taxaPresenca([item({ eventoInicio: new Date("2026-11-10T13:00:00Z") })], AGORA)).toBe(0);
    expect(presencaPorMes(itens, AGORA)).toEqual([{ mes: "2026-10", confirmados: 2, presentes: 1 }]);
  });

  it("período vazio devolve zero sem dividir por zero", () => {
    const i = calcularIndicadores({ itens: [], escalas: [], trocas: [], voluntarios: [] }, AGORA);
    expect(i).toEqual({
      escalasPublicadas: 0,
      taxaConfirmacao: 0,
      taxaPresenca: 0,
      trocasPedidas: 0,
      trocasAprovadas: 0,
      voluntariosAprovados: 0,
      voluntariosSemEscala: 0,
    });
    expect(escalasPorVoluntario([], AGORA)).toEqual([]);
    expect(vagasAbertas([], AGORA)).toEqual([]);
  });

  it("conta trocas, confirmação e voluntários sem escala há mais de 60 dias", () => {
    const i = calcularIndicadores(
      {
        itens: [item({}), item({ usuarioId: 2, status: "pendente" }), item({ escalaStatus: "rascunho" })],
        escalas: [{ status: "publicada" }, { status: "rascunho" }],
        trocas: [{ status: "aprovada" }, { status: "aberta" }],
        voluntarios: [
          { usuarioId: 1, nome: "Ana", ultimaEscala: new Date("2026-10-04T13:00:00Z") },
          { usuarioId: 2, nome: "Bia", ultimaEscala: new Date("2026-08-01T13:00:00Z") },
          { usuarioId: 3, nome: "Caio", ultimaEscala: null },
        ],
      },
      AGORA,
    );
    expect(i.escalasPublicadas).toBe(1);
    expect(i.taxaConfirmacao).toBe(0.5);
    expect([i.trocasPedidas, i.trocasAprovadas]).toEqual([2, 1]);
    expect([i.voluntariosAprovados, i.voluntariosSemEscala]).toEqual([3, 2]);
  });

  it("ordena escalas por voluntário e lista vagas dos próximos 30 dias", () => {
    const itens = [item({}), item({}), item({ usuarioId: 2, usuarioNome: "Bia", status: "recusado" })];
    expect(escalasPorVoluntario(itens, AGORA).map((l) => [l.nome, l.total, l.recusas])).toEqual([
      ["Ana", 2, 0],
      ["Bia", 1, 1],
    ]);
    const vagas = vagasAbertas(
      [
        item({ usuarioId: null, usuarioNome: null, eventoInicio: new Date("2026-11-20T13:00:00Z") }),
        item({ usuarioId: null, usuarioNome: null, eventoInicio: new Date("2026-12-20T13:00:00Z") }),
      ],
      AGORA,
    );
    expect(vagas).toHaveLength(1);
  });

  it("CSV usa ; , BOM e neutraliza fórmula", () => {
    const csv = gerarCsv(["Nome", "N"], [["=1+1", 2], ["A;B", 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=1+1;2");
    expect(csv).toContain('"A;B";3');
  });
});

describe("acesso ao painel", () => {
  let db: AnyDb;
  let admin: Ator;
  let lider: Ator;
  let outroLider: Ator;
  let voluntario: Ator;
  let louvor: number;
  let midia: number;

  async function usuario(igrejaId: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
    const [u] = await db
      .insert(schema.usuarios)
      .values({ igrejaId, nome: email, email, senhaHash: await hashSenha("senha-12345"), papelGlobal })
      .returning();
    return { id: u.id, igrejaId, papelGlobal } as Ator;
  }

  beforeAll(async () => {
    const pg = drizzle(new PGlite(), { schema });
    await migrate(pg, { migrationsFolder: "./drizzle" });
    db = pg as unknown as AnyDb;
    const [igreja] = await db.insert(schema.igrejas).values({ nome: "Teste" }).returning();
    admin = await usuario(igreja.id, "admin@x.com", "admin");
    lider = await usuario(igreja.id, "lider@x.com");
    outroLider = await usuario(igreja.id, "lider2@x.com");
    voluntario = await usuario(igreja.id, "vol@x.com");
    louvor = (await criarMinisterio(db, admin, "Louvor")).id;
    midia = (await criarMinisterio(db, admin, "Mídia")).id;
    await definirLider(db, admin, louvor, lider.id, true);
    await definirLider(db, admin, midia, outroLider.id, true);
    await criarFuncao(db, lider, louvor, "Vocal");
    await criarFuncao(db, outroLider, midia, "Câmera");

    const [ev] = await db
      .insert(schema.eventos)
      .values({ igrejaId: igreja.id, titulo: "Culto", inicio: new Date("2026-10-04T13:00:00Z") })
      .returning();
    for (const [min, nome] of [[louvor, "Vocal"], [midia, "Câmera"]] as const) {
      const [esc] = await db
        .insert(schema.escalas)
        .values({ igrejaId: igreja.id, eventoId: ev.id, ministerioId: min, status: "publicada" })
        .returning();
      const funcoes = await db.select().from(schema.funcoes);
      const f = funcoes.find((x) => x.nome === nome)!;
      await db.insert(schema.escalaItens).values({
        igrejaId: igreja.id,
        escalaId: esc.id,
        funcaoId: f.id,
        usuarioId: voluntario.id,
        status: "confirmado",
        checkinEm: new Date("2026-10-04T12:55:00Z"),
      });
    }
  });

  it("líder vê só o ministério dele; admin vê todos", async () => {
    const p = await carregarPainel(db, lider, { de: "2026-09-01", ate: "2026-11-04" }, AGORA);
    expect(p.ministerios.map((m) => m.id)).toEqual([louvor]);
    expect(p.indicadores.escalasPublicadas).toBe(1);
    const a = await carregarPainel(db, admin, { de: "2026-09-01", ate: "2026-11-04" }, AGORA);
    expect(a.indicadores.escalasPublicadas).toBe(2);
    expect(a.indicadores.taxaPresenca).toBe(1);
  });

  it("líder não vê ministério de outro líder", async () => {
    await expect(carregarPainel(db, lider, { ministerioId: midia }, AGORA)).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("voluntário recebe acesso negado", async () => {
    await expect(carregarPainel(db, voluntario, {}, AGORA)).rejects.toBeInstanceOf(ErroAcesso);
  });
});
