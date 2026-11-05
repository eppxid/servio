import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let instancia: Db | undefined;

export function db(): Db {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    instancia = drizzle(postgres(url, { prepare: false }), { schema });
  }
  return instancia;
}
