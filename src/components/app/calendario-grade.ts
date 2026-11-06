/** Contas do calendário mensal, sem fuso: datas como texto `AAAA-MM-DD` e meses como `AAAA-MM`. */

export interface Celula {
  iso: string;
  dia: number;
  foraDoMes: boolean;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function partes(mes: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) throw new Error(`mês inválido: ${mes}`);
  return [Number(m[1]), Number(m[2])];
}

/** Semanas completas (domingo a sábado) que cobrem o mês; 4 a 6 linhas de 7 células. */
export function gradeDoMes(mes: string): Celula[] {
  const [ano, m] = partes(mes);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const recuo = primeiro.getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const total = Math.ceil((recuo + diasNoMes) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(ano, m - 1, 1 - recuo + i));
    return { iso: iso(d), dia: d.getUTCDate(), foraDoMes: d.getUTCMonth() !== m - 1 };
  });
}

export function somarMes(mes: string, n: number): string {
  const [ano, m] = partes(mes);
  return iso(new Date(Date.UTC(ano, m - 1 + n, 1))).slice(0, 7);
}

const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const nomeDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Novembro 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, m] = partes(mes);
  const t = nomeMes.format(new Date(Date.UTC(ano, m - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "domingo, 8 de novembro" (rótulo acessível do dia). */
export function nomeDoDia(dataIso: string): string {
  return nomeDia.format(new Date(`${dataIso}T12:00:00Z`));
}

/** Hoje no fuso da igreja (servidor e navegador chegam à mesma data). */
export function hojeIso(fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
