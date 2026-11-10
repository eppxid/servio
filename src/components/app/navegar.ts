import { use, useEffect, useRef } from "react";
import { ABAS } from "../abas";

/** Entrada em cascata: opacidade e subida de 8 px, 35 ms entre itens; do 8º em diante entram juntos. */
export function cascata(itens: Element[]) {
  if (itens.length > 0) window.motion?.enter(itens, { stagger: 35, y: 8, ms: 360, max: 8 });
}

/** Blocos de uma tela na ordem do DOM, a partir de `desde`; uma lista (`.list`) entra linha a linha. */
export function itensDaTela(tela: Element, desde = 0): Element[] {
  const itens: Element[] = [];
  for (const bloco of [...tela.children].slice(desde)) {
    if (bloco.classList.contains("list")) itens.push(...bloco.children);
    else if (bloco.querySelector(":scope > .list")) {
      for (const filho of bloco.children) filho.classList.contains("list") ? itens.push(...filho.children) : itens.push(filho);
    } else itens.push(bloco);
  }
  return itens;
}

/** A `.tela` dentro do `main` (ou o primeiro filho dele, nas telas sem `.tela`). */
export const telaDo = (main: Element) => main.querySelector(":scope > .tela") ?? main.firstElementChild ?? main;

/** Filtro dentro da tela: quando `chave` muda, as linhas do contêiner do `ref` entram em cascata (a montagem não conta). */
export function useCascata<T extends Element>(chave: unknown) {
  const ref = useRef<T>(null);
  const montou = useRef(false);
  useEffect(() => {
    if (!montou.current) {
      montou.current = true;
      return;
    }
    if (ref.current) cascata([...ref.current.children]);
  }, [chave]);
  return ref;
}

/** Direção da troca de tela; o CSS lê em `html[data-nav]` (kit.css). */
export type TipoNav = "aba-dir" | "aba-esq" | "frente" | "tras" | "troca";

/** Depois que a transição começa: tempo máximo até a tela nova entrar no DOM (`chegou()`). */
const LIMITE_MS = 1000;
/** Pedido sem tela nova nesse tempo (redirect para o mesmo caminho, erro) é descartado. */
const LIMITE_PEDIDO_MS = 8000;

type Pedido = {
  tipo: TipoNav;
  /** Pathname que estava na tela quando o pedido nasceu; a transição só começa quando o React renderiza outro. */
  de: string;
  /** Segura o commit do React até o navegador capturar a tela antiga. */
  portao: Promise<void>;
  abrir: () => void;
  aberto: boolean;
  fim: () => void;
  finalizada: Promise<void> | null;
  validade: ReturnType<typeof setTimeout>;
};
let pendente: Pedido | null = null;

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
 * Registra a troca de tela e roda `acao` (que dispara a navegação) na hora, sem View Transition: a página
 * segue renderizando (a pílula da aba desliza) enquanto a resposta não chega. A transição começa em
 * `esperarTela`, quando o React já tem a tela nova pronta para trocar. Sem suporte ou com movimento reduzido, só executa.
 */
export function transicao(tipo: TipoNav, acao: () => void, de = location.pathname) {
  if (!podeAnimar() || pendente) return acao();
  let abrir!: () => void;
  const portao = new Promise<void>((r) => (abrir = r));
  const pedido: Pedido = {
    tipo,
    de,
    portao,
    abrir,
    aberto: false,
    fim: () => {},
    finalizada: null,
    validade: setTimeout(() => {
      if (pendente === pedido && !pedido.finalizada) pendente = null;
    }, LIMITE_PEDIDO_MS),
  };
  pendente = pedido;
  acao();
}

function iniciar(p: Pedido) {
  clearTimeout(p.validade);
  const html = document.documentElement;
  html.dataset.nav = p.tipo;
  const chegada = new Promise<void>((r) => (p.fim = r));
  const liberar = () => {
    if (p.aberto) return;
    p.aberto = true;
    p.abrir();
  };
  // O navegador já capturou a tela antiga: o React pode trocar o DOM.
  const t = document.startViewTransition(() => {
    liberar();
    // O limite evita deixar a tela congelada se o commit não chegar.
    setTimeout(p.fim, LIMITE_MS);
    return chegada;
  });
  // Rede de segurança: o commit nunca fica preso esperando o navegador.
  setTimeout(liberar, LIMITE_MS);
  p.finalizada = t.finished.then(
    () => {},
    () => {},
  );
  void p.finalizada.then(() => {
    delete html.dataset.nav;
    if (pendente === p) pendente = null;
  });
}

/**
 * Chamada no render (Movimento.tsx). Se há troca de tela pedida e o React está renderizando o caminho novo,
 * inicia a View Transition e suspende este render até o navegador capturar a tela antiga.
 */
export function esperarTela(caminho: string, anterior: string) {
  const p = pendente;
  if (!p || p.aberto || caminho === p.de || caminho === anterior) return;
  if (!p.finalizada) iniciar(p);
  use(p.portao);
}

export function navegar(router: { push(href: string): void }, destino: string, tipo: TipoNav, de?: string) {
  transicao(tipo, () => router.push(destino), de);
}

/** O novo caminho já está no DOM: libera a transição pendente. Devolve a promessa do fim dela, ou null se não havia. */
export function chegou() {
  const p = pendente;
  if (!p) return null;
  if (!p.finalizada) {
    // A tela mudou sem passar pelo render do portão: não há transição a terminar.
    clearTimeout(p.validade);
    pendente = null;
    return null;
  }
  p.fim();
  return p.finalizada;
}
