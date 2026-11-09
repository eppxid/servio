import { cookies } from "next/headers";
import { Casca } from "@/components/app/Casca";
import { COOKIE_MODO, lerModo } from "@/components/app/modo-comum";
import "@/components/app/app.css";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";
import { versoesDeFoto } from "@/lib/foto/nucleo";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  // Modo líder: administradores e líderes de algum ministério (mesma regra do painel).
  const banco = db() as unknown as AnyDb;
  const [meus, fotos] = await Promise.all([ministeriosDoLider(banco, usuario), versoesDeFoto(banco, [usuario.id])]);
  const ehLider = meus.length > 0;
  const modoSalvo = lerModo((await cookies()).get(COOKIE_MODO)?.value);
  return (
    <div className="app">
      <Casca
        ehLider={ehLider}
        modoSalvo={modoSalvo}
        nome={usuario.nome}
        usuarioId={usuario.id}
        fotoVersao={fotos.get(usuario.id)}
      />
      <main className="main">{children}</main>
    </div>
  );
}
