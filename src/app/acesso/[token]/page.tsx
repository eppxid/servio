import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { gravarAparelhoCookie, lerAparelhoCookie } from "@/lib/acesso/cookie";
import {
  aparelhoEhDoDono,
  lerConvitePessoal,
  pedirAcessoMesmaPessoa,
  pedirConviteOutraPessoa,
  rotuloDoAparelho,
  usarConvitePrimeiraVez,
} from "@/lib/acesso/nucleo";
import { usuarioAtual } from "@/lib/auth";
import { SENHA_MINIMA, type AnyDb } from "@/lib/auth-core";
import { abrirSessao, guardarAceitePendente } from "@/lib/lgpd/sessao";
import { aceiteEmDia, consentiu } from "@/lib/lgpd/termos";
import { CampoConsentimento, RodapeLegal } from "@/lib/lgpd/ui";
import { validar } from "@/lib/validar";
import { InstalarApp } from "@/components/InstalarApp";
import { Publica } from "@/components/Publica";
import { Aguardando } from "../Aguardando";
import { CopiarLink } from "../CopiarLink";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

const esquemaNome = z.object({
  token: z.string().regex(TOKEN),
  nome: z.string().trim().min(2).max(60),
  sobrenome: z.string().trim().min(2).max(60),
});

function caminho(token: string, consulta = "") {
  return TOKEN.test(token) ? `/acesso/${token}${consulta ? `?${consulta}` : ""}` : "/entrar";
}

async function rotulo() {
  return rotuloDoAparelho((await headers()).get("user-agent"));
}

async function entrar(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/entrar");
  const r = await usarConvitePrimeiraVez(db() as unknown as AnyDb, token, {
    consentimento: consentiu(formData.get("consentimento")),
    rotulo: await rotulo(),
    email: String(formData.get("email") ?? ""),
    senha: String(formData.get("senha") ?? ""),
  });
  if (!r.ok) {
    const erro = r.motivo === "sem_consentimento" ? "consentimento" : r.motivo === "invalido" || r.motivo === "ja_usado" ? "" : r.motivo;
    redirect(caminho(token, erro && `erro=${erro}`));
  }
  await gravarAparelhoCookie(r.aparelhoToken);
  if (!aceiteEmDia(r.usuario)) {
    await guardarAceitePendente(r.usuario, r.aparelhoId);
    redirect("/entrar/termos");
  }
  await abrirSessao(r.usuario, r.aparelhoId);
  redirect(caminho(token, "bemvindo=1"));
}

async function souEu(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/entrar");
  const r = await pedirAcessoMesmaPessoa(db() as unknown as AnyDb, token, await rotulo());
  if (!r.ok) redirect(caminho(token, r.motivo === "limite" ? "erro=limite" : ""));
  await gravarAparelhoCookie(r.aparelhoToken);
  redirect(caminho(token, `pedido=${r.pedidoId}`));
}

async function naoSou(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const v = validar(esquemaNome, formData);
  if (!v.ok) redirect(caminho(token, "nao=1&erro=nome"));
  const r = await pedirConviteOutraPessoa(db() as unknown as AnyDb, v.dados.token, {
    nome: v.dados.nome,
    sobrenome: v.dados.sobrenome,
    rotulo: await rotulo(),
  });
  if (!r.ok) redirect(caminho(token, r.motivo === "limite" ? "erro=limite" : ""));
  redirect(caminho(token, "enviado=1"));
}

function navegadorInterno(ua: string): "android" | "iphone" | null {
  const iphone = /iPhone|iPad|iPod/i.test(ua);
  if (/WhatsApp/i.test(ua)) return iphone ? "iphone" : "android";
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return "android";
  return null;
}

export default async function Acesso({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string; nao?: string; pedido?: string; enviado?: string; bemvindo?: string }>;
}) {
  const { token } = await params;
  const { erro, nao, pedido, enviado, bemvindo } = await searchParams;
  const banco = db() as unknown as AnyDb;
  const convite = TOKEN.test(token) ? await lerConvitePessoal(banco, token) : null;

  if (!convite) {
    return (
      <Publica>
        <h1 className="title">Link inválido</h1>
        <p className="text-sm text-muted">Peça um novo ao líder.</p>
        <RodapeLegal />
      </Publica>
    );
  }

  const interno = navegadorInterno((await headers()).get("user-agent") ?? "");
  if (interno) {
    return (
      <Publica>
        <h1 className="title">Abra em outro navegador</h1>
        <p className="text-sm">
          {interno === "iphone" ? "Toque em ⋯ → Abrir no Safari." : "Abra este link no Chrome: toque em ⋮ → Abrir no navegador."}
        </p>
        <p className="text-sm text-muted">O navegador do WhatsApp não guarda o seu acesso.</p>
        <CopiarLink />
        <RodapeLegal />
      </Publica>
    );
  }

  const cookie = await lerAparelhoCookie();
  const dono = convite.usado && cookie ? await aparelhoEhDoDono(banco, token, cookie) : false;

  if (dono) {
    if (bemvindo && (await usuarioAtual())) {
      return (
        <Publica>
          <h1 className="title">Tudo certo!</h1>
          <p className="text-sm text-muted">Você entrou no Servio.</p>
          <InstalarApp />
          <Link href="/perfil/servir" className="btn btn--primary btn--block">
            Continuar
          </Link>
        </Publica>
      );
    }
    // Server Component não grava cookie: o route handler abre a sessão.
    const atual = await usuarioAtual();
    redirect(atual && atual.id === convite.usuarioId ? "/inicio" : "/acesso/reentrar");
  }

  const msgErro = new Map([
    ["limite", "Muitos pedidos. Tente mais tarde."],
    ["consentimento", "Marque a autorização para entrar."],
    ["nome", "Digite nome e sobrenome (2 a 60 letras cada)."],
    ["email_invalido", "Digite um e-mail válido."],
    ["email_em_uso", "Este e-mail já está em uso."],
    ["senha_curta", `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.`],
  ]).get(erro ?? "");
  const alerta = msgErro && (
    <p role="alert" className="alerta alerta--bad">
      {msgErro}
    </p>
  );

  if (!convite.usado) {
    return (
      <Publica>
        <h1 className="title">Olá, {convite.nome}!</h1>
        {alerta}
        <InstalarApp />
        <form action={entrar} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          {convite.usuarioId === null && <CampoConsentimento />}
          {convite.usuarioId === null && convite.papel === "admin" && (
            <>
              <p className="text-sm">
                <b>Defina e-mail e senha de administrador.</b> Com eles você recupera o acesso se perder o aparelho.
              </p>
              <label className="rotulo">
                E-mail
                <input name="email" type="email" required maxLength={254} autoComplete="email" className="campo" />
              </label>
              <label className="rotulo">
                Senha
                <input name="senha" type="password" required minLength={SENHA_MINIMA} maxLength={200} autoComplete="new-password" className="campo" />
              </label>
            </>
          )}
          <button type="submit" className="btn btn--primary btn--block min-h-11">
            Entrar
          </button>
        </form>
        <RodapeLegal />
      </Publica>
    );
  }

  const pedidoId = Number(pedido);
  if (Number.isInteger(pedidoId) && pedidoId > 0) {
    return (
      <Publica>
        <h1 className="title">{convite.donoAdmin ? "Aguardando outro administrador" : "Aguardando o líder"}</h1>
        <Aguardando pedidoId={pedidoId} />
        {convite.donoAdmin && (
          <Link href="/entrar" className="btn btn--block min-h-11">
            Entrar com e-mail e senha
          </Link>
        )}
        <InstalarApp />
        <RodapeLegal />
      </Publica>
    );
  }

  if (enviado) {
    return (
      <Publica>
        <h1 className="title">Pedido enviado ao líder</h1>
        <p className="text-sm text-muted">Você vai receber um link novo.</p>
        <RodapeLegal />
      </Publica>
    );
  }

  if (nao) {
    return (
      <Publica>
        <h1 className="title">Quem é você?</h1>
        {alerta}
        <form action={naoSou} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <label className="rotulo">
            Nome
            <input name="nome" required minLength={2} maxLength={60} autoComplete="given-name" className="campo" />
          </label>
          <label className="rotulo">
            Sobrenome
            <input name="sobrenome" required minLength={2} maxLength={60} autoComplete="family-name" className="campo" />
          </label>
          <button type="submit" className="btn btn--primary btn--block min-h-11">
            Pedir convite
          </button>
        </form>
        <RodapeLegal />
      </Publica>
    );
  }

  return (
    <Publica>
      <h1 className="title">
        Você é {convite.nome} {convite.sobrenome}?
      </h1>
      {alerta}
      <form action={souEu} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn--primary btn--block min-h-11">
          Sim, sou eu
        </button>
      </form>
      <Link href={caminho(token, "nao=1")} className="btn btn--block min-h-11">
        Não sou
      </Link>
      <RodapeLegal />
    </Publica>
  );
}
