import { expect, type Page } from "@playwright/test";

/** Cria o ministério na aba Ministérios, uma função e o convite. Devolve o id e o link do convite. */
export async function criarMinisterioComConvite(admin: Page, nome: string, funcao: string) {
  await admin.goto("/lider/equipe?aba=ministerios");
  await admin.getByLabel("Nome do novo ministério").fill(nome);
  await admin.getByRole("button", { name: "Criar ministério" }).click();
  await expect(admin.locator("summary", { hasText: nome })).toBeVisible();
  await selecionarMinisterio(admin, nome);
  await admin.getByRole("link", { name: "Funções", exact: true }).click();
  await admin.getByLabel("Nova função").fill(funcao);
  await admin.getByRole("button", { name: "Adicionar" }).click();
  await expect(admin.getByLabel(`Nome da função ${funcao}`)).toBeVisible();
  const id = Number(new URL(admin.url()).searchParams.get("ministerio"));
  await admin.getByRole("link", { name: "Membros", exact: true }).click();
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  await expect(admin).toHaveURL(/convite=[0-9a-f]{64}/);
  const link = await admin.getByLabel("Link do convite").inputValue();
  return { id, link: new URL(link).pathname };
}

/** Escolhe o ministério na barra da Equipe (a barra só aparece com 2 ou mais). */
export async function selecionarMinisterio(pagina: Page, nome: string) {
  const barra = pagina.getByRole("navigation", { name: "Ministério", exact: true });
  if (await barra.count()) await barra.getByRole("link", { name: nome, exact: true }).click();
}

/** Aprova a entrada pedida (aba Pedidos) e abre a aba Membros. */
export async function aprovarEntrada(pagina: Page, ministerioId: number, pessoa: string) {
  await pagina.goto(`/lider/equipe?ministerio=${ministerioId}&aba=pedidos`);
  await pagina.getByRole("button", { name: `Aprovar entrada de ${pessoa}` }).click();
  await pagina.goto(`/lider/equipe?ministerio=${ministerioId}&aba=membros`);
}

/** Marca funções do membro na folha da aba Membros. */
export async function darFuncoes(pagina: Page, pessoa: string, funcoes: string[]) {
  await pagina.getByRole("button", { name: new RegExp(pessoa) }).click();
  for (const f of funcoes) await pagina.getByLabel(f, { exact: true }).check();
  await pagina.getByRole("button", { name: "Salvar funções" }).click();
  await expect(pagina.getByRole("button", { name: new RegExp(pessoa) })).toContainText(funcoes[0]);
}

/** Admin define a pessoa como líder do ministério (aba Ministérios). */
export async function tornarLider(admin: Page, ministerio: string, pessoa: string) {
  await admin.goto("/lider/equipe?aba=ministerios");
  await admin.locator("summary", { hasText: ministerio }).click();
  await admin.getByLabel(`Pessoa de ${ministerio}`).selectOption({ label: pessoa });
  await admin.getByLabel(`Papel em ${ministerio}`).selectOption({ label: "Líder" });
  await admin.getByRole("button", { name: "Definir papel" }).click();
}
