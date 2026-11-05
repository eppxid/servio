import { agradecer } from "@/app/(app)/reconhecimento/acoes";

/** Botão "Agradecer" do líder: abre o formulário de agradecimento a um membro. */
export default function BotaoAgradecer({
  ministerioId,
  membroId,
  nome,
}: {
  ministerioId: number;
  membroId: number;
  nome: string;
}) {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer px-3 py-2 text-blue-700">Agradecer</summary>
      <form action={agradecer} className="space-y-2">
        <input type="hidden" name="ministerio" value={ministerioId} />
        <input type="hidden" name="membro" value={membroId} />
        <label className="block space-y-1 text-sm">
          Agradecimento para {nome}
          <textarea name="texto" required maxLength={280} rows={3} className="campo" />
        </label>
        <button type="submit" className="botao">
          Enviar agradecimento
        </button>
      </form>
    </details>
  );
}
