import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { temPapel } from "@/lib/auth-core";
import {
  arquivarMinisterio,
  criarMinisterio,
  definirLider,
  editarMinisterio,
  listarMinisterios,
} from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { validar } from "@/lib/validar";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const esquemaMin = z.object({
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(500).optional(),
});

async function criar(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const v = validar(esquemaMin, formData);
  if (!v.ok) redirect("/ministerios?erro=1");
  await criarMinisterio(db(), ator, v.dados.nome, v.dados.descricao);
  revalidatePath("/ministerios");
}

async function editar(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const v = validar(esquemaMin, formData);
  if (!v.ok) redirect("/ministerios?erro=1");
  await editarMinisterio(db(), ator, idSeguro(formData.get("id")), v.dados);
  revalidatePath("/ministerios");
}

async function arquivar(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  await arquivarMinisterio(db(), ator, idSeguro(formData.get("id")), formData.get("arquivar") === "1");
  revalidatePath("/ministerios");
}

async function lider(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  await definirLider(
    db(),
    ator,
    idSeguro(formData.get("id")),
    idSeguro(formData.get("usuario")),
    formData.get("lider") === "1",
  );
  revalidatePath("/ministerios");
}

export default async function Ministerios({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const banco = db();
  const { erro } = await searchParams;
  const admin = await temPapel(banco, ator, "admin");
  const todos = await listarMinisterios(banco, ator);
  const lista = admin ? todos : todos.filter((m) => !m.arquivadoEm);
  const pessoas = admin
    ? await banco
        .select({ id: usuarios.id, nome: usuarios.nome })
        .from(usuarios)
        .where(eq(usuarios.igrejaId, ator.igrejaId))
        .orderBy(asc(usuarios.nome))
    : [];

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Equipes" titulo="Ministérios" />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          Confira os campos.
        </p>
      )}
      <ul className="grid items-start gap-4 md:grid-cols-2" data-enter>
        {lista.map((m) => (
          <li key={m.id} className="card space-y-3">
            <Link href={`/ministerios/${m.id}`} className="card__title block min-h-6 text-primary">
              {m.nome}
              {m.arquivadoEm ? " (arquivado)" : ""}
            </Link>
            {m.descricao && <p className="text-sm text-muted">{m.descricao}</p>}
            {admin && (
              <details className="text-sm">
                <summary className="btn btn--sm cursor-pointer">Gerenciar</summary>
                <div className="mt-3 space-y-3">
                  <form action={editar} className="space-y-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="nome" defaultValue={m.nome} required minLength={2} maxLength={120} className="campo" aria-label="Nome" />
                    <input name="descricao" defaultValue={m.descricao ?? ""} maxLength={500} className="campo" aria-label="Descrição" />
                    <button type="submit" className="btn btn--primary btn--block">Salvar</button>
                  </form>
                  <form action={lider} className="space-y-2">
                    <input type="hidden" name="id" value={m.id} />
                    <select name="usuario" className="campo" aria-label="Pessoa">
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                    <select name="lider" className="campo" aria-label="Papel">
                      <option value="1">Líder</option>
                      <option value="0">Voluntário</option>
                    </select>
                    <button type="submit" className="btn btn--primary btn--block">Definir papel</button>
                  </form>
                  <form action={arquivar}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="arquivar" value={m.arquivadoEm ? "0" : "1"} />
                    <button type="submit" className="btn btn--block">{m.arquivadoEm ? "Reativar" : "Arquivar"}</button>
                  </form>
                </div>
              </details>
            )}
          </li>
        ))}
        {lista.length === 0 && <li className="card text-sm text-muted">Nenhum ministério ainda.</li>}
      </ul>
      {admin && (
        <form action={criar} className="card space-y-3">
          <h2 className="card__title">Novo ministério</h2>
          <input name="nome" required minLength={2} maxLength={120} className="campo" aria-label="Nome" placeholder="Nome" />
          <input name="descricao" maxLength={500} className="campo" aria-label="Descrição" placeholder="Descrição (opcional)" />
          <button type="submit" className="btn btn--primary btn--block">Criar</button>
        </form>
      )}
    </div>
  );
}
