import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { igrejas, ministerios, usuarios } from "./schema";

export const reconhecimentos = pgTable(
  "reconhecimentos",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    ministerioId: integer("ministerio_id").notNull().references(() => ministerios.id),
    deUsuario: integer("de_usuario").notNull().references(() => usuarios.id),
    paraUsuario: integer("para_usuario").notNull().references(() => usuarios.id),
    texto: text("texto").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reconhecimentos_para").on(t.paraUsuario, t.criadoEm)],
);
