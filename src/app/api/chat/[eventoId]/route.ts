import { NextResponse } from "next/server";
import { db } from "@/db";
import { usuarioAtual } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ErroChat, enviarMensagem, listarMensagens } from "@/lib/chat/nucleo";
import { ErroAcesso } from "@/lib/ministerios/nucleo";
import { idSeguro } from "@/lib/ministerios/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventoId: string }> };

function erro(e: unknown) {
  if (e instanceof ErroAcesso) return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  if (e instanceof ErroChat) return NextResponse.json({ erro: e.message }, { status: 400 });
  throw e;
}

export async function GET(req: Request, { params }: Ctx) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const eventoId = idSeguro((await params).eventoId);
  const depoisTxt = new URL(req.url).searchParams.get("depois");
  const depois = depoisTxt ? new Date(depoisTxt) : undefined;
  if (depois && Number.isNaN(depois.getTime())) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }
  try {
    return NextResponse.json({
      mensagens: await listarMensagens(db() as unknown as AnyDb, usuario, eventoId, depois),
    });
  } catch (e) {
    return erro(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const usuario = await usuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const eventoId = idSeguro((await params).eventoId);
  const corpo = (await req.json().catch(() => null)) as { texto?: unknown; aviso?: unknown } | null;
  if (typeof corpo?.texto !== "string") {
    return NextResponse.json({ erro: "Texto obrigatório" }, { status: 400 });
  }
  try {
    const m = await enviarMensagem(
      db() as unknown as AnyDb,
      usuario,
      eventoId,
      corpo.texto,
      corpo.aviso === true,
    );
    return NextResponse.json({ id: m.id }, { status: 201 });
  } catch (e) {
    return erro(e);
  }
}
