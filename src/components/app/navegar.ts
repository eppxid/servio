import { ABAS } from "../abas";

/** Direção da troca de tela; o CSS lê em `html[data-nav]` (kit.css). */
export type TipoNav = "aba-dir" | "aba-esq" | "frente" | "tras" | "troca";

const LIMITE_MS = 1000;
let pendente: { fim: () => void; finalizada: Promise<void> } | null = null;

function reduzido() {
  return document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const podeAnimar = () => typeof document.startViewTransition === "function" && !reduzido();

const dentro = (caminho: string, raiz: string) => caminho === raiz || caminho.startsWith(raiz + "/");

function posicaoDaAba(caminho: string) {
  for (const modo of ["voluntario", "lider"] as const) {
    const i = ABAS[modo].findIndex((a) => dentro(caminho, a.href));
    if (i >= 0) return { modo, i };
  }
  return null;
}

/** Decide o movimento pela relação entre os dois caminhos (pathname, sem query). */
export function tipoDaNavegacao(de: string, para: string): TipoNav {
  if (para.startsWith(de + "/")) return "frente";
  if (de.startsWith(para + "/")) return "tras";
  const a = posicaoDaAba(de);
  const b = posicaoDaAba(para);
  if (a && b && a.modo === b.modo) return a.i === b.i ? "frente" : b.i > a.i ? "aba-dir" : "aba-esq";
  return "troca";
}

/**
 * Roda `acao` (que dispara a navegação) dentro de uma View Transition. A transição só captura o "depois"
 * quando `chegou()` é chamado (troca de pathname) ou passa o limite. Sem suporte ou com movimento reduzido, só executa.
 */
export function transicao(tipo: TipoNav, acao: () => void) {
  if (!podeAnimar() || pendente) return acao();
  const html = document.documentElement;
  html.dataset.nav = tipo;
  let fim!: () => void;
  const chegada = new Promise<void>((r) => (fim = r));
  const t = document.startViewTransition(() => {
    acao();
    // O limite evita deixar a tela congelada se a rota redirecionar para o mesmo caminho.
    setTimeout(fim, LIMITE_MS);
    return chegada;
  });
  const finalizada = t.finished.then(
    () => {},
    () => {},
  );
  pendente = { fim, finalizada };
  void finalizada.then(() => {
    delete html.dataset.nav;
    pendente = null;
  });
}

export function navegar(router: { push(href: string): void }, destino: string, tipo: TipoNav) {
  transicao(tipo, () => router.push(destino));
}

/** O novo caminho já está no DOM: libera a transição pendente. Devolve a promessa do fim dela, ou null se não havia. */
export function chegou() {
  const p = pendente;
  if (!p) return null;
  p.fim();
  return p.finalizada;
}
