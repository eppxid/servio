import Link from "next/link";
import { headers } from "next/headers";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Cabecalho } from "@/components/Cabecalho";
import { db } from "@/db";
import { funcoes, ministerios } from "@/db/schema";
import { exigirPapel } from "@/lib/auth";
import { CopiarLink } from "../../ministerios/copiar-link";
import { gerarLinkConvite, salvarCulto, salvarMinisterio } from "./acoes";
import { PassoMinisterio } from "./passo-ministerio";
import { DIAS_SEMANA } from "./sugestoes";

export const dynamic = "force-dynamic";

const PASSOS = ["Ministério", "Cultos", "Convidar"];
const TOKEN = /^[0-9a-f]{64}$/;

/** Assistente do admin em 3 passos (cada um pulável). Abre também depois, para quem já tem igreja. */
export default async function Configurar({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string; ministerio?: string; erro?: string; convite?: string }>;
}) {
  const admin = await exigirPapel("admin");
  const q = await searchParams;
  const passo = Math.min(3, Math.max(1, Number.parseInt(q.passo ?? "1", 10) || 1));

  const lista = await db()
    .select({ id: ministerios.id, nome: ministerios.nome })
    .from(ministerios)
    .where(and(eq(ministerios.igrejaId, admin.igrejaId), isNull(ministerios.arquivadoEm)))
    .orderBy(asc(ministerios.id));
  const pedido = Number(q.ministerio);
  const ministerio = lista.find((m) => m.id === pedido) ?? lista[0] ?? null;
  const sufixo = ministerio ? `&ministerio=${ministerio.id}` : "";

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = q.convite && TOKEN.test(q.convite) ? `${proto}://${host}/convite/${q.convite}` : null;

  const funcoesDoMinisterio =
    passo === 2 && ministerio
      ? await db()
          .select({ id: funcoes.id, nome: funcoes.nome })
          .from(funcoes)
          .where(eq(funcoes.ministerioId, ministerio.id))
          .orderBy(asc(funcoes.id))
      : [];

  const mensagem =
    q.erro === "fim"
      ? "O fim deve ser depois do início."
      : q.erro === "vagas"
        ? "Defina pelo menos 1 vaga."
        : q.erro
        ? "Confira os campos."
        : null;

  const pular = passo < 3 ? `/lider/configurar?passo=${passo + 1}${sufixo}` : "/lider/cultos";

  return (
    <div className="tela space-y-5">
      <Cabecalho eyebrow={`Passo ${passo} de 3`} titulo="Configurar a igreja" />
      <div
        role="progressbar"
        aria-label="Progresso"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={passo}
        className="flex gap-1"
      >
        {PASSOS.map((nome, i) => (
          <div key={nome} className="flex-1 space-y-1">
            <div className={`h-1.5 rounded-full ${i < passo ? "bg-primary" : "bg-well"}`} />
            <p className={`text-xs ${i + 1 === passo ? "font-semibold text-ink" : "text-muted"}`}>{nome}</p>
          </div>
        ))}
      </div>

      {mensagem && (
        <p role="alert" className="alerta alerta--bad">
          {mensagem}
        </p>
      )}

      {passo === 1 && (
        <form action={salvarMinisterio} className="space-y-4">
          <p className="text-sm text-muted">Crie um ministério e marque as funções dele.</p>
          <PassoMinisterio />
          <button type="submit" className="btn btn--primary btn--block">
            Salvar e continuar
          </button>
        </form>
      )}

      {passo === 2 && (
        <form action={salvarCulto} className="space-y-4">
          <p className="text-sm text-muted">Crie um tipo de culto que se repete toda semana.</p>
          <input type="hidden" name="ministerio" value={ministerio?.id ?? ""} />
          <label className="rotulo">
            Nome do culto
            <input name="nome" className="campo" required maxLength={120} defaultValue="Culto de domingo" autoComplete="off" />
          </label>
          <label className="rotulo">
            Dia da semana
            <select name="dia" className="campo" defaultValue="0">
              {DIAS_SEMANA.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="rotulo">
              Início
              <input name="horaInicio" type="time" className="campo" required defaultValue="18:00" />
            </label>
            <label className="rotulo">
              Fim (opcional)
              <input name="horaFim" type="time" className="campo" />
            </label>
          </div>
          {ministerio && funcoesDoMinisterio.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="rotulo">Vagas de {ministerio.nome} por função</legend>
              {funcoesDoMinisterio.map((f) => (
                <label key={f.id} className="flex items-center justify-between gap-3 text-sm">
                  {f.nome}
                  <input
                    name={`qtd_${f.id}`}
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={1}
                    aria-label={`Quantidade de ${f.nome}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="campo w-24"
                  />
                </label>
              ))}
            </fieldset>
          )}
          <button type="submit" className="btn btn--primary btn--block">
            Salvar e continuar
          </button>
        </form>
      )}

      {passo === 3 && (
        <div className="space-y-4">
          {ministerio ? (
            <>
              <p className="text-sm text-muted">Convide a equipe de {ministerio.nome} pelo WhatsApp.</p>
              {link ? (
                <div className="space-y-3">
                  <CopiarLink link={link} />
                  <a
                    className="btn btn--primary btn--block"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Oi! Entre na equipe de ${ministerio.nome} pelo Servio: ${link}`,
                    )}`}
                  >
                    Enviar no WhatsApp
                  </a>
                </div>
              ) : (
                <form action={gerarLinkConvite}>
                  <input type="hidden" name="ministerio" value={ministerio.id} />
                  <button type="submit" className="btn btn--primary btn--block">
                    Gerar link do convite
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Crie um ministério no passo 1 para gerar o convite.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {passo > 1 ? (
          <Link href={`/lider/configurar?passo=${passo - 1}${sufixo}`} className="btn">
            Voltar
          </Link>
        ) : (
          <span />
        )}
        <Link href={pular} className="btn">
          {passo < 3 ? "Pular" : "Concluir"}
        </Link>
      </div>
    </div>
  );
}
