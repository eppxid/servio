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
      <summary className="btn btn--sm btn--ghost cursor-pointer text-primary">Agradecer</summary>
      <form action={agradecer} className="mt-2 space-y-2">
        <input type="hidden" name="ministerio" value={ministerioId} />
        <input type="hidden" name="membro" value={membroId} />
        <label className="rotulo">
          Agradecimento para {nome}
          <textarea name="texto" required maxLength={280} rows={3} className="campo" />
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Enviar agradecimento
        </button>
      </form>
    </details>
  );
}
