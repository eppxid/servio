import { Abas } from "@/components/abas";
import { BotaoTema } from "@/components/BotaoTema";
import { Marca } from "@/components/Marca";
import { db } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { ministeriosDoLider } from "@/lib/escala/nucleo";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  // Mesma regra do painel: administradores e líderes de algum ministério.
  const temPainel = (await ministeriosDoLider(db() as unknown as AnyDb, usuario)).length > 0;
  return (
    <div className="app">
      <Abas temPainel={temPainel} />
      <header className="top">
        <Marca href="/agenda" />
        <div className="top__end">
          <BotaoTema />
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
