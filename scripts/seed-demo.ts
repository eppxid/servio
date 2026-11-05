/**
 * Igreja de demonstração: 1 admin, 2 líderes, 8 voluntários, 2 ministérios,
 * eventos de 1 mês (2 semanas atrás até 2 à frente), repertório em 2 eventos
 * e histórico de check-in para o painel e os pontos.
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
  usuarios,
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
    for (const [i, u] of equipe.entries()) {
      const [mm] = await banco
        .insert(membrosMinisterio)
        .values({ igrejaId: igreja.id, usuarioId: u.id, ministerioId: m.id, status: "aprovado" })
        .returning();
      await banco.insert(membroFuncoes).values({ igrejaId: igreja.id, membroId: mm.id, funcaoId: fs[i % fs.length].id });
    }
    return { m, fs, equipe };
  }
  const L = await ministerio("Louvor", liderLouvor, ["Vocal", "Violão", "Teclado", "Bateria"], louvor);
  const M = await ministerio("Mídia", liderMidia, ["Câmera", "Projeção"], midia);

  // Cultos de domingo 10h e quarta 20h, de 14 dias atrás até 14 dias à frente.
  const hoje = new Date();
  const dados: { id: number; inicio: Date; domingo: boolean }[] = [];
  for (let d = -14; d <= 14; d++) {
    const iso = new Date(hoje.getTime() + d * DIA).toLocaleDateString("sv-SE", { timeZone: FUSO });
    const semana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 3) continue;
    const domingo = semana === 0;
    const inicio = fromZonedTime(`${iso}T${domingo ? "10:00" : "20:00"}:00`, FUSO);
    const fim = fromZonedTime(`${iso}T${domingo ? "12:00" : "21:30"}:00`, FUSO);
    const [e] = await banco
      .insert(eventos)
      .values({ igrejaId: igreja.id, titulo: domingo ? "Culto de domingo" : "Culto de quarta", inicio, fim })
      .returning();
    dados.push({ id: e.id, inicio, domingo });
  }

  // Escalas publicadas. Passado: confirmado + check-in (com algumas faltas). Futuro: pendente ou confirmado.
  const escalaLouvor = new Map<number, number>();
  for (const [n, ev] of dados.entries()) {
    const passado = ev.inicio < hoje;
    for (const min of [L, M]) {
      const [esc] = await banco
        .insert(escalas)
        .values({ igrejaId: igreja.id, eventoId: ev.id, ministerioId: min.m.id, status: "publicada" })
        .returning();
      if (min === L) escalaLouvor.set(ev.id, esc.id);
      for (const [i, f] of min.fs.entries()) {
        const u = min.equipe[(i + n) % min.equipe.length];
        const faltou = passado && (n + i) % 7 === 0;
        await banco.insert(escalaItens).values({
          igrejaId: igreja.id,
          escalaId: esc.id,
          funcaoId: f.id,
          usuarioId: u.id,
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
