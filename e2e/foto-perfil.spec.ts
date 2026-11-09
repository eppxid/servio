import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Roda depois de fluxo-principal (ordem alfabética): o voluntário já existe no banco.
const SENHA = "senha-e2e-12345";
const PRINTS = process.env.PRINTS_DIR ?? "E:\\Devs\\Servio-teste-foto";

// PNG 8×4 vermelho, montado na hora: o recorte quadrado central e o WebP do navegador cuidam do resto.
function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function bloco(tipo: string, dados: Buffer) {
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}
function criarPng(l: number, a: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(a, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(l * 3, 0).map((_, i) => (i % 3 === 0 ? 200 : 40))]);
  const bruto = Buffer.concat(Array.from({ length: a }, () => linha));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(bruto)),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = criarPng(8, 4);

test("perfil: envia foto, vê a prévia, salva e remove (390×844)", async ({ browser }) => {
  mkdirSync(PRINTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto("/entrar");
  await p.getByLabel("E-mail").fill("voluntario@e2e.local");
  await p.getByLabel("Senha", { exact: true }).fill(SENHA);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL(/\/(inicio|agenda)/);

  // Sem foto: a tela "Onde quero servir" mostra o atalho.
  await p.goto("/perfil/servir");
  await expect(p.getByRole("link", { name: "Adicionar foto" })).toBeVisible();
  await p.getByRole("link", { name: "Adicionar foto" }).click();
  await expect(p).toHaveURL(/\/perfil#foto/);

  await p.getByTestId("foto-arquivo").setInputFiles({ name: "teste.png", mimeType: "image/png", buffer: PNG });
  await expect(p.getByAltText("Prévia da nova foto")).toBeVisible();
  await p.screenshot({ path: `${PRINTS}/01-previa.png` });

  await p.getByRole("button", { name: "Salvar foto" }).click();
  await expect(p.getByText("Foto salva")).toBeVisible();
  const foto = p.getByTestId("foto-previa");
  await expect(foto).toHaveAttribute("src", /\/api\/foto\/\d+\?v=\d+/);
  await p.screenshot({ path: `${PRINTS}/02-salva.png` });

  // A rota entrega WebP para quem está logado e 404 para quem não está.
  const url = (await foto.getAttribute("src"))!;
  const resp = await p.request.get(url);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toBe("image/webp");
  const anonimo = await (await browser.newContext()).request.get(new URL(url, p.url()).toString());
  expect(anonimo.status()).toBe(404);

  await p.getByRole("button", { name: "Remover foto" }).click();
  await expect(p.getByText("Foto removida")).toBeVisible();
  await expect(p.getByRole("button", { name: "Remover foto" })).toHaveCount(0);
  await ctx.close();
});
