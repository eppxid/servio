import { Abas } from "@/components/abas";
import { exigirUsuario } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  await exigirUsuario();
  return (
    <div className="mx-auto max-w-xl px-4 pb-20 pt-6">
      <main>{children}</main>
      <Abas />
    </div>
  );
}
