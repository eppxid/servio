export type Servico = "spotify" | "deezer" | "cifra";

const HOSTS: Record<Servico, string[]> = {
  spotify: ["open.spotify.com"],
  deezer: ["deezer.com", "www.deezer.com", "link.deezer.com"],
  cifra: ["cifraclub.com.br", "www.cifraclub.com.br", "m.cifraclub.com.br"],
};

const NOME: Record<Servico, string> = { spotify: "Spotify", deezer: "Deezer", cifra: "Cifra Club" };

/** Vazio = sem link (null). URL fora do domínio do serviço ou sem https = erro com mensagem. */
export function validarLink(servico: Servico, bruto: string): { ok: true; url: string | null } | { ok: false; erro: string } {
  const texto = bruto.trim();
  if (!texto) return { ok: true, url: null };
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return { ok: false, erro: `Link do ${NOME[servico]} inválido` };
  }
  if (u.protocol !== "https:" || u.username || u.password || !HOSTS[servico].includes(u.hostname.toLowerCase())) {
    return { ok: false, erro: `Use um link https do ${NOME[servico]} (${HOSTS[servico][0]})` };
  }
  return { ok: true, url: u.toString() };
}

function caminho(url: string | null | undefined, host: string[]): string[] | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!host.includes(u.hostname.toLowerCase())) return null;
    return u.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
}

/** Id da faixa em open.spotify.com/track/<id> (aceita prefixo /intl-xx/). */
export function idFaixaSpotify(url: string | null | undefined): string | null {
  const p = caminho(url, HOSTS.spotify);
  const i = p?.indexOf("track") ?? -1;
  const id = p && i >= 0 ? p[i + 1] : undefined;
  return id && /^[A-Za-z0-9]+$/.test(id) ? id : null;
}

/** Id numérico da faixa em deezer.com/[idioma/]track/<id>. Link curto (link.deezer.com) não resolve. */
export function idFaixaDeezer(url: string | null | undefined): string | null {
  const p = caminho(url, ["deezer.com", "www.deezer.com"]);
  const i = p?.indexOf("track") ?? -1;
  const id = p && i >= 0 ? p[i + 1] : undefined;
  return id && /^\d+$/.test(id) ? id : null;
}

/** URL do player embutido, ou null quando o link não é de faixa. */
export function urlEmbed(servico: "spotify" | "deezer", url: string | null | undefined): string | null {
  if (servico === "spotify") {
    const id = idFaixaSpotify(url);
    return id ? `https://open.spotify.com/embed/track/${id}` : null;
  }
  const id = idFaixaDeezer(url);
  return id ? `https://widget.deezer.com/widget/auto/track/${id}` : null;
}

/** URL de busca por título + artista (Cifra Club: formato /?q= conferido no site em 04/11/2026). */
export function urlBusca(servico: Servico, titulo: string, artista?: string | null): string {
  const q = [titulo, artista].filter(Boolean).join(" ").trim();
  const enc = encodeURIComponent(q);
  if (servico === "spotify") return `https://open.spotify.com/search/${enc}`;
  if (servico === "deezer") return `https://www.deezer.com/search/${enc}`;
  return `https://www.cifraclub.com.br/?q=${encodeURIComponent(q).replace(/%20/g, "+")}`;
}
