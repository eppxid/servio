/** Modos do app: voluntário (padrão) e líder (só para quem lidera algum ministério ou é admin). */
export type Modo = "voluntario" | "lider";

export const COOKIE_MODO = "servio_modo";

export const INICIO_DO_MODO: Record<Modo, string> = { voluntario: "/inicio", lider: "/lider/cultos" };

const ROTAS_LIDER = ["/lider", "/painel", "/agenda/trocas", "/eventos"];
const ROTAS_VOLUNTARIO = ["/inicio", "/agenda", "/folgas", "/perfil"];

const dentro = (caminho: string, raizes: string[]) =>
  raizes.some((r) => caminho === r || caminho.startsWith(r + "/"));

export function lerModo(valor: string | undefined): Modo {
  return valor === "lider" ? "lider" : "voluntario";
}

/** A rota decide o modo quando pertence a um deles; nas demais (menu "Mais") vale a escolha salva. */
export function modoDoCaminho(caminho: string, salvo: Modo, ehLider: boolean): Modo {
  if (!ehLider) return "voluntario";
  if (dentro(caminho, ROTAS_LIDER)) return "lider";
  if (dentro(caminho, ROTAS_VOLUNTARIO)) return "voluntario";
  return salvo;
}
