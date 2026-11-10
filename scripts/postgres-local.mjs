// Postgres local sem instalar nada: PGlite exposto por socket TCP.
// Uso: node scripts/postgres-local.mjs  (porta 54329; DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres)
// O PGlite atende uma conexão por vez. Um proxy na porta pública enfileira (FIFO) os clientes
// em vez de recusar: quem chega com outra conexão aberta espera a anterior fechar.
import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PG_LOCAL_PORT ?? 54329);
const portaInterna = port + 1;
const db = await PGlite.create(process.env.PG_LOCAL_DIR);
const interno = new PGLiteSocketServer({ db, port: portaInterna, host: "127.0.0.1", maxConnections: 1 });
await interno.start();

const fila = [];
let ocupado = false;

function proximo() {
  if (ocupado || fila.length === 0) return;
  const cliente = fila.shift();
  if (cliente.destroyed) return proximo();
  ocupado = true;
  const liberar = () => {
    if (!ocupado) return;
    ocupado = false;
    // Dá tempo ao servidor interno de soltar a conexão antes da próxima.
    setTimeout(proximo, 20);
  };
  conectar(cliente, liberar, 0);
}

function conectar(cliente, liberar, tentativa) {
  const upstream = net.connect(portaInterna, "127.0.0.1");
  let ligado = false;
  upstream.once("connect", () => {
    ligado = true;
    cliente.pipe(upstream);
    upstream.pipe(cliente);
    cliente.resume();
  });
  upstream.on("error", (e) => {
    if (!ligado && tentativa < 50) return setTimeout(() => conectar(cliente, liberar, tentativa + 1), 50);
    cliente.destroy(e);
  });
  upstream.on("close", () => {
    cliente.destroy();
    liberar();
  });
  cliente.on("close", () => upstream.destroy());
  cliente.on("error", () => upstream.destroy());
}

const proxy = net.createServer((cliente) => {
  cliente.pause();
  fila.push(cliente);
  proximo();
});
await new Promise((ok) => proxy.listen(port, "127.0.0.1", ok));
console.log(`Postgres local em 127.0.0.1:${port}`);

async function parar() {
  proxy.close();
  await interno.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
