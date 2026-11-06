import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// Em globalThis: bundles separados (ação, página, dev com recarga) dividem a mesma conexão.
const global = globalThis as unknown as { __servioDb?: Db };

export function db(): Db {
  let instancia = global.__servioDb;
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    instancia = global.__servioDb = drizzle(postgres(url, { prepare: false }), { schema });
  }
  return instancia;
}
