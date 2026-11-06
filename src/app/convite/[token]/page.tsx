import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { funcoes } from "@/db/schema";
import { SENHA_MINIMA } from "@/lib/auth-core";
import { usuarioAtual } from "@/lib/auth";
import { abrirSessao } from "@/lib/lgpd/sessao";
import { consentiu } from "@/lib/lgpd/termos";
import { Publica } from "@/components/Publica";
import { CampoConsentimento, RodapeLegal } from "@/lib/lgpd/ui";
import type { AnyDb } from "@/lib/auth-core";
import { aceitarConvite, cadastrarPorConvite, conviteValido } from "@/lib/ministerios/nucleo";
import { pedirParaServir } from "@/lib/servir/nucleo";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

const esquema = z.object({
  token: z.string().regex(TOKEN),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  telefone: z.string().trim().max(30).optional(),
  senha: z.string().min(SENHA_MINIMA).max(200),
});

function caminho(token: string, consulta: string) {
  return TOKEN.test(token) ? `/convite/${token}?${consulta}` : "/entrar";
}

async function cadastrar(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const v = validar(esquema, formData);
  if (!v.ok) redirect(caminho(token, "erro=1"));
  const r = await cadastrarPorConvite(db(), v.dados.token, {
    ...v.dados,
    consentimento: consentiu(formData.get("consentimento")),
  });
  if (!r.ok) redirect(caminho(token, `erro=${r.motivo}`));
  await abrirSessao(r.usuario);
  redirect(caminho(token, "conta=1"));
}

async function pedirEntrada(formData: FormData) {
  "use server";
  const usuario = await usuarioAtual();
  const token = String(formData.get("token") ?? "");
  if (!usuario) redirect("/entrar");
  const r = await aceitarConvite(db(), usuario, token);
  if (!r.ok) redirect(caminho(token, "erro=invalido"));
  const convite = await conviteValido(db(), token);
  if (!convite) redirect(caminho(token, "erro=invalido"));
  const ids = formData.getAll("funcoes").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  try {
    await pedirParaServir(db() as unknown as AnyDb, usuario, convite.ministerioId, ids);
  } catch {
    redirect(caminho(token, "erro=invalido"));
  }
  redirect(caminho(token, "ok=1"));
}

export default async function Convite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string; ok?: string; conta?: string }>;
}) {
  const { token } = await params;
  const { erro, ok, conta } = await searchParams;
  const convite = TOKEN.test(token) ? await conviteValido(db(), token) : null;

  if (!convite) {
    return (
      <Publica>
        <h1 className="title">Convite inválido</h1>
        <p className="text-sm text-muted">O link expirou ou não existe. Peça um novo ao líder.</p>
        <RodapeLegal />
      </Publica>
    );
  }

  if (ok) {
    return (
      <Publica>
        <h1 className="title">Pedido enviado</h1>
        <p className="text-sm text-muted">O líder de {convite.ministerio} vai aprovar sua entrada.</p>
        <Link href="/agenda" className="btn btn--primary btn--block">
          Abrir o app
        </Link>
      </Publica>
    );
  }

  const usuario = await usuarioAtual();
  const opcoes = await db()
    .select({ id: funcoes.id, nome: funcoes.nome })
    .from(funcoes)
    .where(eq(funcoes.ministerioId, convite.ministerioId))
    .orderBy(asc(funcoes.nome));
  const msg =
    erro === "email_em_uso"
      ? "Este e-mail já tem conta. Entre com ela."
      : erro === "sem_consentimento"
        ? "Marque a autorização de tratamento de dados para criar a conta."
        : erro
        ? `Confira os campos. A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`
        : null;

  return (
    <Publica>
      <h1 className="title">{conta ? "Escolha onde quer servir" : `Convite: ${convite.ministerio}`}</h1>
      {msg && (
        <p role="alert" className="alerta alerta--bad">
          {msg}
        </p>
      )}
      {usuario && usuario.igrejaId === convite.igrejaId ? (
        <form action={pedirEntrada} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-muted">
            {conta ? "Conta criada." : `Entrar como ${usuario.nome}.`} Escolha onde quer servir (pode pular).
          </p>
          {opcoes.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="rotulo">Funções que desejo</legend>
              {opcoes.map((f) => (
                <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="funcoes" value={f.id} className="caixa size-5" />
                  {f.nome}
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" className="btn btn--primary btn--block">Enviar pedido</button>
        </form>
      ) : (
        <>
          <form action={cadastrar} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <label className="rotulo">
              Nome
              <input name="nome" required minLength={2} maxLength={120} autoComplete="name" className="campo" />
            </label>
            <label className="rotulo">
              E-mail
              <input name="email" type="email" required autoComplete="email" className="campo" />
            </label>
            <label className="rotulo">
              Telefone (opcional)
              <input name="telefone" type="tel" maxLength={30} autoComplete="tel" className="campo" />
            </label>
            <label className="rotulo">
              Senha
              <input name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="campo" />
            </label>
            <CampoConsentimento />
            <button type="submit" className="btn btn--primary btn--block">Criar conta e pedir para entrar</button>
          </form>
          <p className="text-sm">
            Já tem conta?{" "}
            <Link href="/entrar" className="link">
              Entre
            </Link>{" "}
            e abra este link de novo.
          </p>
        </>
      )}
      <RodapeLegal />
    </Publica>
  );
}
