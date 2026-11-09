import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { AnyDb } from "@/lib/auth-core";
import { RETENCAO } from "./termos";

const DIA_MS = 24 * 60 * 60 * 1000;

/** yyyy-MM-dd em UTC (as datas de indisponibilidade não têm hora). */
function diaIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Retenção (art. 15 e 16): apaga o que passou do prazo. Devolve quantas linhas saíram de cada tabela. */
export async function limparDadosAntigos(db: AnyDb, agora = new Date()) {
  const limiteMensagens = new Date(agora.getTime() - RETENCAO.mensagensDias * DIA_MS);
  const eventosVelhos = db
    .select({ id: t.eventos.id })
    .from(t.eventos)
    // Comparado a uma expressão sql, o Date não passa pelo mapeamento da coluna: o driver postgres recusa o objeto.
    .where(lt(sql`coalesce(${t.eventos.fim}, ${t.eventos.inicio})`, sql`${limiteMensagens.toISOString()}::timestamptz`));
  const mensagens = await db
    .delete(t.mensagens)
    .where(inArray(t.mensagens.eventoId, eventosVelhos))
    .returning({ id: t.mensagens.id });

  const limiteIndisp = diaIso(new Date(agora.getTime() - RETENCAO.indisponibilidadesDias * DIA_MS));
  const indisponibilidades = await db
    .delete(t.indisponibilidades)
    .where(lt(t.indisponibilidades.dataFim, limiteIndisp))
    .returning({ id: t.indisponibilidades.id });

  const tentativas = await db
    .delete(t.tentativasLogin)
    .where(lt(t.tentativasLogin.criadoEm, new Date(agora.getTime() - RETENCAO.tentativasLoginDias * DIA_MS)))
    .returning({ id: t.tentativasLogin.id });

  const convites = await db
    .delete(t.convites)
    .where(lt(t.convites.expiraEm, agora))
    .returning({ id: t.convites.id });

  // Acesso por link (LGPD regras 1 e 5 da spec 2026-11-08).
  const limitePedidos = new Date(agora.getTime() - RETENCAO.pedidosAcessoDias * DIA_MS);
  const pedidosAcesso = await db
    .delete(t.pedidosAcesso)
    .where(
      or(
        lt(t.pedidosAcesso.decididoEm, limitePedidos),
        and(eq(t.pedidosAcesso.status, "pendente"), lt(t.pedidosAcesso.criadoEm, limitePedidos)),
      ),
    )
    .returning({ id: t.pedidosAcesso.id });

  // Pré-cadastro (só nome e sobrenome) que ninguém usou: some na expiração, com os pedidos dele.
  const convitesVencidos = db
    .select({ id: t.convitesPessoais.id })
    .from(t.convitesPessoais)
    .where(and(isNull(t.convitesPessoais.usadoEm), lt(t.convitesPessoais.expiraEm, agora)));
  await db.delete(t.pedidosAcesso).where(inArray(t.pedidosAcesso.conviteId, convitesVencidos));
  const convitesPessoais = await db
    .delete(t.convitesPessoais)
    .where(and(isNull(t.convitesPessoais.usadoEm), lt(t.convitesPessoais.expiraEm, agora)))
    .returning({ id: t.convitesPessoais.id });

  const aparelhos = await db
    .delete(t.aparelhos)
    .where(
      and(
        isNotNull(t.aparelhos.revogadoEm),
        lt(t.aparelhos.revogadoEm, new Date(agora.getTime() - RETENCAO.aparelhosRevogadosDias * DIA_MS)),
      ),
    )
    .returning({ id: t.aparelhos.id });

  return {
    mensagens: mensagens.length,
    indisponibilidades: indisponibilidades.length,
    tentativasLogin: tentativas.length,
    convites: convites.length,
    convitesPessoais: convitesPessoais.length,
    pedidosAcesso: pedidosAcesso.length,
    aparelhos: aparelhos.length,
  };
}
