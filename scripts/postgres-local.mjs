// Postgres local sem instalar nada: PGlite exposto por socket TCP.
// Uso: node scripts/postgres-local.mjs  (porta 54329; DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres)
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PG_LOCAL_PORT ?? 54329);
const db = await PGlite.create(process.env.PG_LOCAL_DIR);
const servidor = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 1 });
await servidor.start();
console.log(`Postgres local em 127.0.0.1:${port}`);

async function parar() {
  await servidor.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
