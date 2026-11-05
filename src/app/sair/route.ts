import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";

export async function POST(req: Request) {
  const s = await sessao();
  s.destroy();
  return NextResponse.redirect(new URL("/entrar", req.url), 303);
}
