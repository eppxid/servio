import { describe, expect, it } from "vitest";
import { gradeDoMes, nomeDoDia, nomeDoMes, somarMes } from "./calendario-grade";
import { modoDoCaminho } from "./modo-comum";

describe("gradeDoMes", () => {
  it("novembro/2026 começa num domingo e ocupa 5 semanas", () => {
    const g = gradeDoMes("2026-11");
    expect(g).toHaveLength(35);
    expect(g[0]).toEqual({ iso: "2026-11-01", dia: 1, foraDoMes: false });
    expect(g[29]).toEqual({ iso: "2026-11-30", dia: 30, foraDoMes: false });
    expect(g[30]).toEqual({ iso: "2026-12-01", dia: 1, foraDoMes: true });
  });

  it("completa a primeira semana com o mês anterior", () => {
    const g = gradeDoMes("2026-12"); // 1º/12/2026 é terça
    expect(g.slice(0, 3).map((c) => c.iso)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
    expect(g[0].foraDoMes).toBe(true);
    expect(g.length % 7).toBe(0);
  });

  it("fevereiro que cabe em 4 semanas e mês que pede 6", () => {
    expect(gradeDoMes("2026-02")).toHaveLength(28);
    expect(gradeDoMes("2026-08")).toHaveLength(42);
  });
});

describe("mês e rótulos", () => {
  it("soma meses atravessando o ano", () => {
    expect(somarMes("2026-12", 1)).toBe("2027-01");
    expect(somarMes("2026-01", -1)).toBe("2025-12");
  });
  it("nomes em português", () => {
    expect(nomeDoMes("2026-11")).toBe("Novembro 2026");
    expect(nomeDoDia("2026-11-08")).toBe("domingo, 8 de novembro");
  });
});

describe("modoDoCaminho", () => {
  it("quem não lidera fica sempre no modo voluntário", () => {
    expect(modoDoCaminho("/lider/cultos", "lider", false)).toBe("voluntario");
  });
  it("a rota decide quando pertence a um modo; nas demais vale a escolha salva", () => {
    expect(modoDoCaminho("/painel", "voluntario", true)).toBe("lider");
    expect(modoDoCaminho("/lider/equipe", "voluntario", true)).toBe("lider");
    expect(modoDoCaminho("/eventos/novo", "lider", true)).toBe("lider");
    expect(modoDoCaminho("/chat/3", "lider", true)).toBe("lider");
    expect(modoDoCaminho("/agenda", "lider", true)).toBe("voluntario");
    expect(modoDoCaminho("/escalas", "lider", true)).toBe("lider");
    expect(modoDoCaminho("/ministerios", "voluntario", true)).toBe("voluntario");
    expect(modoDoCaminho("/liderados", "voluntario", true)).toBe("voluntario");
  });
});
