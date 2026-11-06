import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import * as t from "@/db/schema";
import { exigirUsuario } from "@/lib/auth";
import type { AnyDb } from "@/lib/auth-core";
import { minhasPreferencias } from "@/lib/servir/nucleo";
import { FormServir, type MinisterioParaServir } from "./FormServir";

export const dynamic = "force-dynamic";

export default async function OndeQueroServir({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const usuario = await exigirUsuario();
  const banco = db() as unknown as AnyDb;
  const { ok, erro } = await searchParams;
  const [ministerios, funcoes, minhas] = await Promise.all([
    banco
      .select({ id: t.ministerios.id, nome: t.ministerios.nome })
      .from(t.ministerios)
      .where(and(eq(t.ministerios.igrejaId, usuario.igrejaId), isNull(t.ministerios.arquivadoEm)))
      .orderBy(asc(t.ministerios.nome)),
    banco
      .select({ id: t.funcoes.id, nome: t.funcoes.nome, ministerioId: t.funcoes.ministerioId })
      .from(t.funcoes)
      .where(eq(t.funcoes.igrejaId, usuario.igrejaId))
      .orderBy(asc(t.funcoes.nome)),
    minhasPreferencias(banco, usuario),
  ]);

  const lista: MinisterioParaServir[] = ministerios.map((m) => {
    const meu = minhas.find((x) => x.ministerioId === m.id);
    const status = new Map(meu?.funcoes.map((f) => [f.funcaoId, f.status]) ?? []);
    return {
      id: m.id,
      nome: m.nome,
      situacao: meu ? meu.status : null,
      funcoes: funcoes
        .filter((f) => f.ministerioId === m.id)
        .map((f) => ({ id: f.id, nome: f.nome, status: status.get(f.id) ?? null })),
    };
  });

  return (
    <div className="tela">
      <Cabecalho eyebrow="Perfil" titulo="Onde quero servir">
        <Link href="/perfil" className="tbtn">
          Voltar
        </Link>
      </Cabecalho>
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="alerta alerta--good">
          {ok}
        </p>
      )}
      <p className="muted">Escolha os ministérios e as funções que você quer exercer. O líder aprova cada pedido.</p>
      <FormServir ministerios={lista} />
    </div>
  );
}
