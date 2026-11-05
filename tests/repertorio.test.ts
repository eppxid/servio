import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { ErroAcesso, type Ator } from "@/lib/ministerios/nucleo";
import { idFaixaDeezer, idFaixaSpotify, urlBusca, urlEmbed, validarLink } from "@/lib/repertorio/links";
import {
  copiarRepertorio,
  ErroRepertorio,
  excluirMusica,
  incluirMusica,
  linksDoEvento,
  listarRepertorio,
  moverMusica,
} from "@/lib/repertorio/nucleo";

describe("links do repertório", () => {
  it("recusa domínio fora da lista e protocolo inseguro", () => {
    expect(validarLink("spotify", "https://evil.com/track/1").ok).toBe(false);
    expect(validarLink("spotify", "https://open.spotify.com.evil.com/track/1").ok).toBe(false);
    expect(validarLink("spotify", "http://open.spotify.com/track/1").ok).toBe(false);
    expect(validarLink("deezer", "https://open.spotify.com/track/1").ok).toBe(false);
    expect(validarLink("cifra", "javascript:alert(1)").ok).toBe(false);
    expect(validarLink("cifra", "https://user:x@www.cifraclub.com.br/a/b/").ok).toBe(false);
  });

  it("aceita os domínios permitidos e vazio", () => {
    expect(validarLink("spotify", "https://open.spotify.com/track/abc123").ok).toBe(true);
    expect(validarLink("deezer", "https://link.deezer.com/s/abc").ok).toBe(true);
    expect(validarLink("deezer", "https://www.deezer.com/br/track/42").ok).toBe(true);
    expect(validarLink("cifra", "https://www.cifraclub.com.br/hillsong/oceanos/").ok).toBe(true);
    expect(validarLink("cifra", "  ")).toEqual({ ok: true, url: null });
  });

  it("extrai o id da faixa do Spotify e do Deezer", () => {
    expect(idFaixaSpotify("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")).toBe("4uLU6hMCjMI75M1A2tKUQC");
    expect(idFaixaSpotify("https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC")).toBe("4uLU6hMCjMI75M1A2tKUQC");
    expect(idFaixaSpotify("https://open.spotify.com/album/abc")).toBeNull();
    expect(idFaixaSpotify("https://evil.com/track/abc")).toBeNull();
    expect(idFaixaDeezer("https://www.deezer.com/br/track/3135556")).toBe("3135556");
    expect(idFaixaDeezer("https://www.deezer.com/track/3135556")).toBe("3135556");
    expect(idFaixaDeezer("https://link.deezer.com/s/abc")).toBeNull();
    expect(idFaixaDeezer("https://www.deezer.com/br/album/1")).toBeNull();
    expect(urlEmbed("spotify", "https://open.spotify.com/track/abc")).toBe("https://open.spotify.com/embed/track/abc");
    expect(urlEmbed("deezer", "https://www.deezer.com/track/9")).toBe("https://widget.deezer.com/widget/auto/track/9");
  });

  it("monta a URL de busca", () => {
    expect(urlBusca("spotify", "Oceanos", "Hillsong")).toBe("https://open.spotify.com/search/Oceanos%20Hillsong");
    expect(urlBusca("deezer", "Oceanos", null)).toBe("https://www.deezer.com/search/Oceanos");
    expect(urlBusca("cifra", "Oceanos", "Hillsong")).toBe("https://www.cifraclub.com.br/?q=Oceanos+Hillsong");
  });
});

let db: AnyDb;
let igrejaId: number;
let eventoId: number;
let eventoAnterior: number;
let ministerioId: number;
let escalado: Ator;
let foraDaEscala: Ator;
let lider: Ator;
let liderOutro: Ator;
let admin: Ator;
let outraIgreja: Ator;

async function usuario(igreja: number, email: string, papelGlobal: Ator["papelGlobal"] = "voluntario") {
  const [u] = await db
    .insert(schema.usuarios)
    .values({ igrejaId: igreja, nome: email.split("@")[0], email, senhaHash: "x", papelGlobal })
    .returning();
  return { id: u.id, igrejaId: igreja, papelGlobal } as Ator;
}

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  [{ id: igrejaId }] = await db.insert(schema.igrejas).values({ nome: "A" }).returning();
  const [{ id: igrejaB }] = await db.insert(schema.igrejas).values({ nome: "B" }).returning();
  escalado = await usuario(igrejaId, "escalado@x.com");
  foraDaEscala = await usuario(igrejaId, "fora@x.com");
  lider = await usuario(igrejaId, "lider@x.com");
  liderOutro = await usuario(igrejaId, "lider2@x.com");
  admin = await usuario(igrejaId, "admin@x.com", "admin");
  outraIgreja = await usuario(igrejaB, "b@x.com", "admin");

  const [louvor] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Louvor" }).returning();
  const [midia] = await db.insert(schema.ministerios).values({ igrejaId, nome: "Mídia" }).returning();
  ministerioId = louvor.id;
  const [vocal] = await db.insert(schema.funcoes).values({ igrejaId, ministerioId, nome: "Vocal" }).returning();
  await db.insert(schema.membrosMinisterio).values([
    { igrejaId, usuarioId: lider.id, ministerioId, papel: "lider", status: "aprovado" },
    { igrejaId, usuarioId: liderOutro.id, ministerioId: midia.id, papel: "lider", status: "aprovado" },
  ]);
  const [ev0] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto anterior", inicio: new Date("2026-11-29T22:00:00Z") })
    .returning();
  const [ev] = await db
    .insert(schema.eventos)
    .values({ igrejaId, titulo: "Culto", inicio: new Date("2026-12-06T22:00:00Z") })
    .returning();
  eventoAnterior = ev0.id;
  eventoId = ev.id;
  await db.insert(schema.escalas).values({ igrejaId, eventoId: ev0.id, ministerioId, status: "publicada" });
  const [escala] = await db
    .insert(schema.escalas)
    .values({ igrejaId, eventoId, ministerioId, status: "publicada" })
    .returning();
  await db.insert(schema.escalaItens).values({ igrejaId, escalaId: escala.id, funcaoId: vocal.id, usuarioId: escalado.id });
});

describe("repertório do evento", () => {
  it("voluntário fora da escala recebe 403; líder de outro ministério e outra igreja também", async () => {
    await expect(listarRepertorio(db, foraDaEscala, eventoId, ministerioId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(listarRepertorio(db, liderOutro, eventoId, ministerioId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(listarRepertorio(db, outraIgreja, eventoId, ministerioId)).rejects.toBeInstanceOf(ErroAcesso);
    await expect(incluirMusica(db, foraDaEscala, eventoId, ministerioId, { titulo: "X" })).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("escalado só lê; líder e admin editam", async () => {
    await incluirMusica(db, lider, eventoId, ministerioId, {
      titulo: "Oceanos",
      artista: "Hillsong",
      tom: "D",
      linkSpotify: "https://open.spotify.com/track/abc",
    });
    await incluirMusica(db, admin, eventoId, ministerioId, { titulo: "Grande é o Senhor" });
    const lido = await listarRepertorio(db, escalado, eventoId, ministerioId);
    expect(lido.lider).toBe(false);
    expect(lido.itens.map((i) => i.titulo)).toEqual(["Oceanos", "Grande é o Senhor"]);
    await expect(incluirMusica(db, escalado, eventoId, ministerioId, { titulo: "Y" })).rejects.toBeInstanceOf(ErroAcesso);
    await expect(moverMusica(db, escalado, eventoId, ministerioId, lido.itens[0].id, "descer")).rejects.toBeInstanceOf(ErroAcesso);
  });

  it("recusa link de domínio fora da lista ao salvar", async () => {
    await expect(
      incluirMusica(db, lider, eventoId, ministerioId, { titulo: "Z", linkDeezer: "https://evil.com/track/1" }),
    ).rejects.toBeInstanceOf(ErroRepertorio);
  });

  it("reordena com setas e renumera ao excluir", async () => {
    let { itens } = await listarRepertorio(db, lider, eventoId, ministerioId);
    await moverMusica(db, lider, eventoId, ministerioId, itens[1].id, "subir");
    ({ itens } = await listarRepertorio(db, lider, eventoId, ministerioId));
    expect(itens.map((i) => i.titulo)).toEqual(["Grande é o Senhor", "Oceanos"]);
    await excluirMusica(db, lider, eventoId, ministerioId, itens[0].id);
    ({ itens } = await listarRepertorio(db, lider, eventoId, ministerioId));
    expect(itens.map((i) => [i.titulo, i.ordem])).toEqual([["Oceanos", 1]]);
  });

  it("copia de outro evento do mesmo ministério", async () => {
    await incluirMusica(db, lider, eventoAnterior, ministerioId, { titulo: "Antiga" });
    const n = await copiarRepertorio(db, lider, eventoId, ministerioId, eventoAnterior);
    expect(n).toBe(1);
    const { itens } = await listarRepertorio(db, lider, eventoId, ministerioId);
    expect(itens.map((i) => i.titulo)).toEqual(["Oceanos", "Antiga"]);
    await expect(copiarRepertorio(db, lider, eventoId, ministerioId, eventoId)).rejects.toBeInstanceOf(ErroRepertorio);
  });

  it("link do evento aparece só para quem tem acesso", async () => {
    expect((await linksDoEvento(db, escalado, eventoId)).map((l) => l.ministerio)).toEqual(["Louvor"]);
    expect(await linksDoEvento(db, foraDaEscala, eventoId)).toEqual([]);
  });
});
