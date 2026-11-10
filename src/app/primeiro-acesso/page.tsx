import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { igrejas, usuarios } from "@/db/schema";
import { SENHA_MINIMA, hashSenha, normalizarEmail } from "@/lib/auth-core";
import { abrirSessao } from "@/lib/lgpd/sessao";
import { TERMOS_VERSAO, consentiu } from "@/lib/lgpd/termos";
import { Publica } from "@/components/Publica";
import { CampoConsentimento, RodapeLegal } from "@/lib/lgpd/ui";
import { validar } from "@/lib/validar";

export const dynamic = "force-dynamic";

const esquema = z.object({
  igreja: z.string().trim().min(2).max(120),
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  senha: z.string().min(SENHA_MINIMA).max(200),
});

async function criar(formData: FormData) {
  "use server";
  const v = validar(esquema, formData);
  if (!v.ok) redirect("/primeiro-acesso?erro=1");
  if (!consentiu(formData.get("consentimento"))) redirect("/primeiro-acesso?erro=consentimento");
  const agora = new Date();
  const banco = db();
  const senhaHash = await hashSenha(v.dados.senha);

  // Só cria quando ainda não existe igreja; a transação evita duas criações concorrentes.
  const usuario = await banco.transaction(async (tx) => {
    const [existe] = await tx.select({ id: igrejas.id }).from(igrejas).limit(1);
    if (existe) return null;
    const [igreja] = await tx.insert(igrejas).values({ nome: v.dados.igreja }).returning();
    const [novo] = await tx
      .insert(usuarios)
      .values({
        igrejaId: igreja.id,
        nome: v.dados.nome,
        email: normalizarEmail(v.dados.email),
        senhaHash,
        papelGlobal: "admin",
        consentimentoEm: agora,
        termosVersao: TERMOS_VERSAO,
      })
      .returning();
    return novo;
  });
  if (!usuario) redirect("/entrar");

  await abrirSessao(usuario);
  redirect("/lider/configurar");
}

export default async function PrimeiroAcesso({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const [existe] = await db().select({ id: igrejas.id }).from(igrejas).limit(1);
  if (existe) redirect("/entrar");
  const { erro } = await searchParams;

  return (
    <Publica>
      <h1 className="title">Primeiro acesso</h1>
      <p className="text-sm text-muted">Cria a igreja e o administrador.</p>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro === "consentimento"
            ? "Marque a autorização de tratamento de dados para continuar."
            : `Confira os campos. A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`}
        </p>
      )}
      <form action={criar} className="space-y-4">
        <label className="rotulo">
          Nome da igreja
          <input name="igreja" required minLength={2} maxLength={120} className="campo" />
        </label>
        <label className="rotulo">
          Seu nome
          <input name="nome" required minLength={2} maxLength={120} autoComplete="name" className="campo" />
        </label>
        <label className="rotulo">
          E-mail
          <input name="email" type="email" required autoComplete="email" autoCapitalize="none" className="campo" />
        </label>
        <label className="rotulo">
          Senha
          <input
            name="senha"
            type="password"
            required
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            className="campo"
          />
        </label>
        <CampoConsentimento />
        <button type="submit" className="btn btn--primary btn--block">
          Criar
        </button>
      </form>
      <RodapeLegal />
    </Publica>
  );
}
