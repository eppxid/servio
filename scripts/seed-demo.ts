/**
 * Igreja de demonstração: 1 admin, 2 líderes, 8 voluntários, 2 ministérios,
 * cultos de 2 semanas atrás até o fim do mês seguinte (tipos de culto com vagas),
 * escalas só com funções aprovadas (2 pessoas por função), mês seguinte em rascunho,
 * repertório em 2 eventos e histórico de check-in para o painel e os pontos.
 * Uso: pnpm seed:demo  (DATABASE_URL apontando para um banco já migrado e vazio).
 */
import { fromZonedTime } from "date-fns-tz";
import { db } from "../src/db";
import {
  escalaItens,
  escalas,
  eventos,
  funcoes,
  igrejas,
  membroFuncoes,
  membrosMinisterio,
  ministerios,
  recorrencias,
  usuarios,
  vagasModelo,
} from "../src/db/schema";
import { repertorioItens } from "../src/db/schema-repertorio";
import { hashSenha } from "../src/lib/auth-core";
import { TERMOS_VERSAO } from "../src/lib/lgpd/termos";
import { FUSO } from "../src/lib/recorrencia";

const SENHA = "demo-12345";
const DIA = 24 * 60 * 60 * 1000;

type Papel = "admin" | "lider" | "voluntario";

async function main() {
  const banco = db();
  const [existe] = await banco.select({ id: igrejas.id }).from(igrejas).limit(1);
  if (existe) throw new Error("O banco já tem igreja. Use um banco vazio para a demonstração.");

  const senhaHash = await hashSenha(SENHA);
  const consentimentoEm = new Date();
  const [igreja] = await banco.insert(igrejas).values({ nome: "Igreja Demonstração" }).returning();
  const novoUsuario = async (nome: string, email: string, papelGlobal: Papel) =>
    (
      await banco
        .insert(usuarios)
        .values({ igrejaId: igreja.id, nome, email, senhaHash, papelGlobal, consentimentoEm, termosVersao: TERMOS_VERSAO })
        .returning()
    )[0];

  await novoUsuario("Admin Demo", "admin@demo.local", "admin");
  const liderLouvor = await novoUsuario("Marta Louvor", "marta@demo.local", "lider");
  const liderMidia = await novoUsuario("Caio Mídia", "caio@demo.local", "lider");
  const nomes = [
    ["Ana", "ana"],
    ["Bruno", "bruno"],
    ["Carla", "carla"],
    ["Diego", "diego"],
    ["Elisa", "elisa"],
    ["Fábio", "fabio"],
    ["Gabi", "gabi"],
    ["Hugo", "hugo"],
  ];
  const voluntarios = [];
  for (const [nome, login] of nomes) voluntarios.push(await novoUsuario(`${nome} Voluntário`, `${login}@demo.local`, "voluntario"));
  const louvor = voluntarios.slice(0, 4);
  const midia = voluntarios.slice(4);

  async function ministerio(nome: string, lider: typeof liderLouvor, nomesFuncao: string[], equipe: typeof louvor) {
    const [m] = await banco.insert(ministerios).values({ igrejaId: igreja.id, nome }).returning();
    const fs = await banco
      .insert(funcoes)
      .values(nomesFuncao.map((f) => ({ igrejaId: igreja.id, ministerioId: m.id, nome: f })))
      .returning();
    await banco
      .insert(membrosMinisterio)
      .values({ igrejaId: igreja.id, usuarioId: lider.id, ministerioId: m.id, papel: "lider", status: "aprovado" });
    // Cada voluntário tem 2 funções aprovadas (a dele e a seguinte); com 2 funções só, cada um fica com uma.
    // Assim toda função tem ao menos 2 pessoas aprovadas.
    const aprovadas = new Map<number, number[]>(fs.map((f) => [f.id, []]));
    for (const [i, u] of equipe.entries()) {
      const [mm] = await banco
        .insert(membrosMinisterio)
        .values({ igrejaId: igreja.id, usuarioId: u.id, ministerioId: m.id, status: "aprovado" })
        .returning();
      const minhas = fs.length > 2 ? [fs[i % fs.length], fs[(i + 1) % fs.length]] : [fs[i % fs.length]];
      for (const f of minhas) {
        await banco.insert(membroFuncoes).values({ igrejaId: igreja.id, membroId: mm.id, funcaoId: f.id });
        aprovadas.get(f.id)!.push(u.id);
      }
    }
    return { m, fs, equipe, aprovadas };
  }
  const L = await ministerio("Louvor", liderLouvor, ["Vocal", "Violão", "Teclado", "Bateria"], louvor);
  const M = await ministerio("Mídia", liderMidia, ["Câmera", "Projeção"], midia);

  // Tipos de culto (domingo 10h, quarta 20h) com 1 vaga por função de cada ministério.
  const tipos = [
    { dia: 0, ini: "10:00", fim: "12:00", nome: "Culto de domingo" },
    { dia: 3, ini: "20:00", fim: "21:30", nome: "Culto de quarta" },
  ];
  const recPorDia = new Map<number, number>();
  for (const t of tipos) {
    const [r] = await banco
      .insert(recorrencias)
      .values({ igrejaId: igreja.id, diaSemana: t.dia, horaInicio: t.ini, horaFim: t.fim, nome: t.nome })
      .returning();
    recPorDia.set(t.dia, r.id);
    for (const min of [L, M])
      await banco
        .insert(vagasModelo)
        .values(min.fs.map((f) => ({ igrejaId: igreja.id, recorrenciaId: r.id, ministerioId: min.m.id, funcaoId: f.id, quantidade: 1 })));
  }

  // Cultos de 14 dias atrás até o último dia do mês seguinte (fuso da igreja).
  const hoje = new Date();
  const hojeIso = hoje.toLocaleDateString("sv-SE", { timeZone: FUSO });
  const [ano, mes] = hojeIso.split("-").map(Number);
  const mesSeguinte = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}`;
  const ultimoDia = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1, 0)).getUTCDate();
  const limite = new Date(`${mesSeguinte}-${ultimoDia}T12:00:00Z`).getTime();
  const dados: { id: number; inicio: Date; domingo: boolean; rascunho: boolean }[] = [];
  for (let d = -14; ; d++) {
    const ref = new Date(hoje.getTime() + d * DIA);
    const iso = ref.toLocaleDateString("sv-SE", { timeZone: FUSO });
    if (new Date(`${iso}T12:00:00Z`).getTime() > limite) break;
    const semana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    const t = tipos.find((x) => x.dia === semana);
    if (!t) continue;
    const inicio = fromZonedTime(`${iso}T${t.ini}:00`, FUSO);
    const fim = fromZonedTime(`${iso}T${t.fim}:00`, FUSO);
    const [e] = await banco
      .insert(eventos)
      .values({ igrejaId: igreja.id, titulo: t.nome, inicio, fim, recorrenciaId: recPorDia.get(semana) })
      .returning();
    dados.push({ id: e.id, inicio, domingo: semana === 0, rascunho: iso.startsWith(mesSeguinte) });
  }

  // Escalas. Mês corrente: publicadas (passado confirmado + check-in com algumas faltas; futuro pendente ou confirmado),
  // cada pessoa só numa função aprovada e sem repetir no mesmo culto. Mês seguinte: rascunho com vagas abertas.
  const escalaLouvor = new Map<number, number>();
  for (const [n, ev] of dados.entries()) {
    const passado = ev.inicio < hoje;
    for (const min of [L, M]) {
      const [esc] = await banco
        .insert(escalas)
        .values({ igrejaId: igreja.id, eventoId: ev.id, ministerioId: min.m.id, status: ev.rascunho ? "rascunho" : "publicada" })
        .returning();
      if (min === L) escalaLouvor.set(ev.id, esc.id);
      const usados = new Set<number>();
      for (const [i, f] of min.fs.entries()) {
        if (ev.rascunho) {
          await banco.insert(escalaItens).values({ igrejaId: igreja.id, escalaId: esc.id, funcaoId: f.id, usuarioId: null });
          continue;
        }
        const candidatos = min.aprovadas.get(f.id)!;
        const livres = candidatos.filter((id) => !usados.has(id));
        const uId = (livres.length ? livres : candidatos)[n % (livres.length || candidatos.length)];
        usados.add(uId);
        const faltou = passado && (n + i) % 7 === 0;
        await banco.insert(escalaItens).values({
          igrejaId: igreja.id,
          escalaId: esc.id,
          funcaoId: f.id,
          usuarioId: uId,
          status: passado ? (faltou ? "pendente" : "confirmado") : n % 2 ? "confirmado" : "pendente",
          checkinEm: passado && !faltou ? new Date(ev.inicio.getTime() - 15 * 60 * 1000) : null,
        });
      }
    }
  }

  // Repertório em 2 eventos do Louvor: o último domingo já passado e o próximo à frente.
  const domingos = dados.filter((e) => e.domingo);
  const alvo = [domingos.filter((e) => e.inicio < hoje).at(-1), domingos.find((e) => e.inicio >= hoje)].filter(
    (e): e is (typeof dados)[number] => Boolean(e),
  );
  for (const ev of alvo) {
    const escalaId = escalaLouvor.get(ev.id)!;
    await banco.insert(repertorioItens).values([
      { igrejaId: igreja.id, escalaId, ordem: 1, titulo: "Grande é o Senhor", artista: "Adhemar de Campos", tom: "G", criadoPor: liderLouvor.id },
      { igrejaId: igreja.id, escalaId, ordem: 2, titulo: "Em Espírito e em Verdade", artista: "Gabriel Guedes", tom: "D", criadoPor: liderLouvor.id },
    ]);
  }

  console.log(`Demonstração criada: ${dados.length} eventos, 11 pessoas. Senha de todos: ${SENHA}`);
  console.log("Admin: admin@demo.local · Líder: marta@demo.local · Voluntário: ana@demo.local");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
