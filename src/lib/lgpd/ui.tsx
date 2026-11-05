import Link from "next/link";
import { TEXTO_CONSENTIMENTO } from "./termos";

/** Rodapé com a política e os termos (páginas públicas). */
export function RodapeLegal() {
  return (
    <footer className="pt-2 text-center text-xs text-muted">
      <Link href="/privacidade" className="link">
        Política de privacidade
      </Link>
      {" · "}
      <Link href="/termos" className="link">
        Termos de uso
      </Link>
    </footer>
  );
}

/** Checkbox de consentimento: desmarcado, obrigatório e destacado (LGPD art. 11 I). */
export function CampoConsentimento() {
  return (
    <label className="alerta alerta--warn flex items-start gap-3 font-medium">
      <input type="checkbox" name="consentimento" value="sim" required className="caixa mt-1 h-5 w-5 shrink-0" />
      <span>
        {TEXTO_CONSENTIMENTO} Li a{" "}
        <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="link">
          política de privacidade
        </Link>{" "}
        e os{" "}
        <Link href="/termos" target="_blank" rel="noopener noreferrer" className="link">
          termos de uso
        </Link>
        .
      </span>
    </label>
  );
}
