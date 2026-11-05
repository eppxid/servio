import type { z } from "zod";

export type Validado<T> =
  | { ok: true; dados: T }
  | { ok: false; erros: Record<string, string> };

/** Valida um FormData com zod no servidor; devolve só a primeira mensagem por campo. */
export function validar<S extends z.ZodType>(schema: S, formData: FormData): Validado<z.output<S>> {
  const bruto: Record<string, FormDataEntryValue> = {};
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("$ACTION")) bruto[chave] = valor;
  }
  const r = schema.safeParse(bruto);
  if (r.success) return { ok: true, dados: r.data };
  const erros: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const campo = String(issue.path[0] ?? "form");
    erros[campo] ??= issue.message;
  }
  return { ok: false, erros };
}
