"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Abas } from "../abas";
import { Marca } from "../Marca";
import { definirModo } from "./modo";
import { INICIO_DO_MODO, modoDoCaminho, type Modo } from "./modo-comum";

/** Topo (marca, chave "Modo líder", avatar) e abas do modo atual. */
export function Casca({
  ehLider,
  modoSalvo,
  iniciais,
}: {
  ehLider: boolean;
  modoSalvo: Modo;
  iniciais: string;
}) {
  const caminho = usePathname();
  const modo = modoDoCaminho(caminho, modoSalvo, ehLider);
  const lider = modo === "lider";

  return (
    <>
      <Abas modo={modo} />
      <header className="top">
        <Marca href={INICIO_DO_MODO[modo]} />
        <div className="top__end">
          {ehLider && (
            <form action={definirModo}>
              <input type="hidden" name="modo" value={lider ? "voluntario" : "lider"} />
              <button type="submit" role="switch" aria-checked={lider} aria-label="Modo líder" className={`modo${lider ? " is-on" : ""}`}>
                Líder
                <i aria-hidden="true" />
              </button>
            </form>
          )}
          <Link href="/perfil" className="avatar top__avatar" aria-label="Perfil">
            {iniciais}
          </Link>
        </div>
      </header>
    </>
  );
}
