import { exigirPapel } from "@/lib/auth";
import { criarEvento } from "../acoes";

export const dynamic = "force-dynamic";

export default async function NovoEvento({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await exigirPapel("admin");
  const { erro } = await searchParams;
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">Novo evento</h1>
      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      <form action={criarEvento} className="space-y-4">
        <label className="block space-y-1 text-sm">
          Título
          <input name="titulo" required maxLength={120} className="campo" />
        </label>
        <label className="block space-y-1 text-sm">
          Data (do primeiro culto)
          <input name="data" type="date" required className="campo" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            Início
            <input name="horaInicio" type="time" required className="campo" />
          </label>
          <label className="block space-y-1 text-sm">
            Fim (opcional)
            <input name="horaFim" type="time" className="campo" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="repetir" type="checkbox" /> Repetir toda semana
        </label>
        <label className="block space-y-1 text-sm">
          Repetir até (opcional)
          <input name="ate" type="date" className="campo" />
        </label>
        <button type="submit" className="botao">
          Salvar
        </button>
      </form>
    </main>
  );
}
