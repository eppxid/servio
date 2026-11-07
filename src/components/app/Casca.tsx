"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Abas } from "../abas";
import { Marca } from "../Marca";
import { FolhaInferior } from "./FolhaInferior";
import { IconeApp, type NomeIcone } from "./icones";
import { definirModo } from "./modo";
import { INICIO_DO_MODO, modoDoCaminho, type Modo } from "./modo-comum";

/** Telas antigas que ainda não têm substituto nas abas novas. */
const MAIS: { href: string; rotulo: string; icone: NomeIcone; soAdmin?: boolean; soLider?: boolean }[] = [
  { href: "/agenda/trocas", rotulo: "Trocas", icone: "escalar", soLider: true },
  { href: "/ministerios", rotulo: "Ministérios", icone: "ministerios" },
  { href: "/eventos", rotulo: "Eventos", icone: "agenda", soAdmin: true },
  { href: "/reconhecimento", rotulo: "Reconhecimento", icone: "pontos" },
];

const TEMAS = [
  { valor: "light", rotulo: "Claro" },
  { valor: "dark", rotulo: "Escuro" },
  { valor: "system", rotulo: "Sistema" },
];

/** Topo (marca, chave "Modo líder", menu Mais, avatar) e abas do modo atual. */
export function Casca({
  ehLider,
  ehAdmin,
  modoSalvo,
  iniciais,
}: {
  ehLider: boolean;
  ehAdmin: boolean;
  modoSalvo: Modo;
  iniciais: string;
}) {
  const caminho = usePathname();
  const modo = modoDoCaminho(caminho, modoSalvo, ehLider);
  const [mais, setMais] = useState(false);
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
          <button type="button" className="btn btn--icon btn--ghost" aria-label="Mais opções" onClick={() => setMais(true)}>
            <IconeApp nome="mais" />
          </button>
          <Link href="/perfil" className="avatar top__avatar" aria-label="Perfil">
            {iniciais}
          </Link>
        </div>
      </header>
      <FolhaInferior aberta={mais} aoFechar={() => setMais(false)} titulo="Mais">
        <nav aria-label="Mais telas" className="lista-mais">
          {MAIS.filter((m) => (!m.soAdmin || ehAdmin) && (!m.soLider || ehLider)).map((m) => (
            <Link key={m.href} href={m.href} className="row" onClick={() => setMais(false)}>
              <span className="row__ic">
                <IconeApp nome={m.icone} />
              </span>
              <span className="row__tx">
                <b>{m.rotulo}</b>
              </span>
              <span className="row__end">
                <IconeApp nome="dir" />
              </span>
            </Link>
          ))}
        </nav>
        <div className="tema-opcoes" role="group" aria-label="Tema">
          <IconeApp nome="tema" />
          {TEMAS.map((t) => (
            <button
              key={t.valor}
              type="button"
              className="tbtn"
              onClick={(e) => window.motion?.theme(t.valor, e.currentTarget)}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
      </FolhaInferior>
    </>
  );
}
