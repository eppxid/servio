import Link from "next/link";
import { TEXTO_CONSENTIMENTO } from "./termos";

/** Rodapé com a política e os termos (páginas públicas). */
export function RodapeLegal() {
  return (
    <footer className="pt-6 text-center text-xs text-slate-500">
      <Link href="/privacidade" className="underline">
        Política de privacidade
      </Link>
      {" · "}
      <Link href="/termos" className="underline">
        Termos de uso
      </Link>
    </footer>
  );
}

/** Checkbox de consentimento: desmarcado, obrigatório e destacado (LGPD art. 11 I). */
export function CampoConsentimento() {
  return (
    <label className="flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-medium">
      <input type="checkbox" name="consentimento" value="sim" required className="mt-1 h-5 w-5 shrink-0" />
      <span>
        {TEXTO_CONSENTIMENTO} Li a{" "}
        <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
          política de privacidade
        </Link>{" "}
        e os{" "}
        <Link href="/termos" target="_blank" rel="noopener noreferrer" className="underline">
          termos de uso
        </Link>
        .
      </span>
    </label>
  );
}
