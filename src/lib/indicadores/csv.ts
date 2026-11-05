const BOM = "﻿";

function celula(v: string | number): string {
  let s = String(v);
  // Evita que o Excel execute fórmula vinda de texto digitado por usuário.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV para Excel pt-BR: separador ";", BOM UTF-8, quebra de linha CRLF. */
export function gerarCsv(cabecalho: string[], linhas: (string | number)[][]): string {
  return BOM + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
