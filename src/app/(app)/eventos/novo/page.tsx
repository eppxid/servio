import { exigirPapel } from "@/lib/auth";
import { criarEvento } from "../acoes";
import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

export default async function NovoEvento({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await exigirPapel("admin");
  const { erro } = await searchParams;
  return (
    <div className="tela">
      <Cabecalho eyebrow="Modo líder" titulo="Novo evento">
        <Link href="/lider/cultos" className="tbtn">
          ← Cultos
        </Link>
      </Cabecalho>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      <form action={criarEvento} className="space-y-4">
        <label className="rotulo">
          Título
          <input name="titulo" required maxLength={120} className="campo" />
        </label>
        <label className="rotulo">
          Data (do primeiro culto)
          <input name="data" type="date" required className="campo" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="rotulo">
            Início
            <input name="horaInicio" type="time" required className="campo" />
          </label>
          <label className="rotulo">
            Fim (opcional)
            <input name="horaFim" type="time" className="campo" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="repetir" type="checkbox" className="caixa size-5" /> Repetir toda semana
        </label>
        <label className="rotulo">
          Repetir até (opcional)
          <input name="ate" type="date" className="campo" />
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Salvar
        </button>
      </form>
    </div>
  );
}
