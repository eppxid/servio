/** Texto do resumo da sugestão ("18 de 20 vagas preenchidas; 2 sem candidato (Iluminação, 15/11 e 22/11)"). */

export interface FaltaSemCandidato {
  funcao: string;
  /** AAAA-MM-DD */
  data: string;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function juntar(itens: string[]) {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Agrupa as faltas por função: "Iluminação, 15/11 e 22/11; Projeção, 29/11". */
export function descreverFaltas(faltas: readonly FaltaSemCandidato[]) {
  const porFuncao = new Map<string, string[]>();
  for (const f of [...faltas].sort((a, b) => a.data.localeCompare(b.data))) {
    const datas = porFuncao.get(f.funcao) ?? [];
    // Duas vagas da mesma função no mesmo culto viram uma data só.
    if (datas.at(-1) !== ddmm(f.data)) datas.push(ddmm(f.data));
    porFuncao.set(f.funcao, datas);
  }
  return [...porFuncao].map(([funcao, datas]) => `${funcao}, ${juntar(datas)}`).join("; ");
}

export function resumoDaSugestao(total: number, preenchidas: number, faltas: readonly FaltaSemCandidato[]) {
  if (total === 0) return "Nenhuma vaga aberta para sugerir neste mês.";
  const base = `${preenchidas} de ${total} ${total === 1 ? "vaga preenchida" : "vagas preenchidas"}`;
  if (faltas.length === 0) return `${base}.`;
  return `${base}; ${faltas.length} sem candidato (${descreverFaltas(faltas)}).`;
}
