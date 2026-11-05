import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { escalas, igrejas, usuarios } from "./schema";

export const repertorioItens = pgTable(
  "repertorio_itens",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    escalaId: integer("escala_id").notNull().references(() => escalas.id),
    ordem: integer("ordem").notNull(),
    titulo: text("titulo").notNull(),
    artista: text("artista"),
    tom: text("tom"),
    linkSpotify: text("link_spotify"),
    linkDeezer: text("link_deezer"),
    linkCifra: text("link_cifra"),
    observacao: text("observacao"),
    criadoPor: integer("criado_por").references(() => usuarios.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("repertorio_escala").on(t.escalaId, t.ordem)],
);
