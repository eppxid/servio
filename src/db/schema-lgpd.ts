import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { igrejas, usuarios } from "./schema";

/** Registro dos pedidos do titular (LGPD art. 18): quem pediu, quem fez e quando. */
export const lgpdRegistros = pgTable(
  "lgpd_registros",
  {
    id: serial("id").primaryKey(),
    igrejaId: integer("igreja_id").notNull().references(() => igrejas.id),
    usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
    feitoPor: integer("feito_por").notNull().references(() => usuarios.id),
    acao: text("acao").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lgpd_registros_usuario").on(t.usuarioId)],
);
