import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import BotaoAgradecer from "@/components/BotaoAgradecer";
import { CopiarLink } from "../copiar-link";
import { SENHA_MINIMA } from "@/lib/auth-core";
import {
  criarFuncao,
  decidirMembro,
  definirFuncoesDoMembro,
  definirSenhaTemporaria,
  detalheMinisterio,
  excluirFuncao,
  gerarConvite,
  renomearFuncao,
} from "@/lib/ministerios/nucleo";
import { exigirUsuarioSemTroca, idSeguro } from "@/lib/ministerios/sessao";
import { validar } from "@/lib/validar";
import { Cabecalho } from "@/components/Cabecalho";

export const dynamic = "force-dynamic";

const nomeFuncao = z.object({ nome: z.string().trim().min(2).max(80) });
const senhaTemp = z.object({ senha: z.string().min(SENHA_MINIMA).max(200) });

function ids(formData: FormData, campo: string) {
  return formData.getAll(campo).map(idSeguro).filter(Boolean);
}

function voltar(id: number, extra = "") {
  return `/ministerios/${id}${extra}`;
}

async function convidar(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const token = await gerarConvite(db(), ator, id);
  redirect(voltar(id, `?convite=${token}`));
}

async function funcaoNova(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const v = validar(nomeFuncao, formData);
  if (!v.ok) redirect(voltar(id, "?erro=1"));
  await criarFuncao(db(), ator, id, v.dados.nome);
  revalidatePath(voltar(id));
}

async function funcaoRenomear(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const v = validar(nomeFuncao, formData);
  if (!v.ok) redirect(voltar(id, "?erro=1"));
  await renomearFuncao(db(), ator, idSeguro(formData.get("funcao")), v.dados.nome);
  revalidatePath(voltar(id));
}

async function funcaoExcluir(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  await excluirFuncao(db(), ator, idSeguro(formData.get("funcao")));
  revalidatePath(voltar(idSeguro(formData.get("ministerio"))));
}

async function decidir(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  await decidirMembro(
    db(),
    ator,
    idSeguro(formData.get("membro")),
    formData.get("aprovar") === "1",
    ids(formData, "funcoes"),
  );
  revalidatePath(voltar(idSeguro(formData.get("ministerio"))));
}

async function marcarFuncoes(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  await definirFuncoesDoMembro(db(), ator, idSeguro(formData.get("membro")), ids(formData, "funcoes"));
  revalidatePath(voltar(idSeguro(formData.get("ministerio"))));
}

async function senhaTemporaria(formData: FormData) {
  "use server";
  const ator = await exigirUsuarioSemTroca();
  const id = idSeguro(formData.get("ministerio"));
  const v = validar(senhaTemp, formData);
  if (!v.ok) redirect(voltar(id, "?erro=senha"));
  await definirSenhaTemporaria(db(), ator, idSeguro(formData.get("membro")), v.dados.senha);
  redirect(voltar(id, "?ok=senha"));
}

export default async function Ministerio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ convite?: string; erro?: string; ok?: string }>;
}) {
  const ator = await exigirUsuarioSemTroca();
  const { id: bruto } = await params;
  const id = idSeguro(bruto);
  const { convite, erro, ok } = await searchParams;
  const d = id ? await detalheMinisterio(db(), ator, id) : null;
  if (!d) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = d.lider && convite && /^[0-9a-f]{64}$/.test(convite) ? `${proto}://${host}/convite/${convite}` : null;
  const pendentes = d.membros.filter((m) => m.status === "pendente");
  const aprovados = d.membros.filter((m) => m.status === "aprovado");

  const marcas = (marcadas: number[]) =>
    d.funcoes.map((f) => (
      <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="funcoes" value={f.id} defaultChecked={marcadas.includes(f.id)} className="caixa size-5" />
        {f.nome}
      </label>
    ));

  return (
    <div className="space-y-5">
      <Cabecalho eyebrow="Ministério" titulo={d.ministerio.nome} />
      {erro && (
        <p role="alert" className="alerta alerta--bad">
          {erro === "senha" ? `A senha precisa de ${SENHA_MINIMA} caracteres ou mais.` : "Confira os campos."}
        </p>
      )}
      {erro === "agradecimento" && (
        <p role="alert" className="alerta alerta--bad">
          Não foi possível enviar o agradecimento. Confira o texto (até 280 caracteres).
        </p>
      )}
      {ok === "agradecimento" && (
        <p role="status" className="alerta alerta--good">
          Agradecimento enviado.
        </p>
      )}
      {ok === "senha" && (
        <p role="status" className="alerta alerta--good">
          Senha temporária definida. O membro troca no próximo acesso.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="card__title">Funções</h2>
        <ul className="space-y-2">
          {d.funcoes.map((f) => (
            <li key={f.id} className="text-sm">
              {d.lider ? (
                <div className="flex gap-2">
                  <form action={funcaoRenomear} className="flex flex-1 gap-2">
                    <input type="hidden" name="ministerio" value={id} />
                    <input type="hidden" name="funcao" value={f.id} />
                    <input name="nome" defaultValue={f.nome} required minLength={2} maxLength={80} className="campo" aria-label="Nome da função" />
                    <button type="submit" className="btn">Salvar</button>
                  </form>
                  <form action={funcaoExcluir}>
                    <input type="hidden" name="ministerio" value={id} />
                    <input type="hidden" name="funcao" value={f.id} />
                    <button type="submit" className="btn btn--danger">Excluir</button>
                  </form>
                </div>
              ) : (
                f.nome
              )}
            </li>
          ))}
          {d.funcoes.length === 0 && <li className="text-sm text-muted">Sem funções.</li>}
        </ul>
        {d.lider && (
          <form action={funcaoNova} className="flex gap-2">
            <input type="hidden" name="ministerio" value={id} />
            <input name="nome" required minLength={2} maxLength={80} className="campo" aria-label="Nova função" placeholder="Nova função" />
            <button type="submit" className="btn btn--primary">Adicionar</button>
          </form>
        )}
      </section>

      {d.lider && (
        <>
          <section className="card space-y-3">
            <h2 className="card__title">Convite</h2>
            <form action={convidar}>
              <input type="hidden" name="ministerio" value={id} />
              <button type="submit" className="btn btn--primary btn--block">Gerar convite</button>
            </form>
            {link && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Vale por 14 dias.</p>
                <CopiarLink link={link} />
                <a
                  className="btn btn--block"
                  href={`https://wa.me/?text=${encodeURIComponent(`Convite para o ministério ${d.ministerio.nome}: ${link}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Enviar por WhatsApp
                </a>
              </div>
            )}
          </section>

          <section className="space-y-3 lg:col-span-2">
            <h2 className="card__title">Pendentes ({pendentes.length})</h2>
            {pendentes.map((m) => (
              <form key={m.id} action={decidir} className="card space-y-2">
                <input type="hidden" name="ministerio" value={id} />
                <input type="hidden" name="membro" value={m.id} />
                <p className="font-medium">{m.nome}</p>
                <p className="text-sm text-muted">
                  {m.email}
                  {m.telefone ? ` · ${m.telefone}` : ""}
                </p>
                {marcas([])}
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" name="aprovar" value="1" className="btn btn--primary btn--block">Aprovar</button>
                  <button type="submit" name="aprovar" value="0" className="btn btn--danger btn--block">
                    Recusar
                  </button>
                </div>
              </form>
            ))}
          </section>

          <section className="space-y-3 lg:col-span-2">
            <h2 className="card__title">Membros ({aprovados.length})</h2>
            {aprovados.map((m) => (
              <div key={m.id} className="card space-y-2">
                <p className="font-medium">
                  {m.nome}
                  {m.papel === "lider" ? " (líder)" : ""}
                </p>
                <p className="text-sm text-muted">
                  {m.email}
                  {m.telefone ? ` · ${m.telefone}` : ""}
                </p>
                <form action={marcarFuncoes} className="space-y-1">
                  <input type="hidden" name="ministerio" value={id} />
                  <input type="hidden" name="membro" value={m.id} />
                  {marcas(m.funcaoIds)}
                  <button type="submit" className="btn btn--sm">Salvar funções</button>
                </form>
                {m.status === "aprovado" && (
                  <BotaoAgradecer ministerioId={id} membroId={m.id} nome={m.nome} />
                )}
                <form action={senhaTemporaria} className="flex gap-2">
                  <input type="hidden" name="ministerio" value={id} />
                  <input type="hidden" name="membro" value={m.id} />
                  <input name="senha" type="text" required minLength={SENHA_MINIMA} autoComplete="off" className="campo" aria-label="Senha temporária" placeholder="Senha temporária" />
                  <button type="submit" className="btn">Definir</button>
                </form>
              </div>
            ))}
          </section>
        </>
      )}
      </div>
    </div>
  );
}
