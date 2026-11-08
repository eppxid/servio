import { cookies } from "next/headers";
import { Casca } from "@/components/app/Casca";
import { COOKIE_MODO, lerModo } from "@/components/app/modo-comum";
import "@/components/app/app.css";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";

export const dynamic = "force-dynamic";

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  // Modo líder: administradores e líderes de algum ministério (mesma regra do painel).
  const ehLider = (await ministeriosDoLider(db() as unknown as AnyDb, usuario)).length > 0;
  const modoSalvo = lerModo((await cookies()).get(COOKIE_MODO)?.value);
  return (
    <div className="app">
      <Casca
        ehLider={ehLider}
        modoSalvo={modoSalvo}
        iniciais={iniciais(usuario.nome)}
      />
      <main className="main">{children}</main>
    </div>
  );
}
