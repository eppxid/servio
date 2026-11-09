import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const URL_BANCO = `postgres://postgres:postgres@127.0.0.1:${process.env.PG_LOCAL_PORT ?? "54329"}/postgres?max=1`;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** O PGlite aceita uma conexão só: espera o app soltar a dele (idle_timeout=1) antes de abrir a do teste. */
async function comBanco<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  await new Promise((r) => setTimeout(r, 2500));
  const sql = postgres(URL_BANCO, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Última da ordem alfabética: reaproveita a igreja que já existe (ou cria uma) e gera o link
 * pessoal direto no banco, porque a tela do líder para convidar é de outra tarefa.
 */
test("link pessoal: 1º uso, reabertura, aparelho novo aguarda o líder e revogação derruba a sessão", async ({ browser }) => {
  const token = randomBytes(32).toString("hex");
  await comBanco(async (sql) => {
    let [igreja] = await sql`select id from igrejas limit 1`;
    igreja ??= (await sql`insert into igrejas (nome) values ('Igreja Acesso E2E') returning id`)[0];
    const [lider] = await sql`
      insert into usuarios (igreja_id, nome, email, papel_global) values (${igreja.id}, 'Lider Acesso', 'lider-acesso@e2e.local', 'lider')
      returning id`;
    const [min] = await sql`insert into ministerios (igreja_id, nome) values (${igreja.id}, 'Louvor Acesso') returning id`;
    await sql`
      insert into convites_pessoais (igreja_id, ministerio_id, nome, sobrenome, token_hash, criado_por, expira_em)
      values (${igreja.id}, ${min.id}, 'Maria', 'Souza', ${sha(token)}, ${lider.id}, now() + interval '14 days')`;
  });
  const link = `/acesso/${token}`;

  // Janela A: 1º uso exige o consentimento e termina na tela de boas-vindas.
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto(link);
  await expect(a.getByRole("heading", { name: "Olá, Maria!" })).toBeVisible();
  await a.getByRole("checkbox").check();
  await a.getByRole("button", { name: "Entrar" }).click();
  await expect(a.getByRole("heading", { name: "Tudo certo!" })).toBeVisible();
  await a.getByRole("link", { name: "Continuar" }).click();
  await expect(a).toHaveURL(/\/perfil\/servir/);

  // Só o cookie de sessão some: o cookie do aparelho reabre a sessão sem pergunta.
  const cookies = await ctxA.cookies();
  expect(cookies.map((c) => c.name)).toContain("servio_aparelho");
  await ctxA.clearCookies({ name: "escala_sessao" });
  await a.goto("/inicio");
  await expect(a).toHaveURL(/\/inicio/);
  await ctxA.clearCookies({ name: "escala_sessao" });
  await a.goto(link);
  await expect(a).toHaveURL(/\/inicio/);

  // Janela B (aparelho novo): pergunta e fica esperando.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(link);
  await expect(b.getByRole("heading", { name: "Você é Maria Souza?" })).toBeVisible();
  await b.getByRole("button", { name: "Sim, sou eu" }).click();
  await expect(b.getByRole("heading", { name: "Aguardando o líder" })).toBeVisible();

  // Líder aprova (no banco, como `decidirPedido` faz): B entra sozinho, em até 5 s.
  await comBanco(async (sql) => {
    const [p] = await sql`
      select p.id, p.igreja_id, p.aparelho_token_hash, p.rotulo, c.usuario_id
      from pedidos_acesso p join convites_pessoais c on c.id = p.convite_id
      where c.token_hash = ${sha(token)} and p.status = 'pendente'`;
    await sql`update pedidos_acesso set status = 'aprovado', decidido_em = now() where id = ${p.id}`;
    await sql`
      insert into aparelhos (igreja_id, usuario_id, token_hash, rotulo)
      values (${p.igreja_id}, ${p.usuario_id}, ${p.aparelho_token_hash}, ${p.rotulo})`;
  });
  await expect(b).toHaveURL(/\/inicio/, { timeout: 15_000 });

  // Revogar o aparelho de B: a próxima navegação cai em /entrar.
  await comBanco(async (sql) => {
    await sql`
      update aparelhos set revogado_em = now()
      where id = (select max(a.id) from aparelhos a join convites_pessoais c on c.usuario_id = a.usuario_id where c.token_hash = ${sha(token)})`;
  });
  await b.goto("/agenda");
  await expect(b).toHaveURL(/\/entrar/);

  // Link inexistente.
  await b.goto(`/acesso/${"0".repeat(64)}`);
  await expect(b.getByText("Peça um novo ao líder.")).toBeVisible();
});
